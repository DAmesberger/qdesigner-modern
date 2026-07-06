//! E-RBAC-7 — API keys / service accounts, end to end.
//!
//! Provisions one tenant (owner → org + project + draft questionnaire), mints a
//! read-scoped API key (`session:read` + `response:read`), and proves the three
//! halves of the contract:
//!
//!   * The key AUTHENTICATES the machine surface: `GET /api/v1/questionnaires/
//!     {qid}/aggregate` returns 200 with just the `sk_` bearer (no human JWT).
//!   * Scopes are a real GATE: the same key is 403 on the write endpoint
//!     `POST /api/v1/organizations/{org}/members` (lacks `org:manage_members`).
//!   * Revocation is immediate: after `DELETE …/api-keys/{id}` the key 401s.

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[tokio::test]
async fn scoped_key_authenticates_respects_scope_and_401s_after_revoke() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;
    let qid = tenant.questionnaire_id;

    // ── Mint a read/export-scoped key ─────────────────────────────────
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/api-keys"),
        Some(&owner.token),
        Some(&serde_json::json!({
            "name": "export bot",
            "scopes": ["session:read", "response:read"],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create api key: {created:?}");
    let key = created["key"].as_str().expect("plaintext key").to_string();
    assert!(key.starts_with("sk_"), "token is an sk_ key: {key}");
    let key_id = created["api_key"]["id"]
        .as_str()
        .expect("key id")
        .to_string();
    // The plaintext must NOT be echoed back on the redacted record.
    assert!(created["api_key"].get("key_hash").is_none());

    // ── Authenticates the analytics read ──────────────────────────────
    let (status, agg) = json_request(
        &app,
        "GET",
        &format!("/api/v1/questionnaires/{qid}/aggregate?source=variable&key=score"),
        Some(&key),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "scoped key should read analytics: {agg:?}"
    );
    assert_eq!(agg["questionnaire_id"], serde_json::json!(qid.to_string()));

    // ── Out-of-scope mutation is denied ───────────────────────────────
    let (status, denied) = json_request(
        &app,
        "POST",
        &format!("/api/v1/organizations/{org}/members"),
        Some(&key),
        Some(&serde_json::json!({ "email": owner.email, "role": "member" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "read-only key must not mutate: {denied:?}"
    );

    // ── Revoke → the key stops authenticating ─────────────────────────
    let (status, _revoked) = json_request(
        &app,
        "DELETE",
        &format!("/api/organizations/{org}/api-keys/{key_id}"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revoke should succeed");

    let (status, after) = json_request(
        &app,
        "GET",
        &format!("/api/v1/questionnaires/{qid}/aggregate?source=variable&key=score"),
        Some(&key),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "revoked key must 401: {after:?}"
    );
}

#[tokio::test]
async fn expired_key_is_rejected() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;
    let qid = tenant.questionnaire_id;

    // Already-expired key (expiry one hour in the past).
    let past = (chrono::Utc::now() - chrono::Duration::hours(1)).to_rfc3339();
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/api-keys"),
        Some(&owner.token),
        Some(&serde_json::json!({
            "name": "stale",
            "scopes": ["session:read"],
            "expires_at": past,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create api key: {created:?}");
    let key = created["key"].as_str().expect("plaintext key").to_string();

    let (status, _json) = json_request(
        &app,
        "GET",
        &format!("/api/v1/questionnaires/{qid}/aggregate?source=variable&key=score"),
        Some(&key),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "expired key must 401");
}

#[tokio::test]
async fn create_rejects_unknown_and_empty_scopes() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/api-keys"),
        Some(&owner.token),
        Some(&serde_json::json!({ "name": "bogus", "scopes": ["not:a:scope"] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unknown scope rejected");

    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/api-keys"),
        Some(&owner.token),
        Some(&serde_json::json!({ "name": "empty", "scopes": [] })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "empty scope set rejected");
}

#[tokio::test]
async fn non_admin_cannot_mint_keys() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // A plain member (viewer tier) cannot mint keys.
    let member = register_user(&app).await;
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/members"),
        Some(&owner.token),
        Some(&serde_json::json!({ "email": member.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);

    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/api-keys"),
        Some(&member.token),
        Some(&serde_json::json!({ "name": "sneaky", "scopes": ["session:read"] })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "non-admin must not mint API keys"
    );
}
