//! Fillout-path RLS context middleware (P6.3, ADR 0012).
//!
//! Sibling to [`super::rls_context::set_rls_context`]. Differences:
//!
//! - **Always** opens a per-request transaction. Anonymous fillout
//!   has no JWT but still needs the transaction so the dual-path RLS
//!   policies in `00021_fillout_dual_policies.sql` can read the
//!   `app.session_id` GUC.
//! - Sets **two** GUCs (either may be NULL):
//!     - `app.user_id` — populated from the JWT if present.
//!     - `app.session_id` — populated from the request URL when the
//!       path matches `/api/sessions/<uuid>/…` (everything except the
//!       create endpoint).
//! - Both GUCs are transaction-local (`set_config(…, true)`).
//!
//! Mount on `session_routes` instead of `set_rls_context`. The `Tx`
//! extractor reads from the same `SharedTx` slot, so the handler-side
//! API is unchanged.
//!
//! Commit/rollback policy mirrors `set_rls_context`: 2xx/3xx commit,
//! everything else rolls back.

use std::sync::Arc;

use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::tx::SharedTx;
use crate::state::AppState;

pub async fn set_fillout_rls_context(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let user_id = extract_user_id_from_jwt(&state, &request);
    let session_id = extract_session_id_from_path(request.uri().path());

    let mut tx = state.pool.begin().await?;

    // set_config(key, value, true) — `true` makes the setting
    // transaction-local (cleared on commit/rollback). Empty string
    // resolves to NULL via NULLIF in the `current_app_*_id()` helpers.
    sqlx::query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.session_id', $2, true)",
    )
    .bind(user_id.map(|u| u.to_string()).unwrap_or_default())
    .bind(session_id.map(|s| s.to_string()).unwrap_or_default())
    .execute(&mut *tx)
    .await?;

    let slot: SharedTx = Arc::new(Mutex::new(Some(tx)));
    request.extensions_mut().insert(slot.clone());

    let response = next.run(request).await;

    let taken = {
        let mut guard = slot.lock().await;
        guard.take()
    };

    if let Some(tx) = taken {
        let status = response.status();
        if status.is_success() || status.is_redirection() {
            if let Err(e) = tx.commit().await {
                tracing::error!("fillout-RLS-tx commit failed: {e}");
                return Err(ApiError::Database(e));
            }
        } else if let Err(e) = tx.rollback().await {
            tracing::warn!("fillout-RLS-tx rollback failed (response was {status}): {e}");
        }
    }

    Ok(response)
}

fn extract_user_id_from_jwt(state: &AppState, request: &Request) -> Option<Uuid> {
    let auth_header = request.headers().get("authorization")?.to_str().ok()?;
    let token = auth_header.strip_prefix("Bearer ")?;
    let claims = state.jwt_manager.verify_access_token(token).ok()?;
    Some(claims.sub)
}

/// Pull the session UUID out of the request path.
///
/// The middleware is mounted on `session_routes` which is nested under
/// `/api/sessions` in the outer router. Axum's nesting strips the nest
/// prefix from `request.uri().path()`, so inside this middleware the
/// path looks like `/` for create, `/<uuid>` for get/update,
/// `/<uuid>/responses` for sub-resources, and `/aggregate` (etc.) for
/// listing endpoints.
fn extract_session_id_from_path(path: &str) -> Option<Uuid> {
    // Strip the leading slash; first segment is either a UUID or a
    // non-UUID listing keyword.
    let rest = path.strip_prefix('/')?;
    if rest.is_empty() {
        return None;
    }
    let first = rest.split('/').next()?;
    Uuid::parse_str(first).ok()
}

#[cfg(test)]
mod tests {
    use super::extract_session_id_from_path;
    use uuid::Uuid;

    #[test]
    fn parses_session_id_from_subresource_paths() {
        let id = Uuid::new_v4();
        let s = id.to_string();
        for suffix in ["", "/responses", "/events", "/sync", "/variables", "/media"] {
            let path = format!("/{s}{suffix}");
            assert_eq!(
                extract_session_id_from_path(&path),
                Some(id),
                "should parse from {path}"
            );
        }
    }

    #[test]
    fn rejects_non_uuid_segments() {
        // Create endpoint hits "/" (after nest-prefix strip).
        assert_eq!(extract_session_id_from_path("/"), None);
        assert_eq!(extract_session_id_from_path(""), None);
        // Listing/utility paths the session router carries that aren't
        // session-id keyed.
        for path in [
            "/aggregate",
            "/dashboard",
            "/filter",
            "/timeseries",
            "/compare",
            "/check-duplicate",
        ] {
            assert_eq!(
                extract_session_id_from_path(path),
                None,
                "should not parse from {path}"
            );
        }
    }
}
