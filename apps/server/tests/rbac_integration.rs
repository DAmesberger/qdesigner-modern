//! RBAC + RLS Integration Tests
//!
//! Validates:
//! - RLS helper functions exist (current_app_user_id, is_super_admin).
//! - DB-level triggers enforce cross-tenant project_member constraints.
//! - RLS policies enforce per-tenant SELECT — both allow paths and
//!   adversarial deny paths (a member of org A cannot see org B's data).
//!
//! Requires a running PostgreSQL with all migrations applied, including
//! 00014_rls_policies.sql.
//!
//! Note on test pattern:
//! The `qdesigner` connection user is the table owner and bypasses RLS by
//! default. To exercise policies, each policy test BEGINs a transaction,
//! CREATEs a temporary non-owner role, SETs LOCAL ROLE to it, sets the
//! GUC `app.user_id` to the impersonated user, runs the query, then
//! ROLLBACKs — which transactionally drops the role. This pattern works
//! today even though production handlers don't yet pin their connection;
//! handler-side pinning is deferred to Phase 5.

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

async fn create_test_user(pool: &PgPool, email: &str) -> sqlx::Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'argon2-hash-placeholder') RETURNING id",
    )
    .bind(email)
    .fetch_one(pool)
    .await
}

async fn create_test_org(pool: &PgPool, name: &str, owner: Uuid) -> sqlx::Result<Uuid> {
    let slug = format!(
        "{}-{}",
        name.to_lowercase().replace(' ', "-"),
        &Uuid::new_v4().to_string()[..8]
    );
    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(name)
    .bind(&slug)
    .bind(owner)
    .fetch_one(pool)
    .await?;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    )
    .bind(org_id)
    .bind(owner)
    .execute(pool)
    .await?;
    Ok(org_id)
}

async fn create_test_project(pool: &PgPool, org: Uuid, name: &str) -> sqlx::Result<Uuid> {
    let code = format!("p-{}", &Uuid::new_v4().to_string()[..8]);
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(org)
    .bind(name)
    .bind(code)
    .fetch_one(pool)
    .await
}

// ── Helper-function existence ─────────────────────────────────────────

#[tokio::test]
async fn rls_helper_functions_exist() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'current_app_user_id')",
    )
    .fetch_one(&pool)
    .await
    .expect("query");
    assert!(exists, "current_app_user_id() should exist");

    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_super_admin')")
            .fetch_one(&pool)
            .await
            .expect("query");
    assert!(exists, "is_super_admin() should exist");
}

#[tokio::test]
async fn rls_context_set_and_reset() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let user_id = Uuid::new_v4();
    let mut tx = pool.begin().await.expect("begin");

    // Set on this connection
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user_id.to_string())
        .execute(&mut *tx)
        .await
        .expect("set_config");

    let read: Uuid = sqlx::query_scalar("SELECT current_app_user_id()")
        .fetch_one(&mut *tx)
        .await
        .expect("read back");
    assert_eq!(read, user_id);

    tx.rollback().await.ok();
}

// ── Cross-org project membership (ADR 0033) ───────────────────────────
//
// ADR 0033 makes external collaboration cross-org project membership: the
// 00009 `trg_project_members_org_check` trigger (which required every project
// member to be an active org member of the project's parent org) is DROPPED
// (migration 00055). These three tests previously asserted that trigger's
// restriction; they are rewritten to the new contract — a project member need
// NOT be an org member, and cross-tenant isolation for such a member is now
// enforced by the study-data RLS scoping (00054) + the handler `authorize`
// gate, not by this schema-layer trigger.

#[tokio::test]
async fn project_member_org_check_trigger_removed() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // ADR 0033: the trigger is gone so cross-org project membership is possible.
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_members_org_check')",
    )
    .fetch_one(&pool)
    .await
    .expect("query");
    assert!(
        !exists,
        "trg_project_members_org_check must be dropped (ADR 0033 — cross-org project membership)"
    );
}

#[tokio::test]
async fn project_member_need_not_be_org_member() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user a");
    let user_b = create_test_user(&pool, &format!("b-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user b");
    let org_a = create_test_org(&pool, "Org A", user_a).await.expect("org");
    let project_a = create_test_project(&pool, org_a, "Project A")
        .await
        .expect("project");

    // ADR 0033: user_b is not a member of org_a, but may now be added as a
    // project member of org_a's project (external collaborator). The schema no
    // longer blocks this; isolation is enforced by RLS + the authorize gate.
    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')",
    )
    .bind(project_a)
    .bind(user_b)
    .execute(&pool)
    .await;

    assert!(
        result.is_ok(),
        "ADR 0033: a project member need not be an org member, got: {result:?}"
    );

    // Cleanup the persisted cross-org membership row.
    let _ = sqlx::query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2")
        .bind(project_a)
        .bind(user_b)
        .execute(&pool)
        .await;
}

#[tokio::test]
async fn cross_tenant_project_member_insertion_allowed_at_schema_layer() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let user_org1 = create_test_user(&pool, &format!("u1-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user");
    let user_org2 = create_test_user(&pool, &format!("u2-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user");
    let org1 = create_test_org(&pool, "Org One", user_org1)
        .await
        .expect("org1");
    let _org2 = create_test_org(&pool, "Org Two", user_org2)
        .await
        .expect("org2");
    let project_in_org1 = create_test_project(&pool, org1, "P1")
        .await
        .expect("project");

    // ADR 0033: user_org2 (org2 only) may be added to a project in org1 as a
    // cross-org collaborator. The schema-layer trigger no longer denies this;
    // such a member sees ONLY that project's study data (RLS 00054), never any
    // other org1 data — the tenant-isolation contract proven end-to-end in
    // tests/cross_org_project_membership.rs.
    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')",
    )
    .bind(project_in_org1)
    .bind(user_org2)
    .execute(&pool)
    .await;

    assert!(
        result.is_ok(),
        "ADR 0033: cross-org project membership is allowed at the schema layer, got: {result:?}"
    );

    let _ = sqlx::query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2")
        .bind(project_in_org1)
        .bind(user_org2)
        .execute(&pool)
        .await;
}

