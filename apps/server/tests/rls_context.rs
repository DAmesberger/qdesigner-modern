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

use uuid::Uuid;

mod common;
use common::app_pool;

#[tokio::test]
async fn rls_context_guc_is_set_inside_transaction_and_cleared_outside() {
    let Some(pool) = app_pool().await else {
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

/// P3-T1 — `app_pool()` connects as the non-BYPASSRLS production role.
/// In the CI/prod posture `DATABASE_URL` is `qdesigner_app`; assert the
/// connection actually runs as that role so a mis-pointed DSN can't
/// silently exercise RLS as a superuser. Locally (`.env.development`)
/// `DATABASE_URL` is also `qdesigner_app`, so this holds there too.
#[tokio::test]
async fn app_pool_connects_as_qdesigner_app_role() {
    let Some(pool) = app_pool().await else {
        eprintln!("skipping: no DATABASE_URL / DB not reachable");
        return;
    };

    let current_user: String = sqlx::query_scalar("SELECT current_user")
        .fetch_one(&pool)
        .await
        .expect("read current_user");
    assert_eq!(
        current_user, "qdesigner_app",
        "app_pool() must connect as the non-BYPASSRLS qdesigner_app role, got {current_user:?}"
    );
}
