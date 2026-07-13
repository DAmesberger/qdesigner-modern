//! Regression guards for three confirmed privilege-escalation holes (2026-07-12
//! audit). Each test asserts on **DB state**, not merely the status code, because
//! in all three the escalation lands as a row (or a row rewrite) that a 403/409
//! response alone would not disprove.
//!
//!   1. `create_invitation` gated on `OrgManageMembers` (the **Admin** tier) while
//!      accepting `role: "owner"` verbatim — an org admin could invite a colluding
//!      account as OWNER, escalating past the tier `add_member` /
//!      `change_member_role` enforce.
//!   2. `machine_add_member` (`POST /api/v1/organizations/{org}/members`) checked
//!      only the API key's *scopes*, never whether the key's creator is STILL an
//!      admin — so a key outlived its creator's demotion and kept
//!      member-provisioning power. `organization_members` INSERT is permissive
//!      under RLS (ADR 0013 D2a), so nothing else stopped it.
//!   3. SCIM `POST /scim/v2/Users` upserted with `ON CONFLICT DO UPDATE SET
//!      status = $3, source = 'scim'`, rewriting a hand-added member's row — which
//!      both suspended them AND re-labelled the row SCIM-owned, defeating the
//!      `source != 'scim'` guards the PATCH/PUT/DELETE paths rely on.

use axum::http::StatusCode;
use uuid::Uuid;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
};

