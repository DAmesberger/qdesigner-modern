//! ADR 0033 (Unit 1) — cross-org project membership as the READ path for
//! external collaborators, proving tenant isolation stays intact.
//!
//! Exercised end-to-end through the app-role (`qdesigner_app`, non-BYPASSRLS)
//! pool so BOTH the handler gates (`authorize` → `verify_*` +
//! `require_permission`) AND the study-data RLS branches (00054) are under
//! test: a 200 with real rows proves the row survived
//! `sessions_select_via_project_member`; a 403 proves the handler gate denied
//! before the query ran; an empty org-filtered list proves org-scope
//! invisibility.
//!
//! Fixture:
//!   * Owner A owns org A, with TWO projects: P (+ questionnaire Q) and P2
//!     (+ questionnaire Q2). Each questionnaire is published and carries one
//!     anonymous session with one response.
//!   * User B is a registered user who is a member of org B ONLY (their own
//!     tenant) — NOT a member of org A. A adds B as a `viewer` project member
//!     of P (this add itself only works because ADR 0033 dropped the org-check
//!     trigger + the `verify_org_membership` precondition).
//!   * Org viewer V is an active `viewer` member of org A (additivity control).
//!   * Non-member N has no membership in org A at all (additivity control).
//!
//! Assertions:
//!   (a) B reads exactly P's study data — Q's sessions/responses (200, real
//!       rows) and project P (200);
//!   (b) B is DENIED a DIFFERENT project's data in org A — Q2's sessions and
//!       project P2 (403), and B's viewer membership does not confer write on P;
//!   (c) B has no org-A-level visibility — the org-filtered project list is
//!       empty for B and org A's member list is forbidden;
//!   plus: org viewer V (org-member branch) and plain non-member N are
//!   unaffected — V still reads both questionnaires, N is denied.

use axum::http::StatusCode;

mod common;
use common::{
    app_pool, build_test_state, json_request, provision_tenant, register_user, test_app, TestUser,
};

