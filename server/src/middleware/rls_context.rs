use axum::{extract::Request, extract::State, middleware::Next, response::Response};

use crate::error::ApiError;
use crate::state::AppState;

/// Middleware that sets `app.user_id` and `app.user_role` as PostgreSQL
/// session-level variables so that RLS policies can reference them.
///
/// Extracts the JWT Bearer token directly (same logic as the AuthenticatedUser
/// extractor) so it can run before handler-level extraction.
///
/// Uses `set_config(..., false)` (session-scoped) because there is no
/// surrounding transaction.  To prevent context from leaking across pooled
/// connections, both variables are explicitly reset to empty strings after
/// the downstream handler returns.
pub async fn set_rls_context(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    // Try to extract user identity from the Authorization header.
    let user_info = extract_user_from_request(&state, &request);

    if let Some((user_id, primary_role)) = user_info {
        let user_id_str = user_id.to_string();

        // Set session-scoped RLS variables (false = session-level, survives
        // until overwritten or connection is returned to pool).
        sqlx::query("SELECT set_config('app.user_id', $1, false), set_config('app.user_role', $2, false)")
            .bind(&user_id_str)
            .bind(&primary_role)
            .execute(&state.pool)
            .await
            .map_err(|e| ApiError::Internal(format!("Failed to set RLS context: {e}")))?;

        let response = next.run(request).await;

        // Reset to prevent context leaking to the next request on this
        // pooled connection.
        let _ = sqlx::query(
            "SELECT set_config('app.user_id', '', false), set_config('app.user_role', '', false)",
        )
        .execute(&state.pool)
        .await;

        Ok(response)
    } else {
        // No auth header or invalid token — let downstream handlers decide
        // whether to reject (via the AuthenticatedUser extractor).
        Ok(next.run(request).await)
    }
}

/// Decode the JWT from the Authorization header without consuming the request.
/// Returns `(user_id, primary_role)` or `None` if the header is absent / invalid.
fn extract_user_from_request(
    state: &AppState,
    request: &Request,
) -> Option<(uuid::Uuid, String)> {
    let auth_header = request
        .headers()
        .get("authorization")?
        .to_str()
        .ok()?;

    let token = auth_header.strip_prefix("Bearer ")?;

    let claims = state.jwt_manager.verify_access_token(token).ok()?;

    let primary_role = claims.roles.first().cloned().unwrap_or_default();
    Some((claims.sub, primary_role))
}
