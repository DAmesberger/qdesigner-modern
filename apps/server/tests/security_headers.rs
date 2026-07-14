//! The security-header middleware decorates every API response, and — the part
//! that matters for a footgun — HSTS is emitted only over a *trusted* TLS hop.
//!
//! `test_app` wraps the router in the same `security_headers` layer `main.rs`
//! applies, so these assertions exercise the real wiring.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};

use common::{build_test_state, send_full, test_app};

async fn get(app: &axum::Router, uri: &str, headers: &[(&str, &str)]) -> axum::http::HeaderMap {
    let mut builder = Request::builder().method("GET").uri(uri);
    for (k, v) in headers {
        builder = builder.header(*k, *v);
    }
    let (_, resp_headers, _) = send_full(app, builder.body(Body::empty()).unwrap()).await;
    resp_headers
}

#[tokio::test]
async fn baseline_headers_are_present_on_every_response() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let app = test_app(state);

    // `/health` is anonymous and always routed, so the response is the
    // middleware's alone.
    let headers = get(&app, "/health", &[]).await;

    assert_eq!(
        headers
            .get("x-content-type-options")
            .map(|v| v.to_str().unwrap()),
        Some("nosniff"),
        "nosniff protects the media proxy from content-type sniffing"
    );
    assert_eq!(
        headers.get("x-frame-options").map(|v| v.to_str().unwrap()),
        Some("DENY")
    );
    assert_eq!(
        headers.get("referrer-policy").map(|v| v.to_str().unwrap()),
        Some("no-referrer"),
        "the sso callback carries an auth code in the URL"
    );
}

#[tokio::test]
async fn hsts_is_absent_without_a_trusted_tls_hop() {
    // The harness config sets no `trusted_proxy_hops`, so even a client that
    // forges `X-Forwarded-Proto: https` must not get an HSTS header — otherwise
    // a single request pins a plain-http dev origin to https for a year.
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let app = test_app(state);

    let headers = get(&app, "/health", &[("x-forwarded-proto", "https")]).await;
    assert!(
        headers.get("strict-transport-security").is_none(),
        "HSTS must not be emitted on an untrusted forwarded-proto"
    );
}

#[tokio::test]
async fn hsts_is_emitted_over_a_trusted_https_hop() {
    let Some(mut state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    // Declare one trusted proxy: now `X-Forwarded-Proto` is authoritative.
    let mut cfg = (*state.config).clone();
    cfg.trusted_proxy_hops = Some(1);
    state.config = std::sync::Arc::new(cfg);
    let app = test_app(state);

    let over_https = get(&app, "/health", &[("x-forwarded-proto", "https")]).await;
    let hsts = over_https
        .get("strict-transport-security")
        .map(|v| v.to_str().unwrap());
    assert_eq!(hsts, Some("max-age=31536000; includeSubDomains"));

    // …but still not over a plain-http hop behind the same trusted proxy.
    let over_http = get(&app, "/health", &[("x-forwarded-proto", "http")]).await;
    assert!(
        over_http.get("strict-transport-security").is_none(),
        "a trusted proxy reporting http must not yield HSTS"
    );
}

#[tokio::test]
async fn headers_present_even_on_a_not_found() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let app = test_app(state);

    let mut builder = Request::builder().method("GET").uri("/api/does-not-exist");
    builder = builder.header("host", "qdesigner.test");
    let (status, headers, _) = send_full(&app, builder.body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        headers
            .get("x-content-type-options")
            .map(|v| v.to_str().unwrap()),
        Some("nosniff"),
        "hardening headers must ride on error responses too"
    );
}
