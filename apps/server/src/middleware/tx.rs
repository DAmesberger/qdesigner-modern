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

use std::ops::{Deref, DerefMut};
use std::sync::Arc;

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sqlx::{Postgres, Transaction};
use tokio::sync::{Mutex, MutexGuard};

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

    /// Lock the shared slot and yield a [`TxHandle`] that derefs straight
    /// to the live `Transaction`. This replaces the two-line
    /// `let mut guard = tx.lock().await; let tx = guard.as_mut().expect(…);`
    /// prelude every authenticated handler used to open with.
    ///
    /// Errors with [`ApiError::Internal`] when the slot is `None` — the
    /// route was wired without `set_rls_context`, which is a server
    /// configuration bug rather than a client-visible condition.
    pub async fn tx(&self) -> Result<TxHandle<'_>, ApiError> {
        let guard = self.0.lock().await;
        if guard.is_none() {
            return Err(ApiError::Internal(
                "rls_context middleware did not place a transaction".into(),
            ));
        }
        Ok(TxHandle(guard))
    }
}

/// Guard yielded by [`Tx::tx`]. Wraps the locked slot and derefs to the
/// live `Transaction<'static, Postgres>`, so call sites keep passing
/// `&mut **tx` to sqlx executors exactly as before. The held
/// [`MutexGuard`] borrows the `Arc<Mutex<…>>` owned by the originating
/// [`Tx`], which the handler keeps alive (shadowed) to end of scope.
pub struct TxHandle<'a>(MutexGuard<'a, Option<Transaction<'static, Postgres>>>);

impl Deref for TxHandle<'_> {
    type Target = Transaction<'static, Postgres>;

    fn deref(&self) -> &Self::Target {
        self.0
            .as_ref()
            .expect("TxHandle only constructed when the slot is Some")
    }
}

impl DerefMut for TxHandle<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.0
            .as_mut()
            .expect("TxHandle only constructed when the slot is Some")
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
