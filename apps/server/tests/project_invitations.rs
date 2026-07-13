//! ADR 0033 (Unit 3) — the `project_invitations` flow: invite an email to
//! collaborate on ONE project; accepting lands a (possibly cross-org)
//! `project_members` row.
//!
//! Driven end-to-end through the app-role (`qdesigner_app`, non-BYPASSRLS)
//! harness so the handler gates AND the Unit-1 study-data RLS branches are
//! under test together.
//!
//! Assertions:
//!   (a) a project admin invites an email; it shows in the pending list.
//!   (b) a DIFFERENT-org user (not an org-A member) whose email matches
//!       accepts → a `project_members` row appears (cross-org membership via
//!       the invite) and they can then READ that project — tying to Unit-1.
//!   (c) expired / revoked / wrong-email accepts are all rejected (404), and
//!       the token never confers membership in those cases.
//!   (d) a non-admin (project viewer, and a plain non-member) cannot create an
//!       invitation (403).

use axum::http::StatusCode;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
    TestUser,
};

/// Read the token for an outstanding invitation directly (the create response
/// carries it too, but reading via the fixture pool lets tests that seed
/// expired rows share one lookup shape).
async fn invitation_token_for(project_id: uuid::Uuid, email: &str) -> uuid::Uuid {
    let pool = fixture_pool().await.expect("fixture pool");
    sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT token FROM project_invitations WHERE project_id = $1 AND email = $2 \
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(email)
    .fetch_one(&pool)
    .await
    .expect("invitation token")
}

/// Create an invitation as `inviter` and return its token (from the response).
async fn create_invite(
    app: &axum::Router,
    inviter: &TestUser,
    project_id: uuid::Uuid,
    email: &str,
    role: &str,
) -> uuid::Uuid {
    let (status, body) = json_request(
        app,
        "POST",
        &format!("/api/projects/{project_id}/invitations"),
        Some(&inviter.token),
        Some(&serde_json::json!({ "email": email, "role": role })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create invitation: {body:?}");
    body["token"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("token in create response")
}

#[tokio::test]
async fn project_invitation_accept_lands_cross_org_member() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);

    // Owner A: org A + project P.
    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let p = a.project_id;

    // User B: member of org B ONLY — NOT an org-A member.
    let user_b = register_user(&app).await;
    let _b = provision_tenant(&app, &user_b.token).await;

    // Baseline: B cannot read P before any membership.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "B denied P pre-invite");

    // (a) A (project owner ⇒ admin tier) invites B's email as editor.
    let token = create_invite(&app, &user_a, p, &user_b.email, "editor").await;

    // It appears in the pending list.
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}/invitations"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list invitations: {list:?}");
    assert_eq!(
        list.as_array().map(|a| a.len()),
        Some(1),
        "one pending invitation: {list:?}"
    );

    // Public token lookup works and echoes the invited email/role.
    let (status, detail) = json_request(
        &app,
        "GET",
        &format!("/api/project-invitations/{token}"),
        None,
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "get invitation by token: {detail:?}"
    );
    assert_eq!(detail["email"].as_str(), Some(user_b.email.as_str()));
    assert_eq!(detail["role"].as_str(), Some("editor"));
    assert_eq!(detail["status"].as_str(), Some("pending"));

    // (b) B accepts → cross-org project membership.
    let (status, accepted) = json_request(
        &app,
        "POST",
        &format!("/api/project-invitations/{token}/accept"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "B accepts invitation: {accepted:?}");

    // A `project_members` row now exists for B on P.
    if let Some(pool) = fixture_pool().await {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND user_id = $2 AND role = 'editor'",
        )
        .bind(p)
        .bind(user_b.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            count, 1,
            "accept must land an editor project_members row for B"
        );
    }

    // B (not an org-A member) can now READ P — tie to Unit-1 cross-org read.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "cross-org member reads P post-accept"
    );

    // The invitation is now marked accepted and no longer pending.
    let (status, list) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}/invitations"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        list.as_array().map(|a| a.len()),
        Some(0),
        "no pending invitations after accept: {list:?}"
    );

    // Re-accepting the now-accepted token is rejected (idempotent, no double).
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/project-invitations/{token}/accept"),
        Some(&user_b.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "re-accepting a consumed invitation is rejected"
    );
}

