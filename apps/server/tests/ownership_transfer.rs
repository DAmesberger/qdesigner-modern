//! E-RBAC-5 — explicit org & project ownership transfer.
//!
//! Exercises the guarded, atomic tx-core functions
//! (`organizations::transfer_org_ownership_tx`,
//! `projects::transfer_project_ownership_tx`) at the SQL level — the same
//! code the HTTP handlers run once the caller/password checks pass. Testing
//! the core directly sidesteps the full-`AppState` harness gap (CLAUDE.md
//! "Testability gaps") while still asserting the security-relevant
//! invariants: promote-and-demote in one unit, reject transfer to a
//! non-member, and never leave zero owners.
//!
//! Uses the migration DSN (qdesigner superuser) for fixture INSERTs so the
//! setup is not subject to RLS, matching `org_seats.rs` / `rls_enforcement.rs`.

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

async fn seed_user(pool: &PgPool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("owner-xfer-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("seed user")
}

async fn seed_org(pool: &PgPool) -> Uuid {
    sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Xfer Co', $1) RETURNING id")
        .bind(format!("xfer-co-{}", Uuid::new_v4()))
        .fetch_one(pool)
        .await
        .expect("seed org")
}

async fn add_member(pool: &PgPool, org: Uuid, user: Uuid, role: &str) {
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
         VALUES ($1, $2, $3, 'active', NOW())",
    )
    .bind(org)
    .bind(user)
    .bind(role)
    .execute(pool)
    .await
    .expect("seed member");
}

async fn org_role(pool: &PgPool, org: Uuid, user: Uuid) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(org)
    .bind(user)
    .fetch_optional(pool)
    .await
    .expect("query role")
}

async fn owner_count(pool: &PgPool, org: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
    )
    .bind(org)
    .fetch_one(pool)
    .await
    .expect("owner count")
}

#[tokio::test]
async fn org_transfer_promotes_target_and_demotes_caller_in_one_tx() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    let target = seed_user(&pool).await;
    add_member(&pool, org, owner, "owner").await;
    add_member(&pool, org, target, "member").await;

    let mut conn = pool.acquire().await.expect("acquire");
    qdesigner_server::api::organizations::transfer_org_ownership_tx(
        &mut conn, org, owner, target, /* demote_previous_owner */ true,
    )
    .await
    .expect("transfer should succeed");
    drop(conn);

    assert_eq!(org_role(&pool, org, target).await.as_deref(), Some("owner"));
    assert_eq!(org_role(&pool, org, owner).await.as_deref(), Some("admin"));
    // Exactly one owner remains — never zero, never a split.
    assert_eq!(owner_count(&pool, org).await, 1);
}

#[tokio::test]
async fn org_transfer_can_keep_previous_owner() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    let target = seed_user(&pool).await;
    add_member(&pool, org, owner, "owner").await;
    add_member(&pool, org, target, "admin").await;

    let mut conn = pool.acquire().await.expect("acquire");
    qdesigner_server::api::organizations::transfer_org_ownership_tx(
        &mut conn, org, owner, target, /* demote_previous_owner */ false,
    )
    .await
    .expect("transfer should succeed");
    drop(conn);

    assert_eq!(org_role(&pool, org, target).await.as_deref(), Some("owner"));
    assert_eq!(org_role(&pool, org, owner).await.as_deref(), Some("owner"));
    assert_eq!(owner_count(&pool, org).await, 2);
}

#[tokio::test]
async fn org_transfer_rejects_non_member() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    let outsider = seed_user(&pool).await; // NOT a member of the org
    add_member(&pool, org, owner, "owner").await;

    let mut conn = pool.acquire().await.expect("acquire");
    let result = qdesigner_server::api::organizations::transfer_org_ownership_tx(
        &mut conn, org, owner, outsider, true,
    )
    .await;
    drop(conn);

    assert!(result.is_err(), "transfer to a non-member must be rejected");
    // The original owner is untouched — still the sole owner.
    assert_eq!(org_role(&pool, org, owner).await.as_deref(), Some("owner"));
    assert_eq!(owner_count(&pool, org).await, 1);
}

