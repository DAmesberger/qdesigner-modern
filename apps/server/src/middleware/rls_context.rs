use std::sync::Arc;

use axum::{extract::Request, extract::State, middleware::Next, response::Response};
use tokio::sync::Mutex;

use crate::error::ApiError;
use crate::middleware::tx::SharedTx;
use crate::state::AppState;

/// Middleware that pins a connection per authenticated request and sets
/// `app.user_id` / `app.user_role` as **transaction-local** PostgreSQL
/// GUCs (via `set_config(..., true)`). The transaction is stashed in the
/// request extensions so the [`crate::middleware::tx::Tx`] extractor can
/// hand it to handlers; every query the handler runs goes against this
/// pinned connection, which is the only way our `00014_rls_policies.sql`
/// policies (which read `current_app_user_id()`) can see the right
/// `app.user_id` value.
///
/// Commit/rollback policy:
/// - `2xx` / `3xx` → commit.
/// - everything else (including 5xx synthesized by the `CatchPanicLayer`
///   above this middleware) → rollback.
///
/// One edge case: if `tx.commit().await` itself panics (after the handler
/// returned successfully and `CatchPanicLayer` has already finished), the
/// panic propagates uncaught past this middleware. Connection-leak risk
/// is bounded by sqlx's `Transaction::drop` rolling back on unhappy drop,
/// so the connection still returns to the pool — just via the drop path
/// rather than the explicit rollback branch above.
///
/// If the request carries no valid `Authorization: Bearer` header the
/// middleware does *not* open a transaction. Routes that require auth
/// rely on the `AuthenticatedUser` extractor to issue the 401 themselves;
/// routes that allow anonymous access keep working without a Tx.
pub async fn set_rls_context(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let Some((user_id, primary_role)) = extract_user_from_request(&state, &request) else {
        return Ok(next.run(request).await);
    };

    let mut tx = state.pool.begin().await?;

    sqlx::query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)",
    )
    .bind(user_id.to_string())
    .bind(&primary_role)
    .execute(&mut *tx)
    .await?;

    let slot: SharedTx = Arc::new(Mutex::new(Some(tx)));
    request.extensions_mut().insert(slot.clone());

    let response = next.run(request).await;

    // Take the transaction back. If the handler somehow already consumed
    // it (shouldn't happen with the current extractor design) the option
    // is None and we have nothing to commit.
    let taken = {
        let mut guard = slot.lock().await;
        guard.take()
    };

    if let Some(tx) = taken {
        let status = response.status();
        if status.is_success() || status.is_redirection() {
            if let Err(e) = tx.commit().await {
                tracing::error!("RLS-tx commit failed: {e}");
                return Err(ApiError::Database(e));
            }
        } else if let Err(e) = tx.rollback().await {
            // A rollback failure here is logged but not surfaced — the
            // original error response is more informative than a 500
            // about the rollback path.
            tracing::warn!("RLS-tx rollback failed (response was {status}): {e}");
        }
    }

    Ok(response)
}

/// Decode the JWT from the Authorization header without consuming the request.
/// Returns `(user_id, primary_role)` or `None` if the header is absent / invalid.
fn extract_user_from_request(state: &AppState, request: &Request) -> Option<(uuid::Uuid, String)> {
    let auth_header = request.headers().get("authorization")?.to_str().ok()?;
    let token = auth_header.strip_prefix("Bearer ")?;
    let claims = state.jwt_manager.verify_access_token(token).ok()?;
    let primary_role = claims.roles.first().cloned().unwrap_or_default();
    Some((claims.sub, primary_role))
}
