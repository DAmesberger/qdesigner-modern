//! P3-T2 (F074) — the ADR-0013 authorization contract at the HTTP layer.
//!
//! Admin-table mutation RLS is permissive (`WITH CHECK (true)`, ADR 0013
//! D2a), so the `api/access::*` handler checks are THE gate for cross-tenant
//! mutations. This suite provisions two tenants through the API (user A owns
//! org A + a project + a draft questionnaire; user B owns only org B) and
//! asserts that every cross-tenant mutation by user B is DENIED end to end,
//! each paired with the user-A positive control.
//!
//! Exact status codes (read against `api/access.rs` + `error.rs` and the
//! RLS SELECT posture, then verified live):
//!   - PATCH/DELETE `/api/projects/{a_proj}` → **404**. Both handlers first
//!     resolve the project's `organization_id` via a plain `SELECT ... FROM
//!     projects`, which the 00014 projects SELECT policy hides from a
//!     non-member (the draft questionnaire means the
//!     `projects_select_via_published_questionnaire` branch does not admit
//!     it either) → `NotFound`.
//!   - questionnaire create/update/delete/bump → **403**.
//!     `verify_project_write_access` runs a boolean `SELECT EXISTS(...)` that
//!     returns false and maps to `Forbidden` without a prior existence probe.
//!   - `POST /api/organizations/{a_org}/members` → **403**. `has_org_role`
//!     finds no admin membership for B → `Forbidden`.

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[tokio::test]
async fn cross_tenant_mutations_denied_positive_controls_pass() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // user A owns org A + project + draft questionnaire.
    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;

    // user B owns only org B.
    let user_b = register_user(&app).await;
    let _b = provision_tenant(&app, &user_b.token).await;

    let a_proj = a.project_id;
    let a_org = a.org_id;
    let a_qid = a.questionnaire_id;
    let tok_b = user_b.token.as_str();
    let tok_a = user_a.token.as_str();

    // ── Denial matrix (user B against org A's resources) ──────────────
    let patch_body = serde_json::json!({ "name": "hijacked" });
    let (status, json) = json_request(
        &app,
        "PATCH",
        &format!("/api/projects/{a_proj}"),
        Some(tok_b),
        Some(&patch_body),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "B PATCH project A: {json:?}");

    let (status, json) = json_request(
        &app,
        "DELETE",
        &format!("/api/projects/{a_proj}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "B DELETE project A: {json:?}"
    );

    let q_body = serde_json::json!({ "name": "B's questionnaire" });
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{a_proj}/questionnaires"),
        Some(tok_b),
        Some(&q_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B POST questionnaire under A: {json:?}"
    );

    let (status, json) = json_request(
        &app,
        "PATCH",
        &format!("/api/projects/{a_proj}/questionnaires/{a_qid}"),
        Some(tok_b),
        Some(&serde_json::json!({ "name": "renamed by B" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B PATCH questionnaire A: {json:?}"
    );

    let (status, json) = json_request(
        &app,
        "DELETE",
        &format!("/api/projects/{a_proj}/questionnaires/{a_qid}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B DELETE questionnaire A: {json:?}"
    );

    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{a_proj}/questionnaires/{a_qid}/bump-version"),
        Some(tok_b),
        Some(&serde_json::json!({ "bump_type": "patch" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "B bump-version A: {json:?}");

    let member_body = serde_json::json!({ "email": user_b.email, "role": "member" });
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{a_org}/members"),
        Some(tok_b),
        Some(&member_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B add member to org A: {json:?}"
    );

    // ── Positive controls (user A) — ordered so soft-delete comes last ─
    let (status, json) = json_request(
        &app,
        "PATCH",
        &format!("/api/projects/{a_proj}"),
        Some(tok_a),
        Some(&serde_json::json!({ "name": "Renamed by A" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "A PATCH own project: {json:?}");

    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{a_proj}/questionnaires"),
        Some(tok_a),
        Some(&serde_json::json!({ "name": "A second questionnaire" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "A POST questionnaire: {json:?}"
    );

    let (status, json) = json_request(
        &app,
        "PATCH",
        &format!("/api/projects/{a_proj}/questionnaires/{a_qid}"),
        Some(tok_a),
        Some(&serde_json::json!({ "name": "A renamed q1" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "A PATCH own questionnaire: {json:?}"
    );

    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{a_proj}/questionnaires/{a_qid}/bump-version"),
        Some(tok_a),
        Some(&serde_json::json!({ "bump_type": "patch" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "A bump-version: {json:?}");

    // A (owner) adds B to org A — valid, and last before the destructive op.
    let (status, json) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{a_org}/members"),
        Some(tok_a),
        Some(&serde_json::json!({ "email": user_b.email, "role": "member" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "A add member: {json:?}");

    let (status, json) = json_request(
        &app,
        "DELETE",
        &format!("/api/projects/{a_proj}"),
        Some(tok_a),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "A DELETE own project: {json:?}");
}
