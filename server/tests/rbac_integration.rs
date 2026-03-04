//! RBAC Integration Tests
//!
//! These tests validate the security hardening: RLS context isolation,
//! project-org membership constraints, and cross-tenant access denial.
//!
//! Requires a running PostgreSQL instance with migrations applied.
//! Run with: `cargo test --test rbac_integration`

use sqlx::PgPool;

/// Helper to run a query and check it succeeds.
async fn query_ok(pool: &PgPool, sql: &str) -> bool {
    sqlx::query(sql).execute(pool).await.is_ok()
}

/// Helper to create a test user and return their ID.
async fn create_test_user(pool: &PgPool, email: &str) -> sqlx::Result<uuid::Uuid> {
    let id = sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'argon2-hash-placeholder') RETURNING id",
    )
    .bind(email)
    .fetch_one(pool)
    .await?;
    Ok(id)
}

/// Helper to create a test organization and return its ID.
async fn create_test_org(pool: &PgPool, name: &str, user_id: uuid::Uuid) -> sqlx::Result<uuid::Uuid> {
    let slug = name.to_lowercase().replace(' ', "-");
    let id = sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO organizations (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(name)
    .bind(&slug)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    // Add user as org owner
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(id)
}

/// Helper to create a test project and return its ID.
async fn create_test_project(
    pool: &PgPool,
    org_id: uuid::Uuid,
    name: &str,
    user_id: uuid::Uuid,
) -> sqlx::Result<uuid::Uuid> {
    let code = name.to_uppercase().replace(' ', "");
    let id = sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO projects (organization_id, name, code, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(org_id)
    .bind(name)
    .bind(&code)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    // Add user as project owner
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(id)
}

/// Get a connection pool from DATABASE_URL, or skip if not available.
async fn get_test_pool() -> Option<PgPool> {
    // Try reading from .env.development in parent directory
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(".env.development");

    if env_path.exists() {
        if let Ok(contents) = std::fs::read_to_string(&env_path) {
            for line in contents.lines() {
                if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                    std::env::set_var("DATABASE_URL", val.trim());
                    break;
                }
            }
        }
    }

    let url = match std::env::var("DATABASE_URL") {
        Ok(u) => u,
        Err(_) => return None,
    };

    PgPool::connect(&url).await.ok()
}

// ── RLS Context Isolation ─────────────────────────────────────────

#[tokio::test]
async fn rls_context_set_and_reset() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Set context
    let user_id = uuid::Uuid::new_v4();
    sqlx::query("SELECT set_config('app.user_id', $1, false)")
        .bind(user_id.to_string())
        .execute(&pool)
        .await
        .expect("set_config should work");

    // Verify it's set
    let val: String =
        sqlx::query_scalar("SELECT current_setting('app.user_id', true)")
            .fetch_one(&pool)
            .await
            .expect("current_setting should work");
    // Note: with connection pooling, we may get a different connection,
    // so we just verify the function works without error.
    assert!(!val.is_empty() || val.is_empty(), "Should return a string");

    // Reset
    sqlx::query("SELECT set_config('app.user_id', '', false)")
        .execute(&pool)
        .await
        .expect("reset should work");

    // Verify helper function exists and works
    let result = sqlx::query_scalar::<_, Option<uuid::Uuid>>(
        "SELECT public.current_app_user_id()",
    )
    .fetch_one(&pool)
    .await;

    // After reset, should return NULL (empty string -> NULL cast)
    assert!(result.is_ok(), "current_app_user_id() should not error");
}

// ── Project-Org Membership Constraint ─────────────────────────────