/// Add `email` to `org` with `role` as the org owner. Asserts 201.
async fn add_member(app: &axum::Router, owner_token: &str, org: Uuid, email: &str, role: &str) {
    let (status, body) = json_request(
        app,
        "POST",
        &format!("/api/organizations/{org}/members"),
        Some(owner_token),
        Some(&serde_json::json!({ "email": email, "role": role })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "add {role} member: {body:?}");
}

// ── Vuln 1 — org admin minting an OWNER via invitation ───────────────

#[tokio::test]
async fn org_admin_cannot_invite_an_owner_but_an_owner_can() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // A second human, promoted to org ADMIN (the tier `OrgManageMembers` maps to).
    let admin = register_user(&app).await;
    add_member(&app, &owner.token, org, &admin.email, "admin").await;

    // The colluding account the admin would like to make an owner.
    let accomplice = format!("accomplice-{}@example.test", Uuid::new_v4());

    let (status, denied) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/invitations"),
        Some(&admin.token),
        Some(&serde_json::json!({ "email": accomplice, "role": "owner" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an org ADMIN must not be able to invite an OWNER: {denied:?}"
    );

    // DB state: the escalation must not have landed as a pending invitation —
    // `accept_invitation` applies the row's role verbatim, so a surviving row IS
    // the escalation regardless of the response code.
    let rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM organization_invitations WHERE organization_id = $1 AND email = $2",
    )
    .bind(org)
    .bind(&accomplice)
    .fetch_one(&pool)
    .await
    .expect("count invitations");
    assert_eq!(
        rows, 0,
        "no invitation row may be created by the denied call"
    );

    // Non-owner roles still work for an admin — the fix must not over-block.
    let colleague = format!("colleague-{}@example.test", Uuid::new_v4());
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/invitations"),
        Some(&admin.token),
        Some(&serde_json::json!({ "email": colleague, "role": "member" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "an admin may still invite a member: {created:?}"
    );

    // The OWNER may invite an owner.
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/invitations"),
        Some(&owner.token),
        Some(&serde_json::json!({ "email": accomplice, "role": "owner" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "an org OWNER may invite an owner: {created:?}"
    );

    let role: String = sqlx::query_scalar(
        "SELECT role FROM organization_invitations WHERE organization_id = $1 AND email = $2",
    )
    .bind(org)
    .bind(&accomplice)
    .fetch_one(&pool)
    .await
    .expect("owner-created invitation row");
    assert_eq!(
        role, "owner",
        "the owner's invitation carries the owner role"
    );
}

// ── Vuln 2 — API key outliving its creator's demotion ────────────────

#[tokio::test]
async fn api_key_loses_member_provisioning_when_creator_is_demoted() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // An org admin mints a member-provisioning key (legitimately — they are an
    // admin at mint time).
    let creator = register_user(&app).await;
    add_member(&app, &owner.token, org, &creator.email, "admin").await;

    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/api-keys"),
        Some(&creator.token),
        Some(&serde_json::json!({
            "name": "provisioning bot",
            "scopes": ["org:manage_members"],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "mint api key: {created:?}");
    let key = created["key"].as_str().expect("plaintext key").to_string();

    // While the creator IS an admin the key provisions members.
    let before = register_user(&app).await;
    let (status, ok) = json_request(
        &app,
        "POST",
        &format!("/api/v1/organizations/{org}/members"),
        Some(&key),
        Some(&serde_json::json!({ "email": before.email, "role": "member" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "key works while its creator is an admin: {ok:?}"
    );
    let landed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(before.id)
    .fetch_one(&pool)
    .await
    .expect("count members");
    assert_eq!(landed, 1, "the legitimate provisioning landed a member row");

    // The owner demotes the creator to viewer (below the Admin tier
    // `org:manage_members` needs). The KEY is untouched — not revoked, not
    // expired, still carrying the scope.
    let (status, demoted) = json_request(
        &app,
        "PUT",
        &format!("/api/organizations/{org}/members/{}/role", creator.id),
        Some(&owner.token),
        Some(&serde_json::json!({ "role": "viewer" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "demote creator to viewer: {demoted:?}"
    );

    // Same key, new target → must now be refused.
    let after = register_user(&app).await;
    let (status, denied) = json_request(
        &app,
        "POST",
        &format!("/api/v1/organizations/{org}/members"),
        Some(&key),
        Some(&serde_json::json!({ "email": after.email, "role": "admin" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "a key whose creator is no longer an admin must not provision members: {denied:?}"
    );

    // DB state: `organization_members` INSERT is permissive under RLS (ADR 0013
    // D2a), so the absence of the row is the only proof the write was stopped.
    let leaked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(after.id)
    .fetch_one(&pool)
    .await
    .expect("count members");
    assert_eq!(
        leaked, 0,
        "no organization_members row may appear for the target of the denied call"
    );
}

// ── Vuln 3 — SCIM hijacking / suspending a hand-added owner ──────────

#[tokio::test]
async fn scim_cannot_take_over_or_suspend_a_hand_added_owner() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let org = tenant.org_id;

    // A second, hand-added OWNER (source = 'manual' by the 00039 default).
    let coowner = register_user(&app).await;
    add_member(&app, &owner.token, org, &coowner.email, "owner").await;

    let (source, status_before, role_before): (String, String, String) = sqlx::query_as(
        "SELECT source, status, role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(coowner.id)
    .fetch_one(&pool)
    .await
    .expect("hand-added owner row");
    assert_eq!(source, "manual", "precondition: the row is hand-added");
    assert_eq!(status_before, "active");
    assert_eq!(role_before, "owner");

    // The directory connector.
    let (status, created) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{org}/scim-tokens"),
        Some(&owner.token),
        Some(&serde_json::json!({ "name": "Okta prod" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "mint scim token: {created:?}");
    let scim_token = created["token"].as_str().expect("scim token").to_string();

    // THE ATTACK: a SCIM create for the hand-added owner's email with
    // `active:false`. The old `ON CONFLICT DO UPDATE SET status = $3, source =
    // 'scim'` suspended the owner and claimed the row for the connector.
    let (status, hijack) = json_request(
        &app,
        "POST",
        "/scim/v2/Users",
        Some(&scim_token),
        Some(&serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": coowner.email,
            "active": false,
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "SCIM must refuse to write a member row it did not provision: {hijack:?}"
    );

    // DB state: the owner's row is untouched on every axis the upsert used to
    // rewrite.
    let (source, status_after, role_after): (String, String, String) = sqlx::query_as(
        "SELECT source, status, role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(coowner.id)
    .fetch_one(&pool)
    .await
    .expect("owner row still present");
    assert_eq!(source, "manual", "SCIM must not claim a hand-added row");
    assert_eq!(
        status_after, "active",
        "SCIM must not suspend a hand-added owner"
    );
    assert_eq!(role_after, "owner", "the owner keeps their role");

    // The follow-up hijack step (now that the row would have been SCIM-labelled)
    // is refused too.
    let (status, _j) = json_request(
        &app,
        "DELETE",
        &format!("/scim/v2/Users/{}", coowner.id),
        Some(&scim_token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "SCIM DELETE on a hand-added owner is refused"
    );
    let status_final: String = sqlx::query_scalar(
        "SELECT status FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(coowner.id)
    .fetch_one(&pool)
    .await
    .expect("owner row still present");
    assert_eq!(
        status_final, "active",
        "owner still active after SCIM DELETE"
    );

    // Legitimate SCIM behaviour is preserved: provisioning a NEW member works and
    // the connector owns that row.
    let fresh = format!("scim-{}@directory.test", Uuid::new_v4());
    let (status, user) = json_request(
        &app,
        "POST",
        "/scim/v2/Users",
        Some(&scim_token),
        Some(&serde_json::json!({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "userName": fresh,
            "active": true,
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "scim create still works: {user:?}"
    );
    let fresh_id = user["id"]
        .as_str()
        .and_then(|s| Uuid::parse_str(s).ok())
        .expect("scim user id");
    let (source, status_row): (String, String) = sqlx::query_as(
        "SELECT source, status FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(fresh_id)
    .fetch_one(&pool)
    .await
    .expect("scim-provisioned row");
    assert_eq!(source, "scim");
    assert_eq!(status_row, "active");

    // …and the connector can still deactivate the member it provisioned.
    let (status, _j) = json_request(
        &app,
        "DELETE",
        &format!("/scim/v2/Users/{fresh_id}"),
        Some(&scim_token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NO_CONTENT,
        "scim deprovision still works"
    );
    let status_row: String = sqlx::query_scalar(
        "SELECT status FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org)
    .bind(fresh_id)
    .fetch_one(&pool)
    .await
    .expect("scim row");
    assert_eq!(status_row, "suspended");
}
