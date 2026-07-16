//! #5 — the client-error ingest sink (`POST /api/client-errors`).
//!
//! A write-only, anonymous, per-IP-rate-limited crash-report endpoint. Driven
//! through the real Axum stack (CSRF + security-headers layers included) via the
//! `tower::oneshot` harness.

use axum::http::StatusCode;
use qdesigner_server::middleware::rate_limit::RateLimiter;

mod common;
use common::{build_test_state, json_req, send_raw, test_app};

/// A well-formed report is accepted with an empty 204 that echoes nothing back.
///
/// Regression guard: without the `/api/client-errors` route wired, this fails —
/// the endpoint 404s instead of 204-ing.
#[tokio::test]
async fn valid_report_is_accepted_with_empty_204() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let body = serde_json::json!({
        "message": "TypeError: x is undefined",
        "stack": "at foo (app.js:1:1)",
        "url": "https://example.test/q/ABCD",
        "userAgent": "Mozilla/5.0",
        "kind": "unhandledrejection",
        "at": "2026-07-16T12:00:00.000Z"
    });
    // json_req sets `X-Requested-With: XMLHttpRequest`, which the CSRF layer
    // requires for an anonymous state-changing request (the frontend client
    // adds the same header on every fetch).
    let (status, _headers, bytes) = send_raw(
        &app,
        json_req("POST", "/api/client-errors", None, Some(&body)),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "valid report → 204");
    assert!(
        bytes.is_empty(),
        "the sink must not echo anything back, got {} bytes",
        bytes.len()
    );
}

/// Only `message` is required; the optional fields may be omitted entirely.
#[tokio::test]
async fn minimal_report_with_only_message_is_accepted() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let body = serde_json::json!({ "message": "boom" });
    let (status, _h, bytes) = send_raw(
        &app,
        json_req("POST", "/api/client-errors", None, Some(&body)),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(bytes.is_empty());
}

/// The per-IP bucket blocks a flood. The oneshot harness injects no
/// `ConnectInfo`, so every request shares the `"unknown"` bucket — which is
/// exactly the single-IP scenario we want to cap.
///
/// Regression guard: without the `client_error_rate_limit_middleware` layer on
/// the route, this fails — the third request returns 204 instead of 429.
#[tokio::test]
async fn ingest_is_rate_limited_per_ip() {
    let Some(mut state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    // Tighten the (otherwise 10k) test bucket so the cap is reachable.
    state.client_error_limiter = RateLimiter::new(2, 60, None);
    let app = test_app(state);

    let body = serde_json::json!({ "message": "loop" });
    let post = || json_req("POST", "/api/client-errors", None, Some(&body));

    let (s1, _, _) = send_raw(&app, post()).await;
    let (s2, _, _) = send_raw(&app, post()).await;
    let (s3, _, _) = send_raw(&app, post()).await;

    assert_eq!(s1, StatusCode::NO_CONTENT, "1st within budget");
    assert_eq!(s2, StatusCode::NO_CONTENT, "2nd within budget");
    assert_eq!(
        s3,
        StatusCode::TOO_MANY_REQUESTS,
        "the 3rd request (over the 2/window cap) must be rate-limited"
    );
}
