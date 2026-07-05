//! P3-T2 (F074) — anonymous fillout session lifecycle at the HTTP layer,
//! through `middleware/fillout_rls_context`.
//!
//! Exercises the dual-path fillout stack end to end: an anonymous caller
//! (no JWT) creates a session for a PUBLISHED questionnaire — the handler
//! generates the id and sets `app.session_id` itself (P6.3) — then submits a
//! response. The fillout middleware derives `app.session_id` from the URL
//! path on every subsequent request, so each `oneshot` is a genuinely fresh
//! context.
//!
//! Read paths are asserted through the real gates rather than raw SQL:
//!   - the questionnaire's owner (user A) reads the anonymous session's
//!     response (positive control);
//!   - a cross-tenant authenticated user (user B) is DENIED (403 from
//!     `ensure_session_access` → `verify_questionnaire_access`);
//!   - an anonymous GET is refused (401 — the read endpoints require auth);
//!   - reading a DIFFERENT session's responses returns only that session's
//!     rows, never session 1's (per-session scoping / 00021 dual-path).
//!
//! NOTE (correction to the P3-T2 plan): `GET /api/sessions/{id}/responses`
//! takes an `AuthenticatedUser`, so an anonymous caller cannot read its own
//! rows over HTTP — the positive read is therefore performed by the
//! questionnaire's authenticated owner. `submit_response`'s `insert_response`
//! does not persist a `client_id` (that column is only written by the
//! offline `/sync` path), so the response is asserted by `question_id`/value.

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[tokio::test]
async fn anonymous_fillout_lifecycle_and_isolation() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner A provisions a tenant and publishes the questionnaire so an
    // anonymous participant can create a session against it.
    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let (proj, qid) = (a.project_id, a.questionnaire_id);
    let (status, pubd) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{proj}/questionnaires/{qid}/publish"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "publish questionnaire: {pubd:?}");

    // ── Anonymous create session (handler-generated id) ───────────────
    let create_body = serde_json::json!({ "questionnaire_id": qid });
    let (status, session) =
        json_request(&app, "POST", "/api/sessions", None, Some(&create_body)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon create session: {session:?}"
    );
    let id1 = session["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("session id in create response");

    // ── Anonymous submit a response ───────────────────────────────────
    let resp_body = serde_json::json!({
        "question_id": "q1",
        "value": { "choice": "a" },
    });
    let (status, submitted) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{id1}/responses"),
        None,
        Some(&resp_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon submit response: {submitted:?}"
    );
    assert_eq!(submitted["count"].as_i64(), Some(1), "one response stored");

    // ── Positive read: the questionnaire owner (A) reads the row ──────
    let (status, rows) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id1}/responses"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "owner read responses: {rows:?}");
    let arr = rows.as_array().expect("responses array");
    assert_eq!(arr.len(), 1, "owner sees exactly the one response");
    assert_eq!(arr[0]["question_id"].as_str(), Some("q1"));

    // ── Cross-tenant denial: unrelated authenticated user B ───────────
    let user_b = register_user(&app).await;
    let _b = provision_tenant(&app, &user_b.token).await;
    let (status, json) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id1}/responses"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "cross-tenant user must not read another tenant's session responses: {json:?}"
    );

    // ── Anonymous read is gated (endpoint requires auth) ──────────────
    let (status, _json) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id1}/responses"),
        None,
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "anonymous GET responses must be 401"
    );

    // ── Per-session scoping: a DIFFERENT session leaks nothing ────────
    // Fresh anonymous session (new oneshot → fillout_rls_context binds
    // app.session_id to id2 from the URL, not id1).
    let (status, session2) =
        json_request(&app, "POST", "/api/sessions", None, Some(&create_body)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon create second session: {session2:?}"
    );
    let id2 = session2["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("second session id");
    assert_ne!(id1, id2, "the two anonymous sessions must be distinct");

    let (status, rows2) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id2}/responses"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "owner read second session: {rows2:?}"
    );
    assert_eq!(
        rows2.as_array().map(|a| a.len()),
        Some(0),
        "a different session must NOT surface session 1's rows"
    );
}
