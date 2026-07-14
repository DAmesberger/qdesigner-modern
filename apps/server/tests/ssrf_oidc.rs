//! SSRF regression lock for the OIDC/SSO outbound path.
//!
//! Signup is open, so anyone can create an org, become its owner, register an
//! identity provider, and thereby choose a URL this server will fetch. Unguarded
//! that is a server-side request forgery into the deployment's own network —
//! cloud instance metadata (`169.254.169.254`), Postgres, Redis, MinIO. These
//! tests drive the real `GET /api/sso/{slug}/start` handler (and the callback
//! path) through the HTTP harness and assert the guard in `auth::ssrf` refuses
//! each class of blocked target *and does not emit the request*.
//!
//! The wiremock servers below all bind loopback, which is itself a blocked
//! target — that is the point. A test that must let discovery through (to probe
//! the *inner* endpoints, or the redirect behaviour) exempts the wiremock host
//! explicitly, exactly as a local-dev operator would via
//! `SSO_ALLOWED_INSECURE_HOSTS`, and points the hostile part elsewhere.
//!
//! These were proven to fail when the guard is relaxed: with every host treated
//! as exempt, `start` fetches discovery from the loopback wiremock — its
//! `received_requests()` becomes non-empty and the handler 303-redirects to the
//! internal `/authorize`, reproducing the SSRF. See the workstream report for
//! the captured failure output.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use common::{build_test_state, provision_tenant, register_user, send_full, test_app, TestTenant};

const CLIENT_ID: &str = "ssrf-test-client";

/// Build the app with an explicit outbound exemption list, mirroring
/// `SSO_ALLOWED_INSECURE_HOSTS`. `[]` is the production posture: nothing on
/// loopback or a private range is reachable.
async fn app_with_exemptions(exempt: &[&str]) -> Option<(axum::Router, PgPool)> {
    let mut state = build_test_state().await?;
    let mut cfg = (*state.config).clone();
    cfg.sso_allowed_insecure_hosts = exempt.iter().map(|s| s.to_string()).collect();
    state.config = std::sync::Arc::new(cfg);
    let pool = state.pool.clone();
    Some((test_app(state), pool))
}

/// Seed an enabled OIDC IdP for `org_id` whose discovery URL is `metadata_url`.
/// The `client_secret` is not needed for the `start`-side tests (they fail
/// before token exchange), so it is left NULL.
async fn seed_idp(pool: &PgPool, org_id: Uuid, metadata_url: &str) {
    sqlx::query(
        r#"
        INSERT INTO org_identity_providers
            (organization_id, protocol, display_name, issuer, metadata_url,
             client_id, default_role, group_claim, group_role_map,
             enforce_role_mapping, enabled)
        VALUES ($1, 'oidc', 'Hostile IdP', $2, $2, $3, 'member', 'groups',
                '{}'::jsonb, false, true)
        "#,
    )
    .bind(org_id)
    .bind(metadata_url)
    .bind(CLIENT_ID)
    .execute(pool)
    .await
    .expect("seed idp");
}

async fn org_slug(pool: &PgPool, org_id: Uuid) -> String {
    sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(org_id)
        .fetch_one(pool)
        .await
        .expect("org slug")
}

/// Drive `GET /api/sso/{slug}/start` and return the raw status + `Location`.
async fn start(app: &axum::Router, slug: &str) -> (StatusCode, Option<String>) {
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/sso/{slug}/start"))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = send_full(app, req).await;
    let location = headers
        .get("location")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    (status, location)
}

async fn tenant(app: &axum::Router) -> TestTenant {
    let owner = register_user(app).await;
    provision_tenant(app, &owner.token).await
}

/// A discovery document whose four required endpoints are all reachable
/// (`base`), except any the caller overrides.
fn discovery_body(base: &str, token_endpoint: &str) -> serde_json::Value {
    json!({
        "issuer": base,
        "authorization_endpoint": format!("{base}/authorize"),
        "token_endpoint": token_endpoint,
        "jwks_uri": format!("{base}/jwks"),
    })
}

