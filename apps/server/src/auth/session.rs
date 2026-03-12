use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

/// Store a refresh token's JTI so we can revoke it later.
pub async fn store_refresh_token(
    pool: &PgPool,
    user_id: Uuid,
    jti: Uuid,
    expires_at: chrono::DateTime<chrono::Utc>,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (jti, user_id, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(jti)
    .bind(user_id)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

/// Check whether a refresh JTI is still valid (exists and not revoked).
pub async fn is_refresh_token_valid(pool: &PgPool, jti: Uuid) -> Result<bool, ApiError> {
    let row = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM refresh_tokens
            WHERE jti = $1
              AND revoked = false
              AND expires_at > NOW()
        )
        "#,
    )
    .bind(jti)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Revoke a single refresh token by JTI.
pub async fn revoke_refresh_token(pool: &PgPool, jti: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        UPDATE refresh_tokens SET revoked = true WHERE jti = $1
        "#,
    )
    .bind(jti)
    .execute(pool)
    .await?;
    Ok(())
}

/// Revoke all refresh tokens for a user (e.g. on password change).
pub async fn revoke_all_user_tokens(pool: &PgPool, user_id: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        UPDATE refresh_tokens SET revoked = true WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Add an access token JTI to the revoked set (for logout).
pub async fn revoke_access_token(pool: &PgPool, jti: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO revoked_tokens (jti) VALUES ($1)
        ON CONFLICT (jti) DO NOTHING
        "#,
    )
    .bind(jti)
    .execute(pool)
    .await?;
    Ok(())
}

/// Check whether an access token JTI has been revoked.
pub async fn is_access_token_revoked(pool: &PgPool, jti: Uuid) -> Result<bool, ApiError> {
    let row = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)
        "#,
    )
    .bind(jti)
    .fetch_one(pool)
    .await?;
    Ok(row)
}
