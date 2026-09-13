//! F-50 — a duplicate questionnaire create returns 409, not 500.
//!
//! The database reserves names within a project independently of the mutable
//! revision. Its 23505 maps through `ApiError::from_db_error` to a repairable 409.

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[tokio::test]
async fn duplicate_questionnaire_name_create_returns_conflict_not_500() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let project_id = tenant.project_id;
    let token = user.token.as_str();

    // First create with a fresh name succeeds.
    let name = "F-50 duplicate probe";
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaires"),
        Some(token),
        Some(&serde_json::json!({ "name": name })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "first create must succeed: {json:?}"
    );

    // The same name must conflict even after the original's revision changes.
    let id = json["id"].as_str().unwrap();
    let (status, saved) = json_request(
        &app,
        "PATCH",
        &format!("/api/projects/{project_id}/questionnaires/{id}"),
        Some(token),
        Some(&serde_json::json!({"description": "Saved original"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved:?}");
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaires"),
        Some(token),
        Some(&serde_json::json!({ "name": name })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "duplicate create must be 409, not 500: {json:?}"
    );

    // The body is the standard error envelope carrying a 409 with a clear,
    // non-leaking message (not the generic "Internal server error").
    let message = json["error"]["message"].as_str().unwrap_or_default();
    assert!(
        message.to_lowercase().contains("already exists"),
        "409 body should explain the conflict, got: {json:?}"
    );
    assert_eq!(
        json["error"]["status"].as_u64(),
        Some(409),
        "error envelope status must be 409: {json:?}"
    );
}

#[tokio::test]
async fn rename_conflict_is_repairable_and_does_not_advance_the_draft() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let base = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let (status, first) = json_request(
        &app,
        "POST",
        &base,
        Some(&user.token),
        Some(&serde_json::json!({"name": "Original"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{first:?}");
    let (status, second) = json_request(
        &app,
        "POST",
        &base,
        Some(&user.token),
        Some(&serde_json::json!({"name": "Copy"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{second:?}");
    let uri = format!("{base}/{}", second["id"].as_str().unwrap());
    let (status, result) = json_request(
        &app,
        "PATCH",
        &uri,
        Some(&user.token),
        Some(&serde_json::json!({"name": "Original"})),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{result:?}");
    let (status, unchanged) = json_request(&app, "GET", &uri, Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(unchanged["name"], "Copy");
    assert_eq!(unchanged["version"], 1);
    let (status, saved) = json_request(
        &app,
        "PATCH",
        &uri,
        Some(&user.token),
        Some(&serde_json::json!({"name": "Copy", "description": "Another save"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved:?}");
    assert_eq!(saved["version"], 2);
}
