//! E-RBAC-10 — cross-project & external-guest sharing controls.
//!
//! Exercised end-to-end through the app-role (`qdesigner_app`, non-BYPASSRLS)
//! pool so both the handler predicates (`access::verify_*`) AND the RLS
//! `…_via_share` branches are under test — a `GET /api/projects/{P}` that
//! returns 200 proves the row survived `projects_select_via_share`, and a 403
//! proves the handler predicate denied before the query even ran.
//!
//! Fixture: owner A owns org A + project P (+ draft questionnaire Q). Guest B is
//! a registered user with NO membership in org A (they own their own org B). A
//! shares P with B, and the tests assert:
//!   * a viewer share grants scoped READ but never write nor member-management,
//!   * an editor share additionally grants scoped WRITE (create questionnaire),
//!   * the guest can never list org A's projects (guest cap),
//!   * "Shared with me" lists exactly the shared resource,
//!   * an expired share denies at BOTH the handler and RLS layers,
//!   * a share to a not-yet-registered email resolves on first sign-up,
//!   * a questionnaire share grants that questionnaire's analytics and no more.

use axum::http::StatusCode;

mod common;
use common::{
    app_pool, build_test_state, extract_cookie, fixture_pool, json_req, json_request,
    provision_tenant, register_user, send_full, test_app, TestUser,
};

fn list_contains(list: &serde_json::Value, id: uuid::Uuid) -> bool {
    list.as_array()
        .map(|arr| {
            arr.iter()
                .any(|p| p["id"].as_str() == Some(id.to_string().as_str()))
        })
        .unwrap_or(false)
}

/// Share a resource (`project`/`questionnaire`) with `email` at `role`, acting
/// as `admin`. Returns `(status, json)` of the create call.
async fn share(
    app: &axum::Router,
    admin: &TestUser,
    kind: &str,
    resource_id: uuid::Uuid,
    email: &str,
    role: &str,
    expires_at: Option<&str>,
) -> (StatusCode, serde_json::Value) {
    let mut body = serde_json::json!({ "email": email, "role": role });
    if let Some(exp) = expires_at {
        body["expires_at"] = serde_json::json!(exp);
    }
    let base = if kind == "project" {
        "projects"
    } else {
        "questionnaires"
    };
    json_request(
        app,
        "POST",
        &format!("/api/{base}/{resource_id}/shares"),
        Some(&admin.token),
        Some(&body),
    )
    .await
}

