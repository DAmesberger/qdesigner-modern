use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::auth::models::AuthenticatedUser;
use crate::auth::session::is_access_token_revoked;
use crate::error::ApiError;
use crate::state::AppState;

/// Extractor that pulls a validated `AuthenticatedUser` from the
/// Authorization: Bearer <token> header via `FromRequestParts`.
impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Extract Bearer token
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| ApiError::Unauthorized("Missing Authorization header".into()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| ApiError::Unauthorized("Invalid Authorization header format".into()))?;

        // Verify JWT
        let claims = state.jwt_manager.verify_access_token(token)?;

        // Check JTI revocation
        if is_access_token_revoked(&state.pool, claims.jti).await? {
            return Err(ApiError::Unauthorized("Token has been revoked".into()));
        }

        Ok(AuthenticatedUser {
            user_id: claims.sub,
            email: claims.email,
            roles: claims.roles,
            jti: claims.jti,
        })
    }
}

/// Optional auth extractor — returns None instead of 401 when no token present.
pub struct OptionalUser(pub Option<AuthenticatedUser>);

impl FromRequestParts<AppState> for OptionalUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        match AuthenticatedUser::from_request_parts(parts, state).await {
            Ok(user) => Ok(OptionalUser(Some(user))),
            Err(_) => Ok(OptionalUser(None)),
        }
    }
}
