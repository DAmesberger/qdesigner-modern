//! E-FLOW-6 — server-atomic between-subjects arm assignment.
//!
//! Proves the two properties the client-side snapshot-then-pick allocation
//! could not guarantee under concurrent starts:
//!
//!   1. **No lost updates / perfect balance.** N concurrent `claim_experiment_arm`
//!      calls against the same questionnaire land balanced — per-arm counts differ
//!      by at most 1, and the totals sum to exactly N (no claim is lost, none is
//!      double-counted).
//!   2. **Caps are never exceeded.** With per-arm caps, no arm is ever filled past
//!      its cap, over-cap claimants get NO row (over quota), and the number of
//!      successful claims equals the total capacity.
//!   3. **Monotonic participant numbers.** N concurrent `allocate_participant_number`
//!      calls yield exactly {0, 1, …, N-1} with no duplicates.
//!
//! Each concurrent task uses its OWN pooled connection + transaction, so the
//! FOR UPDATE row locks in the function are exercised for real. The migration
//! DSN (qdesigner) is used for both seeding and the claims — the SECURITY
//! DEFINER functions run as their owner regardless, and this keeps the test
//! independent of the app-role grant plumbing.

use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

mod common;
use common::fixture_pool;

/// Seed org → project → questionnaire and return the questionnaire id (needed
/// for the arm_counts / participant_counters FKs).
async fn seed_questionnaire(pool: &PgPool) -> Uuid {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("armtest-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('ArmTest', $1, $2) RETURNING id",
    )
    .bind(format!("arm-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");

    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("p-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by) \
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("Q-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("questionnaire")
}

#[tokio::test]
async fn concurrent_claims_stay_balanced() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let qid = seed_questionnaire(&pool).await;
    let conditions = vec!["control".to_string(), "treatment".to_string()];
    const N: usize = 20;

    // Fire N claims concurrently, each on its own connection/transaction so the
    // in-function FOR UPDATE locks actually serialize competing claimers.
    let mut handles = Vec::new();
    for _ in 0..N {
        let pool = pool.clone();
        let conditions = conditions.clone();
        handles.push(tokio::spawn(async move {
            let mut conn = pool.acquire().await.expect("acquire");
            let row: (String, i32, i64) = sqlx::query_as(
                "SELECT o_condition_name, o_condition_index, o_assigned_count \
                 FROM public.claim_experiment_arm($1, $2, 'balanced', NULL)",
            )
            .bind(qid)
            .bind(&conditions)
            .fetch_one(&mut *conn)
            .await
            .expect("claim");
            row.0
        }));
    }

    let mut tally: HashMap<String, usize> = HashMap::new();
    for h in handles {
        let name = h.await.expect("join");
        *tally.entry(name).or_default() += 1;
    }

    // Every claim landed on a real arm, totals sum to N.
    let total: usize = tally.values().sum();
    assert_eq!(total, N, "every concurrent claim must land: {tally:?}");

    // Perfect balance: the two arms differ by at most 1 (10/10 for N=20).
    let control = *tally.get("control").unwrap_or(&0);
    let treatment = *tally.get("treatment").unwrap_or(&0);
    assert!(
        (control as i64 - treatment as i64).abs() <= 1,
        "arms must stay balanced (diff <= 1): control={control}, treatment={treatment}"
    );

    // The persisted ledger agrees with the observed tally.
    let ledger: Vec<(String, i64)> = sqlx::query_as(
        "SELECT condition_name, assigned_count FROM arm_counts WHERE questionnaire_id = $1",
    )
    .bind(qid)
    .fetch_all(&pool)
    .await
    .expect("ledger");
    let ledger_total: i64 = ledger.iter().map(|(_, c)| c).sum();
    assert_eq!(
        ledger_total, N as i64,
        "arm_counts ledger must total N: {ledger:?}"
    );
}

#[tokio::test]
async fn concurrent_claims_never_exceed_cap() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let qid = seed_questionnaire(&pool).await;
    let conditions = vec!["a".to_string(), "b".to_string()];
    // Cap each arm at 10 → total capacity 20. Fire 30 concurrent claims; exactly
    // 20 must succeed, 10 must get no row, and NO arm may exceed 10.
    let caps: Vec<i64> = vec![10, 10];
    const N: usize = 30;
    const CAPACITY: usize = 20;

    let mut handles = Vec::new();
    for _ in 0..N {
        let pool = pool.clone();
        let conditions = conditions.clone();
        let caps = caps.clone();
        handles.push(tokio::spawn(async move {
            let mut conn = pool.acquire().await.expect("acquire");
            let row: Option<(String, i32, i64)> = sqlx::query_as(
                "SELECT o_condition_name, o_condition_index, o_assigned_count \
                 FROM public.claim_experiment_arm($1, $2, 'balanced', $3)",
            )
            .bind(qid)
            .bind(&conditions)
            .bind(&caps)
            .fetch_optional(&mut *conn)
            .await
            .expect("claim");
            row.map(|r| r.0)
        }));
    }

    let mut tally: HashMap<String, usize> = HashMap::new();
    let mut successes = 0usize;
    for h in handles {
        if let Some(name) = h.await.expect("join") {
            successes += 1;
            *tally.entry(name).or_default() += 1;
        }
    }

    assert_eq!(
        successes, CAPACITY,
        "exactly the total capacity must be claimable: got {successes}, tally={tally:?}"
    );
    for (name, count) in &tally {
        assert!(*count <= 10, "arm {name} exceeded its cap of 10: {count}");
    }
}

#[tokio::test]
async fn concurrent_participant_numbers_are_unique_and_dense() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let qid = seed_questionnaire(&pool).await;
    const N: usize = 25;

    let mut handles = Vec::new();
    for _ in 0..N {
        let pool = pool.clone();
        handles.push(tokio::spawn(async move {
            let mut conn = pool.acquire().await.expect("acquire");
            let n: i64 = sqlx::query_scalar("SELECT public.allocate_participant_number($1)")
                .bind(qid)
                .fetch_one(&mut *conn)
                .await
                .expect("allocate");
            n
        }));
    }

    let mut numbers = Vec::new();
    for h in handles {
        numbers.push(h.await.expect("join"));
    }
    numbers.sort_unstable();

    // Exactly {0, 1, …, N-1} — dense, monotonic, no duplicates, no gaps.
    let expected: Vec<i64> = (0..N as i64).collect();
    assert_eq!(numbers, expected, "participant numbers must be {{0..N-1}}");
}