/// Register a user with a specific email through the real register flow (so the
/// pending-grant resolution on the register path is exercised).
async fn register_with_email(app: &axum::Router, email: &str) -> TestUser {
    let body = serde_json::json!({
        "email": email,
        "password": "demo123456",
        "full_name": "Guest",
    });
    let (status, headers, json) = send_full(
        app,
        json_req("POST", "/api/auth/register", None, Some(&body)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "register {email}: {json:?}");
    let session_cookie =
        extract_cookie(&headers, "qd_session").expect("register must set qd_session");
    let csrf = json["csrf_token"]
        .as_str()
        .expect("csrf_token in register response");
    TestUser {
        id: json["user"]["id"]
            .as_str()
            .and_then(|s| uuid::Uuid::parse_str(s).ok())
            .expect("user id"),
        token: format!("{session_cookie}|{csrf}"),
        email: email.to_string(),
    }
}

#[tokio::test]
async fn project_share_grants_scoped_read_edit_and_enforces_guest_cap() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner A: org A + project P (+ draft Q).
    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;

    // Guest B: registered, owns their own tenant, NOT a member of org A.
    let user_b = register_user(&app).await;
    let b = provision_tenant(&app, &user_b.token).await;
    let tok_b = user_b.token.as_str();
    let p = a.project_id;

    // Baseline: B cannot see project P (confidential to org A).
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "B must not see P pre-share");

    // ── A shares P with B as VIEWER ──────────────────────────────────────
    let (status, sh) = share(&app, &user_a, "project", p, &user_b.email, "viewer", None).await;
    assert_eq!(status, StatusCode::CREATED, "viewer share: {sh:?}");
    assert_eq!(sh["status"], "active", "existing user resolves immediately");
    assert_eq!(
        sh["grantee_user_id"].as_str(),
        Some(user_b.id.to_string().as_str())
    );

    // Read via share.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "viewer share must grant read of P");

    // Guest cap: viewer cannot WRITE (create a questionnaire in P).
    let q_body = serde_json::json!({ "name": "Guest attempt" });
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/questionnaires"),
        Some(tok_b),
        Some(&q_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "viewer share must NOT grant write"
    );

    // Guest cap: cannot manage members.
    let member_body = serde_json::json!({ "email": user_a.email, "role": "viewer" });
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/members"),
        Some(tok_b),
        Some(&member_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "share must NEVER grant member management"
    );

    // Guest cap: cannot enumerate org A's projects.
    let (status, list) = json_request(&app, "GET", "/api/projects", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !list_contains(&list, p),
        "shared project must NOT appear in the org list"
    );
    assert!(
        list_contains(&list, b.project_id),
        "B still sees their own project"
    );
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/projects?organization_id={}", a.org_id),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !list_contains(&list, p),
        "org-filtered list must not leak P to a guest"
    );

    // "Shared with me" lists exactly P.
    let (status, shared) =
        json_request(&app, "GET", "/api/shares/shared-with-me", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK, "shared-with-me: {shared:?}");
    let arr = shared.as_array().expect("array");
    assert_eq!(arr.len(), 1, "exactly one shared resource: {shared:?}");
    assert_eq!(arr[0]["resource_id"].as_str(), Some(p.to_string().as_str()));
    assert_eq!(arr[0]["role"], "viewer");

    // ── Upgrade to EDITOR (re-share upserts the same row) ────────────────
    let (status, sh2) = share(&app, &user_a, "project", p, &user_b.email, "editor", None).await;
    assert_eq!(status, StatusCode::CREATED, "editor re-share: {sh2:?}");
    assert_eq!(sh2["id"], sh["id"], "re-share upserts the same share row");

    // Editor share grants scoped WRITE.
    let (status, jq) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/questionnaires"),
        Some(tok_b),
        Some(&q_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "editor share must grant write: {jq:?}"
    );

    // …but STILL not member management.
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/members"),
        Some(tok_b),
        Some(&member_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "editor share still cannot manage members"
    );

    // Positive RLS-layer proof: as qdesigner_app with app.user_id=B, the
    // projects row is visible via projects_select_via_share.
    if let Some(pool) = app_pool().await {
        let mut conn = pool.acquire().await.expect("acquire app conn");
        sqlx::query("SELECT set_config('app.user_id', $1, false)")
            .bind(user_b.id.to_string())
            .execute(&mut *conn)
            .await
            .unwrap();
        let visible: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = $1")
            .bind(p)
            .fetch_one(&mut *conn)
            .await
            .unwrap();
        assert_eq!(
            visible, 1,
            "RLS must admit P for B while the share is active"
        );
    }

    // ── Revoke, then confirm access is gone ──────────────────────────────
    let share_id = sh["id"].as_str().unwrap();
    let (status, _j) = json_request(
        &app,
        "DELETE",
        &format!("/api/projects/{p}/shares/{share_id}"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revoke share");

    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "revoked share denies read again"
    );

    let (status, shared) =
        json_request(&app, "GET", "/api/shares/shared-with-me", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        shared.as_array().map(|a| a.len()),
        Some(0),
        "revoked share drops from inbox"
    );
}

#[tokio::test]
async fn expired_share_denies_at_handler_and_rls_layers() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let user_b = register_user(&app).await;
    let p = a.project_id;

    // Insert an already-expired editor share directly (the API refuses a past
    // expiry, so seed via the superuser fixture pool).
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };
    sqlx::query(
        r#"
        INSERT INTO resource_shares
            (resource_type, resource_id, organization_id, grantee_user_id,
             grantee_email, role, created_by, expires_at)
        VALUES ('project', $1, $2, $3, $4, 'editor', $5, now() - interval '1 hour')
        "#,
    )
    .bind(p)
    .bind(a.org_id)
    .bind(user_b.id)
    .bind(&user_b.email)
    .bind(user_a.id)
    .execute(&fx)
    .await
    .expect("seed expired share");

    // Handler layer: read denied.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "expired share must deny at the handler"
    );

    // Handler layer: shared-with-me omits expired grants.
    let (status, shared) = json_request(
        &app,
        "GET",
        "/api/shares/shared-with-me",
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        shared.as_array().map(|a| a.len()),
        Some(0),
        "expired grant hidden from inbox"
    );

    // RLS layer: as qdesigner_app with app.user_id=B the project stays hidden.
    if let Some(pool) = app_pool().await {
        let mut conn = pool.acquire().await.expect("acquire");
        sqlx::query("SELECT set_config('app.user_id', $1, false)")
            .bind(user_b.id.to_string())
            .execute(&mut *conn)
            .await
            .unwrap();
        let visible: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = $1")
            .bind(p)
            .fetch_one(&mut *conn)
            .await
            .unwrap();
        assert_eq!(visible, 0, "RLS must hide P when the only share is expired");
    }
}

