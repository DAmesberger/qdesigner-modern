//! P8-T1 — cross_project_analytics set-based query equivalence.
//!
//! `cross_project_analytics` used to run one summary query, one timing query
//! and one numeric-samples query PER questionnaire in a loop. P8-T1 collapses
//! those into three batched queries keyed by `s.questionnaire_id = ANY($1)`,
//! grouping the rows by questionnaire id in Rust.
//!
//! This file asserts the batched SQL is EQUIVALENT to the old per-qid SQL: for
//! a two-questionnaire fixture, the batched summary/timing/response-samples
//! queries, grouped by questionnaire id, must reproduce exactly what a per-qid
//! query returns for each questionnaire individually.
//!
//! Uses the migration DSN (qdesigner — SUPERUSER + BYPASSRLS) via
//! `fixture_pool` so the fixture INSERTs aren't subject to RLS.

use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

mod common;
use common::fixture_pool;

struct Fixture {
    q1: Uuid,
    q2: Uuid,
}

/// Seed one org/user/project with two questionnaires. q1 gets two COMPLETED
/// sessions (distinct durations) each carrying two numeric `score` responses;
/// q2 gets one completed session with one `score` response. A non-completed
/// session on q1 (no completed_at) exercises the timing filter.
async fn build_fixture(pool: &PgPool) -> Fixture {
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("u-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('O', $1, $2) RETURNING id",
    )
    .bind(format!("o-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_id)
    .fetch_one(pool)
    .await
    .expect("org");

    let project_id: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org_id)
    .bind(format!("p-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    let make_q = |name: &'static str| {
        // Copy the Copy `project_id` into a fresh local so each `async move`
        // owns it — this FnMut closure is called twice, so it cannot hand its
        // captured binding to a `move` block directly. clippy's redundant_locals
        // doesn't model the async-move capture requirement here.
        #[allow(clippy::redundant_locals)]
        let project_id = project_id;
        async move {
            sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by) \
                 VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
            )
            .bind(project_id)
            .bind(format!("{name}-{}", &Uuid::new_v4().to_string()[..8]))
            .bind(user_id)
            .fetch_one(pool)
            .await
            .expect("questionnaire")
        }
    };

    let q1 = make_q("Q1").await;
    let q2 = make_q("Q2").await;

    // Completed session helper: fixed duration in seconds, then a numeric
    // response per supplied value.
    let seed_completed = |qid: Uuid, dur_secs: i64, values: Vec<i64>| async move {
        let session_id: Uuid = sqlx::query_scalar(
            "INSERT INTO sessions (questionnaire_id, participant_id, status, started_at, completed_at) \
             VALUES ($1, $2, 'completed', NOW() - ($3 || ' seconds')::interval, NOW()) RETURNING id",
        )
        .bind(qid)
        .bind(format!("pp-{}", &Uuid::new_v4().to_string()[..8]))
        .bind(dur_secs.to_string())
        .fetch_one(pool)
        .await
        .expect("session");

        for v in values {
            sqlx::query(
                "INSERT INTO responses (session_id, client_id, question_id, value) \
                 VALUES ($1, $2, 'score', $3) ON CONFLICT (client_id) DO NOTHING",
            )
            .bind(session_id)
            .bind(Uuid::new_v4())
            .bind(serde_json::json!(v))
            .execute(pool)
            .await
            .expect("response");
        }
        session_id
    };

    seed_completed(q1, 10, vec![5, 7]).await;
    seed_completed(q1, 20, vec![9]).await;
    seed_completed(q2, 30, vec![3]).await;

    // A non-completed session on q1 — must NOT contribute a timing value.
    sqlx::query(
        "INSERT INTO sessions (questionnaire_id, status, started_at) VALUES ($1, 'active', NOW())",
    )
    .bind(q1)
    .execute(pool)
    .await
    .expect("active session");

    Fixture { q1, q2 }
}

/// Per-qid response-sample count (the old loop's shape).
async fn per_qid_response_count(pool: &PgPool, qid: Uuid, key: &str) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM responses r \
         INNER JOIN sessions s ON s.id = r.session_id \
         WHERE s.questionnaire_id = $1 AND r.question_id = $2",
    )
    .bind(qid)
    .bind(key)
    .fetch_one(pool)
    .await
    .expect("per-qid count")
}

