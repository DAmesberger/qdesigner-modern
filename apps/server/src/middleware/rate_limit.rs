use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use redis::AsyncCommands;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::ApiError;
use crate::state::AppState;

/// Sliding-window (in-memory) / fixed-window (Redis) rate limiter.
///
/// When a Redis client is provided, uses INCR + EXPIRE for atomic
/// distributed counting. Without Redis falls back to a per-process
/// in-memory map (sliding window). The in-memory backend is acceptable
/// in single-process dev but should not be relied on in production.
#[derive(Clone)]
pub struct RateLimiter {
    /// In-memory fallback: client key → list of request timestamps.
    in_memory: Arc<Mutex<HashMap<String, Vec<i64>>>>,
    /// Optional Redis client for distributed counting.
    redis: Option<Arc<redis::Client>>,
    max_requests: u64,
    window_secs: i64,
}

impl RateLimiter {
    pub fn new(max_requests: u64, window_secs: i64, redis: Option<Arc<redis::Client>>) -> Self {
        Self {
            in_memory: Arc::new(Mutex::new(HashMap::new())),
            redis,
            max_requests,
            window_secs,
        }
    }

    /// Returns `true` if the request is allowed.
    pub async fn check(&self, key: &str) -> bool {
        if let Some(client) = &self.redis {
            match self.check_redis(client, key).await {
                Ok(allowed) => return allowed,
                Err(e) => {
                    // Redis failed; fall back to in-memory so a flaky Redis
                    // doesn't open the gate. If Redis is genuinely down,
                    // the policy degrades to per-process semantics.
                    tracing::warn!("rate-limit redis failed, falling back to in-memory: {e}");
                }
            }
        }
        self.check_in_memory(key).await
    }

    async fn check_redis(&self, client: &redis::Client, key: &str) -> redis::RedisResult<bool> {
        let mut conn = client.get_multiplexed_async_connection().await?;
        let redis_key = format!("ratelimit:{key}");
        let count: u64 = conn.incr(&redis_key, 1).await?;
        if count == 1 {
            let _: () = conn.expire(&redis_key, self.window_secs).await?;
        }
        Ok(count <= self.max_requests)
    }

    async fn check_in_memory(&self, key: &str) -> bool {
        let now = chrono::Utc::now().timestamp();
        let cutoff = now - self.window_secs;

        let mut windows = self.in_memory.lock().await;
        let entry = windows.entry(key.to_string()).or_default();

        entry.retain(|&ts| ts > cutoff);

        if (entry.len() as u64) < self.max_requests {
            entry.push(now);
            true
        } else {
            false
        }
    }
}

/// Derive the rate-limit bucket key for a request: the authenticated user id
/// when present, else the socket peer IP.
///
/// The fallback keys off the socket peer IP (`ConnectInfo`), **not** a
/// client-controlled `X-Forwarded-For` header. XFF is trivially spoofable, so
/// keying on it lets an attacker rotate the header to dodge the limiter (or
/// lump every real client into one bucket). `ConnectInfo` is populated by
/// `into_make_service_with_connect_info::<SocketAddr>()` at serve time; without
/// it the key falls to "unknown" (one shared bucket) — a wiring bug, not a
/// spoofing surface.
fn rate_limit_key(request: &Request) -> String {
    if let Some(user) = request
        .extensions()
        .get::<crate::auth::models::AuthenticatedUser>()
    {
        return user.user_id.to_string();
    }
    request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|ci| ci.0.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Middleware that rate-limits based on the authenticated user ID or remote IP.
pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let key = rate_limit_key(&request);

    if !state.rate_limiter.check(&key).await {
        return Err(ApiError::RateLimited);
    }

    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn in_memory_allows_then_blocks() {
        let limiter = RateLimiter::new(3, 60, None);
        assert!(limiter.check("a").await);
        assert!(limiter.check("a").await);
        assert!(limiter.check("a").await);
        // 4th request in the window is blocked
        assert!(!limiter.check("a").await);
    }

    #[tokio::test]
    async fn in_memory_separates_keys() {
        let limiter = RateLimiter::new(2, 60, None);
        assert!(limiter.check("alice").await);
        assert!(limiter.check("alice").await);
        assert!(!limiter.check("alice").await);
        // Different key has its own bucket
        assert!(limiter.check("bob").await);
    }

    #[test]
    fn key_uses_peer_ip_not_forwarded_for() {
        use axum::extract::ConnectInfo;
        use std::net::{IpAddr, Ipv4Addr, SocketAddr};

        // A spoofed X-Forwarded-For must NOT influence the bucket; the socket
        // peer IP governs. Distinct peer IPs must yield distinct keys.
        let peer = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(203, 0, 113, 7)), 54321);
        let mut req = Request::new(axum::body::Body::empty());
        req.headers_mut()
            .insert("x-forwarded-for", "1.2.3.4".parse().unwrap());
        req.extensions_mut().insert(ConnectInfo(peer));

        assert_eq!(rate_limit_key(&req), "203.0.113.7");

        let peer2 = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(198, 51, 100, 9)), 1);
        let mut req2 = Request::new(axum::body::Body::empty());
        req2.extensions_mut().insert(ConnectInfo(peer2));
        assert_eq!(rate_limit_key(&req2), "198.51.100.9");
        assert_ne!(rate_limit_key(&req), rate_limit_key(&req2));
    }

    #[test]
    fn key_falls_back_to_unknown_without_connect_info() {
        let req = Request::new(axum::body::Body::empty());
        assert_eq!(rate_limit_key(&req), "unknown");
    }

    /// F-30: the dedicated machine-surface limiter is a separate, more generous
    /// bucket — a 300/60s cap admits a burst that the auth-tuned 10/60s cap
    /// would have blocked long before.
    #[tokio::test]
    async fn generous_api_key_bucket_admits_beyond_auth_cap() {
        let auth = RateLimiter::new(10, 60, None);
        let api_key = RateLimiter::new(300, 60, None);
        let key = "apikey:abc";
        for i in 0..200 {
            assert!(
                api_key.check(key).await,
                "generous api-key bucket must admit request {i}"
            );
        }
        // The auth-tuned cap on its own bucket blocks after 10.
        for _ in 0..10 {
            assert!(auth.check("user:xyz").await);
        }
        assert!(
            !auth.check("user:xyz").await,
            "auth cap still blocks the 11th request"
        );
    }
}
