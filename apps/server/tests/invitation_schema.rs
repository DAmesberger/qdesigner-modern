//! Regression guard for the `organization_invitations` schema/handler contract.
//!
//! The table was created in 00001 without `token`, `status`, `custom_message`,
//! or `declined_at`, yet every invitation handler in `api/organizations.rs`
//! references them — so create/list/accept/decline/revoke all 500'd at runtime
//! (surfaced in M7-E live-QA as a `column i.token does not exist` 500 on the
//! signup invite check). 00036 adds the columns. These tests run the exact
//! query shapes the handlers use, so a future schema drift fails here instead
//! of in production.
//!
//! Uses the migration DSN (qdesigner superuser) for fixture INSERTs so the
//! setup is not subject to RLS, matching `org_seats.rs` / `rls_enforcement.rs`.

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

async fn seed_org_and_user(pool: &PgPool) -> (Uuid, Uuid) {
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("inv-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("seed user");

    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug) VALUES ('Invite Co', $1) RETURNING id",
    )
    .bind(format!("invite-co-{}", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("seed org");

    (org_id, user_id)
}

/// The exact `create_invitation` INSERT...RETURNING must resolve every column
/// the handler asks for, and the DB defaults must supply `token` (a Uuid) and
/// `status` = 'pending' since the INSERT column list omits them.
#[tokio::test]
async fn create_invitation_insert_returns_token_and_pending_status() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };
    let (org_id, user_id) = seed_org_and_user(&pool).await;

    let row: (
        Uuid,           // id
        Uuid,           // organization_id
        String,         // email
        String,         // role
        Uuid,           // token
        String,         // status
        Option<Uuid>,   // invited_by
        Option<String>, // custom_message
    ) = sqlx::query_as(
        r#"
        INSERT INTO organization_invitations
            (organization_id, email, role, invited_by, expires_at, custom_message)
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days', $5)
        RETURNING id, organization_id, email, role, token, status, invited_by, custom_message
        "#,
    )
    .bind(org_id)
    .bind("invitee@test.example")
    .bind("member")
    .bind(user_id)
    .bind("welcome aboard")
    .fetch_one(&pool)
    .await
    .expect("create_invitation INSERT...RETURNING must succeed");

    assert_eq!(row.1, org_id);
    assert_eq!(row.2, "invitee@test.example");
    assert_eq!(row.3, "member");
    assert_ne!(
        row.4,
        Uuid::nil(),
        "token default must generate a real uuid"
    );
    assert_eq!(row.5, "pending", "status default must be 'pending'");
    assert_eq!(row.6, Some(user_id));
    assert_eq!(row.7.as_deref(), Some("welcome aboard"));

    // Cleanup.
    let _ = sqlx::query("DELETE FROM organization_invitations WHERE id = $1")
        .bind(row.0)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM organizations WHERE id = $1")
        .bind(org_id)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&pool)
        .await;
}

/// The `list_pending_invitations` SELECT projects `i.token`, `i.status`,
/// `i.custom_message`, and `i.declined_at` — all four must exist so the query
/// resolves (the runtime 500 was `column i.token does not exist`).
#[tokio::test]
async fn list_pending_select_resolves_all_projected_columns() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };
    let (org_id, user_id) = seed_org_and_user(&pool).await;

    let inv_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO organization_invitations
               (organization_id, email, role, invited_by, expires_at, custom_message)
           VALUES ($1, $2, 'member', $3, NOW() + INTERVAL '7 days', 'hi')
           RETURNING id"#,
    )
    .bind(org_id)
    .bind("listme@test.example")
    .bind(user_id)
    .fetch_one(&pool)
    .await
    .expect("seed invitation");

    // Mirror the handler projection (aliased join → just assert columns exist).
    let found: (
        Uuid,
        Uuid,
        String,
        String,
        Option<String>,
        Option<chrono::DateTime<chrono::Utc>>,
    ) = sqlx::query_as(
        r#"
            SELECT i.id, i.token, i.status, i.email, i.custom_message, i.declined_at
            FROM organization_invitations i
            WHERE i.email = $1 AND i.status = 'pending' AND i.expires_at > NOW()
            "#,
    )
    .bind("listme@test.example")
    .fetch_one(&pool)
    .await
    .expect("list_pending SELECT must resolve i.token/i.status/i.custom_message/i.declined_at");

    assert_eq!(found.0, inv_id);
    assert_ne!(found.1, Uuid::nil());
    assert_eq!(found.2, "pending");
    assert_eq!(found.4.as_deref(), Some("hi"));
    assert!(
        found.5.is_none(),
        "declined_at is null for a pending invite"
    );

    // Cleanup.
    let _ = sqlx::query("DELETE FROM organization_invitations WHERE id = $1")
        .bind(inv_id)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM organizations WHERE id = $1")
        .bind(org_id)
        .execute(&pool)
        .await;
    let _ = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&pool)
        .await;
}
