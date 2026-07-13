//! P3-T2 (F074) — HTTP round-trip coverage for the auth flow.
//!
//! First automatically-run handler-level test: drives `api::router` (wrapped
//! with `csrf_middleware`, exactly as `main.rs` layers it) through
//! `tower::ServiceExt::oneshot`. Covers the happy path
//! register → session → login → session → logout plus two negative gates:
//!   - 401 on a wrong-password login, and
//!   - 403 from `csrf_middleware` on a state-changing POST that carries no
//!     CSRF/XHR signal.
//!
//! The cookie-model auth surface exposes only `GET /api/auth/session` for the
//! browser to read its current identity — the JWT-era `POST /api/auth/refresh`
//! and `GET /api/auth/me` were removed (R5-4). The browser receives only an
//! opaque httpOnly `qd_session` cookie. The test round-trips that cookie plus
//! the returned `csrf_token` manually because `oneshot` keeps no cookie jar.

use axum::http::StatusCode;

mod common;
use common::{
    build_test_state, extract_cookie, json_req, json_request, register_user, send_full, test_app,
};

#[tokio::test]
async fn register_session_login_logout_happy_path() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // register → qd_session cookie + user id
    let user = register_user(&app).await;

    // GET /api/auth/session with the register credential
    let (status, view) =
        json_request(&app, "GET", "/api/auth/session", Some(&user.token), None).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "session view should succeed: {view:?}"
    );
    assert_eq!(view["authenticated"].as_bool(), Some(true));
    assert_eq!(
        view["user"]["id"]
            .as_str()
            .and_then(|s| uuid::Uuid::parse_str(s).ok()),
        Some(user.id),
        "session view should report the registered user's id"
    );
    let email = user.email.clone();

    // login with the same credentials — capture the fresh opaque session
    // cookie and CSRF token.
    let login_body = serde_json::json!({ "email": email, "password": "demo123456" });
    let (status, headers, login) = send_full(
        &app,
        json_req("POST", "/api/auth/login", None, Some(&login_body)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "login should succeed: {login:?}");
    assert_eq!(login["authenticated"].as_bool(), Some(true));
    assert!(
        login.get("access_token").is_none(),
        "access token must not be returned in the JSON body"
    );
    assert!(
        login.get("refresh_token").is_none(),
        "refresh token must not be returned in the JSON body"
    );
    let session_cookie = extract_cookie(&headers, "qd_session").expect("login must set qd_session");
    assert!(
        !session_cookie.is_empty(),
        "session cookie must be non-empty"
    );
    let csrf = login["csrf_token"]
        .as_str()
        .expect("csrf_token in login response")
        .to_string();
    let login_credential = format!("{session_cookie}|{csrf}");

    // session view with the login credential confirms the fresh session is
    // live. Each `GET /api/auth/session` rotates the CSRF token (via
    // `session_view_for_token`), so capture the rotated token to authorize the
    // subsequent state-changing logout POST.
    let (status, view) = json_request(
        &app,
        "GET",
        "/api/auth/session",
        Some(&login_credential),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "session view should succeed: {view:?}"
    );
    assert_eq!(view["authenticated"].as_bool(), Some(true));
    let rotated_csrf = view["csrf_token"]
        .as_str()
        .expect("session view rotates csrf token");
    let rotated_credential = format!("{session_cookie}|{rotated_csrf}");

    // logout with the cookie session + the freshly-rotated CSRF token.
    let (status, out) = json_request(
        &app,
        "POST",
        "/api/auth/logout",
        Some(&rotated_credential),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "logout should succeed: {out:?}");

    // After logout the session is revoked → the session view reports anonymous.
    let (status, view) = json_request(
        &app,
        "GET",
        "/api/auth/session",
        Some(&rotated_credential),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "session view is always 200");
    assert_eq!(
        view["authenticated"].as_bool(),
        Some(false),
        "logged-out session must read as anonymous"
    );
}

#[tokio::test]
async fn stale_session_cookie_is_cleared_on_session_view() {
    // A browser holding a stale/invalid httpOnly qd_session cookie must be able
    // to recover: GET /api/auth/session sees a cookie that does not resolve to a
    // live session and returns a removal Set-Cookie so the browser stops sending
    // the dead cookie (which would otherwise trip csrf_middleware on the next
    // login POST and lock the user out). See issue #47 follow-up.
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    // A syntactically-plausible token that resolves to no session.
    let stale = "stale-invalid-session-token-deadbeef";
    let (status, headers, view) = send_full(
        &app,
        json_req("GET", "/api/auth/session", Some(stale), None),
    )
    .await;

    assert_eq!(
        status,
        StatusCode::OK,
        "session view is always 200: {view:?}"
    );
    assert_eq!(
        view["authenticated"].as_bool(),
        Some(false),
        "a stale cookie must read as anonymous"
    );

    let removal = headers
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find(|s| s.starts_with("qd_session="))
        .expect("stale session view must emit a qd_session removal Set-Cookie");
    // The removal clears the value and matches the login cookie's path so the
    // browser actually drops it.
    assert!(
        removal.starts_with("qd_session=;"),
        "removal cookie must clear the value: {removal}"
    );
    assert!(
        removal.contains("Path=/"),
        "removal cookie path must match the login cookie: {removal}"
    );
}

#[tokio::test]
async fn anonymous_session_view_emits_no_set_cookie() {
    // A cookie-less anonymous request must NOT gain a pointless Set-Cookie
    // header — only a *present but invalid* cookie is cleared.
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let (status, headers, view) =
        send_full(&app, json_req("GET", "/api/auth/session", None, None)).await;

    assert_eq!(
        status,
        StatusCode::OK,
        "session view is always 200: {view:?}"
    );
    assert_eq!(view["authenticated"].as_bool(), Some(false));
    assert!(
        headers.get_all("set-cookie").iter().next().is_none(),
        "anonymous request must not receive any Set-Cookie"
    );
}

#[tokio::test]
async fn login_wrong_password_is_401() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let user = register_user(&app).await;

    let bad = serde_json::json!({ "email": user.email, "password": "not-the-password" });
    let (status, json) = json_request(&app, "POST", "/api/auth/login", None, Some(&bad)).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "wrong password must be 401: {json:?}"
    );
}

#[tokio::test]
async fn post_without_csrf_header_is_403() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    // A state-changing POST with neither X-Requested-With nor Authorization
    // is rejected by csrf_middleware BEFORE the handler runs.
    let body = serde_json::json!({ "email": "x@example.test", "password": "demo123456" });
    let req = axum::http::Request::builder()
        .method("POST")
        .uri("/api/auth/login")
        .header("content-type", "application/json")
        .body(axum::body::Body::from(
            serde_json::to_vec(&body).expect("serialize"),
        ))
        .expect("build request");
    let (status, _headers, json) = send_full(&app, req).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "CSRF-missing POST must be 403: {json:?}"
    );
}
