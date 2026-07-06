//! API-key authentication context (E-RBAC-7).
//!
//! Sibling to [`super::rls_context::set_rls_context`], but the principal is a
//! machine identity resolved from an `Authorization: Bearer sk_<prefix>_<secret>`
//! header instead of a JWT. Mounted on the `/api/v1/*` machine surface.
//!
//! Flow:
//!   1. Parse the `sk_` token, resolve the candidate `api_keys` row by its
//!      indexed `prefix`, and Argon2-verify the full token against `key_hash`.
//!      Reject revoked / expired keys.
//!   2. Rate-limit by key id (reusing [`AppState::rate_limiter`]) so a noisy
//!      integration can't hammer the surface.
//!   3. Stamp `last_used_at` on the app pool (NOT the request tx, so it survives
//!      a handler that later returns a non-2xx) and, on the FIRST successful use,
//!      append an `api_key.first_used` audit event.
//!   4. Open a per-request RLS transaction with `app.user_id = created_by` (the
//!      human who minted the key — a real, active org member, so the existing
//!      `access::verify_*` gates and membership-scoped RLS policies admit the
//!      key exactly to its creator's reach). The key's `scopes` narrow further:
//!      each machine route calls [`ApiKey::require_scope`] before doing any work.
//!
//! Setting `app.user_id` to the creator (rather than a brand-new synthetic user
//! row) is the E-RBAC-7 "synthetic service principal" realised without a new
//! cross-cutting RLS policy or a member seat: a key can never exceed its
//! creator's access, and revoking the key (or the creator losing membership)
//! stops it. See the module ADR note in `api::api_keys`.

use std::collections::HashSet;
use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use chrono::{DateTime, Utc};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::audit::{self, resource, AuditAction, AuditEvent};
use crate::auth::password::verify_password;
use crate::error::ApiError;
use crate::middleware::tx::SharedTx;
use crate::rbac::models::Permission;
use crate::state::AppState;

/// The resolved machine principal for one API-key request. Stashed in the
/// request extensions by [`set_api_key_context`] and pulled back out by the
/// [`ApiKey`] extractor.
#[derive(Debug, Clone)]
pub struct ApiKeyContext {
    pub key_id: Uuid,
    pub organization_id: Uuid,
    /// The human who minted the key; also the RLS `app.user_id` principal.
    pub created_by: Uuid,
    /// Granted permission scopes (unknown/retired tokens are dropped).
    pub scopes: HashSet<Permission>,
}

impl ApiKeyContext {
    /// Admit the request only when the key was granted `permission`, else 403.
    pub fn require_scope(&self, permission: Permission) -> Result<(), ApiError> {
        if self.scopes.contains(&permission) {
            Ok(())
        } else {
            Err(ApiError::Forbidden(format!(
                "This API key is not scoped for the '{}' permission",
                permission.as_str()
            )))
        }
    }
}

/// Parse the public `prefix` out of an `sk_<prefix>_<secret>` token.
fn parse_prefix(token: &str) -> Option<&str> {
    let rest = token.strip_prefix("sk_")?;
    let prefix = rest.split('_').next()?;
    if prefix.is_empty() {
        None
    } else {
        Some(prefix)
    }
}

#[derive(sqlx::FromRow)]
struct ApiKeyRow {
    id: Uuid,
    organization_id: Uuid,
    created_by: Option<Uuid>,
    scopes: Vec<String>,
    key_hash: String,
    expires_at: Option<DateTime<Utc>>,
    revoked_at: Option<DateTime<Utc>>,
    last_used_at: Option<DateTime<Utc>>,
}

