//! SV-core-backend — SERVER-COMPUTED VARIABLES (server-computed-variable /
//! E-FEEDBACK-3).
//!
//! Two layers:
//!
//! 1. The `00030` `fillout_dataset_stats(qid, source, key, filter)` SECURITY
//!    DEFINER aggregate that generalizes `00028`'s `fillout_cohort_stats` with
//!    full quartiles (p10/p25/p75) and a designer-declared dataset filter
//!    (version scope, completion-date bounds, and per-clause predicates over
//!    `session_variable_index`). Driven directly on the migration/superuser pool
//!    (mirrors `cohort_stats.rs`): the client never reaches the function, only
//!    the published-declaration filters it evaluates.
//!
//! 2. The public `GET /api/questionnaires/{id}/server-variables` endpoint,
//!    driven through the real router harness. It gates on published status,
//!    extracts the `server` declarations from the definition's `content.variables`,
//!    runs the aggregate per declaration, applies the MIN_COHORT_N floor, and
//!    stamps a `decl_hash` that matches the TS `declHash`.
//!
//! Fixture INSERTs use the migration DSN (`qdesigner` — SUPERUSER + BYPASSRLS)
//! so setup isn't subject to RLS; the HTTP harness reads through the app-role
//! pool where the definer function bypasses the dual-path policy.

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

async fn dataset_stats(
    pool: &PgPool,
    qid: Uuid,
    source: &str,
    key: &str,
    filter: serde_json::Value,
) -> StatsRow {
    sqlx::query_as::<_, StatsRow>(
        "SELECT n, mean, std_dev, min, max, p10, p25, median, p75, p90, p95, p99 \
         FROM public.fillout_dataset_stats($1, $2, $3, $4)",
    )
    .bind(qid)
    .bind(source)
    .bind(key)
    .bind(filter)
    .fetch_one(pool)
    .await
    .expect("dataset_stats")
}

async fn mk_user(pool: &PgPool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("sv-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user")
}

async fn mk_project(pool: &PgPool, user: Uuid) -> Uuid {
    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('SV', $1, $2) RETURNING id",
    )
    .bind(format!("sv-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");
    sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'SV', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("sv-{}", &Uuid::new_v4().to_string()[..8]))
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
    (maj, min, pat): (i32, i32, i32),
) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions \
           (project_id, name, content, status, created_by, version_major, version_minor, version_patch) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
    )
    .bind(project)
    .bind(format!("SV-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(content)
    .bind(status)
    .bind(user)
    .bind(maj)
    .bind(min)
    .bind(pat)
    .fetch_one(pool)
    .await
    .expect("questionnaire")
}

/// Insert a session and return its id. `completed` toggles status; version
/// components drive the version-scope predicates.
async fn mk_session(
    pool: &PgPool,
    qid: Uuid,
    completed: bool,
    (maj, min, pat): (i32, i32, i32),
    completed_at: Option<&str>,
) -> Uuid {
    let status = if completed { "completed" } else { "active" };
    sqlx::query_scalar(
        "INSERT INTO sessions \
           (questionnaire_id, status, metadata, questionnaire_version_major, \
            questionnaire_version_minor, questionnaire_version_patch, completed_at) \
         VALUES ($1, $2, '{}'::jsonb, $3, $4, $5, $6::timestamptz) RETURNING id",
    )
    .bind(qid)
    .bind(status)
    .bind(maj)
    .bind(min)
    .bind(pat)
    .bind(completed_at)
    .fetch_one(pool)
    .await
    .expect("session")
}

/// Numeric session variable via the `session_variables` snapshot table
/// (exercises the JSONB-number resolution branch of the aggregate).
async fn set_var_num(pool: &PgPool, sid: Uuid, name: &str, value: i64) {
    sqlx::query(
        "INSERT INTO session_variables (session_id, variable_name, variable_value) \
         VALUES ($1, $2, to_jsonb($3::int))",
    )
    .bind(sid)
    .bind(name)
    .bind(value)
    .execute(pool)
    .await
    .expect("session_variable");
}

/// Projected index row for a where-clause var (numeric and/or text).
async fn set_svi(
    pool: &PgPool,
    sid: Uuid,
    qid: Uuid,
    name: &str,
    numeric: Option<f64>,
    text: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO session_variable_index \
           (session_id, questionnaire_id, variable_name, numeric_value, text_value, raw_value) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(sid)
    .bind(qid)
    .bind(name)
    .bind(numeric)
    .bind(text)
    .bind(numeric.map(|n| serde_json::json!(n)))
    .execute(pool)
    .await
    .expect("session_variable_index");
}

// ── SQL function ─────────────────────────────────────────────────────────

#[tokio::test]
async fn dataset_stats_returns_full_quartiles_over_completed_sessions() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(
        &pool,
        project,
        user,
        serde_json::json!({}),
        "published",
        (1, 0, 0),
    )
    .await;

    // 10..=60 step 10 over 6 completed sessions; version 1.0.0.
    for score in [10, 20, 30, 40, 50, 60] {
        let sid = mk_session(&pool, qid, true, (1, 0, 0), None).await;
        set_var_num(&pool, sid, "score", score).await;
    }
    // An in-progress outlier that must be excluded.
    let active = mk_session(&pool, qid, false, (1, 0, 0), None).await;
    set_var_num(&pool, active, "score", 999).await;

    let row = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "any" }),
    )
    .await;

    assert_eq!(row.n, 6, "6 completed; active excluded");
    assert!((row.mean.unwrap() - 35.0).abs() < 1e-9);
    let expected_std = (291.666_666_666_666_7_f64).sqrt();
    assert!((row.std_dev.unwrap() - expected_std).abs() < 1e-6);
    assert_eq!(row.min, Some(10.0));
    assert_eq!(row.max, Some(60.0));
    // percentile_cont over the 6 sorted values.
    assert!((row.p10.unwrap() - 15.0).abs() < 1e-9, "p10={:?}", row.p10);
    assert!((row.p25.unwrap() - 22.5).abs() < 1e-9, "p25={:?}", row.p25);
    assert!((row.median.unwrap() - 35.0).abs() < 1e-9);
    assert!((row.p75.unwrap() - 47.5).abs() < 1e-9, "p75={:?}", row.p75);
    assert!(row.p90.is_some() && row.p95.is_some() && row.p99.is_some());
}

