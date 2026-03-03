use axum::{extract::Request, middleware::Next, response::Response};

use crate::error::ApiError;

/// Middleware that rejects state-changing requests (POST, PUT, PATCH, DELETE) unless
/// they include the `X-Requested-With: XMLHttpRequest` header **or** carry a valid
/// JWT in the Authorization header. This prevents basic CSRF attacks from plain HTML
/// forms while allowing legitimate API calls.
pub async fn csrf_middleware(request: Request, next: Next) -> Result<Response, ApiError> {
    let method = request.method().clone();

    // Only check state-changing methods
    if method == axum::http::Method::GET
        || method == axum::http::Method::HEAD
        || method == axum::http::Method::OPTIONS
    {
        return Ok(next.run(request).await);
    }

    // Allow if Authorization header is present (JWT-authenticated request)
    let has_auth = request.headers().contains_key("authorization");

    // Allow if X-Requested-With header is present
    let has_xhr = request
        .headers()
        .get("x-requested-with")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("XMLHttpRequest"))
        .unwrap_or(false);

    if !has_auth && !has_xhr {
        return Err(ApiError::Forbidden(
            "Missing X-Requested-With header".into(),
        ));
    }

    Ok(next.run(request).await)
}