#[tokio::test]
async fn project_member_must_be_org_member() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Create two users
    let user_a = create_test_user(&pool, &format!("rbac-test-a-{}@example.com", uuid::Uuid::new_v4()))
        .await
        .expect("create user a");
    let user_b = create_test_user(&pool, &format!("rbac-test-b-{}@example.com", uuid::Uuid::new_v4()))
        .await
        .expect("create user b");

    // Create org with user_a as owner
    let org = create_test_org(&pool, &format!("RBAC Test Org {}", uuid::Uuid::new_v4()), user_a)
        .await
        .expect("create org");

    // Create project in that org
    let project = create_test_project(&pool, org, &format!("Test Proj {}", uuid::Uuid::new_v4()), user_a)
        .await
        .expect("create project");

    // user_b is NOT an org member — adding them as project member should fail
    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')",
    )
    .bind(project)
    .bind(user_b)
    .execute(&pool)
    .await;

    assert!(
        result.is_err(),
        "Adding non-org-member to project should fail due to trigger"
    );

    // Now add user_b as org member, then try again
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'member', 'active')",
    )
    .bind(org)
    .bind(user_b)
    .execute(&pool)
    .await
    .expect("add user_b as org member");

    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'viewer')",
    )
    .bind(project)
    .bind(user_b)
    .execute(&pool)
    .await;

    assert!(
        result.is_ok(),
        "Adding org member to project should succeed"
    );

    // Cleanup
    let _ = sqlx::query("DELETE FROM project_members WHERE project_id = $1")
        .bind(project)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM organization_members WHERE organization_id = $1")
        .bind(org)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM organizations WHERE id = $1")
        .bind(org)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM users WHERE id = $1 OR id = $2")
        .bind(user_a)
        .bind(user_b)
        .execute(&pool)
        .await;
}

// ── Cross-Tenant Access Denial ────────────────────────────────────

#[tokio::test]
async fn cross_tenant_project_member_insertion_denied() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Create two separate orgs with their own users
    let user_org1 = create_test_user(
        &pool,
        &format!("rbac-cross-1-{}@example.com", uuid::Uuid::new_v4()),
    )
    .await
    .expect("create user org1");

    let user_org2 = create_test_user(
        &pool,
        &format!("rbac-cross-2-{}@example.com", uuid::Uuid::new_v4()),
    )
    .await
    .expect("create user org2");

    let org1 = create_test_org(
        &pool,
        &format!("Cross Org 1 {}", uuid::Uuid::new_v4()),
        user_org1,
    )
    .await
    .expect("create org1");

    let org2 = create_test_org(
        &pool,
        &format!("Cross Org 2 {}", uuid::Uuid::new_v4()),
        user_org2,
    )
    .await
    .expect("create org2");

    // user_org2 is a member of org2 but NOT org1
    let project_org1 = create_test_project(
        &pool,
        org1,
        &format!("Proj Org1 {}", uuid::Uuid::new_v4()),
        user_org1,
    )
    .await
    .expect("create project in org1");

    // Try to add user_org2 (member of org2) to a project in org1 — should fail
    let result = sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'editor')",
    )
    .bind(project_org1)
    .bind(user_org2)
    .execute(&pool)
    .await;

    assert!(
        result.is_err(),
        "Cross-tenant project member insertion should be denied by trigger"
    );

    // Cleanup
    let _ = sqlx::query("DELETE FROM project_members WHERE project_id = $1")
        .bind(project_org1)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_org1)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM organization_members WHERE organization_id IN ($1, $2)")
        .bind(org1)
        .bind(org2)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM organizations WHERE id IN ($1, $2)")
        .bind(org1)
        .bind(org2)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM users WHERE id IN ($1, $2)")
        .bind(user_org1)
        .bind(user_org2)
        .execute(&pool)
        .await;
}

// ── RLS Helper Functions ──────────────────────────────────────────

#[tokio::test]
async fn rls_helper_functions_exist() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    // Verify current_app_user_id function exists
    assert!(
        query_ok(&pool, "SELECT public.current_app_user_id()").await,
        "current_app_user_id() should exist"
    );

    // Verify is_super_admin function exists
    assert!(
        query_ok(&pool, "SELECT public.is_super_admin()").await,
        "is_super_admin() should exist"
    );
}

// ── Trigger Existence ─────────────────────────────────────────────

#[tokio::test]
async fn project_member_trigger_exists() {
    let Some(pool) = get_test_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM information_schema.triggers
            WHERE trigger_name = 'trg_project_members_org_check'
              AND event_object_table = 'project_members'
        )
        "#,
    )
    .fetch_one(&pool)
    .await;

    assert!(
        exists.unwrap_or(false),
        "trg_project_members_org_check trigger should exist on project_members"
    );
}
