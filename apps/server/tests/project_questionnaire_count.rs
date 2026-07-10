//! F-43 — `GET /api/projects` reports each project's questionnaire count.
//!
//! The projects-list card renders `questionnaire_count`; before the fix the
//! list handler never aggregated it, so every card showed 0. This asserts the
//! list payload carries the real non-deleted questionnaire count end to end
//! (handler aggregate subquery → JSON), through the app-role pool.

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

/// The `questionnaire_count` for project `id` in a `GET /api/projects` payload.
fn count_for(list: &serde_json::Value, id: uuid::Uuid) -> Option<i64> {
    list.as_array()?
        .iter()
        .find(|p| p["id"].as_str() == Some(id.to_string().as_str()))
        .and_then(|p| p["questionnaire_count"].as_i64())
}

#[tokio::test]
async fn project_list_reports_questionnaire_count() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner provisions org → project → one draft questionnaire.
    let owner = register_user(&app).await;
    let t = provision_tenant(&app, &owner.token).await;

    // Unfiltered list.
    let (status, list) = json_request(&app, "GET", "/api/projects", Some(&owner.token), None).await;
    assert_eq!(status, StatusCode::OK, "owner list: {list:?}");
    assert_eq!(
        count_for(&list, t.project_id),
        Some(1),
        "project with one questionnaire must report count 1: {list:?}"
    );

    // Org-filtered list is aggregated identically.
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/projects?organization_id={}", t.org_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "owner org-filtered list: {list:?}");
    assert_eq!(
        count_for(&list, t.project_id),
        Some(1),
        "org-filtered list must report the same count: {list:?}"
    );
}
