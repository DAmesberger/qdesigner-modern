//! P8-T10 — self-service account deletion (GDPR erasure path).
//!
//! Drives `DELETE /api/users/me` end-to-end through the real router
//! (register → provision org → delete), and inspects the resulting DB
//! state via the superuser fixture pool. Covers:
//!
//!  (a) sole-owner-of-a-shared-org → 409 (transfer ownership first), and
//!      the caller's row is left intact.
//!  (b) wrong password → 401; correct password → 200, membership removed,
//!      the sole-member org soft-deleted, and the users row anonymized
//!      (PII scrubbed, deleted_at set, login blocked).

use axum::http::StatusCode;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
};

/// (a) A caller who owns an org that has another active member must be
/// blocked with 409 and left un-anonymized.
#[tokio::test]
async fn owner_of_shared_org_is_blocked_with_409() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state);

    // Owner + their org.
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;

    // A second, unrelated user seeded as an active member of the same org
    // (superuser pool bypasses the seat/RLS path — this is fixture setup).
    let other = register_user(&app).await;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) \
         VALUES ($1, $2, 'member', 'active')",
    )
    .bind(tenant.org_id)
    .bind(other.id)
    .execute(&fixtures)
    .await
    .expect("seed co-member");

    let body = serde_json::json!({ "password": "demo123456" });
    let (status, json) = json_request(
        &app,
        "DELETE",
        "/api/users/me",
        Some(&owner.token),
        Some(&body),
    )
    .await;

    assert_eq!(status, StatusCode::CONFLICT, "expected 409, got {json:?}");

    // Caller must be untouched: still active, PII intact.
    let deleted_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM users WHERE id = $1")
            .bind(owner.id)
            .fetch_one(&fixtures)
            .await
            .expect("load owner row");
    assert!(
        deleted_at.is_none(),
        "owner must not be anonymized on the 409 path"
    );

    // Cleanup so repeated runs stay clean.
    let _ = sqlx::query("DELETE FROM organization_members WHERE organization_id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
}

/// (b) Wrong password → 401. Correct password → 200 + anonymization of a
/// solo-org user.
#[tokio::test]
async fn solo_owner_deletes_and_is_anonymized() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state);

    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let user_id = user.id;

    // Wrong password first → 401, no state change.
    let wrong = serde_json::json!({ "password": "not-the-password" });
    let (status, _) = json_request(
        &app,
        "DELETE",
        "/api/users/me",
        Some(&user.token),
        Some(&wrong),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "wrong password → 401");

    let still_here: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&fixtures)
            .await
            .expect("load user row after 401");
    assert!(still_here.is_none(), "401 must not anonymize");

    // Correct password → 200.
    let ok = serde_json::json!({ "password": "demo123456" });
    let (status, json) = json_request(
        &app,
        "DELETE",
        "/api/users/me",
        Some(&user.token),
        Some(&ok),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "correct password → 200, got {json:?}"
    );

    // Memberships removed.
    let membership_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM organization_members WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&fixtures)
            .await
            .expect("count memberships");
    assert_eq!(membership_count, 0, "memberships must be removed");

    // Sole-member org soft-deleted.
    let org_deleted_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM organizations WHERE id = $1")
            .bind(tenant.org_id)
            .fetch_one(&fixtures)
            .await
            .expect("load org row");
    assert!(
        org_deleted_at.is_some(),
        "sole-member org must be soft-deleted"
    );

    // Users row anonymized.
    let (email, full_name, avatar_url, deleted_at): (
        String,
        Option<String>,
        Option<String>,
        Option<chrono::DateTime<chrono::Utc>>,
    ) = sqlx::query_as("SELECT email, full_name, avatar_url, deleted_at FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&fixtures)
        .await
        .expect("load anonymized user");

    assert!(
        email.starts_with("deleted-") && email.ends_with("@anonymized.invalid"),
        "email must be anonymized, got {email}"
    );
    assert!(full_name.is_none(), "full_name must be scrubbed");
    assert!(avatar_url.is_none(), "avatar_url must be scrubbed");
    assert!(deleted_at.is_some(), "deleted_at must be set");

    // The anonymized row must not re-authenticate: the login query filters
    // deleted_at IS NULL, so login by the anonymized email returns 401.
    let login = serde_json::json!({ "email": email, "password": "demo123456" });
    let (login_status, _) = json_request(&app, "POST", "/api/auth/login", None, Some(&login)).await;
    assert_eq!(
        login_status,
        StatusCode::UNAUTHORIZED,
        "anonymized row must not re-authenticate"
    );

    // Cleanup residue (org row) — user row is intentionally retained.
    let _ = sqlx::query("UPDATE organizations SET deleted_at = deleted_at WHERE id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
}

/// (c) F-25: an org with the departing owner (active) + one *non-active*
/// (invited/pending) member must be treated as sole-member. The owner-guard
/// (filters `status='active'`) already lets the delete through with 200; the
/// soft-delete's "no other member" check must *also* ignore the non-active
/// member so the org is soft-deleted rather than left ownerless-but-active.
#[tokio::test]
async fn departing_owner_with_only_non_active_member_soft_deletes_org() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;

    // A second user seeded as an *invited* (non-active) member of the org.
    let invited = register_user(&app).await;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) \
         VALUES ($1, $2, 'member', 'invited')",
    )
    .bind(tenant.org_id)
    .bind(invited.id)
    .execute(&fixtures)
    .await
    .expect("seed invited (non-active) member");

    // The owner-guard must pass (no *active* other member) → delete succeeds.
    let body = serde_json::json!({ "password": "demo123456" });
    let (status, json) = json_request(
        &app,
        "DELETE",
        "/api/users/me",
        Some(&owner.token),
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "expected 200, got {json:?}");

    // The consistency fix: the org must be soft-deleted, not left active with a
    // lingering non-active member and no owner.
    let org_deleted_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM organizations WHERE id = $1")
            .bind(tenant.org_id)
            .fetch_one(&fixtures)
            .await
            .expect("load org row");
    assert!(
        org_deleted_at.is_some(),
        "org with only a non-active co-member must be soft-deleted (F-25)"
    );

    // Cleanup: the invited member row survived the owner's membership DELETE
    // (only the caller's memberships are removed); drop it so reruns stay clean.
    let _ = sqlx::query("DELETE FROM organization_members WHERE organization_id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
}
