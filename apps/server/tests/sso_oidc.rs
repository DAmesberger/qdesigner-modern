//! End-to-end OIDC SSO federation test (E-RBAC-6).
//!
//! Stands up a mock OIDC provider with `wiremock` (discovery + JWKS + token
//! endpoints) and drives the real `start` → `callback` flow through the HTTP
//! harness. Asserts that a first-time callback:
//!   * provisions a fresh `users` row linked to `(idp_id, external_subject)`,
//!   * upserts an active `organization_members` row, and
//!   * derives the role from `group_role_map` (an `admin` group claim wins
//!     over the `member` default), and
//!   * writes an `sso.login` audit event.
//!
//! The id_token is a real RS256 JWT signed with an embedded test key whose
//! public modulus is published through the mocked JWKS, so the handler's
//! signature + `iss`/`aud`/`nonce` validation runs for real.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use common::{
    build_test_state, extract_cookie, fixture_pool, json_request, provision_tenant, register_user,
    send_full, test_app,
};

// A 2048-bit RSA test key. Private key signs the id_token; the modulus below
// (base64url) is what the mocked JWKS advertises so the handler can verify.
const TEST_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDE7Y/cZ8mIu1z6
daCLh0fu/096jXTG3t5hvgqeDca8gqpsbHdKsS07Bz1LARS3DWRKezT2RPzWLUxh
7i3eByqj+rXPSohl3bkLUPo1tkv+oIe1yrI+rNqJ66oopv5tb+a1GUc/D0eiAd+N
HdEYMMgx98nG6bwaBF09X7c9LvVD+5kWlhEf9vfzwZChKfbpSVPOlTAa5glwt3dM
Zo5d72XXO+KhhwG9lJcy89OMc1/dChRCaQLq0L6TqkdWpD2nC5beBjnTKJH233nr
/Ub3Fj66U+HXbo1RPDu/zQk82UQx7qe2PIp5YM8jYE2TZA7Z8d63ANKdI9xAk4PZ
3dCBcD8LAgMBAAECggEALoviRZvoiF+U7gRQkrpCl+yT2ilGUV1LXfn/43TpJRST
eLY4ihiP0tR2udxDC7NoIay2i4Ep6+vgEoOsJr815nVzdNAupjk+rDyTL4/rrX8/
JIqJEARmUVQ5L4utNqvM8cBMVUzkxxe/Qckq65dYMmtZr6D+m32tljyiAJ2xTkRm
/fA9qZOvGYPX3kY7rKQo5hPi5uEEMH7DhT4XSKlBlXSX19L6TmEus7K8Ut/4xfcl
hoPaSPAmMzTN8We9+KgREXRoBp6qe1irOV5aPBOCcwgwjiKcJlP+MWEhhGjgTRRp
B6EMC1i+cajlFsT9VvGJhrFIokU3+DXak2SH2os1fQKBgQDv9RLNmRac/GMHdpmh
C8JZ/yZWnMxslLTE2TDcYnmzx9LViy4ZF1GTEm7XyyxVv/DtzBLTPsHKQbcBNU4y
xxWHJWTEfiJHig/v1ukCEwJme+5HYtK4P6uHl0p9xdXgr68NvA2+yE4HCFQe60Qa
n3B+1eWgs1EpcFzT+iYN07d+NQKBgQDSGAf1rtTGmThak6ku+Q3x8rhZtyZpQ6XA
zZCyV3gSP27H4ox383TEXuYbnaRaQkAnAURETOKBNXebAW/3SN6GOO7G2PNVW2Gb
BWk4exthWEqOgomh1pbEvpRcntwcTl54gLBRPfzt3IooZhnjF4eSh0wj7mc7hymH
AjbxRe1wPwKBgFaWqAda48cYaB/MU1nC5YoWQV5lzHquGqEiAri0LFiMle8K/0J8
oKoir67dGQ2EastUpcJm1gVHO2OLOcGnB4SyIK+rGHGaR2/zrDdcZrRWqkBGT+W+
zAXsuSuzlR80JkYdgxRCMa3l+n0BxpyYxj5uryMTMglzC3xOuyaoLIG1AoGBAJcE
ySv0SWScnOKXA+UNB9YkWBm9SnIeO1aVLW7U6y2KxVIPalOLACNr59JwBcUPnFet
VGoYLjUcvuYAKYDCs5od8J2lM3zm3Al34UPFUlAuDCHWeaKIwwWXzMOrOaNrPgM2
1gcAHQDKJ9GUWwVfU4ejk7q8Ux56MQKoN+BFGME3AoGBAIlxECYk9FyXFT8gS7Fh
74P6D56BkEt0x3Iv4NR9hx7sJJO2EujqGKdGqG5n0VQ+gmK5GfN84iiwpvMEJi2N
ElwZOxry5NjETirgIEqgukaBPPHzIa29qVICNSbGhQVtaDPNQz+CirRZbNkAMfRe
L/tRcWmPKQSMlPC375stPfBM
-----END PRIVATE KEY-----";

