//! E-RBAC-3 — granular permission layer + custom roles, end to end.
//!
//! Provisions one tenant (owner → org + project + draft questionnaire),
//! adds a second user at the org **admin** tier, then authors a custom
//! "Analyst" role (session:read + response:read only) and assigns it to that
//! admin. The assertions prove the two halves of the contract:
//!
//!   * The custom role is a real GATE: the analyst can read analytics
//!     (`GET /api/sessions/aggregate` — has session:read) but is **403** on
//!     `POST …/publish` (lacks questionnaire:publish), even though their
//!     admin tier passes the coarse `verify_project_write_access` check. This
//!     is the override — a custom role denying an action the base tier allows.
//!   * System roles are UNCHANGED: the owner (no custom role) publishes the
//!     same questionnaire successfully.
//!   * System-role presets are immutable through the CRUD API (PATCH on an
//!     `is_system` row → 403).

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[tokio::test]
async fn custom_analyst_role_reads_analytics_but_is_denied_publish() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner provisions the tenant.
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;
    let project = tenant.project_id;
    let qid = tenant.questionnaire_id;

    // A second user, added at the ADMIN tier so the coarse gates pass — the
    // custom role is what will restrict them.
    let analyst = register_user(&app).await;
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/members"),
        Some(&owner.token),
        Some(&serde_json::json!({ "email": analyst.email, "role": "admin" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "add analyst as admin: {json:?}"
    );

    // Owner authors the custom Analyst role.
    let (status, role) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/roles"),
        Some(&owner.token),
        Some(&serde_json::json!({
            "name": "Analyst",
            "permissions": ["session:read", "response:read"],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create Analyst role: {role:?}");
    let role_id = role["id"].as_str().expect("role id").to_string();
    assert_eq!(role["is_system"], serde_json::json!(false));

    // Assign the custom role to the analyst member.
    let (status, json) = json_request(
        &app,
        "PUT",
        &format!(
            "/api/organizations/{org}/members/{}/custom-role",
            analyst.id
        ),
        Some(&owner.token),
        Some(&serde_json::json!({ "custom_role_id": role_id })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "assign custom role: {json:?}");

    // ── The custom role as a gate ─────────────────────────────────────
    // Analyst CAN read analytics (has session:read).
    let (status, json) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/aggregate?questionnaire_id={qid}&source=variable&key=score"),
        Some(&analyst.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "analyst analytics read should be allowed: {json:?}"
    );

    // Analyst is DENIED publish (lacks questionnaire:publish), despite the
    // admin tier passing verify_project_write_access.
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project}/questionnaires/{qid}/publish"),
        Some(&analyst.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "analyst publish should be denied by the custom role: {json:?}"
    );

    // ── System roles unchanged ────────────────────────────────────────
    // The owner (no custom role) publishes the same questionnaire.
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project}/questionnaires/{qid}/publish"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "owner (system role) retains publish access: {json:?}"
    );
}

#[tokio::test]
async fn system_roles_are_immutable_through_the_api() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // The seed (00029 backfill + new-org trigger) created the four system
    // presets. List them and grab one.
    let (status, listing) = json_request(
        &app,
        "GET",
        &format!("/api/organizations/{org}/roles"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list roles: {listing:?}");

    let roles = listing["roles"].as_array().expect("roles array");
    let system_role = roles
        .iter()
        .find(|r| r["is_system"] == serde_json::json!(true))
        .expect("at least one seeded system role");
    let system_id = system_role["id"].as_str().expect("system role id");

    // Available-permissions catalogue is returned for the matrix editor.
    // ADR 0032 added `project:transfer_ownership` (Permission::ALL 19 → 20).
    assert_eq!(
        listing["available_permissions"].as_array().map(|a| a.len()),
        Some(20),
        "all 20 permissions surfaced for the matrix editor"
    );

    // PATCH a system role → 403 (immutable).
    let (status, json) = json_request(
        &app,
        "PATCH",
        &format!("/api/organizations/{org}/roles/{system_id}"),
        Some(&owner.token),
        Some(&serde_json::json!({ "permissions": [] })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "system role PATCH must be rejected: {json:?}"
    );

    // DELETE a system role → 403 (immutable).
    let (status, json) = json_request(
        &app,
        "DELETE",
        &format!("/api/organizations/{org}/roles/{system_id}"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "system role DELETE must be rejected: {json:?}"
    );

    // Rejects an unknown permission token on create.
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/roles"),
        Some(&owner.token),
        Some(&serde_json::json!({ "name": "Bogus", "permissions": ["not:a:perm"] })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "unknown permission token must be rejected: {json:?}"
    );
}
