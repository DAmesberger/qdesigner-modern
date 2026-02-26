use axum::{extract::Request, extract::State, middleware::Next, response::Response};

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;

/// Middleware that sets `app.user_id` and `app.user_role` as PostgreSQL
/// session-local variables so that RLS policies can reference them.
///
/// Must run *after* the auth middleware populates `AuthenticatedUser`.
#[allow(dead_code)]
pub async fn set_rls_context(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if let Some(user) = request.extensions().get::<AuthenticatedUser>() {
        let user_id = user.user_id.to_string();
        let primary_role = user.roles.first().cloned().unwrap_or_default();

        sqlx::query(&format!(
            "SELECT set_config('app.user_id', '{}', false)",
            user_id
        ))
        .execute(&state.pool)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to set RLS context: {e}")))?;

        sqlx::query(&format!(
            "SELECT set_config('app.user_role', '{}', false)",
            primary_role
        ))
        .execute(&state.pool)
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to set RLS context: {e}")))?;
    }

    Ok(next.run(request).await)
}
