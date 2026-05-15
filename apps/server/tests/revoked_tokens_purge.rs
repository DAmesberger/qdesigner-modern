//! P3.5 revoked_tokens purge test.
//!
//! Verifies the DELETE pattern used by `purge_expired_revoked_tokens` in
//! src/auth/session.rs: rows older than the cutoff go, rows newer stay.
//! The test runs the same SQL inline because the apps/server crate has no
//! lib.rs (yet) and integration tests can't import bin-only items;
//! restructuring to bin+lib is Phase 4.1 scope.
//!
//! Requires a running PostgreSQL with migrations applied.

use chrono::{Duration as ChronoDuration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

async fn get_test_pool() -> Option<PgPool> {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".env.development");
    if env_path.exists() {
        if let Ok(contents) = std::fs::read_to_string(&env_path) {
            for line in contents.lines() {
                if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                    std::env::set_var("DATABASE_URL", val.trim());
                    break;
                }
            }
        }
    }
    let url = std::env::var("DATABASE_URL").ok()?;
    PgPool::connect(&url).await.ok()
}

#[tokio::test]
async fn purge_deletes_old_keeps_recent() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let old_jti = Uuid::new_v4();
    let recent_jti = Uuid::new_v4();
    let old_ts = Utc::now() - ChronoDuration::hours(48);
    let recent_ts = Utc::now() - ChronoDuration::minutes(5);

    sqlx::query("INSERT INTO revoked_tokens (jti, revoked_at) VALUES ($1, $2)")
        .bind(old_jti)
        .bind(old_ts)
        .execute(&pool)
        .await
        .expect("insert old");
    sqlx::query("INSERT INTO revoked_tokens (jti, revoked_at) VALUES ($1, $2)")
        .bind(recent_jti)
        .bind(recent_ts)
        .execute(&pool)
        .await
        .expect("insert recent");

    // Mirror of purge_expired_revoked_tokens(pool, 1.hour) from session.rs:
    let cutoff = Utc::now() - ChronoDuration::hours(1);
    let deleted = sqlx::query("DELETE FROM revoked_tokens WHERE revoked_at < $1")
        .bind(cutoff)
        .execute(&pool)
        .await
        .expect("purge")
        .rows_affected();
    assert!(deleted >= 1, "expected at least the old row to be deleted, got {deleted}");

    let old_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)")
            .bind(old_jti)
            .fetch_one(&pool)
            .await
            .expect("check old");
    let recent_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)")
            .bind(recent_jti)
            .fetch_one(&pool)
            .await
            .expect("check recent");

    let _ = sqlx::query("DELETE FROM revoked_tokens WHERE jti = $1")
        .bind(recent_jti)
        .execute(&pool)
        .await;

    assert!(!old_exists, "old row should have been purged");
    assert!(recent_exists, "recent row should have been preserved");
}
