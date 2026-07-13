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

/// The socket peer IP (`ConnectInfo`), or `"unknown"` when the server was not
/// served with `into_make_service_with_connect_info::<SocketAddr>()`.
/// "unknown" is one shared bucket — a wiring bug, not a spoofing surface.
fn socket_ip(request: &Request) -> String {
    request
        .extensions()
        .get::<axum::extract::ConnectInfo<std::net::SocketAddr>>()
        .map(|ci| ci.0.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Derive the client IP used as the rate-limit bucket key for anonymous
/// requests, honouring the operator's declared trusted-proxy topology.
///
/// `trusted_hops` is [`crate::config::Config::trusted_proxy_hops`]:
///
/// - **`None`** — the deployment is directly exposed. `X-Forwarded-For` is
///   **ignored entirely** and the socket peer IP governs. A forged header
///   cannot move an attacker out of (or a victim into) any bucket.
///
/// - **`Some(n)`** — `n` trusted proxies sit in front of us, each appending the
///   peer it received from to `X-Forwarded-For`. The client IP is therefore the
///   **`n`-th entry counting from the RIGHT** (`chain[len - n]`): the rightmost
///   `n` entries were written by our own infrastructure, and the one
///   immediately left of them is the address the outermost trusted proxy
///   actually observed.
///
///   Counting from the LEFT would be unsafe: a client can put anything it likes
///   in the `X-Forwarded-For` it *sends*, and the edge proxy appends to that
///   list rather than replacing it. So `chain[0]` is attacker-chosen — it lets
///   a flooder rotate its own bucket key at will (evading the limit) and lets
///   it pin an innocent IP into a bucket it can exhaust (locking that victim
///   out). Prepending shifts every entry left, but it cannot change what the
///   `n`-th-from-the-right entry is, which is exactly why the right end is the
///   trusted end.
///
/// Fails safe to the socket IP whenever the chain is shorter than `n` (the
/// request did not traverse the configured proxies) or the counted entry does
/// not parse as an IP (proxy misconfiguration) — never to a client-controlled
/// value.
fn client_ip(request: &Request, trusted_hops: Option<usize>) -> String {
    let Some(hops) = trusted_hops.filter(|&n| n > 0) else {
        return socket_ip(request);
    };

    // A chain may arrive as several XFF headers; concatenating them in header
    // order reconstructs the single logical list (RFC 7230 §3.2.2).
    let chain: Vec<&str> = request
        .headers()
        .get_all("x-forwarded-for")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(','))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    // nth(hops - 1) from the right == chain[len - hops].
    match chain.iter().rev().nth(hops - 1).and_then(|s| parse_ip(s)) {
        Some(ip) => ip,
        None => socket_ip(request),
    }
}

/// Parse one `X-Forwarded-For` entry into a canonical IP string. Accepts a bare
/// address (`1.2.3.4`, `2001:db8::1`) and the `addr:port` / `[addr]:port` forms
/// some proxies emit; returns `None` for anything else (obfuscated identifiers,
/// `unknown`, junk) so the caller can fall back to the socket IP.
fn parse_ip(entry: &str) -> Option<String> {
    if let Ok(ip) = entry.parse::<std::net::IpAddr>() {
        return Some(ip.to_string());
    }
    if let Ok(sock) = entry.parse::<std::net::SocketAddr>() {
        return Some(sock.ip().to_string());
    }
    None
}

/// Derive the rate-limit bucket key for a request: the authenticated user id
/// when present, else the client IP per [`client_ip`].
fn rate_limit_key(request: &Request, trusted_hops: Option<usize>) -> String {
    if let Some(user) = request
        .extensions()
        .get::<crate::auth::models::AuthenticatedUser>()
    {
        return user.user_id.to_string();
    }
    client_ip(request, trusted_hops)
}

/// Run `limiter` against `key`, mapping exhaustion to 429.
///
/// Takes the key by value rather than the `Request`: an `&Request` held across
/// an `.await` would make the middleware future non-`Send` (`Body` is not
/// `Sync`), which axum's `from_fn` rejects. Every caller therefore derives the
/// key first — the borrow of the request ends before the check.
async fn enforce(limiter: &RateLimiter, key: String) -> Result<(), ApiError> {
    if !limiter.check(&key).await {
        return Err(ApiError::RateLimited);
    }
    Ok(())
}

/// Middleware that rate-limits based on the authenticated user ID or client IP.
pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let key = rate_limit_key(&request, state.config.trusted_proxy_hops);
    enforce(&state.rate_limiter, key).await?;
    Ok(next.run(request).await)
}

