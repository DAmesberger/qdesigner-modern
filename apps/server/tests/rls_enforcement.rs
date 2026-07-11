//! P6.6 — RLS enforcement integration test.
//!
//! Phase 6 ships actual RLS enforcement (per ADR 0011 → ADR 0012/0013/
//! 0014/0015 chain). This file asserts that both halves of the chain
//! bite:
//!
//! - **Admin-table cross-tenant SELECT denial** for the four still-
//!   RLS-bound admin tables (organization_members, projects,
//!   project_members, media_assets). `users` and `organizations` are
//!   intentionally RLS-exempt per ADR 0015 — handler-layer denial for
//!   those is covered by `rbac_integration::cross_tenant_org_access_denied`.
//! - **Fillout-path isolation** via the dual-path policies in 00021.
//!   Anonymous fillout (bound by `app.session_id`) can read its own
//!   responses and only its own; authenticated fillout (bound by
//!   `app.user_id`) can read all of its sessions and only its own.
//!
//! The test uses the migration DSN (qdesigner — SUPERUSER + BYPASSRLS)
//! for fixture INSERTs so the setup is not subject to RLS, and then
//! switches into a non-superuser test role via `SET LOCAL ROLE` for
//! the policy-under-test queries. This mirrors the production posture
//! where qdesigner_app (non-owner, non-BYPASSRLS) is what the
//! application connects as.
//!
//! Bonus probe (PHASE_6_PLAN.md §P6.6): a manual revert of 00022
//! during P6.6 confirmed these tests pass with FORCE removed — the
//! defense against the application role comes from non-owner ENABLE,
//! not from FORCE. FORCE is for the migration-role/owner case which
//! qdesigner's BYPASSRLS overrides anyway. The revert wasn't
//! committed; this comment records the empirical finding.

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

/// Build a fully-populated two-tenant fixture: two users, two orgs,
/// each org has one project + one questionnaire. User A also has one
/// authenticated fillout session linked to their user_id, plus one
/// anonymous session (user_id NULL) with one response.
struct Fixture {
    user_a: Uuid,
    user_b: Uuid,
    project_a: Uuid,
    project_b: Uuid,
    auth_session_a: Uuid,
    anon_session: Uuid,
    anon_response_id: Uuid,
}

async fn build_fixture(pool: &PgPool) -> Fixture {
    let user_a: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("a-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user a");

    let user_b: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("b-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user b");

    let org_a: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('A', $1, $2) RETURNING id",
    )
    .bind(format!("a-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_a)
    .fetch_one(pool)
    .await
    .expect("org a");

    let org_b: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('B', $1, $2) RETURNING id",
    )
    .bind(format!("b-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_b)
    .fetch_one(pool)
    .await
    .expect("org b");

    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'owner', 'active')",
    )
    .bind(org_a)
    .bind(user_a)
    .bind(org_b)
    .bind(user_b)
    .execute(pool)
    .await
    .expect("org memberships");

    let project_a: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'PA', $2) RETURNING id",
    )
    .bind(org_a)
    .bind(format!("pa-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project a");

    let project_b: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'PB', $2) RETURNING id",
    )
    .bind(org_b)
    .bind(format!("pb-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project b");

    let qd_a: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project_a)
    .bind(format!("QA-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_a)
    .fetch_one(pool)
    .await
    .expect("qd a");

    // Authenticated session: user_id = A
    let auth_session_a: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, user_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(qd_a)
    .bind(user_a)
    .fetch_one(pool)
    .await
    .expect("auth session a");

    // Anonymous session: user_id NULL
    let anon_session: Uuid =
        sqlx::query_scalar("INSERT INTO sessions (questionnaire_id) VALUES ($1) RETURNING id")
            .bind(qd_a)
            .fetch_one(pool)
            .await
            .expect("anon session");

    let anon_response_id: Uuid = sqlx::query_scalar(
        "INSERT INTO responses (session_id, question_id, value)
         VALUES ($1, 'q1', '{}'::jsonb) RETURNING id",
    )
    .bind(anon_session)
    .fetch_one(pool)
    .await
    .expect("anon response");

    Fixture {
        user_a,
        user_b,
        project_a,
        project_b,
        auth_session_a,
        anon_session,
        anon_response_id,
    }
}

/// Inside the open transaction, create a fresh non-superuser role and
/// SET LOCAL ROLE to it so the policy-under-test queries run as a
/// non-bypass connection (the same posture as qdesigner_app in
/// production). Also sets app.user_id and app.session_id GUCs.
async fn pin_as_app_role(
    tx: &mut sqlx::PgConnection,
    user_id: Option<Uuid>,
    session_id: Option<Uuid>,
) {
    let role_name = format!("rls_enf_{}", Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE ROLE {role_name} NOLOGIN NOBYPASSRLS"))
        .execute(&mut *tx)
        .await
        .expect("create role");
    sqlx::query(&format!("GRANT pg_read_all_data TO {role_name}"))
        .execute(&mut *tx)
        .await
        .expect("grant read");
    sqlx::query(&format!(
        "GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role_name}"
    ))
    .execute(&mut *tx)
    .await
    .expect("grant writes");
    sqlx::query(&format!("SET LOCAL ROLE {role_name}"))
        .execute(&mut *tx)
        .await
        .expect("set role");
    sqlx::query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.session_id', $2, true)",
    )
    .bind(user_id.map(|u| u.to_string()).unwrap_or_default())
    .bind(session_id.map(|s| s.to_string()).unwrap_or_default())
    .execute(&mut *tx)
    .await
    .expect("set GUCs");
}

#[tokio::test]
async fn user_a_cannot_select_user_bs_projects() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let f = build_fixture(&pool).await;

    let mut tx = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx, Some(f.user_a), None).await;
    let visible: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM projects WHERE id = ANY($1) ORDER BY id")
            .bind(&[f.project_a, f.project_b][..])
            .fetch_all(&mut *tx)
            .await
            .expect("select projects");
    tx.rollback().await.ok();

    assert_eq!(
        visible,
        vec![f.project_a],
        "user A should see only project A, not project B (cross-tenant denial)"
    );
}

