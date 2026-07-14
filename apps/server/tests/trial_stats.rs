//! RT-5 — TRIAL-LEVEL SERVER AGGREGATES (ADR 0028).
//!
//! Two layers, mirroring `server_variables.rs`:
//!
//! 1. The `00049` `fillout_trial_stats(qid, question_id, metric, include_invalidated,
//!    filter)` SECURITY DEFINER aggregate over the per-trial `trials` table:
//!    quartiles over pooled `trials.rt_us`, `n` = DISTINCT contributing sessions,
//!    invalidated trials excluded by default. Driven directly on the migration pool.
//!
//! 2. The public `GET /api/questionnaires/{id}/server-variables` endpoint with a
//!    `source: 'trials'` declaration carrying an explicit `minN`, driven through the
//!    real router harness: below the declaration's floor → count reported, stats
//!    withheld; at/above → full stats.
//!
//! Fixture INSERTs use the migration DSN (`qdesigner`) so setup bypasses RLS.

use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::{build_test_state, fixture_pool, json_request, test_app};

#[derive(sqlx::FromRow, Debug)]
struct StatsRow {
    n: i64,
    mean: Option<f64>,
    std_dev: Option<f64>,
    min: Option<f64>,
    max: Option<f64>,
    p10: Option<f64>,
    p25: Option<f64>,
    median: Option<f64>,
    p75: Option<f64>,
    p90: Option<f64>,
    p95: Option<f64>,
    p99: Option<f64>,
}

async fn trial_stats(
    pool: &PgPool,
    qid: Uuid,
    question_id: &str,
    metric: &str,
    include_invalidated: bool,
    filter: serde_json::Value,
) -> StatsRow {
    sqlx::query_as::<_, StatsRow>(
        "SELECT n, mean, std_dev, min, max, p10, p25, median, p75, p90, p95, p99 \
         FROM public.fillout_trial_stats($1, $2, $3, $4, $5)",
    )
    .bind(qid)
    .bind(question_id)
    .bind(metric)
    .bind(include_invalidated)
    .bind(filter)
    .fetch_one(pool)
    .await
    .expect("trial_stats")
}

// ── fixtures ──────────────────────────────────────────────────────────────

async fn mk_user(pool: &PgPool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("ts-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user")
}

async fn mk_project(pool: &PgPool, user: Uuid) -> Uuid {
    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('TS', $1, $2) RETURNING id",
    )
    .bind(format!("ts-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");
    sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'TS', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("ts-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project")
}

async fn mk_questionnaire(
    pool: &PgPool,
    project: Uuid,
    user: Uuid,
    content: serde_json::Value,
    status: &str,
) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions \
           (project_id, name, content, status, created_by, version_major, version_minor, version_patch) \
         VALUES ($1, $2, $3, $4, $5, 1, 0, 0) RETURNING id",
    )
    .bind(project)
    .bind(format!("TS-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(content)
    .bind(status)
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("questionnaire")
}

async fn mk_session(pool: &PgPool, qid: Uuid) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO sessions \
           (questionnaire_id, status, metadata, questionnaire_version_major, \
            questionnaire_version_minor, questionnaire_version_patch, completed_at) \
         VALUES ($1, 'completed', '{}'::jsonb, 1, 0, 0, now()) RETURNING id",
    )
    .bind(qid)
    .fetch_one(pool)
    .await
    .expect("session")
}

/// Insert a single TEST (non-practice) trial row; client_id is unique per call.
///
/// `is_practice = false` is explicit and load-bearing: `fillout_trial_stats` admits
/// only trials KNOWN not to be practice (ADR 0028 / migration 00059), so a row left
/// at the NULL default would be treated as unknown provenance and held out of every
/// aggregate below. See `trial_practice_aggregates.rs` for that behaviour on purpose.
async fn insert_trial(
    pool: &PgPool,
    sid: Uuid,
    question_id: &str,
    trial_index: i32,
    rt_us: Option<i64>,
    correct: Option<bool>,
    invalidated: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO trials \
           (session_id, question_id, trial_index, rt_us, correct, invalidated, \
            is_practice, client_id) \
         VALUES ($1, $2, $3, $4, $5, $6, false, $7)",
    )
    .bind(sid)
    .bind(question_id)
    .bind(trial_index)
    .bind(rt_us)
    .bind(correct)
    .bind(invalidated)
    .bind(Uuid::new_v4())
    .execute(pool)
    .await
    .expect("trial");
}

// ── SQL function ─────────────────────────────────────────────────────────

