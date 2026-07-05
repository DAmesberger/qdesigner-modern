//! P5.3 — RLS infrastructure contract test.
//!
//! Phase 5's deliverable is the per-request transaction + Tx extractor
//! infrastructure that sets `app.user_id` as a transaction-local GUC.
//! Enforcement (a non-superuser role + INSERT/UPDATE/DELETE policies +
//! a fillout-path strategy) is deferred to a future phase — see ADR 0011.
//!
//! This test asserts the contract the rest of the infrastructure depends
//! on: inside the kind of transaction the `set_rls_context` middleware
//! opens, `current_setting('app.user_id', true)` and the
//! `current_app_user_id()` helper from migration 00014 both report the
//! UUID the middleware bound; outside that transaction (after commit /
//! rollback / connection return-to-pool) the value goes back to NULL.

use sqlx::PgPool;
use uuid::Uuid;

/// Same `.env.development`-or-process-env discovery as
/// `tests/rbac_integration.rs`; returns None so the test cleanly skips
/// when no DB is reachable.
async fn get_test_pool() -> Option<PgPool> {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join(".env.development"));
    if let Some(path) = env_path.as_ref() {
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines() {
                    if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                        std::env::set_var("DATABASE_URL", val.trim());
                        break;
                    }
                }
            }
        }
    }
    let url = std::env::var("DATABASE_URL").ok()?;
    PgPool::connect(&url).await.ok()
}

#[tokio::test]
async fn rls_context_guc_is_set_inside_transaction_and_cleared_outside() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping: no DATABASE_URL / DB not reachable");
        return;
    };

    let user_id = Uuid::new_v4();

    // Mirror what middleware::rls_context::set_rls_context emits.
    let mut tx = pool.begin().await.expect("begin");
    sqlx::query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)",
    )
    .bind(user_id.to_string())
    .bind("user")
    .execute(&mut *tx)
    .await
    .expect("set_config");

    let raw_guc: String = sqlx::query_scalar("SELECT current_setting('app.user_id', true)")
        .fetch_one(&mut *tx)
        .await
        .expect("read app.user_id GUC");
    assert_eq!(
        raw_guc,
        user_id.to_string(),
        "the GUC the middleware sets must be readable inside the same tx"
    );

    let resolved: Uuid = sqlx::query_scalar("SELECT current_app_user_id()")
        .fetch_one(&mut *tx)
        .await
        .expect("call helper function");
    assert_eq!(
        resolved, user_id,
        "current_app_user_id() (migration 00014) must resolve the GUC to the same UUID"
    );

    // Rolling back drops the transaction-local GUC.
    tx.rollback().await.expect("rollback");

    let outside: Option<String> =
        sqlx::query_scalar::<_, Option<String>>("SELECT current_setting('app.user_id', true)")
            .fetch_one(&pool)
            .await
            .expect("read GUC outside tx")
            .filter(|s| !s.is_empty());
    assert!(
        outside.is_none(),
        "app.user_id must not leak past the per-request transaction; got {outside:?}"
    );
}
