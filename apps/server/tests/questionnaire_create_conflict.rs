//! F-50 — a duplicate questionnaire create returns 409, not 500.
//!
//! `create_questionnaire` INSERTs into `questionnaire_definitions`, whose
//! `UNIQUE(project_id, name, version)` index (00001_initial_schema.sql) trips
//! a Postgres 23505 when a second questionnaire reuses the same name under one
//! project (the default `version` is 1 for both). Before the fix the handler
//! propagated that error with `?`, routing it through `From<sqlx::Error>` →
//! `ApiError::Database` → 500. It now maps through `ApiError::from_db_error`,
//! so the benign, client-retryable conflict surfaces as a 409 Conflict.

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

    // Second create with the same name under the same project collides on the
    // UNIQUE(project_id, name, version) index → must be a 409, never a 500.
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
