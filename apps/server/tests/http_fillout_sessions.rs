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
//!     rows, never session 1's (per-session scoping / 00021 dual-path);
//!   - the owner reads the session's interaction events + variables while a
//!     cross-tenant user is denied the events (R3-1's per-session browser is
//!     the events endpoint's first UI consumer).
//!
//! NOTE (correction to the P3-T2 plan): `GET /api/sessions/{id}/responses`
//! takes an `AuthenticatedUser`, so an anonymous caller cannot read its own
//! rows over HTTP — the positive read is therefore performed by the
//! questionnaire's authenticated owner.
//!
//! NOTE (R5-4): the anonymous write goes through `POST /api/sessions/{id}/sync`
//! — the offline-first batch path — after the per-response `POST
//! /api/sessions/{id}/responses` endpoint was removed as vestigial. `/sync`
//! runs under the same `fillout_rls_context` dual-path GUC, so it exercises the
//! same anonymous-admission contract the removed endpoint did.

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

    // ── Anonymous submit a response via the offline-first /sync path ──
    let resp_body = serde_json::json!({
        "responses": [{
            "client_id": uuid::Uuid::new_v4(),
            "question_id": "q1",
            "value": { "choice": "a" },
        }],
        "events": [],
        "variables": [],
    });
    let (status, submitted) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{id1}/sync"),
        None,
        Some(&resp_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "anon sync response: {submitted:?}");
    assert_eq!(
        submitted["responses_synced"].as_i64(),
        Some(1),
        "one response stored"
    );

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

    // ── Anonymous submit an interaction event ─────────────────────────
    // The events endpoint (R3-1's per-session browser is its first UI
    // consumer) shares `ensure_session_access`/`ensure_session_participant_
    // or_member` and the 00021 dual-path RLS with responses; prove a
    // researcher can read it and a cross-tenant user cannot.
    let event_body = serde_json::json!([{ "event_type": "focus", "question_id": "q1", "timestamp_us": 1000 }]);
    let (status, evt) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{id1}/events"),
        None,
        Some(&event_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "anon submit event: {evt:?}");

    // ── Researcher (owner A) reads events + variables ─────────────────
    let (status, events) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id1}/events"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "owner read events: {events:?}");
    let evt_arr = events.as_array().expect("events array");
    assert_eq!(evt_arr.len(), 1, "owner sees the one event");
    assert_eq!(evt_arr[0]["event_type"].as_str(), Some("focus"));

    let (status, vars) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id1}/variables"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "owner read variables: {vars:?}");
    assert!(vars.is_array(), "variables endpoint returns an array");

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

    // Same cross-tenant denial for the events endpoint.
    let (status, json) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{id1}/events"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "cross-tenant user must not read another tenant's session events: {json:?}"
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

/// RT-1b: the fourth offline record kind (`trials[]`) syncs through the same
/// anonymous `/sync` dual-path GUC as responses, is read back by the researcher
/// via `GET /api/sessions/{id}/trials`, dedups on client_id, and enforces W-8
/// (a multi-trial reaction response's scalar `reaction_time_us` is NULLed
/// server-side). Cross-tenant reads are denied; anonymous reads are 401.
#[tokio::test]
async fn anonymous_trials_sync_read_dedup_and_w8() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

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

    // Anonymous create session.
    let create_body = serde_json::json!({ "questionnaire_id": qid });
    let (status, session) =
        json_request(&app, "POST", "/api/sessions", None, Some(&create_body)).await;
    assert_eq!(status, StatusCode::CREATED, "anon create session: {session:?}");
    let sid = session["id"].as_str().unwrap();

    // Sync a two-trial reaction response for `rt-q` together with a scalar
    // reaction_time_us the server must NULL (W-8), plus the two trial rows.
    let t0 = uuid::Uuid::new_v4();
    let t1 = uuid::Uuid::new_v4();
    let sync_body = serde_json::json!({
        "responses": [{
            "client_id": uuid::Uuid::new_v4(),
            "question_id": "rt-q",
            "value": { "responses": [{}, {}] },
            "reaction_time_us": 400000
        }],
        "events": [],
        "variables": [],
        "trials": [
            { "client_id": t0, "question_id": "rt-q", "trial_index": 0, "option_id": "left",  "source": "keyboard", "rt_us": 321500, "correct": true },
            { "client_id": t1, "question_id": "rt-q", "trial_index": 1, "option_id": "right", "source": "keyboard", "rt_us": 410000, "correct": false, "invalidated": "anticipatory" }
        ]
    });
    let (status, synced) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{sid}/sync"),
        None,
        Some(&sync_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "anon trials sync: {synced:?}");
    assert_eq!(synced["trials_synced"].as_i64(), Some(2), "two trials stored");
    assert_eq!(synced["responses_synced"].as_i64(), Some(1));

    // Researcher reads the trials, ordered by (question_id, trial_index).
    let (status, trials) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{sid}/trials"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "owner read trials: {trials:?}");
    let arr = trials.as_array().expect("trials array");
    assert_eq!(arr.len(), 2, "owner sees both trials");
    assert_eq!(arr[0]["trial_index"].as_i64(), Some(0));
    assert_eq!(arr[0]["option_id"].as_str(), Some("left"));
    assert_eq!(arr[0]["rt_us"].as_i64(), Some(321_500));
    assert_eq!(arr[1]["trial_index"].as_i64(), Some(1));
    assert_eq!(arr[1]["invalidated"].as_str(), Some("anticipatory"));

    // W-8: the multi-trial response's scalar reaction_time_us was NULLed.
    let (status, rows) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{sid}/responses"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "owner read responses: {rows:?}");
    let resp_arr = rows.as_array().expect("responses array");
    assert_eq!(resp_arr.len(), 1);
    assert!(
        resp_arr[0]["reaction_time_us"].is_null(),
        "multi-trial response's scalar RT must be NULL (W-8): {:?}",
        resp_arr[0]
    );

    // Re-sync the same trials → deduped on client_id, nothing new stored.
    let (status, resynced) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{sid}/sync"),
        None,
        Some(&sync_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "anon re-sync: {resynced:?}");
    assert_eq!(
        resynced["trials_synced"].as_i64(),
        Some(0),
        "duplicate trials must not be re-inserted"
    );

    // synced-client-ids reconcile probe includes the trial client_ids.
    let (status, synced_ids) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{sid}/synced-client-ids"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "synced-client-ids: {synced_ids:?}");
    let ids: Vec<String> = synced_ids["client_ids"]
        .as_array()
        .expect("client_ids array")
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();
    assert!(ids.contains(&t0.to_string()), "trial t0 in reconcile set");
    assert!(ids.contains(&t1.to_string()), "trial t1 in reconcile set");

    // Cross-tenant denial on the trials endpoint.
    let user_b = register_user(&app).await;
    let _b = provision_tenant(&app, &user_b.token).await;
    let (status, json) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{sid}/trials"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "cross-tenant user must not read another tenant's trials: {json:?}"
    );

    // Anonymous read of trials is gated (endpoint requires auth).
    let (status, _json) =
        json_request(&app, "GET", &format!("/api/sessions/{sid}/trials"), None, None).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "anonymous GET trials must be 401"
    );
}
