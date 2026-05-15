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

/// Load DATABASE_URL from the repo-root `.env.development` if present, else
/// from the process env. Returns None if no DB is reachable so the test
/// suite skips cleanly in environments without docker compose up.
async fn get_test_pool() -> Option<PgPool> {
    // CARGO_MANIFEST_DIR is `apps/server`; the .env.development lives at
    // the repo root, two levels up. Earlier code used a single .parent()
    // which pointed at the non-existent `apps/.env.development`.
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join(".env.development"));
    if let Some(path) = env_path.as_ref() {
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines() {
                    if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                        std::env::set_var("DATABASE_URL", val.trim());
                        break;
                    }
                }
            }
        }
    }
    let url = std::env::var("DATABASE_URL").ok()?;
    PgPool::connect(&url).await.ok()
}

async fn create_test_user(pool: &PgPool, email: &str) -> sqlx::Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'argon2-hash-placeholder') RETURNING id",
    )
    .bind(email)
    .fetch_one(pool)
    .await
}

async fn create_test_org(pool: &PgPool, name: &str, owner: Uuid) -> sqlx::Result<Uuid> {
    let slug = format!("{}-{}", name.to_lowercase().replace(' ', "-"), &Uuid::new_v4().to_string()[..8]);
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
    let Some(pool) = get_test_pool().await else {
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

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'is_super_admin')",
    )
    .fetch_one(&pool)
    .await
    .expect("query");
    assert!(exists, "is_super_admin() should exist");
}

#[tokio::test]
async fn rls_context_set_and_reset() {
    let Some(pool) = get_test_pool().await else {
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

// ── Trigger / constraint tests (unchanged from prior suite) ───────────

#[tokio::test]
async fn project_member_trigger_exists() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_members_org_check')",
    )
    .fetch_one(&pool)
    .await
    .expect("query");
    assert!(exists, "trg_project_members_org_check trigger should exist on project_members");
}

#[tokio::test]
async fn project_member_must_be_org_member() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4())).await.expect("user a");
    let user_b = create_test_user(&pool, &format!("b-{}@test.local", Uuid::new_v4())).await.expect("user b");
    let org_a = create_test_org(&pool, "Org A", user_a).await.expect("org");
    let project_a = create_test_project(&pool, org_a, "Project A").await.expect("project");

    // user_b is not a member of org_a; the trigger should block adding them
    // as a project member of org_a's project.
    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')",
    )
    .bind(project_a)
    .bind(user_b)
    .execute(&pool)
    .await;

    assert!(result.is_err(), "expected trigger to reject non-org-member, got: {result:?}");
}

#[tokio::test]
async fn cross_tenant_project_member_insertion_denied() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let user_org1 = create_test_user(&pool, &format!("u1-{}@test.local", Uuid::new_v4())).await.expect("user");
    let user_org2 = create_test_user(&pool, &format!("u2-{}@test.local", Uuid::new_v4())).await.expect("user");
    let org1 = create_test_org(&pool, "Org One", user_org1).await.expect("org1");
    let _org2 = create_test_org(&pool, "Org Two", user_org2).await.expect("org2");
    let project_in_org1 = create_test_project(&pool, org1, "P1").await.expect("project");

    // user_org2 belongs to org2 only; cannot be added to a project in org1.
    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')",
    )
    .bind(project_in_org1)
    .bind(user_org2)
    .execute(&pool)
    .await;

    assert!(result.is_err(), "expected cross-tenant insert to be denied, got: {result:?}");
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
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Setup as owner: user A in org A with project, questionnaire, session.
    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4())).await.expect("user");
    let org_a = create_test_org(&pool, "Org A", user_a).await.expect("org");
    let project = create_test_project(&pool, org_a, "P").await.expect("project");

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

    let session_id: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id) VALUES ($1) RETURNING id",
    )
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
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Setup: user A in org A creates a session. user B is in a DIFFERENT org.
    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4())).await.expect("user a");
    let user_b = create_test_user(&pool, &format!("b-{}@test.local", Uuid::new_v4())).await.expect("user b");
    let org_a = create_test_org(&pool, "Org A", user_a).await.expect("org a");
    let _org_b = create_test_org(&pool, "Org B", user_b).await.expect("org b");
    let project = create_test_project(&pool, org_a, "P").await.expect("project");

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

    let session_id: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id) VALUES ($1) RETURNING id",
    )
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

    assert_eq!(count, 0, "cross-org user must not see another org's session");
}

#[tokio::test]
async fn organizations_policy_denies_non_member() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let user_a = create_test_user(&pool, &format!("a-{}@test.local", Uuid::new_v4())).await.expect("user a");
    let user_b = create_test_user(&pool, &format!("b-{}@test.local", Uuid::new_v4())).await.expect("user b");
    let org_a = create_test_org(&pool, "Org A", user_a).await.expect("org a");
    let _org_b = create_test_org(&pool, "Org B", user_b).await.expect("org b");

    // user_b queries org_a — policy must filter it out.
    let mut tx = pool.begin().await.expect("begin");
    pin_as(&mut tx, user_b).await;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM organizations WHERE id = $1")
        .bind(org_a)
        .fetch_one(&mut *tx)
        .await
        .expect("count");
    tx.rollback().await.ok();

    assert_eq!(count, 0, "user_b should not see org_a via policy");
}