const TEST_KEY_N: &str = "xO2P3GfJiLtc-nWgi4dH7v9Peo10xt7eYb4Kng3GvIKqbGx3SrEtOwc9SwEUtw1kSns09kT81i1MYe4t3gcqo_q1z0qIZd25C1D6NbZL_qCHtcqyPqzaieuqKKb-bW_mtRlHPw9HogHfjR3RGDDIMffJxum8GgRdPV-3PS71Q_uZFpYRH_b388GQoSn26UlTzpUwGuYJcLd3TGaOXe9l1zvioYcBvZSXMvPTjHNf3QoUQmkC6tC-k6pHVqQ9pwuW3gY50yiR9t956_1G9xY-ulPh126NUTw7v80JPNlEMe6ntjyKeWDPI2BNk2QO2fHetwDSnSPcQJOD2d3QgXA_Cw";

// Must match the harness `build_test_state` jwt_secret, since the SSO enc key
// falls back to it when `SSO_ENCRYPTION_KEY` is unset.
const HARNESS_JWT_SECRET: &str = "test-secret-32-chars-minimum-padding-padding";
const CLIENT_ID: &str = "qdesigner-test-client";

fn sign_id_token(issuer: &str, nonce: &str, subject: &str, email: &str, groups: &[&str]) -> String {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    let now = Utc::now().timestamp();
    let claims = json!({
        "iss": issuer,
        "aud": CLIENT_ID,
        "sub": subject,
        "email": email,
        "name": "Federated User",
        "groups": groups,
        "nonce": nonce,
        "iat": now,
        "exp": now + 3600,
    });
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some("test-key".into());
    encode(
        &header,
        &claims,
        &EncodingKey::from_rsa_pem(TEST_KEY_PEM.as_bytes()).expect("valid test RSA pem"),
    )
    .expect("sign id_token")
}

