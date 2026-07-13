//! ADR 0034 — study-series authorization at the HTTP layer.
//!
//! Proves the series bug fix (b): a project **viewer** keeps read access to
//! schedules but is denied the researcher mutations. Exercised through the
//! app-role (`qdesigner_app`, non-BYPASSRLS) pool.
//!
//!   - `list_series` → `ProjectRead` → viewer allowed (200).
//!   - `create_series` / `enroll` → `ProjectWrite` → viewer denied (403).
//!
//! Skips cleanly when no DB is reachable (panics under `REQUIRE_DB`).

use axum::http::StatusCode;
use uuid::Uuid;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app, TestUser};

async fn add_project_member(
    app: &axum::Router,
    owner: &TestUser,
    project_id: Uuid,
    member: &TestUser,
    role: &str,
) {
    let body = serde_json::json!({ "email": member.email, "role": role });
    let (status, json) = json_request(
        app,
        "POST",
        &format!("/api/projects/{project_id}/members"),
        Some(&owner.token),
        Some(&body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "add project member {role}: {json:?}"
    );
}

/// Add `member` to `org` as an active org `member` (acting as the owner). The
/// `study_series` RLS policy admits org members, so the viewer needs an org
/// row to *see* schedule rows; the org `member` role grants only project
/// Viewer under default visibility, so the write gate still denies mutations.
async fn add_org_member(app: &axum::Router, owner: &TestUser, org_id: Uuid, member: &TestUser) {
    let body = serde_json::json!({ "email": member.email, "role": "member" });
    let (status, json) = json_request(
        app,
        "POST",
        &format!("/api/organizations/{org_id}/members"),
        Some(&owner.token),
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "add org member: {json:?}");
}

#[tokio::test]
async fn project_viewer_can_read_series_but_not_mutate() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let qid = tenant.questionnaire_id;

    // Owner (project write) creates a baseline series — the read target and
    // the enroll target for the viewer's denied mutation.
    let (status, series) = json_request(
        &app,
        "POST",
        "/api/series",
        Some(&owner.token),
        Some(&serde_json::json!({
            "questionnaire_id": qid,
            "name": "Owner series",
            "schedule_kind": "fixed",
            "wave_defs": [ { "label": "Baseline", "offsetSeconds": 0 } ]
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "owner create series: {series:?}"
    );
    let series_id = series["id"].as_str().unwrap().to_string();

    // A project viewer (also an org member so RLS admits the series rows for
    // the read path; org `member` grants only project Viewer, not Editor).
    let viewer = register_user(&app).await;
    add_org_member(&app, &owner, tenant.org_id, &viewer).await;
    add_project_member(&app, &owner, tenant.project_id, &viewer, "viewer").await;

    // (b) list_series → ProjectRead → 200.
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/series?questionnaire_id={qid}"),
        Some(&viewer.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "viewer list_series must be 200: {list:?}"
    );
    assert_eq!(
        list.as_array().map(|a| a.len()),
        Some(1),
        "viewer sees the owner's series"
    );

    // (b) create_series → ProjectWrite → 403.
    let (status, denied) = json_request(
        &app,
        "POST",
        "/api/series",
        Some(&viewer.token),
        Some(&serde_json::json!({
            "questionnaire_id": qid,
            "name": "Viewer series",
            "schedule_kind": "fixed",
            "wave_defs": [ { "label": "Baseline", "offsetSeconds": 0 } ]
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "viewer create_series must be 403: {denied:?}"
    );

    // (b) enroll → ProjectWrite → 403.
    let (status, denied) = json_request(
        &app,
        "POST",
        &format!("/api/series/{series_id}/enroll"),
        Some(&viewer.token),
        Some(&serde_json::json!({ "contact_channel": "p@test.local" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "viewer enroll must be 403: {denied:?}"
    );
}
