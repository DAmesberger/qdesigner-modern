//! P1-T5 — Anonymous-safe cohort feedback path (resolves F060).
//!
//! Asserts the 00028 SECURITY DEFINER aggregate `fillout_cohort_stats(qid,
//! source, key)` that powers the public `/api/questionnaires/{id}/cohort-stats`
//! endpoint. The endpoint is the anonymous participant's only route to cohort
//! stats — `/api/sessions/aggregate` is `AuthenticatedUser`-gated (401 before
//! RLS), so it is dead for fillout participants.
//!
//! Coverage:
//!   - 6 completed sessions with a numeric session_variable → the function
//!     returns n=6 with the correct population mean/std_dev (matching the Rust
//!     `compute_numeric_stats` reference: variance / count).
//!   - non-completed sessions are excluded.
//!   - the min-N floor is a HANDLER concern (n < 5 → null stats); the SQL
//!     function itself always returns real aggregates. We assert the raw n so
//!     the handler's floor has something to floor.
//!
//! The RLS-bypass property mirrors quota_counting: under the non-owner
//! `qdesigner_app` role with NO app.* GUC (the anonymous posture), a direct
//! `SELECT ... FROM sessions` is hidden by the 00021 dual-path policy while the
//! owner-definer aggregate still sees every completed session.
//!
//! Uses the migration DSN (qdesigner — SUPERUSER + BYPASSRLS) for fixture
//! INSERTs so setup isn't subject to RLS. Mirrors tests/quota_counting.rs.

use sqlx::PgPool;
use uuid::Uuid;

async fn get_test_pool() -> Option<PgPool> {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join(".env.development"));
    if let Some(path) = env_path.as_ref() {
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines() {
                    if let Some(val) = line.strip_prefix("DATABASE_URL_MIGRATIONS=") {
                        std::env::set_var("DATABASE_URL_MIGRATIONS", val.trim());
                    } else if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                        std::env::set_var("DATABASE_URL", val.trim());
                    }
                }
            }
        }
    }
    let url = std::env::var("DATABASE_URL_MIGRATIONS")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .ok()?;
    PgPool::connect(&url).await.ok()
}

#[derive(sqlx::FromRow, Debug)]
struct StatsRow {
    n: i64,
    mean: Option<f64>,
    std_dev: Option<f64>,
    min: Option<f64>,
    max: Option<f64>,
    median: Option<f64>,
    p90: Option<f64>,
    p95: Option<f64>,
    p99: Option<f64>,
}

async fn cohort_stats(pool: &PgPool, qid: Uuid, source: &str, key: &str) -> StatsRow {
    sqlx::query_as::<_, StatsRow>(
        "SELECT n, mean, std_dev, min, max, median, p90, p95, p99 \
         FROM public.fillout_cohort_stats($1, $2, $3)",
    )
    .bind(qid)
    .bind(source)
    .bind(key)
    .fetch_one(pool)
    .await
    .expect("cohort_stats")
}

/// Seed a published questionnaire plus 6 completed sessions each carrying a
/// numeric `score` session_variable (values 10..=60 step 10), one IN-PROGRESS
/// session with score=999 (must be excluded), and returns (published_qid,
/// unpublished_qid). The 6 values give a population mean of 35 and a population
/// std_dev of sqrt(mean((x-35)^2)) = sqrt(291.666..) ≈ 17.0783.
async fn seed(pool: &PgPool) -> (Uuid, Uuid) {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("cs-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('CS', $1, $2) RETURNING id",
    )
    .bind(format!("cs-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");

    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'CS', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("cs-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    let published: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("CS-pub-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("published questionnaire");

    let unpublished: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'draft', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("CS-draft-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("unpublished questionnaire");

    // 6 completed sessions with numeric `score` via the session_variables
    // snapshot (exercises the JSONB-number resolution branch).
    for score in [10, 20, 30, 40, 50, 60] {
        let sid: Uuid = sqlx::query_scalar(
            "INSERT INTO sessions (questionnaire_id, status, metadata) VALUES ($1, 'completed', '{}'::jsonb) RETURNING id",
        )
        .bind(published)
        .fetch_one(pool)
        .await
        .expect("completed session");
        sqlx::query(
            "INSERT INTO session_variables (session_id, variable_name, variable_value) VALUES ($1, 'score', to_jsonb($2::int))",
        )
        .bind(sid)
        .bind(score)
        .execute(pool)
        .await
        .expect("score variable");
    }

    // In-progress session with an outlier score — must NOT be counted.
    let active: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, status, metadata) VALUES ($1, 'active', '{}'::jsonb) RETURNING id",
    )
    .bind(published)
    .fetch_one(pool)
    .await
    .expect("active session");
    sqlx::query(
        "INSERT INTO session_variables (session_id, variable_name, variable_value) VALUES ($1, 'score', to_jsonb(999::int))",
    )
    .bind(active)
    .execute(pool)
    .await
    .expect("active score variable");

    (published, unpublished)
}

#[tokio::test]
async fn cohort_stats_returns_correct_moments_over_completed_sessions() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let (qid, _) = seed(&pool).await;

    let row = cohort_stats(&pool, qid, "variable", "score").await;

    assert_eq!(row.n, 6, "6 completed sessions; the active one is excluded");

    let mean = row.mean.expect("mean");
    assert!(
        (mean - 35.0).abs() < 1e-9,
        "population mean of 10..60 step 10 = 35, got {mean}"
    );

    // Population std_dev: sqrt( mean((x-35)^2) ) over {10,20,30,40,50,60}.
    let std_dev = row.std_dev.expect("std_dev");
    let expected_std = (291.666_666_666_666_7_f64).sqrt();
    assert!(
        (std_dev - expected_std).abs() < 1e-6,
        "population std_dev ≈ {expected_std}, got {std_dev}"
    );

    assert_eq!(row.min, Some(10.0));
    assert_eq!(row.max, Some(60.0));
    // percentile_cont(0.5) over the 6 sorted values = (30+40)/2 = 35.
    assert!((row.median.expect("median") - 35.0).abs() < 1e-9);
    assert!(row.p90.is_some() && row.p95.is_some() && row.p99.is_some());
}