/// Per-IP budget on anonymous session creation (`POST /api/sessions`).
///
/// A separate, deliberately GENEROUS bucket: the auth-tuned 10/60s
/// [`AppState::rate_limiter`] would lock out a legitimate cohort starting a
/// study together behind one NAT. Defaults to 60/60s
/// ([`crate::config::Config::session_create_rate_max`]). The complementary
/// per-questionnaire ceiling — which a distributed flood cannot dodge by
/// rotating IPs — is enforced inside `create_session`, where the questionnaire
/// id is available.
pub async fn session_create_rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let key = rate_limit_key(&request, state.config.trusted_proxy_hops);
    enforce(&state.session_create_limiter, key).await?;
    Ok(next.run(request).await)
}

/// Per-IP budget on the anonymous session-media upload route
/// (`POST /api/sessions/{id}/media`). Defaults to 120/60s
/// ([`crate::config::Config::session_media_rate_max`]) — twice the
/// session-create budget, because one session may answer several file-upload
/// questions. The hard storage ceiling is the per-session file-count / total-
/// bytes quota enforced in `upload_session_media`.
pub async fn session_media_rate_limit_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let key = rate_limit_key(&request, state.config.trusted_proxy_hops);
    enforce(&state.session_media_limiter, key).await?;
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

    /// Build a request with an optional socket peer and an optional XFF chain.
    fn req_with(peer: Option<&str>, xff: Option<&str>) -> Request {
        use axum::extract::ConnectInfo;
        use std::net::SocketAddr;

        let mut req = Request::new(axum::body::Body::empty());
        if let Some(peer) = peer {
            let addr: SocketAddr = format!("{peer}:54321").parse().expect("peer addr");
            req.extensions_mut().insert(ConnectInfo(addr));
        }
        if let Some(xff) = xff {
            req.headers_mut()
                .insert("x-forwarded-for", xff.parse().unwrap());
        }
        req
    }

    #[test]
    fn key_uses_peer_ip_not_forwarded_for_when_no_proxy_configured() {
        // TRUSTED_PROXY_HOPS unset: a spoofed X-Forwarded-For must NOT influence
        // the bucket; the socket peer IP governs. Distinct peer IPs must yield
        // distinct keys.
        let req = req_with(Some("203.0.113.7"), Some("1.2.3.4"));
        assert_eq!(rate_limit_key(&req, None), "203.0.113.7");

        let req2 = req_with(Some("198.51.100.9"), None);
        assert_eq!(rate_limit_key(&req2, None), "198.51.100.9");
        assert_ne!(rate_limit_key(&req, None), rate_limit_key(&req2, None));
    }

    #[test]
    fn spoofed_forwarded_for_cannot_rotate_the_bucket_without_proxy_config() {
        // Same socket, three different forged XFF values → one and the same
        // bucket, so a flooder cannot evade the limit by rotating the header.
        let keys: Vec<String> = ["1.2.3.4", "5.6.7.8", "9.9.9.9, 8.8.8.8"]
            .iter()
            .map(|xff| rate_limit_key(&req_with(Some("203.0.113.7"), Some(xff)), None))
            .collect();
        assert!(
            keys.iter().all(|k| k == "203.0.113.7"),
            "XFF must be ignored entirely when no trusted proxy is configured: {keys:?}"
        );
    }

    #[test]
    fn key_falls_back_to_unknown_without_connect_info() {
        let req = Request::new(axum::body::Body::empty());
        assert_eq!(rate_limit_key(&req, None), "unknown");
    }

    #[test]
    fn one_trusted_hop_takes_the_rightmost_entry() {
        // One reverse proxy: it appends the peer it saw (the real client), so
        // the chain's LAST entry is the client. Socket peer is the proxy.
        let req = req_with(Some("10.0.0.1"), Some("198.51.100.23"));
        assert_eq!(rate_limit_key(&req, Some(1)), "198.51.100.23");
    }

    #[test]
    fn client_prepended_entries_cannot_move_the_bucket() {
        // THE attack: the client sends its own `X-Forwarded-For: <fake>`; the
        // edge proxy APPENDS the address it saw rather than replacing the
        // header. Right-counting is therefore stable — every one of these
        // prepend attempts still buckets under the real client IP.
        let real = "198.51.100.23";
        for forged in [
            "1.2.3.4",
            "9.9.9.9, 8.8.8.8",
            "203.0.113.7, 203.0.113.8, 203.0.113.9",
            "not-an-ip",
        ] {
            let req = req_with(Some("10.0.0.1"), Some(&format!("{forged}, {real}")));
            assert_eq!(
                rate_limit_key(&req, Some(1)),
                real,
                "prepending {forged:?} must not move the bucket"
            );
        }

        // And left-counting — the unsafe alternative — would have handed the
        // attacker a different key on each of those, which is precisely the
        // evasion this ordering prevents.
        let req = req_with(Some("10.0.0.1"), Some(&format!("1.2.3.4, {real}")));
        assert_ne!(
            rate_limit_key(&req, Some(1)),
            "1.2.3.4",
            "the leftmost (client-supplied) entry must never be the key"
        );
    }

    #[test]
    fn two_trusted_hops_count_from_the_right() {
        // client → edge → inner → app. Edge appends the client, inner appends
        // the edge. Real chain: "<client>, <edge>"; the client IP is the 2nd
        // from the right.
        let req = req_with(Some("10.0.0.2"), Some("198.51.100.23, 10.0.0.1"));
        assert_eq!(rate_limit_key(&req, Some(2)), "198.51.100.23");

        // With a client-prepended entry the chain grows on the left; the 2nd
        // from the right is unchanged.
        let req = req_with(
            Some("10.0.0.2"),
            Some("1.2.3.4, 5.6.7.8, 198.51.100.23, 10.0.0.1"),
        );
        assert_eq!(rate_limit_key(&req, Some(2)), "198.51.100.23");
    }

    #[test]
    fn short_or_malformed_chain_fails_safe_to_socket_ip() {
        // Chain shorter than the configured hop count → the request did not
        // traverse the proxies; never trust what is there.
        let req = req_with(Some("203.0.113.7"), Some("198.51.100.23"));
        assert_eq!(rate_limit_key(&req, Some(2)), "203.0.113.7");

        // No XFF at all under a proxy config.
        let req = req_with(Some("203.0.113.7"), None);
        assert_eq!(rate_limit_key(&req, Some(1)), "203.0.113.7");

        // Counted entry is not an IP (obfuscated / junk) → socket IP.
        let req = req_with(Some("203.0.113.7"), Some("1.2.3.4, _hidden"));
        assert_eq!(rate_limit_key(&req, Some(1)), "203.0.113.7");
    }

    #[test]
    fn forwarded_entry_with_port_is_normalized() {
        let req = req_with(Some("10.0.0.1"), Some("198.51.100.23:44321"));
        assert_eq!(rate_limit_key(&req, Some(1)), "198.51.100.23");
    }

    #[test]
    fn authenticated_key_is_the_user_id_regardless_of_proxy_config() {
        use crate::auth::models::AuthenticatedUser;
        let user_id = uuid::Uuid::new_v4();
        for hops in [None, Some(1), Some(2)] {
            let mut req = req_with(Some("203.0.113.7"), Some("1.2.3.4, 198.51.100.23"));
            req.extensions_mut().insert(AuthenticatedUser {
                user_id,
                email: "u@example.test".into(),
                roles: vec![],
                provider: "local".into(),
                mfa_verified: false,
                session_hash: None,
                jti: None,
            });
            assert_eq!(rate_limit_key(&req, hops), user_id.to_string());
        }
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