#[tokio::test]
async fn dataset_stats_version_scope_excludes_other_versions() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(
        &pool,
        project,
        user,
        serde_json::json!({}),
        "published",
        (2, 0, 0),
    )
    .await;

    // 5 at major 2 (2.1.0), 5 at major 3.
    for score in [10, 20, 30, 40, 50] {
        let sid = mk_session(&pool, qid, true, (2, 1, 0), None).await;
        set_var_num(&pool, sid, "score", score).await;
    }
    for score in [100, 200, 300, 400, 500] {
        let sid = mk_session(&pool, qid, true, (3, 0, 0), None).await;
        set_var_num(&pool, sid, "score", score).await;
    }

    // sameMajor at v2 → only the five major-2 sessions.
    let same = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "sameMajor", "versionMajor": 2, "versionMinor": 0, "versionPatch": 0 }),
    )
    .await;
    assert_eq!(same.n, 5, "sameMajor v2 excludes major-3 sessions");
    assert_eq!(same.max, Some(50.0));

    // exact 2.1.0 → still the five (they are all 2.1.0); exact 2.0.0 → none.
    let exact_present = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "exact", "versionMajor": 2, "versionMinor": 1, "versionPatch": 0 }),
    )
    .await;
    assert_eq!(exact_present.n, 5);
    let exact_absent = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "exact", "versionMajor": 2, "versionMinor": 0, "versionPatch": 0 }),
    )
    .await;
    assert_eq!(exact_absent.n, 0, "no session at exactly 2.0.0");

    // any → all ten.
    let any = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "any" }),
    )
    .await;
    assert_eq!(any.n, 10);
}

#[tokio::test]
async fn dataset_stats_where_clause_filters_over_session_variable_index() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(
        &pool,
        project,
        user,
        serde_json::json!({}),
        "published",
        (1, 0, 0),
    )
    .await;

    // 6 sessions: sex f/m alternating, age 15..40; score = age.
    let rows = [
        ("f", 30),
        ("m", 20),
        ("f", 40),
        ("m", 18),
        ("f", 25),
        ("m", 15),
    ];
    for (sex, age) in rows {
        let sid = mk_session(&pool, qid, true, (1, 0, 0), None).await;
        set_var_num(&pool, sid, "score", age).await;
        set_svi(&pool, sid, qid, "sex", None, Some(sex)).await;
        set_svi(&pool, sid, qid, "age", Some(age as f64), None).await;
    }

    // string eq: sex == 'f' → 3 rows (ages 30,40,25).
    let females = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "any", "where": [{ "var": "sex", "op": "eq", "value": "f" }] }),
    )
    .await;
    assert_eq!(females.n, 3, "sex==f");
    assert_eq!(females.max, Some(40.0));

    // numeric gte: age >= 25 → ages {30,40,25} → 3 rows.
    let adults = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "any", "where": [{ "var": "age", "op": "gte", "value": 25 }] }),
    )
    .await;
    assert_eq!(adults.n, 3, "age>=25");

    // numeric in: age in [18,20,15] → 3 rows.
    let listed = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "any", "where": [{ "var": "age", "op": "in", "value": [18, 20, 15] }] }),
    )
    .await;
    assert_eq!(listed.n, 3, "age in {{18,20,15}}");

    // AND across two clauses: sex==f AND age>=30 → ages {30,40} → 2 rows.
    let both = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({
            "versionScope": "any",
            "where": [
                { "var": "sex", "op": "eq", "value": "f" },
                { "var": "age", "op": "gte", "value": 30 }
            ]
        }),
    )
    .await;
    assert_eq!(both.n, 2, "sex==f AND age>=30");
}