#[tokio::test]
async fn trial_stats_quartiles_and_session_distinct_n() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(&pool, project, user, serde_json::json!({}), "published").await;

    // Two sessions, 5 pooled trial values [100,200,300,400,500] across them.
    let s1 = mk_session(&pool, qid).await;
    let s2 = mk_session(&pool, qid).await;
    insert_trial(&pool, s1, "q_rt", 0, Some(100), Some(true), None).await;
    insert_trial(&pool, s1, "q_rt", 1, Some(200), Some(true), None).await;
    insert_trial(&pool, s1, "q_rt", 2, Some(300), Some(true), None).await;
    insert_trial(&pool, s2, "q_rt", 0, Some(400), Some(true), None).await;
    insert_trial(&pool, s2, "q_rt", 1, Some(500), Some(true), None).await;

    let stats = trial_stats(&pool, qid, "q_rt", "rt", false, serde_json::json!({})).await;
    // n counts DISTINCT sessions (2), not the 5 raw trial rows.
    assert_eq!(stats.n, 2, "n is distinct sessions");
    assert!((stats.mean.unwrap() - 300.0).abs() < 1e-9);
    assert!((stats.median.unwrap() - 300.0).abs() < 1e-9);
    assert!((stats.p25.unwrap() - 200.0).abs() < 1e-9);
    assert!((stats.p75.unwrap() - 400.0).abs() < 1e-9);
    assert!((stats.min.unwrap() - 100.0).abs() < 1e-9);
    assert!((stats.max.unwrap() - 500.0).abs() < 1e-9);
    assert!(
        stats.p10.is_some() && stats.p90.is_some() && stats.p95.is_some() && stats.p99.is_some()
    );
    assert!(stats.std_dev.unwrap() > 0.0);
}

#[tokio::test]
async fn trial_stats_excludes_invalidated_by_default() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(&pool, project, user, serde_json::json!({}), "published").await;
    let s1 = mk_session(&pool, qid).await;
    insert_trial(&pool, s1, "q_rt", 0, Some(400), Some(true), None).await;
    insert_trial(
        &pool,
        s1,
        "q_rt",
        1,
        Some(10),
        Some(false),
        Some("anticipatory"),
    )
    .await;

    // Default: the invalidated 10µs anticipation is excluded, so mean == 400.
    let excluded = trial_stats(&pool, qid, "q_rt", "rt", false, serde_json::json!({})).await;
    assert!((excluded.mean.unwrap() - 400.0).abs() < 1e-9);

    // include_invalidated=true pulls it back in → mean of 400 and 10 == 205.
    let included = trial_stats(&pool, qid, "q_rt", "rt", true, serde_json::json!({})).await;
    assert!((included.mean.unwrap() - 205.0).abs() < 1e-9);
}

#[tokio::test]
async fn trial_stats_accuracy_metric() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(&pool, project, user, serde_json::json!({}), "published").await;
    let s1 = mk_session(&pool, qid).await;
    insert_trial(&pool, s1, "q_rt", 0, Some(400), Some(true), None).await;
    insert_trial(&pool, s1, "q_rt", 1, Some(400), Some(false), None).await;
    insert_trial(&pool, s1, "q_rt", 2, Some(400), Some(true), None).await;

    let stats = trial_stats(&pool, qid, "q_rt", "accuracy", false, serde_json::json!({})).await;
    // 2 of 3 correct → mean accuracy 0.666…
    assert!((stats.mean.unwrap() - 2.0 / 3.0).abs() < 1e-9);
    assert_eq!(stats.n, 1);
}

// ── endpoint (minN enforcement) ──────────────────────────────────────────

#[tokio::test]
async fn endpoint_trials_source_enforces_declaration_min_n() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let app = test_app(state);

    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    // Two trial declarations over the same reaction question: one floor above the
    // cohort (withheld), one at/below (published).
    let content = serde_json::json!({
        "variables": [
            { "id": "rtHigh", "name": "rtHigh", "type": "object",
              "server": { "source": "trials", "key": "q_rt", "minN": 3 } },
            { "id": "rtLow", "name": "rtLow", "type": "object",
              "server": { "source": "trials", "key": "q_rt", "minN": 2 } }
        ]
    });
    let qid = mk_questionnaire(&pool, project, user, content, "published").await;

    // Exactly two distinct sessions contribute trials.
    let s1 = mk_session(&pool, qid).await;
    let s2 = mk_session(&pool, qid).await;
    for (i, rt) in [300, 350, 400].into_iter().enumerate() {
        insert_trial(&pool, s1, "q_rt", i as i32, Some(rt), Some(true), None).await;
    }
    insert_trial(&pool, s2, "q_rt", 0, Some(500), Some(true), None).await;

    let (status, body) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "server-variables: {body:?}");
    let vars = body["variables"].as_array().expect("variables array");

    let high = vars.iter().find(|v| v["name"] == "rtHigh").expect("rtHigh");
    assert_eq!(
        high["sample_count"].as_i64(),
        Some(2),
        "count always reported"
    );
    assert!(high["stats"].is_null(), "n=2 < minN=3 → stats withheld");

    let low = vars.iter().find(|v| v["name"] == "rtLow").expect("rtLow");
    assert_eq!(low["sample_count"].as_i64(), Some(2));
    assert_eq!(low["source"].as_str(), Some("trials"));
    assert!(
        low["stats"]["p25"].as_f64().is_some(),
        "n=2 >= minN=2 → stats present"
    );
    assert!(low["stats"]["median"].as_f64().is_some());
}
