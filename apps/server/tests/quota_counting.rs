//! P1-T4 — Real per-cell quota counting (resolves F014).
//!
//! Asserts the 00027 SECURITY DEFINER counters:
//!   - `fillout_completed_count(qid)` — total completed sessions.
//!   - `fillout_quota_condition_count(qid, var, op, cmp)` — completed
//!     sessions whose resolved value satisfies the condition, with the
//!     value resolved from `metadata->'urlParams'->>var` OR the
//!     `session_variables` snapshot (COALESCE), and numeric ops guarded
//!     by a numeric regex so non-numeric data counts as a non-match.
//!
//! The RLS-bypass property is the whole point of the fix: the quota
//! endpoint runs on the bare app pool with NO GUC, where the 00021
//! dual-path SELECT policy hides every session from `qdesigner_app`
//! (the always-0 bug). We prove it by SET LOCAL ROLE qdesigner_app in a
//! tx and asserting a direct `SELECT count(*) FROM sessions` returns 0
//! while `SELECT fillout_completed_count(...)` returns the real total —
//! the owner-definer function is the only aggregate window.
//!
//! Uses the migration DSN (qdesigner — SUPERUSER + BYPASSRLS) for fixture
//! INSERTs so setup isn't subject to RLS. Mirrors tests/rls_enforcement.rs.

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

/// Seed a published questionnaire plus:
///   - 2 completed sessions gender=male via metadata.urlParams (session 1
///     also age=25, session 2 age=17),
///   - 1 completed session gender=female via the session_variables snapshot
///     (empty urlParams — exercises the COALESCE fallback),
///   - 1 IN-PROGRESS session gender=male (must NOT be counted).
/// Returns the questionnaire id.
async fn seed(pool: &PgPool) -> Uuid {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("qc-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('QC', $1, $2) RETURNING id",
    )
    .bind(format!("qc-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");

    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'QC', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("qc-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    let qid: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("QC-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("questionnaire");

    // Two completed male sessions via urlParams (+ numeric age).
    for age in ["25", "17"] {
        sqlx::query(
            "INSERT INTO sessions (questionnaire_id, status, metadata)
             VALUES ($1, 'completed', jsonb_build_object('urlParams', jsonb_build_object('gender', 'male', 'age', $2::text)))",
        )
        .bind(qid)
        .bind(age)
        .execute(pool)
        .await
        .expect("completed male session");
    }

    // One completed female session with NO urlParams — gender comes from the
    // session_variables snapshot, exercising the COALESCE fallback.
    let female_session: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, status, metadata) VALUES ($1, 'completed', '{}'::jsonb) RETURNING id",
    )
    .bind(qid)
    .fetch_one(pool)
    .await
    .expect("completed female session");
    sqlx::query(
        "INSERT INTO session_variables (session_id, variable_name, variable_value) VALUES ($1, 'gender', '\"female\"'::jsonb)",
    )
    .bind(female_session)
    .execute(pool)
    .await
    .expect("female session_variable");

    // One in-progress male session — must be excluded from all counts.
    sqlx::query(
        "INSERT INTO sessions (questionnaire_id, status, metadata)
         VALUES ($1, 'active', jsonb_build_object('urlParams', jsonb_build_object('gender', 'male')))",
    )
    .bind(qid)
    .execute(pool)
    .await
    .expect("active male session");

    qid
}

#[tokio::test]
async fn completed_count_ignores_non_completed_sessions() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let qid = seed(&pool).await;

    let total: i64 = sqlx::query_scalar("SELECT public.fillout_completed_count($1)")
        .bind(qid)
        .fetch_one(&pool)
        .await
        .expect("completed count");

    assert_eq!(total, 3, "3 completed (2 male + 1 female); the active one is excluded");
}