/// Publish `qid` under `proj`, create one anonymous session, and sync one
/// response into it. Returns the created session id. Mirrors the seeding in
/// `http_fillout_sessions.rs`.
async fn seed_session_with_response(
    app: &axum::Router,
    owner: &TestUser,
    proj: uuid::Uuid,
    qid: uuid::Uuid,
) -> uuid::Uuid {
    let (status, pubd) = json_request(
        app,
        "POST",
        &format!("/api/projects/{proj}/questionnaires/{qid}/publish"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "publish questionnaire: {pubd:?}");

    let create_body = serde_json::json!({ "questionnaire_id": qid });
    let (status, session) =
        json_request(app, "POST", "/api/sessions", None, Some(&create_body)).await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "anon create session: {session:?}"
    );
    let sid = session["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("session id");

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
        app,
        "POST",
        &format!("/api/sessions/{sid}/sync"),
        None,
        Some(&resp_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "anon sync response: {submitted:?}");
    sid
}

fn list_contains(list: &serde_json::Value, id: uuid::Uuid) -> bool {
    list.as_array()
        .map(|arr| {
            arr.iter()
                .any(|p| p["id"].as_str() == Some(id.to_string().as_str()))
        })
        .unwrap_or(false)
}

#[tokio::test]
async fn cross_org_project_member_reads_only_that_projects_data() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // ── Owner A: org A + project P (Q) and a SECOND project P2 (Q2) ──────
    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let (p, q) = (a.project_id, a.questionnaire_id);
    let sid_p = seed_session_with_response(&app, &user_a, p, q).await;

    // Second project in the SAME org A, with its own questionnaire + data.
    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let (status, project2) = json_request(
        &app,
        "POST",
        "/api/projects",
        Some(&user_a.token),
        Some(&serde_json::json!({
            "organization_id": a.org_id,
            "name": format!("Project2 {suffix}"),
            "code": format!("PB{suffix}"),
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create project2: {project2:?}");
    let p2 = project2["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("project2 id");
    let (status, q2j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p2}/questionnaires"),
        Some(&user_a.token),
        Some(&serde_json::json!({ "name": format!("Q2 {suffix}") })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create Q2: {q2j:?}");
    let q2 = q2j["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("q2 id");
    let _sid_p2 = seed_session_with_response(&app, &user_a, p2, q2).await;

    // ── User B: member of org B ONLY (own tenant), NOT a member of org A ─
    let user_b = register_user(&app).await;
    let b = provision_tenant(&app, &user_b.token).await;
    let tok_b = user_b.token.as_str();

    // Baseline: before any project membership, B is denied P and Q's analytics.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "B denied P pre-membership");
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/sessions?questionnaire_id={q}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B denied Q analytics pre-membership"
    );

    // ── A adds B as a cross-org VIEWER project member of P ───────────────
    // This add ONLY works under ADR 0033: pre-0033 the org-check trigger +
    // verify_org_membership precondition would 400 (B is not an org-A member).
    let (status, added) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/members"),
        Some(&user_a.token),
        Some(&serde_json::json!({ "email": user_b.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "cross-org project member add must succeed (ADR 0033): {added:?}"
    );

    // (a) B reads exactly P's study data ────────────────────────────────
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "project member reads P");

    let (status, sessions) = json_request(
        &app,
        "GET",
        &format!("/api/sessions?questionnaire_id={q}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "project member reads Q's sessions: {sessions:?}"
    );
    assert!(
        list_contains(&sessions, sid_p),
        "B must see the REAL session row for Q (RLS project-member branch): {sessions:?}"
    );

    let (status, responses) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/{sid_p}/responses"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "project member reads Q's responses: {responses:?}"
    );
    assert_eq!(
        responses.as_array().map(|r| r.len()),
        Some(1),
        "B sees the one real response row"
    );

    // (b) B is DENIED a DIFFERENT project's data in org A ────────────────
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p2}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B denied a different project P2"
    );
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/sessions?questionnaire_id={q2}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "B denied Q2 analytics (different project)"
    );

    // …and a VIEWER membership does not confer WRITE on P (scoped grant).
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/questionnaires"),
        Some(tok_b),
        Some(&serde_json::json!({ "name": "B write attempt" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "viewer project member has no write on P"
    );

    // …and never member management on P.
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/members"),
        Some(tok_b),
        Some(&serde_json::json!({ "email": user_a.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "viewer project member cannot manage members"
    );

    // (c) B has NO org-A-level visibility ───────────────────────────────
    // Org-filtered project list is membership-scoped: B (not an org member)
    // sees NEITHER P nor P2 when enumerating org A — no org-scope leak.
    let (status, org_list) = json_request(
        &app,
        "GET",
        &format!("/api/projects?organization_id={}", a.org_id),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !list_contains(&org_list, p),
        "org list must not leak P to a cross-org member"
    );
    assert!(
        !list_contains(&org_list, p2),
        "org list must not leak P2 to a cross-org member"
    );

    // Org A's member roster is forbidden to a non-member.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/organizations/{}/members", a.org_id),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "B cannot list org A members");

    // B still sees their OWN project in the unfiltered list, plus P (they are a
    // real project member of it) — but never P2.
    let (status, my_list) = json_request(&app, "GET", "/api/projects", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        list_contains(&my_list, b.project_id),
        "B sees their own project"
    );
    assert!(
        list_contains(&my_list, p),
        "B sees P (they are a project member)"
    );
    assert!(!list_contains(&my_list, p2), "B never sees P2");

    // ── Additivity control: org viewer V is UNAFFECTED ──────────────────
    let user_v = register_user(&app).await;
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/members", a.org_id),
        Some(&user_a.token),
        Some(&serde_json::json!({ "email": user_v.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "add org viewer V");
    // An org viewer reads EVERY questionnaire's analytics in org A (org-member
    // branch), unchanged by this unit.
    for qq in [q, q2] {
        let (status, _j) = json_request(
            &app,
            "GET",
            &format!("/api/sessions?questionnaire_id={qq}"),
            Some(&user_v.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "org viewer reads {qq} analytics");
    }

    // ── Additivity control: a plain non-member N is DENIED ──────────────
    let user_n = register_user(&app).await;
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/sessions?questionnaire_id={q}"),
        Some(&user_n.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "plain non-member denied Q analytics"
    );
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(&user_n.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "plain non-member denied P");

    // ── RLS-layer proof (as qdesigner_app with app.user_id = B) ─────────
    // Direct confirmation the study-data RLS branches — not just the handler
    // gates — admit exactly P's rows and nothing from P2.
    if let Some(pool) = app_pool().await {
        let mut conn = pool.acquire().await.expect("acquire app conn");
        sqlx::query("SELECT set_config('app.user_id', $1, false)")
            .bind(user_b.id.to_string())
            .execute(&mut *conn)
            .await
            .unwrap();

        let q_sessions: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE questionnaire_id = $1")
                .bind(q)
                .fetch_one(&mut *conn)
                .await
                .unwrap();
        assert_eq!(q_sessions, 1, "RLS admits Q's session for project member B");

        let q_responses: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM responses r JOIN sessions s ON s.id = r.session_id \
             WHERE s.questionnaire_id = $1",
        )
        .bind(q)
        .fetch_one(&mut *conn)
        .await
        .unwrap();
        assert_eq!(
            q_responses, 1,
            "RLS admits Q's response for project member B"
        );

        let q2_sessions: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE questionnaire_id = $1")
                .bind(q2)
                .fetch_one(&mut *conn)
                .await
                .unwrap();
        assert_eq!(
            q2_sessions, 0,
            "RLS hides Q2's session from B (not a member of P2)"
        );
    }
}
