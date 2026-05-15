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

/// Middleware that rate-limits based on the authenticated user ID or remote IP.
pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let key = request
        .extensions()
        .get::<crate::auth::models::AuthenticatedUser>()
        .map(|u| u.user_id.to_string())
        .unwrap_or_else(|| {
            request
                .headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("unknown")
                .to_string()
        });

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
}