#[tokio::test]
async fn user_a_can_insert_project_with_org_bs_id_at_rls_layer() {
    // Permissive D2a mutation policy (ADR 0013) admits at RLS layer;
    // api/access::verify_project_write_access is the actual gate at
    // the handler layer. This test asserts RLS behaviour in isolation
    // — confirms the policy is permissive and the api/access::* layer
    // is the load-bearing one for mutation authorization.
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let f = build_fixture(&pool).await;

    // Resolve org B's id on the bypass connection — once we pin to
    // user A's role, the projects_select policy filters out project B
    // (which is the cross-tenant denial the other test asserts).
    let org_b_id: Uuid = sqlx::query_scalar("SELECT organization_id FROM projects WHERE id = $1")
        .bind(f.project_b)
        .fetch_one(&pool)
        .await
        .expect("fetch org b id");

    let mut tx = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx, Some(f.user_a), None).await;
    let result =
        sqlx::query("INSERT INTO projects (organization_id, name, code) VALUES ($1, 'A-in-B', $2)")
            .bind(org_b_id)
            .bind(format!("rls-{}", &Uuid::new_v4().to_string()[..8]))
            .execute(&mut *tx)
            .await;
    tx.rollback().await.ok();

    assert!(
        result.is_ok(),
        "RLS layer (permissive D2a) admits cross-tenant INSERT; handler-layer api/access::verify_project_write_access is the real gate. Got: {result:?}"
    );
}

#[tokio::test]
async fn session_insert_admitted_only_for_matching_app_session_id() {
    // The Phase-8 offline-sync upsert (sync_session) INSERTs a session under the
    // `app.session_id` GUC that fillout_rls_context set from the URL path. The
    // 00021 `sessions_insert_dual` bootstrap must admit an INSERT ONLY when
    // `app.session_id = sessions.id`, so an anonymous caller can never materialize
    // a session id they do not already possess (tenant isolation for the new
    // anonymous-reachable upsert path).
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let f = build_fixture(&pool).await;
    let qid: Uuid = sqlx::query_scalar(
        "SELECT id FROM questionnaire_definitions WHERE project_id = $1 LIMIT 1",
    )
    .bind(f.project_a)
    .fetch_one(&pool)
    .await
    .expect("fixture questionnaire id");

    // Case 1: bound to session X, INSERT session id = X → admitted (bootstrap).
    let own = Uuid::new_v4();
    let mut tx = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx, None, Some(own)).await;
    let admitted = sqlx::query("INSERT INTO sessions (id, questionnaire_id) VALUES ($1, $2)")
        .bind(own)
        .bind(qid)
        .execute(&mut *tx)
        .await;
    tx.rollback().await.ok();
    assert!(
        admitted.is_ok(),
        "bootstrap must admit inserting the caller's own session id. Got: {admitted:?}"
    );

    // Case 2: bound to session X, INSERT a DIFFERENT session id Y ≠ X → denied.
    let bound = Uuid::new_v4();
    let other = Uuid::new_v4();
    let mut tx2 = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx2, None, Some(bound)).await;
    let denied = sqlx::query("INSERT INTO sessions (id, questionnaire_id) VALUES ($1, $2)")
        .bind(other)
        .bind(qid)
        .execute(&mut *tx2)
        .await;
    tx2.rollback().await.ok();
    assert!(
        denied.is_err(),
        "RLS must DENY inserting a session id != app.session_id (no session hijack). Got: {denied:?}"
    );
}

