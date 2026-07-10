//! Background housekeeping jobs that keep append-only / expiring tables tidy.
//!
//! Currently a single job: purge expired `resource_shares` (F-31). The
//! `purge_expired_resource_shares()` SQL function already exists (00041) and
//! reads/predicates already treat expired grants as inert, so the rows are
//! functionally harmless — but nothing called the function, so they accrete.
//! This wires it to a periodic tick.
//!
//! Follows the series-scheduler pattern (`series::spawn_scheduler`): a
//! fire-and-forget tokio interval task that runs for the process lifetime, with
//! the single-tick body factored into a public `run_share_purge` so a test can
//! drive one pass deterministically. The purge fn is SECURITY DEFINER, so the
//! non-BYPASSRLS app pool can delete across tenants.

use std::time::Duration;

use crate::state::AppState;

/// How often the share-purge job wakes. Hourly: expired grants are already inert
/// on reads, so this is pure hygiene — no need to run it hot.
const SHARE_PURGE_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Spawn the expired-resource-share purger. Fire-and-forget; the handle is
/// dropped (the task runs for the process lifetime, mirroring the series
/// scheduler and the revoked-token purger in `main.rs`).
pub fn spawn_share_purge(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(SHARE_PURGE_INTERVAL);
        // Skip missed ticks rather than bursting to catch up after a stall.
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            match run_share_purge(&state).await {
                Ok(0) => {}
                Ok(n) => tracing::info!(purged = n, "purged expired resource_shares"),
                Err(e) => tracing::warn!("resource_shares purge failed: {e}"),
            }
        }
    });
}

/// Run a single purge pass. Returns the number of expired rows removed. Public so
/// an integration test can drive one pass instead of waiting on the interval.
pub async fn run_share_purge(state: &AppState) -> Result<i64, sqlx::Error> {
    let purged: i32 = sqlx::query_scalar("SELECT public.purge_expired_resource_shares()")
        .fetch_one(&state.pool)
        .await?;
    Ok(purged as i64)
}