#[tokio::test]
async fn oidc_callback_provisions_user_and_maps_group_to_admin() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::ERROR)
        .try_init();
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);

    // Owner + org, so the org has a slug + membership table to provision into.
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;

    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .expect("org slug");

    // ── Mock OIDC provider ──
    let idp = MockServer::start().await;
    let issuer = idp.uri();

    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "issuer": issuer,
            "authorization_endpoint": format!("{issuer}/authorize"),
            "token_endpoint": format!("{issuer}/token"),
            "jwks_uri": format!("{issuer}/jwks"),
        })))
        .mount(&idp)
        .await;

    Mock::given(method("GET"))
        .and(path("/jwks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "keys": [{
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": "test-key",
                "n": TEST_KEY_N,
                "e": "AQAB",
            }]
        })))
        .mount(&idp)
        .await;

    // ── Seed the IdP config (encrypted secret, group→role map) ──
    let secret_enc = qdesigner_server::api::sso::crypto::encrypt(HARNESS_JWT_SECRET, "oidc-secret")
        .expect("encrypt secret");
    sqlx::query(
        r#"
        INSERT INTO org_identity_providers
            (organization_id, protocol, display_name, issuer, metadata_url,
             client_id, client_secret_enc, default_role, group_claim,
             group_role_map, enforce_role_mapping, enabled)
        VALUES ($1, 'oidc', 'Test IdP', $2, $3, $4, $5, 'member', 'groups',
                $6::jsonb, true, true)
        "#,
    )
    .bind(tenant.org_id)
    .bind(&issuer)
    .bind(format!("{issuer}/.well-known/openid-configuration"))
    .bind(CLIENT_ID)
    .bind(&secret_enc)
    .bind(json!({ "lab-admins": "admin" }))
    .execute(&pool)
    .await
    .expect("seed idp");

    // ── start: 303 to the IdP with state + nonce ──
    let start_req = Request::builder()
        .method("GET")
        .uri(format!("/api/sso/{slug}/start"))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = send_full(&app, start_req).await;
    assert_eq!(status, StatusCode::SEE_OTHER, "start should 303");
    let location = headers
        .get("location")
        .and_then(|v| v.to_str().ok())
        .expect("start Location header")
        .to_string();
    let authorize = reqwest::Url::parse(&location).expect("authorize url");
    let state_tok = authorize
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string())
        .expect("state param");
    let nonce = authorize
        .query_pairs()
        .find(|(k, _)| k == "nonce")
        .map(|(_, v)| v.to_string())
        .expect("nonce param");

    // ── token endpoint returns an id_token carrying that nonce + admin group ──
    let id_token = sign_id_token(
        &issuer,
        &nonce,
        "ext-subject-oidc-1",
        "sso.federated@example.test",
        &["lab-admins"],
    );
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "opaque-access",
            "token_type": "Bearer",
            "expires_in": 3600,
            "id_token": id_token,
        })))
        .mount(&idp)
        .await;

    // ── callback: 303 back to the app with a session ──
    let cb_req = Request::builder()
        .method("GET")
        .uri(format!(
            "/api/sso/callback?code=auth-code-123&state={state_tok}"
        ))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = send_full(&app, cb_req).await;
    assert_eq!(
        status,
        StatusCode::SEE_OTHER,
        "callback should 303 back to the app: {:?}",
        headers.get("location")
    );
    let cb_location = headers
        .get("location")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    assert!(
        cb_location.ends_with("/sso/complete"),
        "callback should return to the SSO completion route without token fragments: {cb_location}"
    );
    assert!(
        extract_cookie(&headers, "qd_session").is_some(),
        "callback should set the qd_session cookie"
    );

    // ── DB side effects ── (RLS-bound tables read via the superuser pool)
    let sup = fixture_pool().await.expect("fixture pool");
    let user = sqlx::query("SELECT id, idp_id, external_subject FROM users WHERE email = $1")
        .bind("sso.federated@example.test")
        .fetch_one(&pool)
        .await
        .expect("provisioned user exists");
    let user_id: Uuid = user.get("id");
    let ext: String = user.get("external_subject");
    assert_eq!(ext, "ext-subject-oidc-1");
    assert!(
        user.get::<Option<Uuid>, _>("idp_id").is_some(),
        "user should be linked to the idp"
    );

    let role: String = sqlx::query_scalar(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(tenant.org_id)
    .bind(user_id)
    .fetch_one(&sup)
    .await
    .expect("membership provisioned");
    assert_eq!(role, "admin", "lab-admins group should map to admin");

    let audit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_events WHERE organization_id = $1 AND action = 'sso.login' AND actor_user_id = $2",
    )
    .bind(tenant.org_id)
    .bind(user_id)
    .fetch_one(&sup)
    .await
    .expect("audit query");
    assert_eq!(audit_count, 1, "sso.login should be audited");
}

