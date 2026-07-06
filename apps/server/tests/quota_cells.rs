//! E-FLOW-7 — Interlocking cross-quota per-cell counters + atomic claim.
//!
//! The whole point of 00032's `claim_quota_cell` is that the claim and the
//! cap decision are ONE atomic step, so concurrent completions can never
//! overfill a cell. These tests hammer the function from many concurrent
//! connections and assert:
//!   - exactly `target` claims succeed for a capped cell (never target+1),
//!   - the surplus claimers each get -1 (over quota),
//!   - distinct cells fill independently (an age×gender grid), and
//!   - target <= 0 means uncapped (every claim succeeds).
//!
//! Uses the migration DSN (qdesigner — SUPERUSER + BYPASSRLS) via the shared
//! `fixture_pool` so fixture INSERTs aren't subject to RLS. Mirrors
//! tests/quota_counting.rs.

use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

mod common;
use common::fixture_pool;

/// Seed a published questionnaire and return its id.
async fn seed(pool: &PgPool) -> Uuid {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("qcell-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('QCell', $1, $2) RETURNING id",
    )
    .bind(format!("qcell-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");

    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'QCell', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("qcell-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("QCell-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("questionnaire")
}

/// Fire `n` concurrent claims against a single cell, each on its own pooled
/// connection (a fresh autocommit transaction), and return the vector of
/// returned occupancies (-1 == rejected).
async fn concurrent_claims(
    pool: Arc<PgPool>,
    qid: Uuid,
    cell_key: &str,
    target: i64,
    n: usize,
) -> Vec<i64> {
    let mut handles = Vec::with_capacity(n);
    for _ in 0..n {
        let pool = pool.clone();
        let key = cell_key.to_string();
        handles.push(tokio::spawn(async move {
            sqlx::query_scalar::<_, i64>("SELECT public.claim_quota_cell($1, $2, $3)")
                .bind(qid)
                .bind(&key)
                .bind(target)
                .fetch_one(&*pool)
                .await
                .expect("claim")
        }));
    }
    let mut out = Vec::with_capacity(n);
    for h in handles {
        out.push(h.await.expect("join"));
    }
    out
}

#[tokio::test]
async fn concurrent_claims_never_exceed_a_cell_target() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let pool = Arc::new(pool);
    let qid = seed(&pool).await;

    const TARGET: i64 = 5;
    const CONTENDERS: usize = 40;

    let results = concurrent_claims(pool.clone(), qid, "gender=male", TARGET, CONTENDERS).await;

    let successes = results.iter().filter(|&&r| r >= 1).count();
    let rejections = results.iter().filter(|&&r| r == -1).count();

    assert_eq!(
        successes, TARGET as usize,
        "exactly {TARGET} of {CONTENDERS} concurrent claims must succeed"
    );
    assert_eq!(
        rejections,
        CONTENDERS - TARGET as usize,
        "every surplus claim must be rejected with -1"
    );

    // The successful occupancies must be exactly 1..=TARGET (no duplicates,
    // no value above the cap) — proof the increment is serialized.
    let mut wins: Vec<i64> = results.into_iter().filter(|&r| r >= 1).collect();
    wins.sort_unstable();
    assert_eq!(
        wins,
        (1..=TARGET).collect::<Vec<_>>(),
        "occupancies are 1..=target with no overfill"
    );

    // Persisted counter matches the cap exactly.
    let current: i64 = sqlx::query_scalar(
        "SELECT current FROM quota_cells WHERE questionnaire_id = $1 AND cell_key = 'gender=male'",
    )
    .bind(qid)
    .fetch_one(&*pool)
    .await
    .expect("current");
    assert_eq!(current, TARGET, "persisted current never exceeds target");
}

#[tokio::test]
async fn distinct_cells_fill_independently() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let pool = Arc::new(pool);
    let qid = seed(&pool).await;

    // A 2×2 age×gender grid, each cell with its own independent cap. Fire all
    // four cells' contention concurrently; each must fill to exactly its own
    // target regardless of the others.
    let grid: [(&str, i64); 4] = [
        ("age=18-24|gender=male", 3),
        ("age=18-24|gender=female", 2),
        ("age=25-34|gender=male", 4),
        ("age=25-34|gender=female", 1),
    ];

    let mut cell_handles = Vec::new();
    for (key, target) in grid {
        let pool = pool.clone();
        cell_handles.push(tokio::spawn(async move {
            let results = concurrent_claims(pool, qid, key, target, 15).await;
            let successes = results.iter().filter(|&&r| r >= 1).count() as i64;
            (key, target, successes)
        }));
    }

    for h in cell_handles {
        let (key, target, successes) = h.await.expect("join");
        assert_eq!(
            successes, target,
            "cell {key} must fill to exactly its own target {target}, independent of siblings"
        );
    }
}

#[tokio::test]
async fn uncapped_cell_admits_every_claim() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let pool = Arc::new(pool);
    let qid = seed(&pool).await;

    // target <= 0 ⇒ uncapped: every one of the concurrent claims succeeds.
    let results = concurrent_claims(pool.clone(), qid, "gender=other", 0, 12).await;
    let successes = results.iter().filter(|&&r| r >= 1).count();
    assert_eq!(
        successes, 12,
        "an uncapped cell (target 0) admits every claim"
    );
    assert!(
        results.iter().all(|&r| r != -1),
        "no rejection for an uncapped cell"
    );
}