// ── The core block: a metadata_url on a blocked address is never fetched ──

#[tokio::test]
async fn start_blocks_loopback_metadata_and_emits_no_request() {
    let Some((app, pool)) = app_with_exemptions(&[]).await else {
        eprintln!("skipping: no database");
        return;
    };

    // Stands in for an internal service the attacker wants the server to hit.
    // It records every request it receives, so we can prove none arrives.
    let internal = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(discovery_body(
            &internal.uri(),
            &format!("{}/token", internal.uri()),
        )))
        .mount(&internal)
        .await;

    let t = tenant(&app).await;
    let metadata_url = format!("{}/.well-known/openid-configuration", internal.uri());
    seed_idp(&pool, t.org_id, &metadata_url).await;
    let slug = org_slug(&pool, t.org_id).await;

    let (status, location) = start(&app, &slug).await;

    assert_ne!(
        status,
        StatusCode::SEE_OTHER,
        "a loopback metadata_url must not produce an authorize redirect (got {location:?})"
    );
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "the guard should reject the URL as a client error"
    );
    assert!(
        internal.received_requests().await.unwrap().is_empty(),
        "SSRF: the server must not have connected to the loopback address at all"
    );
}

// ── The cloud-metadata crown jewel, as an IP literal ──

#[tokio::test]
async fn start_blocks_link_local_metadata_ip() {
    let Some((app, pool)) = app_with_exemptions(&[]).await else {
        eprintln!("skipping: no database");
        return;
    };
    let t = tenant(&app).await;
    seed_idp(
        &pool,
        t.org_id,
        "http://169.254.169.254/latest/meta-data/openid-configuration",
    )
    .await;
    let slug = org_slug(&pool, t.org_id).await;

    let (status, _) = start(&app, &slug).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "the AWS/GCP instance-metadata IP must be blocked"
    );
}

// ── A private range as an IP literal ──

#[tokio::test]
async fn start_blocks_private_range_metadata_ip() {
    let Some((app, pool)) = app_with_exemptions(&[]).await else {
        eprintln!("skipping: no database");
        return;
    };
    let t = tenant(&app).await;
    seed_idp(
        &pool,
        t.org_id,
        "https://10.0.0.5/.well-known/openid-configuration",
    )
    .await;
    let slug = org_slug(&pool, t.org_id).await;

    let (status, _) = start(&app, &slug).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "10.0.0.0/8 must be blocked"
    );
}

// ── Plain http to a non-exempt host ──

#[tokio::test]
async fn start_blocks_http_metadata_for_non_exempt_host() {
    let Some((app, pool)) = app_with_exemptions(&[]).await else {
        eprintln!("skipping: no database");
        return;
    };
    let t = tenant(&app).await;
    seed_idp(
        &pool,
        t.org_id,
        "http://idp.example.com/.well-known/openid-configuration",
    )
    .await;
    let slug = org_slug(&pool, t.org_id).await;

    let (status, _) = start(&app, &slug).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "plain http to a public host must be rejected (https required)"
    );
}

// ── The classic half-fix: guard the outer URL but not the inner endpoints ──

#[tokio::test]
async fn start_blocks_discovery_whose_inner_endpoint_is_a_blocked_host() {
    // The discovery URL itself is reachable — we exempt the wiremock host to
    // simulate a legitimately-public IdP — but the document it returns points
    // `token_endpoint` at the metadata service. A first-URL-only guard would
    // sail past this and later POST the auth code to 169.254.169.254.
    let idp = MockServer::start().await;
    let host = reqwest::Url::parse(&idp.uri())
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .expect("wiremock host");
    let Some((app, pool)) = app_with_exemptions(&[&host]).await else {
        eprintln!("skipping: no database");
        return;
    };

    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(discovery_body(
            &idp.uri(),
            "http://169.254.169.254/token", // ← the poisoned inner endpoint
        )))
        .mount(&idp)
        .await;

    let t = tenant(&app).await;
    let metadata_url = format!("{}/.well-known/openid-configuration", idp.uri());
    seed_idp(&pool, t.org_id, &metadata_url).await;
    let slug = org_slug(&pool, t.org_id).await;

    let (status, location) = start(&app, &slug).await;
    assert_ne!(
        status,
        StatusCode::SEE_OTHER,
        "a discovery doc naming a blocked inner endpoint must be rejected whole (got {location:?})"
    );
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ── A 302 into the private network must not be followed ──

