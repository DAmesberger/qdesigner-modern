//! ADR 0034 — comment authorization at the HTTP layer.
//!
//! Proves the two folded rules against the running Postgres (extractor →
//! rls middleware → handler → RLS-tx), through the app-role
//! (`qdesigner_app`, non-BYPASSRLS) pool — the production posture:
//!
//!   (a) a non-author project member CANNOT edit another member's comment
//!       body even while also setting `resolved` (403), but CAN resolve /
//!       unresolve it (200);
//!   (c) a project **admin** may delete another member's comment
//!       (moderation, 200) while a plain non-author member cannot (404);
//!   (d) the author may still edit their own comment body (200).
//!
//! Skips cleanly when no DB is reachable (panics under `REQUIRE_DB`).

use axum::http::StatusCode;
use uuid::Uuid;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app, TestUser};

/// Add `member` to `project` at `role` via the real projects API (acting as
/// the project owner). ADR 0033 lets a project member skip org membership,
/// so a bare registered user can be added directly.
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

#[tokio::test]
async fn comment_body_edit_is_author_only_resolve_is_open() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner A owns the tenant. B (author) and C (plain member) are project
    // viewers; D is a project admin.
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let qid = tenant.questionnaire_id;

    let author = register_user(&app).await;
    let member_c = register_user(&app).await;
    let admin_d = register_user(&app).await;
    add_project_member(&app, &owner, tenant.project_id, &author, "viewer").await;
    add_project_member(&app, &owner, tenant.project_id, &member_c, "viewer").await;
    add_project_member(&app, &owner, tenant.project_id, &admin_d, "admin").await;

    // B authors a comment.
    let (status, comment) = json_request(
        &app,
        "POST",
        &format!("/api/questionnaires/{qid}/comments"),
        Some(&author.token),
        Some(&serde_json::json!({ "anchor_type": "question", "body": "original" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "author creates comment: {comment:?}"
    );
    let cid = comment["id"].as_str().unwrap().to_string();

    // (d) The author edits their own body → 200, body changes.
    let (status, updated) = json_request(
        &app,
        "PATCH",
        &format!("/api/questionnaires/{qid}/comments/{cid}"),
        Some(&author.token),
        Some(&serde_json::json!({ "body": "edited by author" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "author edits own body: {updated:?}");
    assert_eq!(updated["body"].as_str(), Some("edited by author"));

    // (a) A non-author (C) that sets BOTH body and resolved is rejected on the
    // body — a resolve value no longer buys a body rewrite.
    let (status, denied) = json_request(
        &app,
        "PATCH",
        &format!("/api/questionnaires/{qid}/comments/{cid}"),
        Some(&member_c.token),
        Some(&serde_json::json!({ "body": "hijacked", "resolved": true })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "non-author body edit (even with resolved) must be 403: {denied:?}"
    );

    // Body is untouched and the comment stayed unresolved (the whole PATCH was
    // rejected — no partial resolve leaked through).
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/comments"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list comments: {list:?}");
    let row = &list.as_array().unwrap()[0];
    assert_eq!(
        row["body"].as_str(),
        Some("edited by author"),
        "body untouched"
    );
    assert_eq!(
        row["resolved"].as_bool(),
        Some(false),
        "resolve did not leak"
    );

    // (a) The same non-author CAN resolve when the PATCH touches only resolve.
    let (status, resolved) = json_request(
        &app,
        "PATCH",
        &format!("/api/questionnaires/{qid}/comments/{cid}"),
        Some(&member_c.token),
        Some(&serde_json::json!({ "resolved": true })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "non-author resolve must succeed: {resolved:?}"
    );
    assert_eq!(resolved["resolved"].as_bool(), Some(true));

    // …and unresolve it again.
    let (status, unresolved) = json_request(
        &app,
        "PATCH",
        &format!("/api/questionnaires/{qid}/comments/{cid}"),
        Some(&member_c.token),
        Some(&serde_json::json!({ "resolved": false })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "non-author unresolve must succeed: {unresolved:?}"
    );
    assert_eq!(unresolved["resolved"].as_bool(), Some(false));

    // (c) A plain non-author member (C) cannot delete B's comment.
    let (status, _body) = json_request(
        &app,
        "DELETE",
        &format!("/api/questionnaires/{qid}/comments/{cid}"),
        Some(&member_c.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "plain non-author member must not delete another's comment"
    );

    // (c) A project admin (D) CAN delete B's comment (moderation).
    let (status, deleted) = json_request(
        &app,
        "DELETE",
        &format!("/api/questionnaires/{qid}/comments/{cid}"),
        Some(&admin_d.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "project admin deletes comment: {deleted:?}"
    );
    assert_eq!(deleted["deleted"].as_bool(), Some(true));
}