#[tokio::test]
async fn oidc_default_role_when_no_group_matches() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let idp = MockServer::start().await;
    let issuer = idp.uri();
    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "issuer": issuer,
            "authorization_endpoint": format!("{issuer}/authorize"),
            "token_endpoint": format!("{issuer}/token"),
            "jwks_uri": format!("{issuer}/jwks"),
        })))
        .mount(&idp)
        .await;
    Mock::given(method("GET"))
        .and(path("/jwks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "keys": [{ "kty": "RSA", "use": "sig", "alg": "RS256", "kid": "test-key", "n": TEST_KEY_N, "e": "AQAB" }]
        })))
        .mount(&idp)
        .await;

    let secret_enc =
        qdesigner_server::api::sso::crypto::encrypt(HARNESS_JWT_SECRET, "oidc-secret").unwrap();
    sqlx::query(
        r#"
        INSERT INTO org_identity_providers
            (organization_id, protocol, display_name, issuer, metadata_url,
             client_id, client_secret_enc, default_role, group_claim,
             group_role_map, enforce_role_mapping, enabled)
        VALUES ($1, 'oidc', 'Test IdP', $2, $3, $4, $5, 'viewer', 'groups',
                $6::jsonb, false, true)
        "#,
    )
    .bind(tenant.org_id)
    .bind(&issuer)
    .bind(format!("{issuer}/.well-known/openid-configuration"))
    .bind(CLIENT_ID)
    .bind(&secret_enc)
    .bind(json!({ "lab-admins": "admin" }))
    .execute(&pool)
    .await
    .unwrap();

    let start_req = Request::builder()
        .method("GET")
        .uri(format!("/api/sso/{slug}/start"))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (_, headers, _) = send_full(&app, start_req).await;
    let location = headers
        .get("location")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let authorize = reqwest::Url::parse(&location).unwrap();
    let state_tok = authorize
        .query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string())
        .unwrap();
    let nonce = authorize
        .query_pairs()
        .find(|(k, _)| k == "nonce")
        .map(|(_, v)| v.to_string())
        .unwrap();

    // No matching group → falls back to default_role = viewer.
    let id_token = sign_id_token(
        &issuer,
        &nonce,
        "ext-subject-oidc-2",
        "sso.viewer@example.test",
        &["some-other-group"],
    );
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token_type": "Bearer",
            "id_token": id_token,
        })))
        .mount(&idp)
        .await;

    let cb_req = Request::builder()
        .method("GET")
        .uri(format!("/api/sso/callback?code=xyz&state={state_tok}"))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (status, _, _) = send_full(&app, cb_req).await;
    assert_eq!(status, StatusCode::SEE_OTHER);

    let sup = fixture_pool().await.expect("fixture pool");
    let role: String = sqlx::query_scalar(
        "SELECT om.role FROM organization_members om JOIN users u ON u.id = om.user_id WHERE u.email = $1 AND om.organization_id = $2",
    )
    .bind("sso.viewer@example.test")
    .bind(tenant.org_id)
    .fetch_one(&sup)
    .await
    .expect("membership provisioned");
    assert_eq!(role, "viewer", "no group match should use default_role");
}

/// F-27 interim: the admin CRUD refuses to CREATE a `protocol = 'saml'` IdP
/// (the SAML runtime is not built), so an org can't configure a provider that
/// silently can't complete login. An OIDC provider on the same org is still
/// accepted, proving the rejection is specific to SAML rather than a blanket
/// create failure.
#[tokio::test]
async fn create_saml_provider_is_rejected() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;

    let saml_body = json!({
        "protocol": "saml",
        "display_name": "Legacy SAML",
        "metadata_url": "https://idp.example.com/saml/metadata",
        "default_role": "member",
    });
    let (status, resp) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/sso", tenant.org_id),
        Some(&owner.token),
        Some(&saml_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "creating a saml IdP should be rejected: {resp:?}"
    );

    // Nothing was persisted for the rejected saml create.
    let sup = fixture_pool().await.expect("fixture pool");
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM org_identity_providers WHERE organization_id = $1",
    )
    .bind(tenant.org_id)
    .fetch_one(&sup)
    .await
    .expect("count providers");
    assert_eq!(count, 0, "no saml provider should have been persisted");

    // Control: an OIDC provider (no metadata_url → skips the reachability probe)
    // is still accepted on the same org.
    let oidc_body = json!({
        "protocol": "oidc",
        "display_name": "Acme OIDC",
        "metadata_url": null,
        "default_role": "member",
    });
    let (status, resp) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/sso", tenant.org_id),
        Some(&owner.token),
        Some(&oidc_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "an oidc IdP should still be accepted: {resp:?}"
    );
}
