//! Per-request transaction handle and `Tx` extractor.
//!
//! The `set_rls_context` middleware ([`super::rls_context`]) acquires a
//! pooled connection per authenticated request, begins a transaction,
//! sets `app.user_id` / `app.user_role` as transaction-local GUCs via
//! `set_config(..., true)`, and stashes the live transaction in the
//! request's extensions under [`SharedTx`].
//!
//! Authenticated handlers pull the transaction out via the [`Tx`]
//! extractor and run every SQL statement against the same pinned
//! connection. The middleware commits on a success status and rolls
//! back on anything else (including panics caught by the
//! `CatchPanicLayer` mounted above it).
//!
//! Wrapping `Option<Transaction<'static, Postgres>>` in
//! `Arc<Mutex<…>>` is what lets the transaction live in request
//! extensions (which require `Clone + Send + Sync + 'static`) while
//! still being mutably borrowed inside a handler — exactly one task
//! ever locks the mutex (Axum runs the handler chain serially per
//! request) so the lock is uncontended.

use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sqlx::{Postgres, Transaction};
use tokio::sync::Mutex;

use crate::error::ApiError;

/// Shared, optionally-present transaction. The slot is `None` after the
/// middleware takes it back at the end of the request (or if the
/// middleware was not mounted).
pub type SharedTx = Arc<Mutex<Option<Transaction<'static, Postgres>>>>;

/// Handler extractor that yields the per-request transaction handle.
///
/// Usage:
/// ```text
/// pub async fn handler(tx: Tx, ...) -> Result<..., ApiError> {
///     let mut guard = tx.lock().await;
///     let tx = guard.as_mut().expect("rls_context middleware sets the tx");
///     sqlx::query(...).fetch_one(&mut **tx).await?;
/// }
/// ```
#[derive(Clone)]
pub struct Tx(SharedTx);

impl Tx {
    /// Lock the shared slot for the duration of one or more queries.
    /// The returned guard derefs to `&mut Option<Transaction<…>>`; in
    /// well-formed handlers the option is always `Some` because the
    /// middleware places the transaction there before the handler runs
    /// and only removes it after the handler returns.
    pub async fn lock(
        &self,
    ) -> tokio::sync::MutexGuard<'_, Option<Transaction<'static, Postgres>>> {
        self.0.lock().await
    }
}

impl<S> FromRequestParts<S> for Tx
where
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<SharedTx>()
            .cloned()
            .map(Tx)
            .ok_or_else(|| {
                ApiError::Internal(
                    "Tx extractor used on a route not wrapped in set_rls_context".into(),
                )
            })
    }
}
