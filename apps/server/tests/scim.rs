//! E-RBAC-7 — SCIM 2.0 provisioning, end to end.
//!
//! An owner mints a per-org SCIM bearer token, then a simulated directory
//! connector drives `/scim/v2/Users`:
//!
//!   * `POST /scim/v2/Users` provisions a brand-new account and an ACTIVE
//!     `organization_members` row (`source='scim'`).
//!   * `PATCH …/Users/{id}` with `active:false` SUSPENDS the member.
//!
//! Assertions cross-check both the SCIM view (the returned `active` flag) and the
//! first-class member listing (`status`), so the mapping is verified on both
//! sides of the seam.

use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

fn find_member<'a>(members: &'a serde_json::Value, email: &str) -> Option<&'a serde_json::Value> {
    members
        .as_array()?
        .iter()
        .find(|m| m["email"].as_str() == Some(email))
}

#[tokio::test]
async fn scim_create_adds_active_member_then_deactivate_suspends() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // ── Mint a SCIM token ─────────────────────────────────────────────
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/scim-tokens"),
        Some(&owner.token),
        Some(&serde_json::json!({ "name": "Okta prod" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "create scim token: {created:?}"
    );
    let scim_token = created["token"]
        .as_str()
        .expect("plaintext token")
        .to_string();
    assert!(scim_token.starts_with("scim_"), "token is a scim_ token");

    // ── SCIM create → active member ───────────────────────────────────
    let email = format!("scim-{}@directory.test", uuid::Uuid::new_v4());
    let (status, user) = json_request(
        &app,
        "POST",
        "/scim/v2/Users",
        Some(&scim_token),
        Some(&serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": email,
            "name": { "givenName": "Ada", "familyName": "Lovelace" },
            "active": true,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "scim create: {user:?}");
    let scim_id = user["id"].as_str().expect("scim user id").to_string();
    assert_eq!(user["active"], serde_json::json!(true));
    assert_eq!(user["userName"], serde_json::json!(email));

    // Cross-check against the first-class member listing.
    let (status, members) = json_request(
        &app,
        "GET",
        &format!("/api/organizations/{org}/members"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list members: {members:?}");
    let member = find_member(&members, &email).expect("provisioned member present");
    assert_eq!(
        member["status"],
        serde_json::json!("active"),
        "SCIM create yields an active member"
    );

    // ── SCIM deactivate → suspended ───────────────────────────────────
    let (status, patched) = json_request(
        &app,
        "PATCH",
        &format!("/scim/v2/Users/{scim_id}"),
        Some(&scim_token),
        Some(&serde_json::json!({
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [{ "op": "replace", "path": "active", "value": false }],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "scim patch: {patched:?}");
    assert_eq!(patched["active"], serde_json::json!(false));

    let (status, members) = json_request(
        &app,
        "GET",
        &format!("/api/organizations/{org}/members"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let member = find_member(&members, &email).expect("member still present");
    assert_eq!(
        member["status"],
        serde_json::json!("suspended"),
        "SCIM deactivate suspends the member"
    );

    // SCIM view agrees.
    let (status, got) = json_request(
        &app,
        "GET",
        &format!("/scim/v2/Users/{scim_id}"),
        Some(&scim_token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(got["active"], serde_json::json!(false));
}

#[tokio::test]
async fn scim_rejects_missing_and_disabled_tokens() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // No token → 401.
    let (status, _j) = json_request(&app, "GET", "/scim/v2/Users", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "missing token 401s");

    // Mint then revoke a token; it must then 401.
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/scim-tokens"),
        Some(&owner.token),
        Some(&serde_json::json!({ "name": "temp" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let scim_token = created["token"].as_str().unwrap().to_string();
    let token_id = created["scim_token"]["id"].as_str().unwrap().to_string();

    let (status, _j) = json_request(
        &app,
        "DELETE",
        &format!("/api/organizations/{org}/scim-tokens/{token_id}"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revoke scim token");

    let (status, _j) = json_request(&app, "GET", "/scim/v2/Users", Some(&scim_token), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "disabled token 401s");
}
