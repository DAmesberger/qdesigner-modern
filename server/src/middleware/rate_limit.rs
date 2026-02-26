use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::ApiError;
use crate::state::AppState;

/// Simple in-memory sliding-window rate limiter.
/// When Redis is available the state could be moved there instead.
#[derive(Clone)]
pub struct RateLimiter {
    /// Map of client key -> list of request timestamps (unix seconds).
    windows: Arc<Mutex<HashMap<String, Vec<i64>>>>,
    /// Maximum requests per window.
    max_requests: u64,
    /// Window size in seconds.
    window_secs: i64,
}

impl RateLimiter {
    pub fn new(max_requests: u64, window_secs: i64) -> Self {
        Self {
            windows: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window_secs,
        }
    }

    /// Returns `true` if the request is allowed.
    pub async fn check(&self, key: &str) -> bool {
        let now = chrono::Utc::now().timestamp();
        let cutoff = now - self.window_secs;

        let mut windows = self.windows.lock().await;
        let entry = windows.entry(key.to_string()).or_default();

        // Remove expired entries
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
    // Derive a key from the user ID (if authenticated) or source IP.
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
