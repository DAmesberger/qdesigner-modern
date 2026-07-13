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
//!
//! The `federated_identity_binding_*` tests are the regression lock for the
//! SSO account-takeover fix: an org's IdP may only bind a federated identity to
//! a local account when the id_token asserts `email_verified` AND the email's
//! domain is a VERIFIED `organization_domains` row of that IdP's own org.
//! Both the LINK (pre-existing local account) and PROVISION (new account)
//! paths are gated; the flow fails closed.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use serde_json::json;
use sqlx::{PgPool, Row};
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

/// Claims for the minted id_token. Split out so the binding tests can vary
/// `email` / `email_verified` independently of the happy path.
struct IdToken<'a> {
    issuer: &'a str,
    nonce: &'a str,
    subject: &'a str,
    email: &'a str,
    email_verified: bool,
    groups: &'a [&'a str],
}

fn sign_id_token(t: IdToken<'_>) -> String {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    let now = Utc::now().timestamp();
    let claims = json!({
        "iss": t.issuer,
        "aud": CLIENT_ID,
        "sub": t.subject,
        "email": t.email,
        "email_verified": t.email_verified,
        "name": "Federated User",
        "groups": t.groups,
        "nonce": t.nonce,
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

/// Mock OIDC provider with discovery + JWKS mounted. `/token` is mounted later,
/// once the nonce from `start` is known.
async fn mock_provider() -> (MockServer, String) {
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

    (idp, issuer)
}

/// Seed an enabled OIDC IdP for `org_id` pointing at the mock provider.
async fn seed_idp(
    pool: &PgPool,
    org_id: Uuid,
    issuer: &str,
    default_role: &str,
    group_role_map: serde_json::Value,
    enforce_role_mapping: bool,
) {
    let secret_enc =
        qdesigner_server::api::sso::crypto::encrypt(HARNESS_JWT_SECRET, "oidc-secret").unwrap();
    sqlx::query(
        r#"
        INSERT INTO org_identity_providers
            (organization_id, protocol, display_name, issuer, metadata_url,
             client_id, client_secret_enc, default_role, group_claim,
             group_role_map, enforce_role_mapping, enabled)
        VALUES ($1, 'oidc', 'Test IdP', $2, $3, $4, $5, $6, 'groups',
                $7::jsonb, $8, true)
        "#,
    )
    .bind(org_id)
    .bind(issuer)
    .bind(format!("{issuer}/.well-known/openid-configuration"))
    .bind(CLIENT_ID)
    .bind(&secret_enc)
    .bind(default_role)
    .bind(group_role_map)
    .bind(enforce_role_mapping)
    .execute(pool)
    .await
    .expect("seed idp");
}

/// Claim `domain` for `org_id`. `verified` drives `verified_at` — an unverified
/// row is a domain the org merely *asserted*, which must NOT authorize its IdP.
async fn seed_domain(pool: &PgPool, org_id: Uuid, domain: &str, verified: bool) {
    sqlx::query(
        "INSERT INTO organization_domains (organization_id, domain, verified_at)
         VALUES ($1, $2, CASE WHEN $3 THEN now() ELSE NULL END)",
    )
    .bind(org_id)
    .bind(domain)
    .bind(verified)
    .execute(pool)
    .await
    .expect("seed domain");
}

/// Drive `GET /api/sso/{slug}/start` and pull the CSRF `state` + `nonce` out of
/// the authorize redirect.
async fn start_flow(app: &axum::Router, slug: &str) -> (String, String) {
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/sso/{slug}/start"))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = send_full(app, req).await;
    assert_eq!(status, StatusCode::SEE_OTHER, "start should 303");
    let location = headers
        .get("location")
        .and_then(|v| v.to_str().ok())
        .expect("start Location header")
        .to_string();
    let authorize = reqwest::Url::parse(&location).expect("authorize url");
    let param = |k: &str| {
        authorize
            .query_pairs()
            .find(|(key, _)| key == k)
            .map(|(_, v)| v.to_string())
            .unwrap_or_else(|| panic!("{k} param"))
    };
    (param("state"), param("nonce"))
}

async fn mount_token_endpoint(idp: &MockServer, id_token: String) {
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "opaque-access",
            "token_type": "Bearer",
            "expires_in": 3600,
            "id_token": id_token,
        })))
        .mount(idp)
        .await;
}

async fn callback(
    app: &axum::Router,
    state_tok: &str,
) -> (StatusCode, axum::http::HeaderMap, serde_json::Value) {
    let req = Request::builder()
        .method("GET")
        .uri(format!(
            "/api/sso/callback?code=auth-code-123&state={state_tok}"
        ))
        .header("host", "qdesigner.test")
        .body(Body::empty())
        .unwrap();
    send_full(app, req).await
}

/// A local (password) account, seeded straight into `users` so it is
/// unmistakably NOT federated: `idp_id` / `external_subject` NULL and
/// `email_verified = false`.
async fn seed_local_user(sup: &PgPool, email: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, full_name, password_hash, email_verified)
         VALUES ($1, $2, 'Victim', 'argon2-placeholder', false)",
    )
    .bind(id)
    .bind(email)
    .execute(sup)
    .await
    .expect("seed local user");
    id
}

