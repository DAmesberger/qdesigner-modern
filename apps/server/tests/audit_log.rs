//! E-RBAC-2 — append-only audit log.
//!
//! Two guarantees under test:
//!
//! 1. **Attribution + atomicity.** A privileged mutation (here: an org
//!    member role change, driven through the real HTTP stack) writes
//!    exactly one `member.role_changed` audit row, carrying the correct
//!    actor, resource, and before/after role in `metadata`. The write
//!    rides the mutation's transaction, so it is visible iff the mutation
//!    committed.
//!
//! 2. **Immutability.** The application role (`qdesigner_app`) may INSERT
//!    and SELECT audit rows but can never UPDATE or DELETE one —
//!    `00034_audit_log.sql` REVOKEs those privileges (append-only,
//!    schema-enforced).

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::{
    app_pool, build_test_state, fixture_pool, json_request, provision_tenant, register_user,
    test_app,
};

use axum::http::StatusCode;

#[tokio::test]
async fn role_change_writes_single_attributed_audit_event() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: DB unreachable");
        return;
    };
    let app = test_app(state);

    // Owner provisions an org; a second user is added as a member.
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let member = register_user(&app).await;

    let (status, body) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/members", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "email": member.email, "role": "member" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "add member: {body:?}");

    // The privileged action under audit: member → admin.
    let (status, body) = json_request(
        &app,
        "PUT",
        &format!(
            "/api/organizations/{}/members/{}/role",
            tenant.org_id, member.id
        ),
        Some(&owner.token),
        Some(&serde_json::json!({ "role": "admin" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "change role: {body:?}");

    // ── Assert via the DB (bypass pool sees all rows regardless of RLS) ──
    let pool = fixture_pool().await.expect("fixture pool");
    let row: (Uuid, Uuid, Option<Uuid>, String, String, Option<Uuid>, serde_json::Value) =
        sqlx::query_as(
            "SELECT id, organization_id, actor_user_id, action, resource_type, resource_id, metadata \
             FROM audit_events \
             WHERE organization_id = $1 AND action = 'member.role_changed'",
        )
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .expect("exactly one member.role_changed row");

    let (_id, org_id, actor, action, resource_type, resource_id, metadata) = row;
    assert_eq!(org_id, tenant.org_id);
    assert_eq!(actor, Some(owner.id), "actor is the acting owner");
    assert_eq!(action, "member.role_changed");
    assert_eq!(resource_type, "organization_member");
    assert_eq!(resource_id, Some(member.id), "resource is the target member");
    assert_eq!(
        metadata["before"], "member",
        "metadata records the prior role"
    );
    assert_eq!(
        metadata["after"], "admin",
        "metadata records the new role"
    );

    // Exactly one such row (no double-writes, no writes on the no-op path).
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_events WHERE organization_id = $1 AND action = 'member.role_changed'",
    )
    .bind(tenant.org_id)
    .fetch_one(&pool)
    .await
    .expect("count");
    assert_eq!(count, 1, "a single role change writes exactly one audit row");

    // ── Assert via the API (org admin/owner can read the timeline) ──
    let (status, page) = json_request(
        &app,
        "GET",
        &format!("/api/organizations/{}/audit", tenant.org_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "audit list: {page:?}");
    let events = page["events"].as_array().expect("events array");
    assert!(
        events
            .iter()
            .any(|e| e["action"] == "member.role_changed" && e["actor_email"] == owner.email),
        "timeline surfaces the attributed role-change event: {page:?}"
    );
}

#[tokio::test]
async fn audit_rows_are_immutable_for_the_app_role() {
    let Some(bypass) = fixture_pool().await else {
        eprintln!("skipping: DB unreachable");
        return;
    };

    // Seed a minimal org + actor + one audit row on the bypass pool.
    let actor: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("audit-{}@test.local", Uuid::new_v4()))
    .fetch_one(&bypass)
    .await
    .expect("actor");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('Audit', $1, $2) RETURNING id",
    )
    .bind(format!("audit-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(actor)
    .fetch_one(&bypass)
    .await
    .expect("org");

    let event_id: Uuid = sqlx::query_scalar(
        "INSERT INTO audit_events (organization_id, actor_user_id, action, resource_type) \
         VALUES ($1, $2, 'organization.updated', 'organization') RETURNING id",
    )
    .bind(org)
    .bind(actor)
    .fetch_one(&bypass)
    .await
    .expect("seed audit row");

    // The application role must be denied UPDATE and DELETE (REVOKE'd).
    let Some(app) = app_pool().await else {
        eprintln!("skipping: app pool unreachable");
        return;
    };
    assert_app_role(&app).await;

    let update = sqlx::query("UPDATE audit_events SET action = 'tampered' WHERE id = $1")
        .bind(event_id)
        .execute(&app)
        .await;
    assert!(
        update.is_err(),
        "app role must NOT be able to UPDATE an audit row (append-only). Got: {update:?}"
    );

    let delete = sqlx::query("DELETE FROM audit_events WHERE id = $1")
        .bind(event_id)
        .execute(&app)
        .await;
    assert!(
        delete.is_err(),
        "app role must NOT be able to DELETE an audit row (append-only). Got: {delete:?}"
    );

    // The row is still intact and unaltered.
    let action: String = sqlx::query_scalar("SELECT action FROM audit_events WHERE id = $1")
        .bind(event_id)
        .fetch_one(&bypass)
        .await
        .expect("row survives");
    assert_eq!(action, "organization.updated", "row was not tampered");
}

/// Guard: confirm the "app" pool really connects as a non-superuser so the
/// immutability assertions are meaningful (a superuser would bypass the
/// REVOKE and the test would be a false green).
async fn assert_app_role(pool: &PgPool) {
    let is_super: bool = sqlx::query_scalar(
        "SELECT rolsuper FROM pg_roles WHERE rolname = current_user",
    )
    .fetch_one(pool)
    .await
    .expect("role introspection");
    assert!(
        !is_super,
        "immutability test requires a non-superuser app role; got a superuser connection"
    );
}
