//! E-RBAC-1 — project-scoped READ isolation at the HTTP layer.
//!
//! Asserts that `organizations.settings->>'projectVisibility'` is a real
//! read boundary end to end (extractor → fillout/rls middleware → handler →
//! RLS-tx), exercised through the app-role (`qdesigner_app`, non-BYPASSRLS)
//! pool — the production posture.
//!
//! Fixture: owner A owns org A + project P (draft questionnaire). Member B is
//! an *active org member* of org A but is NOT a member of project P.
//!
//!   - visibility = 'org' (default): B's `GET /api/projects` includes P and
//!     `GET /api/projects/{P}` returns 200 (legacy behaviour, backward compat).
//!   - visibility = 'members': B's `GET /api/projects` EXCLUDES P and
//!     `GET /api/projects/{P}` returns 403. Owner A still sees P (200). Adding
//!     B to project P restores B's visibility even under 'members'.

use axum::http::StatusCode;

mod common;
use common::{
    build_test_state, json_request, provision_tenant, register_user, test_app, TestUser,
};

/// Whether the project list returned by `GET /api/projects` contains `id`.
fn list_contains(list: &serde_json::Value, id: uuid::Uuid) -> bool {
    list.as_array()
        .map(|arr| {
            arr.iter()
                .any(|p| p["id"].as_str() == Some(id.to_string().as_str()))
        })
        .unwrap_or(false)
}

/// Add `email` to org `org_id` as an active `member` (acting as `admin`).
async fn add_org_member(app: &axum::Router, admin: &TestUser, org_id: uuid::Uuid, email: &str) {
    let body = serde_json::json!({ "email": email, "role": "member" });
    let (status, json) = json_request(
        app,
        "POST",
        &format!("/api/organizations/{org_id}/members"),
        Some(&admin.token),
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "add org member: {json:?}");
}

/// Flip org A's projectVisibility via the real PATCH endpoint (acting as A).
async fn set_visibility(app: &axum::Router, admin: &TestUser, org_id: uuid::Uuid, value: &str) {
    let body = serde_json::json!({ "settings": { "projectVisibility": value } });
    let (status, json) = json_request(
        app,
        "PATCH",
        &format!("/api/organizations/{org_id}"),
        Some(&admin.token),
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "set projectVisibility={value}: {json:?}");
}

#[tokio::test]
async fn project_read_isolation_respects_org_visibility() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner A owns org A + project P (draft questionnaire).
    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;

    // Member B: active org member of org A, NOT a member of project P.
    let user_b = register_user(&app).await;
    add_org_member(&app, &user_a, a.org_id, &user_b.email).await;

    let p = a.project_id;
    let tok_b = user_b.token.as_str();

    // ── visibility = 'org' (default) — B sees P ──────────────────────────
    let (status, list) = json_request(&app, "GET", "/api/projects", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK, "B list (org): {list:?}");
    assert!(
        list_contains(&list, p),
        "under 'org' visibility, member B must see project P: {list:?}"
    );

    let (status, _json) =
        json_request(&app, "GET", &format!("/api/projects/{p}"), Some(tok_b), None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "under 'org' visibility, B GET project P must be 200"
    );

    // ── visibility = 'members' — P becomes confidential to B ─────────────
    set_visibility(&app, &user_a, a.org_id, "members").await;

    let (status, list) = json_request(&app, "GET", "/api/projects", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK, "B list (members): {list:?}");
    assert!(
        !list_contains(&list, p),
        "under 'members' visibility, member B must NOT see project P: {list:?}"
    );

    let (status, json) =
        json_request(&app, "GET", &format!("/api/projects/{p}"), Some(tok_b), None).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "under 'members' visibility, B GET project P must be 403: {json:?}"
    );

    // Org-filtered list is scoped identically.
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/projects?organization_id={}", a.org_id),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "B org-filtered list (members): {list:?}");
    assert!(
        !list_contains(&list, p),
        "under 'members' visibility, B org-filtered list must NOT include P: {list:?}"
    );

    // Owner A always sees P.
    let (status, list) = json_request(&app, "GET", "/api/projects", Some(&user_a.token), None).await;
    assert_eq!(status, StatusCode::OK, "A list (members): {list:?}");
    assert!(
        list_contains(&list, p),
        "org owner A must always see project P: {list:?}"
    );
    let (status, _json) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "org owner A GET project P must be 200");

    // ── Add B to project P — restores B's read access under 'members' ────
    let member_body = serde_json::json!({ "email": user_b.email, "role": "viewer" });
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/members"),
        Some(&user_a.token),
        Some(&member_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "A add B to project P: {json:?}");

    let (status, list) = json_request(&app, "GET", "/api/projects", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK, "B list after join: {list:?}");
    assert!(
        list_contains(&list, p),
        "after being added to P, member B must see it again under 'members': {list:?}"
    );
    let (status, _json) =
        json_request(&app, "GET", &format!("/api/projects/{p}"), Some(tok_b), None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "after being added to P, B GET project P must be 200"
    );
}