#[tokio::test]
async fn condition_count_is_per_cell_not_grand_total() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping");
        return;
    };
    let qid = seed(&pool).await;

    let male: i64 =
        sqlx::query_scalar("SELECT public.fillout_quota_condition_count($1, 'gender', '==', 'male')")
            .bind(qid)
            .fetch_one(&pool)
            .await
            .expect("male count");
    let female: i64 = sqlx::query_scalar(
        "SELECT public.fillout_quota_condition_count($1, 'gender', '==', 'female')",
    )
    .bind(qid)
    .fetch_one(&pool)
    .await
    .expect("female count");

    assert_eq!(male, 2, "gender == male should count exactly the two male completions");
    assert_eq!(
        female, 1,
        "gender == female should count the one female completion (resolved via session_variables)"
    );
}

#[tokio::test]
async fn numeric_comparisons_are_guarded_and_correct() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping");
        return;
    };
    let qid = seed(&pool).await;

    // Numeric compare over age: 25 >= 18 (one), 17 < 18 (one).
    let age_ge_18: i64 =
        sqlx::query_scalar("SELECT public.fillout_quota_condition_count($1, 'age', '>=', '18')")
            .bind(qid)
            .fetch_one(&pool)
            .await
            .expect("age >= 18");
    let age_lt_18: i64 =
        sqlx::query_scalar("SELECT public.fillout_quota_condition_count($1, 'age', '<', '18')")
            .bind(qid)
            .fetch_one(&pool)
            .await
            .expect("age < 18");
    assert_eq!(age_ge_18, 1, "only age=25 satisfies >= 18");
    assert_eq!(age_lt_18, 1, "only age=17 satisfies < 18");

    // Numeric op on a non-numeric column must count as a non-match, not error.
    let gender_gt_1: i64 =
        sqlx::query_scalar("SELECT public.fillout_quota_condition_count($1, 'gender', '>', '1')")
            .bind(qid)
            .fetch_one(&pool)
            .await
            .expect("gender > 1");
    assert_eq!(gender_gt_1, 0, "non-numeric 'male'/'female' > 1 must be a non-match, not an error");

    // != counts the complement (males are 'not female').
    let not_female: i64 = sqlx::query_scalar(
        "SELECT public.fillout_quota_condition_count($1, 'gender', '!=', 'female')",
    )
    .bind(qid)
    .fetch_one(&pool)
    .await
    .expect("gender != female");
    assert_eq!(not_female, 2, "gender != female counts the two males");
}

#[tokio::test]
async fn definer_is_the_only_aggregate_window_under_the_app_role() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("skipping");
        return;
    };
    let qid = seed(&pool).await;

    // Switch to the real non-owner application role with NO app.* GUC set —
    // exactly the anonymous quota-endpoint posture. A direct SELECT is hidden
    // by the 00021 dual-path policy; the owner-definer function is not.
    let mut tx = pool.begin().await.expect("begin");
    sqlx::query("SET LOCAL ROLE qdesigner_app")
        .execute(&mut *tx)
        .await
        .expect("set role qdesigner_app");

    let direct: i64 =
        sqlx::query_scalar("SELECT count(*)::bigint FROM sessions WHERE questionnaire_id = $1 AND status = 'completed'")
            .bind(qid)
            .fetch_one(&mut *tx)
            .await
            .expect("direct count under app role");
    assert_eq!(
        direct, 0,
        "direct SELECT under qdesigner_app with no GUC must be hidden by RLS (this is the always-0 bug)"
    );

    let via_definer: i64 = sqlx::query_scalar("SELECT public.fillout_completed_count($1)")
        .bind(qid)
        .fetch_one(&mut *tx)
        .await
        .expect("definer count under app role");
    assert_eq!(
        via_definer, 3,
        "the SECURITY DEFINER function must see the true total across all sessions"
    );

    let male_via_definer: i64 =
        sqlx::query_scalar("SELECT public.fillout_quota_condition_count($1, 'gender', '==', 'male')")
            .bind(qid)
            .fetch_one(&mut *tx)
            .await
            .expect("definer condition count under app role");
    assert_eq!(male_via_definer, 2, "per-cell definer count also works under the app role");

    tx.rollback().await.ok();
}