#[tokio::test]
async fn start_does_not_follow_a_redirect_to_a_blocked_host() {
    // Discovery lives on an exempt host and answers with a 302 whose Location is
    // a *second* internal server. If reqwest followed the redirect, that server
    // would receive the request; the guard (Policy::none + require-2xx) means it
    // does not, and `start` fails on the non-2xx.
    let idp = MockServer::start().await;
    let redirect_target = MockServer::start().await;

    let idp_host = reqwest::Url::parse(&idp.uri())
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .expect("host");

    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(302).insert_header(
            "location",
            format!("{}/.well-known/openid-configuration", redirect_target.uri()).as_str(),
        ))
        .mount(&idp)
        .await;
    // If the redirect were followed, this would serve a valid document.
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(discovery_body(
            &redirect_target.uri(),
            &format!("{}/token", redirect_target.uri()),
        )))
        .mount(&redirect_target)
        .await;

    // Exempt only the first host; the redirect target stays blocked-by-default
    // *and* unreachable because we never follow the hop.
    let Some((app, pool)) = app_with_exemptions(&[&idp_host]).await else {
        eprintln!("skipping: no database");
        return;
    };

    let t = tenant(&app).await;
    let metadata_url = format!("{}/.well-known/openid-configuration", idp.uri());
    seed_idp(&pool, t.org_id, &metadata_url).await;
    let slug = org_slug(&pool, t.org_id).await;

    let (status, _) = start(&app, &slug).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "a 302 discovery response must be treated as a failure, not followed"
    );
    assert!(
        redirect_target
            .received_requests()
            .await
            .unwrap()
            .is_empty(),
        "the redirect target must never be contacted"
    );
}

// ── The callback re-validates a persisted token_endpoint ──
//
// A login-state row written before this guard existed can still name a blocked
// token_endpoint. The callback validates it again rather than trusting the row.

#[tokio::test]
async fn callback_blocks_a_persisted_blocked_token_endpoint() {
    let Some((app, pool)) = app_with_exemptions(&[]).await else {
        eprintln!("skipping: no database");
        return;
    };
    let t = tenant(&app).await;
    // The IdP row must exist (callback re-reads it) but is otherwise unused on
    // this path — the failure happens at token exchange.
    seed_idp(
        &pool,
        t.org_id,
        "https://idp.example.com/.well-known/openid-configuration",
    )
    .await;
    let idp_id: Uuid =
        sqlx::query_scalar("SELECT id FROM org_identity_providers WHERE organization_id = $1")
            .bind(t.org_id)
            .fetch_one(&pool)
            .await
            .expect("idp id");

    // Forge the login-state row a legitimate `start` would have written, but
    // with a token_endpoint pointing at the metadata service.
    let state_tok = format!("ssrf-state-{}", Uuid::new_v4());
    sqlx::query(
        r#"
        INSERT INTO sso_login_states
            (state, idp_id, nonce, redirect_uri, token_endpoint, jwks_uri, issuer, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(&state_tok)
    .bind(idp_id)
    .bind("deadbeef")
    .bind("https://qdesigner.test/api/sso/callback")
    .bind("http://169.254.169.254/token") // ← blocked
    .bind("https://idp.example.com/jwks")
    .bind("https://idp.example.com")
    .bind(Utc::now() + chrono::Duration::minutes(5))
    .execute(&pool)
    .await
    .expect("seed login state");

    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/sso/callback?code=abc&state={state_tok}"))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (status, _, _) = send_full(&app, req).await;

    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "a persisted blocked token_endpoint must be re-rejected at callback"
    );
}