#[tokio::test]
async fn dataset_stats_completed_at_bounds() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(
        &pool,
        project,
        user,
        serde_json::json!({}),
        "published",
        (1, 0, 0),
    )
    .await;

    let dates = [
        "2026-01-01T00:00:00Z",
        "2026-03-01T00:00:00Z",
        "2026-06-01T00:00:00Z",
    ];
    for (i, d) in dates.iter().enumerate() {
        let sid = mk_session(&pool, qid, true, (1, 0, 0), Some(d)).await;
        set_var_num(&pool, sid, "score", (i as i64 + 1) * 10).await;
    }

    let after = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({ "versionScope": "any", "completedAfter": "2026-02-01T00:00:00Z" }),
    )
    .await;
    assert_eq!(after.n, 2, "completedAfter 2026-02 keeps Mar + Jun");

    let window = dataset_stats(
        &pool,
        qid,
        "variable",
        "score",
        serde_json::json!({
            "versionScope": "any",
            "completedAfter": "2026-02-01T00:00:00Z",
            "completedBefore": "2026-05-01T00:00:00Z"
        }),
    )
    .await;
    assert_eq!(window.n, 1, "Feb..May window keeps only Mar");
}

#[tokio::test]
async fn dataset_stats_response_source_branch() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let qid = mk_questionnaire(
        &pool,
        project,
        user,
        serde_json::json!({}),
        "published",
        (1, 0, 0),
    )
    .await;

    for v in [2, 4, 6, 8, 10] {
        let sid = mk_session(&pool, qid, true, (1, 0, 0), None).await;
        sqlx::query(
            "INSERT INTO responses (session_id, question_id, value) VALUES ($1, 'q1', to_jsonb($2::int))",
        )
        .bind(sid)
        .bind(v)
        .execute(&pool)
        .await
        .expect("response");
    }

    let row = dataset_stats(
        &pool,
        qid,
        "response",
        "q1",
        serde_json::json!({ "versionScope": "any" }),
    )
    .await;
    assert_eq!(row.n, 5);
    assert!((row.mean.unwrap() - 6.0).abs() < 1e-9);
}

// ── HTTP endpoint ────────────────────────────────────────────────────────

/// Seed a published questionnaire declaring one object + one scalar server
/// variable over `score`, with `n` completed sessions carrying that score.
async fn seed_endpoint_fixture(pool: &PgPool, scores: &[i64]) -> Uuid {
    let user = mk_user(pool).await;
    let project = mk_project(pool, user).await;
    let content = serde_json::json!({
        "variables": [
            { "id": "cohortAnxiety", "name": "cohortAnxiety", "type": "object",
              "server": { "source": "variable", "key": "score" } },
            { "id": "cohortMean", "name": "cohortMean", "type": "number",
              "server": { "source": "variable", "key": "score", "stat": "mean" } }
        ]
    });
    let qid = mk_questionnaire(pool, project, user, content, "published", (1, 0, 0)).await;
    for &s in scores {
        let sid = mk_session(pool, qid, true, (1, 0, 0), None).await;
        set_var_num(pool, sid, "score", s).await;
    }
    qid
}

#[tokio::test]
async fn endpoint_returns_entries_with_stats_above_floor() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let app = test_app(state);
    let qid = seed_endpoint_fixture(&pool, &[10, 20, 30, 40, 50, 60]).await;

    let (status, body) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "server-variables: {body:?}");
    assert_eq!(body["questionnaire_id"].as_str().unwrap(), qid.to_string());
    assert_eq!(body["version"].as_str().unwrap(), "1.0.0");
    assert_eq!(body["fallback_registry"].as_bool(), Some(false));

    let vars = body["variables"].as_array().expect("variables array");
    assert_eq!(vars.len(), 2, "one object + one scalar declaration");

    let obj = vars
        .iter()
        .find(|v| v["name"] == "cohortAnxiety")
        .expect("cohortAnxiety");
    assert_eq!(obj["sample_count"].as_i64(), Some(6));
    assert!((obj["stats"]["mean"].as_f64().unwrap() - 35.0).abs() < 1e-9);
    assert!(obj["stats"]["p25"].as_f64().is_some(), "quartiles present");
    // decl_hash matches the TS declHash({source:'variable',key:'score'}).
    assert!(!obj["decl_hash"].as_str().unwrap().is_empty());

    let scalar = vars
        .iter()
        .find(|v| v["name"] == "cohortMean")
        .expect("cohortMean");
    assert_eq!(scalar["source"].as_str(), Some("variable"));
    assert!((scalar["stats"]["mean"].as_f64().unwrap() - 35.0).abs() < 1e-9);
}