#[tokio::test]
async fn org_transfer_to_self_never_yields_zero_owners() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    add_member(&pool, org, owner, "owner").await;

    // Transferring to oneself with demote=true must NOT demote the sole owner
    // (the self-demote branch is skipped) — org keeps exactly one owner.
    let mut conn = pool.acquire().await.expect("acquire");
    qdesigner_server::api::organizations::transfer_org_ownership_tx(
        &mut conn, org, owner, owner, true,
    )
    .await
    .expect("self-transfer is a benign no-op");
    drop(conn);

    assert_eq!(org_role(&pool, org, owner).await.as_deref(), Some("owner"));
    assert_eq!(owner_count(&pool, org).await, 1);
}

// ── Project ownership transfer ───────────────────────────────────────

async fn seed_project(pool: &PgPool, org: Uuid) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("code-{}", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("seed project")
}

async fn add_project_member(pool: &PgPool, project: Uuid, user: Uuid, role: &str) {
    sqlx::query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)")
        .bind(project)
        .bind(user)
        .bind(role)
        .execute(pool)
        .await
        .expect("seed project member");
}

async fn project_role(pool: &PgPool, project: Uuid, user: Uuid) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project)
    .bind(user)
    .fetch_optional(pool)
    .await
    .expect("query project role")
}

async fn project_owner_count(pool: &PgPool, project: Uuid) -> i64 {
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND role = 'owner'",
    )
    .bind(project)
    .fetch_one(pool)
    .await
    .expect("project owner count")
}

#[tokio::test]
async fn project_transfer_promotes_target_and_demotes_prior_owner() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    let target = seed_user(&pool).await;
    add_member(&pool, org, owner, "admin").await;
    add_member(&pool, org, target, "member").await;
    let project = seed_project(&pool, org).await;
    add_project_member(&pool, project, owner, "owner").await;
    add_project_member(&pool, project, target, "editor").await;

    let mut conn = pool.acquire().await.expect("acquire");
    qdesigner_server::api::projects::transfer_project_ownership_tx(
        &mut conn, project, org, owner, target,
    )
    .await
    .expect("transfer should succeed");
    drop(conn);

    assert_eq!(
        project_role(&pool, project, target).await.as_deref(),
        Some("owner")
    );
    assert_eq!(
        project_role(&pool, project, owner).await.as_deref(),
        Some("admin")
    );
    assert_eq!(project_owner_count(&pool, project).await, 1);
}

#[tokio::test]
async fn project_transfer_auto_adds_org_member_as_owner() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    let target = seed_user(&pool).await; // org member, NOT yet a project member
    add_member(&pool, org, owner, "admin").await;
    add_member(&pool, org, target, "member").await;
    let project = seed_project(&pool, org).await;
    add_project_member(&pool, project, owner, "owner").await;

    let mut conn = pool.acquire().await.expect("acquire");
    qdesigner_server::api::projects::transfer_project_ownership_tx(
        &mut conn, project, org, owner, target,
    )
    .await
    .expect("transfer should auto-add the org member");
    drop(conn);

    assert_eq!(
        project_role(&pool, project, target).await.as_deref(),
        Some("owner")
    );
    assert_eq!(
        project_role(&pool, project, owner).await.as_deref(),
        Some("admin")
    );
    assert_eq!(project_owner_count(&pool, project).await, 1);
}

#[tokio::test]
async fn project_transfer_rejects_non_org_member() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org = seed_org(&pool).await;
    let owner = seed_user(&pool).await;
    let outsider = seed_user(&pool).await; // not an org member at all
    add_member(&pool, org, owner, "admin").await;
    let project = seed_project(&pool, org).await;
    add_project_member(&pool, project, owner, "owner").await;

    let mut conn = pool.acquire().await.expect("acquire");
    let result = qdesigner_server::api::projects::transfer_project_ownership_tx(
        &mut conn, project, org, owner, outsider,
    )
    .await;
    drop(conn);

    assert!(
        result.is_err(),
        "transfer to a non-org-member must be rejected"
    );
    assert_eq!(
        project_role(&pool, project, owner).await.as_deref(),
        Some("owner")
    );
    assert_eq!(project_owner_count(&pool, project).await, 1);
}