#[tokio::test]
async fn cohort_stats_excludes_non_completed() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping");
        return;
    };
    let (qid, _) = seed(&pool).await;

    let row = cohort_stats(&pool, qid, "variable", "score").await;
    // If the active score=999 leaked in, max would be 999 and n would be 7.
    assert_eq!(row.n, 6);
    assert_eq!(
        row.max,
        Some(60.0),
        "the active outlier (999) must be excluded"
    );
}

#[tokio::test]
async fn cohort_stats_small_cohort_reports_raw_n_for_handler_floor() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping");
        return;
    };
    let (_, _) = seed(&pool).await;

    // A fresh published questionnaire with only 3 completed sessions — the SQL
    // returns real aggregates over n=3; the min-N floor (n < 5 → null stats)
    // is applied by the handler, which this test verifies has an n to floor.
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("cs3-{}@test.local", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .expect("user");
    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('CS3', $1, $2) RETURNING id",
    )
    .bind(format!("cs3-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(&pool)
    .await
    .expect("org");
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'CS3', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("cs3-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(&pool)
    .await
    .expect("project");
    let qid: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("CS3-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(&pool)
    .await
    .expect("questionnaire");
    for score in [1, 2, 3] {
        let sid: Uuid = sqlx::query_scalar(
            "INSERT INTO sessions (questionnaire_id, status, metadata) VALUES ($1, 'completed', '{}'::jsonb) RETURNING id",
        )
        .bind(qid)
        .fetch_one(&pool)
        .await
        .expect("session");
        sqlx::query(
            "INSERT INTO session_variables (session_id, variable_name, variable_value) VALUES ($1, 'score', to_jsonb($2::int))",
        )
        .bind(sid)
        .bind(score)
        .execute(&pool)
        .await
        .expect("var");
    }

    let row = cohort_stats(&pool, qid, "variable", "score").await;
    assert_eq!(
        row.n, 3,
        "the SQL returns the raw n; the handler floors n < 5 to null stats"
    );
}

#[tokio::test]
async fn cohort_stats_definer_is_the_only_window_under_the_app_role() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping");
        return;
    };
    let (qid, _) = seed(&pool).await;

    // Anonymous posture: the non-owner app role with NO app.* GUC. A direct
    // SELECT is hidden by the 00021 dual-path policy; the definer aggregate is
    // not (mirrors quota_counting's proof).
    let mut tx = pool.begin().await.expect("begin");
    sqlx::query("SET LOCAL ROLE qdesigner_app")
        .execute(&mut *tx)
        .await
        .expect("set role");

    let visible: i64 =
        sqlx::query_scalar("SELECT count(*) FROM sessions WHERE questionnaire_id = $1")
            .bind(qid)
            .fetch_one(&mut *tx)
            .await
            .expect("direct count");
    assert_eq!(
        visible, 0,
        "dual-path RLS hides every session from the anonymous app role"
    );

    let row = sqlx::query_as::<_, StatsRow>(
        "SELECT n, mean, std_dev, min, max, median, p90, p95, p99 \
         FROM public.fillout_cohort_stats($1, 'variable', 'score')",
    )
    .bind(qid)
    .fetch_one(&mut *tx)
    .await
    .expect("definer stats under app role");
    assert_eq!(
        row.n, 6,
        "the owner-definer aggregate still sees all completed sessions"
    );

    tx.rollback().await.ok();
}
