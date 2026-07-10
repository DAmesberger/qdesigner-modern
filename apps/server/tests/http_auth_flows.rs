//! P3-T2 (F074) — HTTP round-trip coverage for the auth flow.
//!
//! First automatically-run handler-level test: drives `api::router` (wrapped
//! with `csrf_middleware`, exactly as `main.rs` layers it) through
//! `tower::ServiceExt::oneshot`. Covers the happy path
//! register → me → login → session refresh → logout plus two negative gates:
//!   - 401 on a wrong-password login, and
//!   - 403 from `csrf_middleware` on a state-changing POST that carries no
//!     CSRF/XHR signal.
//!
//! The browser receives only an opaque httpOnly `qd_session` cookie. The test
//! round-trips that cookie plus the returned `csrf_token` manually because
//! `oneshot` keeps no cookie jar.

use axum::http::StatusCode;

mod common;
use common::{
    build_test_state, extract_cookie, json_req, json_request, register_user, send_full, test_app,
};

#[tokio::test]
async fn register_me_login_refresh_logout_happy_path() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // register → qd_session cookie + user id
    let user = register_user(&app).await;

    // GET /api/auth/me with the register token
    let (status, me) = json_request(&app, "GET", "/api/auth/me", Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK, "me should succeed: {me:?}");
    assert_eq!(
        me["id"]
            .as_str()
            .and_then(|s| uuid::Uuid::parse_str(s).ok()),
        Some(user.id),
        "me should report the registered user's id"
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

    // refresh/session view: send the session cookie and CSRF header back.
    let refresh_req = axum::http::Request::builder()
        .method("POST")
        .uri("/api/auth/refresh")
        .header("x-requested-with", "XMLHttpRequest")
        .header("x-csrf-token", csrf)
        .header("cookie", format!("qd_session={session_cookie}"))
        .body(axum::body::Body::empty())
        .expect("build refresh request");
    let (status, _headers, refreshed) = send_full(&app, refresh_req).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "refresh should succeed: {refreshed:?}"
    );
    assert_eq!(refreshed["authenticated"].as_bool(), Some(true));
    let refreshed_csrf = refreshed["csrf_token"]
        .as_str()
        .expect("refresh rotates csrf token");
    let refreshed_credential = format!("{session_cookie}|{refreshed_csrf}");

    // logout with the cookie session.
    let (status, out) = json_request(
        &app,
        "POST",
        "/api/auth/logout",
        Some(&refreshed_credential),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "logout should succeed: {out:?}");

    // After logout the session is revoked → /me now 401.
    let (status, _) =
        json_request(&app, "GET", "/api/auth/me", Some(&login_credential), None).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "logged-out access token must be rejected"
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