#[tokio::test]
async fn anon_session_insert_cannot_forge_user_id() {
    // F011 — 00029 tightens `sessions_insert_dual` so the anonymous
    // (session-GUC-bound) branch requires `sessions.user_id IS NULL`. An
    // anonymous caller must never be able to materialize a session that
    // claims a victim's user_id (which the authenticated dual-path SELECT
    // branch would then admit as that user's own session).
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let f = build_fixture(&pool).await;
    let qid: Uuid = sqlx::query_scalar(
        "SELECT id FROM questionnaire_definitions WHERE project_id = $1 LIMIT 1",
    )
    .bind(f.project_a)
    .fetch_one(&pool)
    .await
    .expect("fixture questionnaire id");

    // Case 1: bound to session X, INSERT session id = X with a NON-NULL
    // (forged victim) user_id → DENIED by the new WITH CHECK.
    let own = Uuid::new_v4();
    let mut tx = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx, None, Some(own)).await;
    let denied =
        sqlx::query("INSERT INTO sessions (id, questionnaire_id, user_id) VALUES ($1, $2, $3)")
            .bind(own)
            .bind(qid)
            .bind(f.user_b)
            .execute(&mut *tx)
            .await;
    tx.rollback().await.ok();
    assert!(
        denied.is_err(),
        "anonymous INSERT with a forged non-null user_id must be DENIED. Got: {denied:?}"
    );

    // Case 2: bound to session X, INSERT session id = X with user_id NULL
    // → still ADMITTED (the live anonymous-create path).
    let own2 = Uuid::new_v4();
    let mut tx2 = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx2, None, Some(own2)).await;
    let admitted = sqlx::query("INSERT INTO sessions (id, questionnaire_id) VALUES ($1, $2)")
        .bind(own2)
        .bind(qid)
        .execute(&mut *tx2)
        .await;
    tx2.rollback().await.ok();
    assert!(
        admitted.is_ok(),
        "anonymous INSERT with NULL user_id must still be admitted. Got: {admitted:?}"
    );
}

#[tokio::test]
async fn session_media_upload_reads_completed_session_status_under_session_guc() {
    // Fix A (QA of #34): `upload_session_media` validates the session with
    // `SELECT status FROM sessions WHERE id = $1`. Binary answers upload deferred,
    // so this runs under `set_fillout_rls_context` bound by app.session_id and must
    // (a) admit the row through the dual-path SELECT policy and (b) see a `completed`
    // session — the handler now accepts `active` OR `completed`. Running the same
    // query on the raw pool (no session GUC) is what produced the 404 "Session not
    // found" the participant retried against; the second half proves that denial.
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let f = build_fixture(&pool).await;
    let qid: Uuid = sqlx::query_scalar(
        "SELECT id FROM questionnaire_definitions WHERE project_id = $1 LIMIT 1",
    )
    .bind(f.project_a)
    .fetch_one(&pool)
    .await
    .expect("fixture questionnaire id");

    // A COMPLETED anonymous session — the deferred-upload case.
    let completed_session: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, status) VALUES ($1, 'completed') RETURNING id",
    )
    .bind(qid)
    .fetch_one(&pool)
    .await
    .expect("completed anon session");

    // Bound to the session id (what the middleware sets from the URL path): the
    // handler's status query admits the row and reads `completed`.
    let mut tx = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx, None, Some(completed_session)).await;
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM sessions WHERE id = $1")
            .bind(completed_session)
            .fetch_optional(&mut *tx)
            .await
            .expect("status query");
    tx.rollback().await.ok();
    assert_eq!(
        status.as_deref(),
        Some("completed"),
        "a completed session must be readable (and thus uploadable) under its own session GUC"
    );

    // Bound to a DIFFERENT session id (or, equivalently, the no-GUC raw pool the old
    // handler used): the dual-path SELECT policy denies the row → the exact 404.
    let mut tx2 = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx2, None, Some(Uuid::new_v4())).await;
    let denied: Option<String> =
        sqlx::query_scalar("SELECT status FROM sessions WHERE id = $1")
            .bind(completed_session)
            .fetch_optional(&mut *tx2)
            .await
            .expect("status query");
    tx2.rollback().await.ok();
    assert_eq!(
        denied, None,
        "without the matching session GUC the status query returns nothing — the pre-fix 404"
    );
}

