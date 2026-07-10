use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::auth::models::AuthenticatedUser;
use crate::auth::session::{
    extract_session_cookie, is_access_token_revoked, resolve_session_token,
};
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
        if let Some(session_token) = extract_session_cookie(&parts.headers) {
            if let Some(user) = resolve_session_token(
                &state.pool,
                &session_token,
                state.config.auth_session_idle_expiry,
            )
            .await?
            {
                return Ok(user);
            }
            return Err(ApiError::Unauthorized("Invalid session".into()));
        }

        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| ApiError::Unauthorized("Missing session".into()))?;

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
            provider: "legacy_bearer".into(),
            mfa_verified: false,
            session_hash: None,
            jti: Some(claims.jti),
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