/// The `users` columns a takeover would have to rewrite.
struct UserBinding {
    idp_id: Option<Uuid>,
    external_subject: Option<String>,
    email_verified: bool,
}

async fn read_binding(sup: &PgPool, user_id: Uuid) -> UserBinding {
    let row =
        sqlx::query("SELECT idp_id, external_subject, email_verified FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(sup)
            .await
            .expect("user row");
    UserBinding {
        idp_id: row.get("idp_id"),
        external_subject: row.get("external_subject"),
        email_verified: row.get("email_verified"),
    }
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

    let (idp, issuer) = mock_provider().await;
    seed_idp(
        &pool,
        tenant.org_id,
        &issuer,
        "member",
        json!({ "lab-admins": "admin" }),
        true,
    )
    .await;
    // The IdP is authorized for its org's verified domain.
    seed_domain(&pool, tenant.org_id, "example.test", true).await;

    let (state_tok, nonce) = start_flow(&app, &slug).await;

    let id_token = sign_id_token(IdToken {
        issuer: &issuer,
        nonce: &nonce,
        subject: "ext-subject-oidc-1",
        email: "sso.federated@example.test",
        email_verified: true,
        groups: &["lab-admins"],
    });
    mount_token_endpoint(&idp, id_token).await;

    // ── callback: 303 back to the app with a session ──
    let (status, headers, _) = callback(&app, &state_tok).await;
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

    let (idp, issuer) = mock_provider().await;
    seed_idp(
        &pool,
        tenant.org_id,
        &issuer,
        "viewer",
        json!({ "lab-admins": "admin" }),
        false,
    )
    .await;
    seed_domain(&pool, tenant.org_id, "example.test", true).await;

    let (state_tok, nonce) = start_flow(&app, &slug).await;

    // No matching group → falls back to default_role = viewer.
    let id_token = sign_id_token(IdToken {
        issuer: &issuer,
        nonce: &nonce,
        subject: "ext-subject-oidc-2",
        email: "sso.viewer@example.test",
        email_verified: true,
        groups: &["some-other-group"],
    });
    mount_token_endpoint(&idp, id_token).await;

    let (status, _, _) = callback(&app, &state_tok).await;
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

// ── Federated-identity binding gate (SSO account-takeover regression lock) ──

/// (a) THE TAKEOVER PoC. Org A runs an IdP. It asserts an id_token for
/// `victim@other.example` — a pre-existing LOCAL account in a domain org A does
/// not own. Pre-fix this silently rewrote the victim's `users` row
/// (`idp_id`/`external_subject` set, `email_verified` forced true) and handed
/// org A's IdP a session as the victim. It must now be rejected, and — the real
/// regression lock — the victim's row must be byte-for-byte untouched.
#[tokio::test]
async fn federated_identity_binding_rejects_takeover_of_foreign_domain_account() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);
    let sup = fixture_pool().await.expect("fixture pool");

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let (idp, issuer) = mock_provider().await;
    seed_idp(&pool, tenant.org_id, &issuer, "admin", json!({}), false).await;
    // The attacker org has ONLY proven it owns `attacker.example`.
    seed_domain(&pool, tenant.org_id, "attacker.example", true).await;

    // The victim: a local account in an unrelated domain the attacker org does
    // not own. Not federated, email not verified.
    let victim_email = format!("victim-{}@other.example", Uuid::new_v4());
    let victim_id = seed_local_user(&sup, &victim_email).await;

    let (state_tok, nonce) = start_flow(&app, &slug).await;
    let id_token = sign_id_token(IdToken {
        issuer: &issuer,
        nonce: &nonce,
        subject: "attacker-controlled-subject",
        email: &victim_email, // ← the IdP asserts the victim's address
        email_verified: true, // ← and even claims it verified it
        groups: &[],
    });
    mount_token_endpoint(&idp, id_token).await;

    let (status, headers, _) = callback(&app, &state_tok).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an IdP must not authenticate an email domain its org has not verified"
    );
    assert!(
        extract_cookie(&headers, "qd_session").is_none(),
        "no session may be minted for a rejected federated binding"
    );

    // ── The regression lock: the victim's row is UNCHANGED. ──
    let after = read_binding(&sup, victim_id).await;
    assert_eq!(
        after.idp_id, None,
        "victim must NOT have been linked to the attacker's idp"
    );
    assert_eq!(
        after.external_subject, None,
        "victim must NOT carry the attacker-controlled external_subject"
    );
    assert!(
        !after.email_verified,
        "victim's email_verified must NOT have been force-set by the IdP"
    );

    // No membership was granted in the attacker's org either.
    let members: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(tenant.org_id)
    .bind(victim_id)
    .fetch_one(&sup)
    .await
    .expect("membership count");
    assert_eq!(members, 0, "no membership may be provisioned on rejection");
}