/// Per-qid completed-timing count (the old loop's shape).
async fn per_qid_timing_count(pool: &PgPool, qid: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM sessions s \
         WHERE s.questionnaire_id = $1 AND s.completed_at IS NOT NULL AND s.started_at IS NOT NULL",
    )
    .bind(qid)
    .fetch_one(pool)
    .await
    .expect("per-qid timing")
}

#[tokio::test]
async fn batched_queries_group_equals_per_qid_results() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let fx = build_fixture(&pool).await;
    let ids = vec![fx.q1, fx.q2];

    // (1) Summary: batched ANY($1) grouping must reproduce per-qid counts.
    let summary_rows = sqlx::query_as::<_, (Uuid, i64, i64)>(
        r#"
        SELECT
            q.id,
            COUNT(DISTINCT r.id)::bigint AS total_responses,
            COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END)::bigint AS completed_sessions
        FROM questionnaire_definitions q
        LEFT JOIN sessions s ON s.questionnaire_id = q.id
        LEFT JOIN responses r ON r.session_id = s.id
        WHERE q.id = ANY($1) AND q.deleted_at IS NULL
        GROUP BY q.id
        "#,
    )
    .bind(&ids)
    .fetch_all(&pool)
    .await
    .expect("batched summary");

    let summary_map: HashMap<Uuid, (i64, i64)> = summary_rows
        .into_iter()
        .map(|(id, resp, done)| (id, (resp, done)))
        .collect();

    // q1: 3 responses across 2 completed sessions; q2: 1 response, 1 completed.
    assert_eq!(summary_map.get(&fx.q1), Some(&(3, 2)));
    assert_eq!(summary_map.get(&fx.q2), Some(&(1, 1)));

    // (2) Timing: batched grouping must match per-qid completed counts and
    // exclude the non-completed session on q1.
    let timing_rows = sqlx::query_as::<_, (Uuid, f64)>(
        r#"
        SELECT s.questionnaire_id,
               (EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0)::float8
        FROM sessions s
        WHERE s.questionnaire_id = ANY($1)
          AND s.completed_at IS NOT NULL
          AND s.started_at IS NOT NULL
        "#,
    )
    .bind(&ids)
    .fetch_all(&pool)
    .await
    .expect("batched timing");

    let mut timing_map: HashMap<Uuid, Vec<f64>> = HashMap::new();
    for (qid, ms) in timing_rows {
        timing_map.entry(qid).or_default().push(ms);
    }

    assert_eq!(
        timing_map.get(&fx.q1).map(|v| v.len() as i64),
        Some(per_qid_timing_count(&pool, fx.q1).await)
    );
    assert_eq!(timing_map.get(&fx.q1).map(|v| v.len()), Some(2));
    assert_eq!(
        timing_map.get(&fx.q2).map(|v| v.len() as i64),
        Some(per_qid_timing_count(&pool, fx.q2).await)
    );

    // Every timing value is a positive duration in ms.
    for v in timing_map.values().flatten() {
        assert!(*v > 0.0, "duration must be positive ms");
    }

    // (3) Response samples: batched grouping must match per-qid samples.
    let sample_rows = sqlx::query_as::<_, (Uuid, serde_json::Value)>(
        r#"
        SELECT s.questionnaire_id, r.value
        FROM responses r
        INNER JOIN sessions s ON s.id = r.session_id
        WHERE s.questionnaire_id = ANY($1)
          AND r.question_id = $2
        ORDER BY s.created_at ASC
        "#,
    )
    .bind(&ids)
    .bind("score")
    .fetch_all(&pool)
    .await
    .expect("batched samples");

    let mut sample_map: HashMap<Uuid, Vec<f64>> = HashMap::new();
    for (qid, value) in sample_rows {
        if let Some(n) = value.as_f64() {
            sample_map.entry(qid).or_default().push(n);
        }
    }

    assert_eq!(
        sample_map.get(&fx.q1).map(|v| v.len() as i64),
        Some(per_qid_response_count(&pool, fx.q1, "score").await)
    );
    assert_eq!(
        sample_map.get(&fx.q2).map(|v| v.len() as i64),
        Some(per_qid_response_count(&pool, fx.q2, "score").await)
    );

    // Grouped values match the seeded numbers.
    let mut q1_vals = sample_map.get(&fx.q1).cloned().unwrap_or_default();
    q1_vals.sort_by(|a, b| a.partial_cmp(b).unwrap());
    assert_eq!(q1_vals, vec![5.0, 7.0, 9.0]);
    assert_eq!(sample_map.get(&fx.q2), Some(&vec![3.0]));
}