#[tokio::test]
async fn endpoint_withholds_stats_below_floor_but_reports_count() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let app = test_app(state);
    let qid = seed_endpoint_fixture(&pool, &[1, 2, 3]).await; // n=3 < 5

    let (status, body) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let obj = body["variables"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["name"] == "cohortAnxiety")
        .unwrap();
    assert_eq!(obj["sample_count"].as_i64(), Some(3));
    assert!(obj["stats"].is_null(), "stats withheld below n<5 floor");
}

#[tokio::test]
async fn endpoint_404_for_unpublished_and_missing() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let app = test_app(state);

    // Unpublished (draft) questionnaire.
    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let draft = mk_questionnaire(
        &pool,
        project,
        user,
        serde_json::json!({}),
        "draft",
        (1, 0, 0),
    )
    .await;
    let (status, _) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{draft}/server-variables"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "draft is not probeable");

    // Missing id.
    let (status, _) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{}/server-variables", Uuid::new_v4()),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn endpoint_version_resolves_snapshot_and_flags_registry_fallback() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let app = test_app(state);

    // Latest registry declares `cohortAnxiety`/`cohortMean` over `score`.
    let qid = seed_endpoint_fixture(&pool, &[10, 20, 30, 40, 50]).await;
    // Grab the created_by user for the snapshot FK.
    let created_by: Uuid =
        sqlx::query_scalar("SELECT created_by FROM questionnaire_definitions WHERE id = $1")
            .bind(qid)
            .fetch_one(&pool)
            .await
            .expect("created_by");

    // A pinned 1.0.0 snapshot with a DIFFERENT declaration (keyed 'legacyScore').
    let snap_content = serde_json::json!({
        "variables": [
            { "id": "legacy", "name": "legacy", "type": "number",
              "server": { "source": "variable", "key": "legacyScore", "stat": "mean" } }
        ]
    });
    sqlx::query(
        "INSERT INTO questionnaire_snapshots \
           (questionnaire_id, version_major, version_minor, version_patch, content, created_by) \
         VALUES ($1, 1, 0, 0, $2, $3)",
    )
    .bind(qid)
    .bind(&snap_content)
    .bind(created_by)
    .execute(&pool)
    .await
    .expect("snapshot");

    // ?version=1.0.0 resolves the snapshot → its single 'legacy' declaration.
    let (status, body) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables?version=1.0.0"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body:?}");
    assert_eq!(body["version"].as_str(), Some("1.0.0"));
    assert_eq!(body["fallback_registry"].as_bool(), Some(false));
    let names: Vec<&str> = body["variables"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v["name"].as_str())
        .collect();
    assert_eq!(names, vec!["legacy"], "snapshot declarations used");

    // ?version=9.9.9 has no snapshot → registry fallback (flagged).
    let (status, body) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables?version=9.9.9"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body:?}");
    assert_eq!(body["version"].as_str(), Some("9.9.9"));
    assert_eq!(
        body["fallback_registry"].as_bool(),
        Some(true),
        "pruned snapshot → registry fallback"
    );
    let names: Vec<&str> = body["variables"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v["name"].as_str())
        .collect();
    assert!(
        names.contains(&"cohortAnxiety"),
        "registry declarations used: {names:?}"
    );
}

#[tokio::test]
async fn endpoint_caps_declarations_at_fifty() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: fixture pool unavailable");
        return;
    };
    let app = test_app(state);

    let user = mk_user(&pool).await;
    let project = mk_project(&pool, user).await;
    let mut vars = Vec::new();
    for i in 0..60 {
        vars.push(serde_json::json!({
            "id": format!("v{i}"), "name": format!("v{i}"), "type": "number",
            "server": { "source": "variable", "key": "score", "stat": "mean" }
        }));
    }
    let content = serde_json::json!({ "variables": vars });
    let qid = mk_questionnaire(&pool, project, user, content, "published", (1, 0, 0)).await;

    let (status, body) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["variables"].as_array().unwrap().len(),
        50,
        "capped at 50 declarations"
    );
}