/// (b) `email_verified: false` → rejected. The IdP itself says it has not
/// verified the address, so it may neither link nor provision — even inside a
/// domain the org HAS verified.
#[tokio::test]
async fn federated_identity_binding_rejects_unverified_email_claim() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);
    let sup = fixture_pool().await.expect("fixture pool");

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let (idp, issuer) = mock_provider().await;
    seed_idp(&pool, tenant.org_id, &issuer, "member", json!({}), false).await;
    seed_domain(&pool, tenant.org_id, "verified.example", true).await;

    let email = format!("unverified-{}@verified.example", Uuid::new_v4());
    let (state_tok, nonce) = start_flow(&app, &slug).await;
    let id_token = sign_id_token(IdToken {
        issuer: &issuer,
        nonce: &nonce,
        subject: "subject-unverified-email",
        email: &email,
        email_verified: false, // ← the only thing wrong
        groups: &[],
    });
    mount_token_endpoint(&idp, id_token).await;

    let (status, headers, _) = callback(&app, &state_tok).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an unverified email claim must not bind a federated identity"
    );
    assert!(
        extract_cookie(&headers, "qd_session").is_none(),
        "no session may be minted for an unverified email claim"
    );

    let provisioned: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE email = $1")
        .bind(&email)
        .fetch_one(&sup)
        .await
        .expect("count users");
    assert_eq!(
        provisioned, 0,
        "no account may be provisioned from an unverified email claim"
    );
}

/// (c) The domain row EXISTS for the org but `verified_at IS NULL` — the org
/// merely asserted it. Claiming a domain must not be enough; only proving it is.
#[tokio::test]
async fn federated_identity_binding_rejects_unverified_org_domain() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);
    let sup = fixture_pool().await.expect("fixture pool");

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let (idp, issuer) = mock_provider().await;
    seed_idp(&pool, tenant.org_id, &issuer, "member", json!({}), false).await;
    // Claimed, never verified.
    seed_domain(&pool, tenant.org_id, "pending.example", false).await;

    let email = format!("user-{}@pending.example", Uuid::new_v4());
    let (state_tok, nonce) = start_flow(&app, &slug).await;
    let id_token = sign_id_token(IdToken {
        issuer: &issuer,
        nonce: &nonce,
        subject: "subject-pending-domain",
        email: &email,
        email_verified: true,
        groups: &[],
    });
    mount_token_endpoint(&idp, id_token).await;

    let (status, headers, _) = callback(&app, &state_tok).await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an unverified (merely claimed) org domain must not authorize the IdP"
    );
    assert!(
        extract_cookie(&headers, "qd_session").is_none(),
        "no session may be minted against an unverified org domain"
    );

    let provisioned: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE email = $1")
        .bind(&email)
        .fetch_one(&sup)
        .await
        .expect("count users");
    assert_eq!(
        provisioned, 0,
        "no account may be provisioned against an unverified org domain"
    );
}

/// (d) HAPPY PATH — proves the gate did not just break SSO. `email_verified` +
/// an email inside a VERIFIED domain of the IdP's own org → the pre-existing
/// local account is LINKED (the legitimate form of the operation the takeover
/// PoC abuses) and the login succeeds.
#[tokio::test]
async fn federated_identity_binding_links_local_account_in_verified_domain() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no database");
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);
    let sup = fixture_pool().await.expect("fixture pool");

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&pool)
        .await
        .unwrap();

    let (idp, issuer) = mock_provider().await;
    seed_idp(&pool, tenant.org_id, &issuer, "member", json!({}), false).await;
    // The org has PROVEN it owns this domain.
    seed_domain(&pool, tenant.org_id, "owned.example", true).await;

    // A pre-existing local account inside that owned domain — a real employee
    // who signed up with a password before SSO was turned on.
    let staff_email = format!("staff-{}@owned.example", Uuid::new_v4());
    let staff_id = seed_local_user(&sup, &staff_email).await;

    let (state_tok, nonce) = start_flow(&app, &slug).await;
    let id_token = sign_id_token(IdToken {
        issuer: &issuer,
        nonce: &nonce,
        subject: "legit-subject-1",
        email: &staff_email,
        email_verified: true,
        groups: &[],
    });
    mount_token_endpoint(&idp, id_token).await;

    let (status, headers, _) = callback(&app, &state_tok).await;
    assert_eq!(
        status,
        StatusCode::SEE_OTHER,
        "a verified email in a verified org domain must complete login: {:?}",
        headers.get("location")
    );
    assert!(
        extract_cookie(&headers, "qd_session").is_some(),
        "the happy path must mint a session"
    );

    // The account was linked to the IdP (same UPDATE the PoC abuses, now legit).
    let after = read_binding(&sup, staff_id).await;
    assert!(
        after.idp_id.is_some(),
        "the local account should now be linked to the org's idp"
    );
    assert_eq!(
        after.external_subject.as_deref(),
        Some("legit-subject-1"),
        "the federated subject should be bound to the account"
    );
    assert!(
        after.email_verified,
        "linking through a verified domain marks the email verified"
    );

    let role: String = sqlx::query_scalar(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(tenant.org_id)
    .bind(staff_id)
    .fetch_one(&sup)
    .await
    .expect("membership provisioned");
    assert_eq!(role, "member", "default_role applies with no group match");
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