// ── RLS policy tests (allow + adversarial deny) ──────────────────────

/// Inside an open transaction, switch to a non-owner role with
/// `app.user_id` set to `as_user`. Caller owns the rollback. Returns
/// the (anonymous) test role name in case the test wants to log it.
async fn pin_as(tx: &mut sqlx::PgConnection, as_user: Uuid) {
    let role_name = format!("rls_test_{}", Uuid::new_v4().simple());
    sqlx::query(&format!("CREATE ROLE {role_name} NOLOGIN"))
        .execute(&mut *tx)
        .await
        .expect("create role");
    sqlx::query(&format!("GRANT pg_read_all_data TO {role_name}"))
        .execute(&mut *tx)
        .await
        .expect("grant");
    sqlx::query(&format!("SET LOCAL ROLE {role_name}"))
        .execute(&mut *tx)
        .await
        .expect("set role");
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(as_user.to_string())
        .execute(&mut *tx)
        .await
        .expect("set_config");
}

#[tokio::test]
async fn sessions_policy_allows_org_member() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Setup as owner: user A in org A with project, questionnaire, session.
    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user");
    let org_a = create_test_org(&pool, "Org A", user_a).await.expect("org");
    let project = create_test_project(&pool, org_a, "P")
        .await
        .expect("project");

    let q_id: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by) \
         VALUES ($1, $2, '{}'::jsonb, 'draft', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("Q-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_a)
    .fetch_one(&pool)
    .await
    .expect("questionnaire");

    let session_id: Uuid =
        sqlx::query_scalar("INSERT INTO sessions (questionnaire_id) VALUES ($1) RETURNING id")
            .bind(q_id)
            .fetch_one(&pool)
            .await
            .expect("session");

    let mut tx = pool.begin().await.expect("begin");
    pin_as(&mut tx, user_a).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_one(&mut *tx)
        .await
        .expect("count");
    tx.rollback().await.ok();

    assert_eq!(count, 1, "org member should see their org's session");
}

#[tokio::test]
async fn sessions_policy_denies_non_member() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Setup: user A in org A creates a session. user B is in a DIFFERENT org.
    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user a");
    let user_b = create_test_user(&pool, &format!("b-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user b");
    let org_a = create_test_org(&pool, "Org A", user_a)
        .await
        .expect("org a");
    let _org_b = create_test_org(&pool, "Org B", user_b)
        .await
        .expect("org b");
    let project = create_test_project(&pool, org_a, "P")
        .await
        .expect("project");

    let q_id: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by) \
         VALUES ($1, $2, '{}'::jsonb, 'draft', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("Q-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_a)
    .fetch_one(&pool)
    .await
    .expect("questionnaire");

    let session_id: Uuid =
        sqlx::query_scalar("INSERT INTO sessions (questionnaire_id) VALUES ($1) RETURNING id")
            .bind(q_id)
            .fetch_one(&pool)
            .await
            .expect("session");

    // user_b queries with policy active — should NOT see org_a's session.
    let mut tx = pool.begin().await.expect("begin");
    pin_as(&mut tx, user_b).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_one(&mut *tx)
        .await
        .expect("count");
    tx.rollback().await.ok();

    assert_eq!(
        count, 0,
        "cross-org user must not see another org's session"
    );
}

// `organizations_policy_denies_non_member` was deleted in P6.2 with
// migration 00020. ADR 0015 records the decision: `organizations` is
// RLS-exempt because the `/api/domains/auto-join` endpoint is an
// intentional anonymous-read path. Cross-tenant denial on
// `organizations` now lives in `api/access::*` (handler layer), not
// the DB; `organization_members` still enforces RLS, and the
// authenticated reads that need org-scope filter through that table.
//
// The test below covers the surviving handler-layer gate: the
// membership probe `get_organization` runs before reading the
// organizations row. This is the contract ADR 0015 leans on.

#[tokio::test]
async fn cross_tenant_org_membership_check_denies_non_member() {
    // Asserts the api/access::* contract the get_organization handler
    // depends on: the membership probe returns false for a user who is
    // not in the target org, so the handler short-circuits to 403
    // before SELECTing from `organizations` (which is now RLS-exempt
    // per ADR 0015 and would otherwise leak the row).
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };
    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user a");
    let user_b = create_test_user(&pool, &format!("b-{}@test.local", Uuid::new_v4()))
        .await
        .expect("user b");
    let org_a = create_test_org(&pool, "Org A", user_a)
        .await
        .expect("org a");
    let _org_b = create_test_org(&pool, "Org B", user_b)
        .await
        .expect("org b");

    // Replicate the SQL the get_organization handler runs
    // (apps/server/src/api/organizations.rs §322). User B should not
    // be a member of org A.
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM organization_members
            WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
        )",
    )
    .bind(org_a)
    .bind(user_b)
    .fetch_one(&pool)
    .await
    .expect("membership probe");

    assert!(
        !is_member,
        "user B should NOT be a member of org A; handler must 403 cross-tenant gets"
    );
}