#[tokio::test]
async fn project_invitation_rejects_wrong_email_expired_and_revoked() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let p = a.project_id;

    // ── Wrong-email accept ──────────────────────────────────────────────
    let intended = register_user(&app).await;
    let attacker = register_user(&app).await;
    let token = create_invite(&app, &user_a, p, &intended.email, "viewer").await;

    // A different logged-in user (email mismatch) cannot accept.
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/project-invitations/{token}/accept"),
        Some(&attacker.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "wrong-email accept must be rejected"
    );
    if let Some(pool) = fixture_pool().await {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND user_id = $2",
        )
        .bind(p)
        .bind(attacker.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 0, "wrong-email accept must not create membership");
    }

    // ── Expired accept ──────────────────────────────────────────────────
    let expired_user = register_user(&app).await;
    let _t = create_invite(&app, &user_a, p, &expired_user.email, "viewer").await;
    // Backdate the expiry via the fixture (superuser) pool.
    {
        let pool = fixture_pool().await.expect("fixture pool");
        sqlx::query(
            "UPDATE project_invitations SET expires_at = NOW() - INTERVAL '1 day' \
             WHERE project_id = $1 AND email = $2",
        )
        .bind(p)
        .bind(&expired_user.email)
        .execute(&pool)
        .await
        .expect("backdate expiry");
    }
    let expired_token = invitation_token_for(p, &expired_user.email).await;
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/project-invitations/{expired_token}/accept"),
        Some(&expired_user.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "expired accept must be rejected"
    );

    // ── Revoked accept ──────────────────────────────────────────────────
    let revoked_user = register_user(&app).await;
    let revoke_token = create_invite(&app, &user_a, p, &revoked_user.email, "viewer").await;
    // Find the invitation id for the revoke route.
    let inv_id = {
        let pool = fixture_pool().await.expect("fixture pool");
        sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM project_invitations WHERE token = $1")
            .bind(revoke_token)
            .fetch_one(&pool)
            .await
            .expect("invitation id")
    };
    let (status, _j) = json_request(
        &app,
        "DELETE",
        &format!("/api/projects/{p}/invitations/{inv_id}"),
        Some(&user_a.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "admin revokes invitation");
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/project-invitations/{revoke_token}/accept"),
        Some(&revoked_user.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "revoked accept must be rejected"
    );
    if let Some(pool) = fixture_pool().await {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND user_id = $2",
        )
        .bind(p)
        .bind(revoked_user.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 0, "revoked accept must not create membership");
    }
}

#[tokio::test]
async fn non_admin_cannot_create_project_invitation() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state);

    let user_a = register_user(&app).await;
    let a = provision_tenant(&app, &user_a.token).await;
    let p = a.project_id;

    // A plain non-member cannot invite (403).
    let outsider = register_user(&app).await;
    let target = register_user(&app).await;
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/invitations"),
        Some(&outsider.token),
        Some(&serde_json::json!({ "email": target.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "non-member cannot invite");

    // A VIEWER project member cannot invite either (ManageMembers is Admin tier).
    let viewer = register_user(&app).await;
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/members"),
        Some(&user_a.token),
        Some(&serde_json::json!({ "email": viewer.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "seed viewer member");
    let (status, _j) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{p}/invitations"),
        Some(&viewer.token),
        Some(&serde_json::json!({ "email": target.email, "role": "viewer" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "project viewer cannot create invitations"
    );

    // And a viewer cannot list them.
    let (status, _j) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{p}/invitations"),
        Some(&viewer.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "project viewer cannot list invitations"
    );
}