#[tokio::test]
async fn pending_share_resolves_on_registration() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let p = a.project_id;

    // Share to an email with no account yet — a pending grant.
    let pending_email = format!("pending-{}@example.test", uuid::Uuid::new_v4());
    let (status, sh) = share(&app, &user_a, "project", p, &pending_email, "viewer", None).await;
    assert_eq!(status, StatusCode::CREATED, "pending share: {sh:?}");
    assert_eq!(sh["status"], "pending", "no account yet ⇒ pending");
    assert!(sh["grantee_user_id"].is_null(), "unresolved grantee");

    // First sign-up for that email links + activates the grant.
    let guest = register_with_email(&app, &pending_email).await;
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(&guest.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "pending share resolves on first sign-up"
    );

    // The sharer now sees the grant as active.
    let (status, shares) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}/shares"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list shares: {shares:?}");
    let arr = shares.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["status"], "active", "resolved grant is active");
}

#[tokio::test]
async fn questionnaire_share_grants_only_that_questionnaires_analytics() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let q = a.questionnaire_id;

    let user_b = register_user(&app).await;
    let tok_b = user_b.token.as_str();

    // Before sharing: B cannot read Q's analytics nor the parent project.
    // `GET /api/sessions?questionnaire_id=…` flows through the same
    // `verify_questionnaire_access` gate the analytics endpoints do.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/sessions?questionnaire_id={q}"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "no share ⇒ analytics denied");

    // A shares questionnaire Q (viewer) with B.
    let (status, sh) = share(
        &app,
        &user_a,
        "questionnaire",
        q,
        &user_b.email,
        "viewer",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "questionnaire share: {sh:?}");

    // B may now read Q's analytics (empty result, but admitted — 200).
    let (status, res) = json_request(
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
        "questionnaire share grants analytics: {res:?}"
    );

    // The guest analytics view (F-32) reads the timeseries + arm-counts for the
    // shared questionnaire; both flow through the same `verify_questionnaire_access`
    // gate and must admit the grantee so the guest page renders rather than 403s.
    let (status, _ts) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/timeseries?questionnaire_id={q}&interval=day"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "share grants timeseries read");

    let (status, _arms) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{q}/arm-counts"),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "share grants arm-counts read");

    // Scope: a questionnaire share does NOT grant read of the parent project.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{}", a.project_id),
        Some(tok_b),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "questionnaire share must not leak the parent project"
    );

    // "Shared with me" shows exactly the questionnaire.
    let (status, shared) =
        json_request(&app, "GET", "/api/shares/shared-with-me", Some(tok_b), None).await;
    assert_eq!(status, StatusCode::OK);
    let arr = shared.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["resource_type"], "questionnaire");
    assert_eq!(arr[0]["resource_id"].as_str(), Some(q.to_string().as_str()));
}

/// F-31: the housekeeping purge deletes expired `resource_shares` rows (which
/// otherwise accrete) while leaving live/never-expiring grants untouched. Runs
/// the same single-pass body the hourly background task calls, on the app pool.
#[tokio::test]
async fn share_purge_removes_only_expired_grants() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state.clone());
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };

    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let user_b = register_user(&app).await;
    // Distinct grantee for the live grant — a unique index on
    // (resource_type, resource_id, lower(grantee_email)) forbids two shares of
    // the same project to the same email.
    let user_c = register_user(&app).await;
    let p = a.project_id;

    // One already-expired grant + one live grant (no expiry) on the same project.
    let expired_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO resource_shares
            (resource_type, resource_id, organization_id, grantee_user_id,
             grantee_email, role, created_by, expires_at)
        VALUES ('project', $1, $2, $3, $4, 'viewer', $5, now() - interval '1 hour')
        RETURNING id
        "#,
    )
    .bind(p)
    .bind(a.org_id)
    .bind(user_b.id)
    .bind(&user_b.email)
    .bind(user_a.id)
    .fetch_one(&fx)
    .await
    .expect("seed expired share");

    let live_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO resource_shares
            (resource_type, resource_id, organization_id, grantee_user_id,
             grantee_email, role, created_by, expires_at)
        VALUES ('project', $1, $2, $3, $4, 'viewer', $5, NULL)
        RETURNING id
        "#,
    )
    .bind(p)
    .bind(a.org_id)
    .bind(user_c.id)
    .bind(&user_c.email)
    .bind(user_a.id)
    .fetch_one(&fx)
    .await
    .expect("seed live share");

    // Run one purge pass (the body the hourly job calls).
    let purged = qdesigner_server::housekeeping::run_share_purge(&state)
        .await
        .expect("purge runs");
    assert!(purged >= 1, "purge removed at least the expired grant");

    let expired_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM resource_shares WHERE id = $1)")
            .bind(expired_id)
            .fetch_one(&fx)
            .await
            .expect("probe expired");
    assert!(!expired_exists, "expired grant purged");

    let live_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM resource_shares WHERE id = $1)")
            .bind(live_id)
            .fetch_one(&fx)
            .await
            .expect("probe live");
    assert!(live_exists, "live grant survives the purge");

    // Cleanup.
    let _ = sqlx::query("DELETE FROM resource_shares WHERE id = $1")
        .bind(live_id)
        .execute(&fx)
        .await;
}