/// Resolve + verify a presented `sk_` token to an [`ApiKeyContext`], returning a
/// 401 for any failure mode (absent header, unknown prefix, bad secret, revoked,
/// expired, orphaned principal). Also stamps `last_used_at` and emits the
/// first-use audit event as a side effect on success.
async fn authenticate(state: &AppState, token: &str) -> Result<ApiKeyContext, ApiError> {
    let prefix =
        parse_prefix(token).ok_or_else(|| ApiError::Unauthorized("Malformed API key".into()))?;

    let row = sqlx::query_as::<_, ApiKeyRow>(
        r#"
        SELECT id, organization_id, created_by, scopes, key_hash,
               expires_at, revoked_at, last_used_at
        FROM api_keys
        WHERE prefix = $1
        "#,
    )
    .bind(prefix)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("Invalid API key".into()))?;

    // Constant-work verify regardless of the branch taken above would be ideal,
    // but the prefix is public (non-secret) so a prefix miss leaks nothing an
    // attacker couldn't already enumerate; the full-token Argon2 verify below is
    // the actual gate.
    if !verify_password(token, &row.key_hash)? {
        return Err(ApiError::Unauthorized("Invalid API key".into()));
    }

    if row.revoked_at.is_some() {
        return Err(ApiError::Unauthorized("API key has been revoked".into()));
    }
    if let Some(exp) = row.expires_at {
        if exp <= Utc::now() {
            return Err(ApiError::Unauthorized("API key has expired".into()));
        }
    }

    let created_by = row
        .created_by
        .ok_or_else(|| ApiError::Unauthorized("API key principal no longer exists".into()))?;

    // Rate-limit by key id, reusing the shared limiter (E-RBAC-7 step 8). The
    // `apikey:` bucket prefix keeps it from colliding with the user-id / IP
    // buckets. NOTE: the shared limiter is tuned for the auth surface
    // (main.rs: 10 requests / 60s); a high-throughput integration that needs a
    // larger machine budget should be given a dedicated, more generous
    // `RateLimiter` instance in `AppState` rather than widening the auth cap.
    if !state
        .rate_limiter
        .check(&format!("apikey:{}", row.id))
        .await
    {
        return Err(ApiError::RateLimited);
    }

    // Stamp last_used_at on the pool (autocommit) so it persists even if the
    // handler later returns an error and the request tx rolls back.
    let first_use = row.last_used_at.is_none();
    sqlx::query("UPDATE api_keys SET last_used_at = now() WHERE id = $1")
        .bind(row.id)
        .execute(&state.pool)
        .await?;

    if first_use {
        // Best-effort first-use audit on a dedicated pool connection. A failure
        // here must not deny an otherwise-valid request, so log and continue.
        if let Ok(mut conn) = state.pool.acquire().await {
            let _ = audit::record(
                &mut conn,
                AuditEvent {
                    organization_id: row.organization_id,
                    actor_user_id: created_by,
                    action: AuditAction::ApiKeyFirstUsed,
                    resource_type: resource::API_KEY,
                    resource_id: Some(row.id),
                    metadata: serde_json::json!({}),
                    ip: None,
                },
            )
            .await;
        }
    }

    let scopes = row
        .scopes
        .iter()
        .filter_map(|s| Permission::from_str(s))
        .collect::<HashSet<Permission>>();

    Ok(ApiKeyContext {
        key_id: row.id,
        organization_id: row.organization_id,
        created_by,
        scopes,
    })
}

/// Middleware for the `/api/v1/*` machine surface. Authenticates the API key,
/// opens an RLS transaction bound to the key's creator, and stashes both the
/// transaction ([`SharedTx`]) and the [`ApiKeyContext`] in the request
/// extensions. Commit/rollback policy mirrors `set_rls_context`.
pub async fn set_api_key_context(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let token = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| ApiError::Unauthorized("Missing API key".into()))?
        .to_string();

    let ctx = authenticate(&state, &token).await?;

    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(ctx.created_by.to_string())
        .execute(&mut *tx)
        .await?;

    let slot: SharedTx = Arc::new(Mutex::new(Some(tx)));
    request.extensions_mut().insert(slot.clone());
    request.extensions_mut().insert(Arc::new(ctx));

    let response = next.run(request).await;

    let taken = {
        let mut guard = slot.lock().await;
        guard.take()
    };

    if let Some(tx) = taken {
        let status = response.status();
        if status.is_success() || status.is_redirection() {
            if let Err(e) = tx.commit().await {
                tracing::error!("api-key-tx commit failed: {e}");
                return Err(ApiError::Database(e));
            }
        } else if let Err(e) = tx.rollback().await {
            tracing::warn!("api-key-tx rollback failed (response was {status}): {e}");
        }
    }

    Ok(response)
}

/// Handler extractor yielding the resolved [`ApiKeyContext`]. Errors with 500 if
/// used on a route not wrapped in [`set_api_key_context`] (a wiring bug).
pub struct ApiKey(pub Arc<ApiKeyContext>);

impl FromRequestParts<AppState> for ApiKey {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        _state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<Arc<ApiKeyContext>>()
            .cloned()
            .map(ApiKey)
            .ok_or_else(|| {
                ApiError::Internal(
                    "ApiKey extractor used on a route not wrapped in set_api_key_context".into(),
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_prefix_from_token() {
        assert_eq!(
            parse_prefix("sk_abc123def456_thesecretpart"),
            Some("abc123def456")
        );
        assert_eq!(parse_prefix("sk_deadbeef_x"), Some("deadbeef"));
    }

    #[test]
    fn rejects_non_sk_tokens() {
        assert_eq!(parse_prefix("Bearer xyz"), None);
        assert_eq!(parse_prefix("jwt.token.here"), None);
        assert_eq!(parse_prefix("sk_"), None);
        assert_eq!(parse_prefix("sk__nosecret"), None);
    }
}