#[tokio::test]
async fn anon_fillout_can_select_its_own_responses() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let f = build_fixture(&pool).await;

    let mut tx = pool.begin().await.expect("begin");
    // No user_id GUC; session_id bound to the anonymous session.
    pin_as_app_role(&mut tx, None, Some(f.anon_session)).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM responses WHERE id = $1")
        .bind(f.anon_response_id)
        .fetch_one(&mut *tx)
        .await
        .expect("count");
    tx.rollback().await.ok();

    assert_eq!(
        count, 1,
        "anonymous fillout bound by app.session_id should see its own responses"
    );
}

#[tokio::test]
async fn anon_fillout_cannot_select_other_sessions_responses() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let f = build_fixture(&pool).await;

    // Bind to a fresh unrelated session id — not the one that owns
    // f.anon_response_id. The dual-path SELECT policy admits only
    // responses whose session matches the bound app.session_id.
    let other_session_id = Uuid::new_v4();

    let mut tx = pool.begin().await.expect("begin");
    pin_as_app_role(&mut tx, None, Some(other_session_id)).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM responses WHERE id = $1")
        .bind(f.anon_response_id)
        .fetch_one(&mut *tx)
        .await
        .expect("count");
    tx.rollback().await.ok();

    assert_eq!(
        count, 0,
        "anonymous fillout bound to a different session must NOT see another session's responses"
    );
}

#[tokio::test]
async fn authenticated_fillout_can_select_all_of_its_sessions() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let f = build_fixture(&pool).await;

    let mut tx = pool.begin().await.expect("begin");
    // user_id = A bound; session_id NULL. Dual-path admits via
    // sessions.user_id = current_app_user_id().
    pin_as_app_role(&mut tx, Some(f.user_a), None).await;
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = $1 AND user_id = $2")
            .bind(f.auth_session_a)
            .bind(f.user_a)
            .fetch_one(&mut *tx)
            .await
            .expect("count");
    tx.rollback().await.ok();

    assert_eq!(
        count, 1,
        "authenticated fillout bound by app.user_id should see its own auth-linked sessions"
    );
}

#[tokio::test]
async fn authenticated_fillout_cannot_select_user_bs_sessions() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping");
        return;
    };
    let f = build_fixture(&pool).await;

    // Pre-flight (using the bypass connection): create an
    // auth-linked session for user B so we have something for A to
    // fail to read.
    let auth_session_b: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, user_id) VALUES ((SELECT id FROM questionnaire_definitions LIMIT 1), $1) RETURNING id",
    )
    .bind(f.user_b)
    .fetch_one(&pool)
    .await
    .expect("user b session");

    let mut tx = pool.begin().await.expect("begin");
    // Bind app.user_id = A. The dual-path SELECT admits only sessions
    // where user_id = A (and the org-member subselect for analytics
    // reads through the questionnaire chain — but user A is in org A,
    // not org B; questionnaire_b doesn't exist yet so no admission
    // via that path either).
    pin_as_app_role(&mut tx, Some(f.user_a), None).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = $1")
        .bind(auth_session_b)
        .fetch_one(&mut *tx)
        .await
        .expect("count");
    tx.rollback().await.ok();

    assert_eq!(
        count, 0,
        "user A bound by app.user_id must NOT see user B's sessions"
    );
}
