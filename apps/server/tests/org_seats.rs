//! E-RBAC-4 — org seat model.
//!
//! Asserts that `organizations::seat_usage` counts seats correctly:
//! a "seat" is an active organization member OR a pending invitation.
//! The configured limit is read from `organizations.settings->>'seatLimit'`
//! and is null (unlimited) when unset.
//!
//! Uses the migration DSN (qdesigner superuser) for fixture INSERTs so the
//! setup is not subject to RLS, matching the pattern in `rls_enforcement.rs`.

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

async fn seed_user(pool: &PgPool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("seat-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("seed user")
}

#[tokio::test]
async fn seat_usage_counts_active_members_and_pending_invitations() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    // Org with a seat limit of 3.
    let org_id: Uuid = sqlx::query_scalar(
        r#"INSERT INTO organizations (name, slug, settings)
           VALUES ('Seat Co', $1, '{"seatLimit": 3}'::jsonb) RETURNING id"#,
    )
    .bind(format!("seat-co-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .expect("seed org");

    // Two active members.
    for _ in 0..2 {
        let uid = seed_user(&pool).await;
        sqlx::query(
            "INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
             VALUES ($1, $2, 'member', 'active', NOW())",
        )
        .bind(org_id)
        .bind(uid)
        .execute(&pool)
        .await
        .expect("seed active member");
    }

    // One suspended member — must NOT count toward seats.
    let suspended = seed_user(&pool).await;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'member', 'suspended', NOW())",
    )
    .bind(org_id)
    .bind(suspended)
    .execute(&pool)
    .await
    .expect("seed suspended member");

    // One pending invitation (unaccepted, unexpired) — counts as a reserved seat.
    let inviter = seed_user(&pool).await;
    sqlx::query(
        "INSERT INTO organization_invitations (organization_id, email, role, invited_by, expires_at)
         VALUES ($1, $2, 'member', $3, NOW() + INTERVAL '7 days')",
    )
    .bind(org_id)
    .bind(format!("invitee-{}@test.local", Uuid::new_v4()))
    .bind(inviter)
    .execute(&pool)
    .await
    .expect("seed pending invitation");

    // One expired invitation — must NOT count (a stale invite frees its seat).
    sqlx::query(
        "INSERT INTO organization_invitations (organization_id, email, role, invited_by, expires_at)
         VALUES ($1, $2, 'member', $3, NOW() - INTERVAL '1 day')",
    )
    .bind(org_id)
    .bind(format!("expired-{}@test.local", Uuid::new_v4()))
    .bind(inviter)
    .execute(&pool)
    .await
    .expect("seed expired invitation");

    let mut conn = pool.acquire().await.expect("acquire");
    let (limit, active, pending) =
        qdesigner_server::api::organizations::seat_usage(&mut conn, org_id)
            .await
            .expect("seat_usage");

    assert_eq!(limit, Some(3), "seat limit read from settings");
    assert_eq!(active, 2, "only active members count");
    assert_eq!(pending, 1, "pending invitation reserves a seat");
    assert_eq!(
        active + pending,
        3,
        "used seats == limit (next add is blocked)"
    );
}

#[tokio::test]
async fn seat_usage_returns_null_limit_when_unset() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no test DB");
        return;
    };

    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug) VALUES ('No Limit Co', $1) RETURNING id",
    )
    .bind(format!("nolimit-{}", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .expect("seed org");

    let mut conn = pool.acquire().await.expect("acquire");
    let (limit, active, pending) =
        qdesigner_server::api::organizations::seat_usage(&mut conn, org_id)
            .await
            .expect("seat_usage");

    assert_eq!(limit, None, "no seatLimit configured -> unlimited");
    assert_eq!(active, 0);
    assert_eq!(pending, 0);
}
