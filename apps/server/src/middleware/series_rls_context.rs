//! Series-path RLS context middleware (E-FLOW-2).
//!
//! Sibling of [`super::fillout_rls_context::set_fillout_rls_context`], for
//! the anonymous participant endpoints on `series_public_routes`
//! (`GET /api/series/prompt/{resume_token}` and its `…/complete` /
//! `…/unsubscribe` siblings).
//!
//! It always opens a per-request transaction and sets **two** GUCs (either
//! may be NULL):
//!   - `app.user_id` — from the JWT when present (so a logged-in
//!     researcher hitting a participant endpoint is still admitted via the
//!     org-member policy branch).
//!   - `app.enrollment_token` — parsed from the URL path segment after
//!     `/prompt/`. This is the `series_enrollment.resume_token` the
//!     dual-path policies in `00042_study_series.sql` admit on.
//!
//! Commit/rollback policy mirrors the fillout sibling: 2xx/3xx commit,
//! everything else rolls back.

use std::sync::Arc;

use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::tx::SharedTx;
use crate::state::AppState;

pub async fn set_series_rls_context(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let user_id = extract_user_id_from_jwt(&state, &request);
    let enrollment_token = extract_enrollment_token_from_path(request.uri().path());

    let mut tx = state.pool.begin().await?;

    // Transaction-local GUCs; empty string resolves to NULL via NULLIF in
    // the `current_app_*` helpers.
    sqlx::query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.enrollment_token', $2, true)",
    )
    .bind(user_id.map(|u| u.to_string()).unwrap_or_default())
    .bind(enrollment_token.map(|t| t.to_string()).unwrap_or_default())
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
                tracing::error!("series-RLS-tx commit failed: {e}");
                return Err(ApiError::Database(e));
            }
        } else if let Err(e) = tx.rollback().await {
            tracing::warn!("series-RLS-tx rollback failed (response was {status}): {e}");
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

/// Pull the resume-token UUID out of the request path.
///
/// The middleware is mounted on `series_public_routes`, nested under
/// `/api/series`, so inside this middleware the path looks like
/// `/prompt/<uuid>` or `/prompt/<uuid>/complete`. Any other shape yields
/// `None` (the GUC stays NULL and every policy branch that needs it fails
/// closed).
fn extract_enrollment_token_from_path(path: &str) -> Option<Uuid> {
    let rest = path.strip_prefix('/')?;
    let mut segs = rest.split('/');
    if segs.next()? != "prompt" {
        return None;
    }
    let token = segs.next()?;
    Uuid::parse_str(token).ok()
}

#[cfg(test)]
mod tests {
    use super::extract_enrollment_token_from_path;
    use uuid::Uuid;

    #[test]
    fn parses_token_from_prompt_paths() {
        let id = Uuid::new_v4();
        let s = id.to_string();
        for suffix in ["", "/complete", "/unsubscribe"] {
            let path = format!("/prompt/{s}{suffix}");
            assert_eq!(
                extract_enrollment_token_from_path(&path),
                Some(id),
                "should parse from {path}"
            );
        }
    }

    #[test]
    fn rejects_non_prompt_or_non_uuid_paths() {
        assert_eq!(extract_enrollment_token_from_path("/"), None);
        assert_eq!(extract_enrollment_token_from_path("/prompt"), None);
        assert_eq!(
            extract_enrollment_token_from_path("/prompt/not-a-uuid"),
            None
        );
        assert_eq!(extract_enrollment_token_from_path("/enrollments"), None);
    }
}
