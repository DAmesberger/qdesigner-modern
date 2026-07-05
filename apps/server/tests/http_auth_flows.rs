//! P3-T2 (F074) — HTTP round-trip coverage for the auth flow.
//!
//! First automatically-run handler-level test: drives `api::router` (wrapped
//! with `csrf_middleware`, exactly as `main.rs` layers it) through
//! `tower::ServiceExt::oneshot`. Covers the happy path
//! register → me → login → refresh → logout plus two negative gates:
//!   - 401 on a wrong-password login, and
//!   - 403 from `csrf_middleware` on a state-changing POST that carries
//!     neither `X-Requested-With` nor an `Authorization` header.
//!
//! The refresh token is delivered only via the httpOnly `refresh_token`
//! cookie (ADR — P2-T9), so the refresh step round-trips the `Set-Cookie`
//! from login back as a `Cookie` header — `oneshot` keeps no cookie jar.

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

    // register → access token + user id
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

    // login with the same credentials — capture the fresh access token and
    // the httpOnly refresh cookie.
    let login_body = serde_json::json!({ "email": email, "password": "demo123456" });
    let (status, headers, login) = send_full(
        &app,
        json_req("POST", "/api/auth/login", None, Some(&login_body)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "login should succeed: {login:?}");
    let login_token = login["access_token"]
        .as_str()
        .expect("access_token in login response")
        .to_string();
    assert_eq!(
        login["refresh_token"].as_str(),
        Some(""),
        "refresh token must NOT be returned in the JSON body (cookie-only)"
    );
    let refresh_cookie =
        extract_cookie(&headers, "refresh_token").expect("login must set a refresh_token cookie");
    assert!(
        !refresh_cookie.is_empty(),
        "refresh cookie must be non-empty"
    );

    // refresh: send the cookie back as a Cookie header (oneshot keeps no jar).
    let refresh_req = axum::http::Request::builder()
        .method("POST")
        .uri("/api/auth/refresh")
        .header("x-requested-with", "XMLHttpRequest")
        .header("cookie", format!("refresh_token={refresh_cookie}"))
        .body(axum::body::Body::empty())
        .expect("build refresh request");
    let (status, _headers, refreshed) = send_full(&app, refresh_req).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "refresh should succeed: {refreshed:?}"
    );
    assert!(
        refreshed["access_token"]
            .as_str()
            .is_some_and(|t| !t.is_empty()),
        "refresh should mint a new access token"
    );

    // logout with the login access token.
    let (status, out) =
        json_request(&app, "POST", "/api/auth/logout", Some(&login_token), None).await;
    assert_eq!(status, StatusCode::OK, "logout should succeed: {out:?}");

    // After logout the access token JTI is revoked → /me now 401.
    let (status, _) = json_request(&app, "GET", "/api/auth/me", Some(&login_token), None).await;
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
