use axum::{extract::Request, extract::State, middleware::Next, response::Response};

use crate::auth::session;
use crate::error::ApiError;
use crate::state::AppState;

/// Middleware that rejects unsafe requests unless they either:
/// - are anonymous XHR-style requests, or
/// - carry a valid session-bound CSRF header for the `qd_session` cookie.
///
/// This keeps public fillout and login forms behind the old non-simple-request
/// guard while making authenticated cookie requests prove they know the
/// per-session CSRF token returned by `/api/auth/session`.
pub async fn csrf_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let method = request.method().clone();

    // Only check state-changing methods
    if method == axum::http::Method::GET
        || method == axum::http::Method::HEAD
        || method == axum::http::Method::OPTIONS
    {
        return Ok(next.run(request).await);
    }

    if let Some(session_token) = session::extract_session_cookie(request.headers()) {
        let csrf_token = request
            .headers()
            .get(session::CSRF_HEADER)
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.trim().is_empty())
            .ok_or_else(|| ApiError::Forbidden("Missing CSRF token".into()))?;

        if !session::validate_csrf(&state.pool, &session_token, csrf_token).await? {
            return Err(ApiError::Forbidden("Invalid CSRF token".into()));
        }

        return Ok(next.run(request).await);
    }

    // Allow if X-Requested-With header is present
    let has_xhr = request
        .headers()
        .get("x-requested-with")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("XMLHttpRequest"))
        .unwrap_or(false);

    if !has_xhr {
        return Err(ApiError::Forbidden(
            "Missing X-Requested-With header".into(),
        ));
    }

    Ok(next.run(request).await)
}
