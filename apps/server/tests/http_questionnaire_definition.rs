use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[tokio::test]
async fn authorized_export_and_dry_run_round_trip_without_writing_questionnaire_state() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let project_id = tenant.project_id;
    let questionnaire_id = tenant.questionnaire_id;
    let questionnaire_uri = format!("/api/projects/{project_id}/questionnaires/{questionnaire_id}");

    let text_content = serde_json::json!({
        "questions": [{
            "id": "welcome",
            "type": "text-display",
            "order": 0,
            "required": false,
            "display": { "content": "Welcome." }
        }],
        "pages": [{
            "id": "intro",
            "name": "Introduction",
            "blocks": [{
                "id": "copy",
                "pageId": "intro",
                "type": "standard",
                "questions": ["welcome"]
            }]
        }]
    });
    let settings = serde_json::json!({
        "allowBackNavigation": false,
        "showProgressBar": true
    });
    let (status, updated) = json_request(
        &app,
        "PATCH",
        &questionnaire_uri,
        Some(&user.token),
        Some(&serde_json::json!({ "content": text_content, "settings": settings })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "seed text Questionnaire: {updated:?}"
    );

    let (status, before) =
        json_request(&app, "GET", &questionnaire_uri, Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK, "read before dry run: {before:?}");

    let (status, exported) = json_request(
        &app,
        "GET",
        &format!("{questionnaire_uri}/definition"),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "definition export: {exported:?}");
    let canonical = exported["canonical"].as_str().expect("canonical string");
    serde_json::from_str::<serde_json::Value>(canonical).expect("exported canonical JSON");

    let outsider = register_user(&app).await;
    let (status, denied) = json_request(
        &app,
        "GET",
        &format!("{questionnaire_uri}/definition"),
        Some(&outsider.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "outsider export: {denied:?}");
    let (status, denied) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaire-definitions/dry-run"),
        Some(&outsider.token),
        Some(&serde_json::json!({ "definition": canonical })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "outsider dry run: {denied:?}"
    );

    let (status, inspected) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaire-definitions/dry-run"),
        Some(&user.token),
        Some(&serde_json::json!({ "definition": canonical })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "definition dry run: {inspected:?}");
    assert_eq!(inspected["valid"], true);
    assert_eq!(inspected["committed"], false);
    assert_eq!(inspected["canonical"], exported["canonical"]);
    assert_eq!(inspected["digest"], exported["digest"]);

    let (status, after) =
        json_request(&app, "GET", &questionnaire_uri, Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK, "read after dry run: {after:?}");
    assert_eq!(after, before, "dry run must not mutate Questionnaire state");
}
