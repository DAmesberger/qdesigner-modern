use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::state::AppState;

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct UserProfile {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub timezone: Option<String>,
    pub locale: Option<String>,
    pub email_verified: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateProfileRequest {
    #[validate(length(min = 1, max = 255))]
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub timezone: Option<String>,
    pub locale: Option<String>,
}

/// GET /api/users/me
#[utoipa::path(
    get,
    path = "/api/users/me",
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Current user profile", body = UserProfile),
        (status = 404, description = "User not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["users"]
)]
pub async fn get_profile(user: AuthenticatedUser, tx: Tx) -> Result<Json<UserProfile>, ApiError> {
    let mut tx = tx.tx().await?;

    let profile = sqlx::query_as::<_, UserProfile>(
        r#"
        SELECT id, email, full_name, avatar_url, timezone, locale, email_verified, created_at
        FROM users WHERE id = $1
        "#,
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    Ok(Json(profile))
}

/// PATCH /api/users/me
#[utoipa::path(
    patch,
    path = "/api/users/me",
    request_body = UpdateProfileRequest,
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Updated user profile", body = UserProfile),
        (status = 400, description = "No fields to update", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["users"]
)]
pub async fn update_profile(
    user: AuthenticatedUser,
    tx: Tx,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<Json<UserProfile>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Build dynamic UPDATE
    let mut sets: Vec<String> = Vec::new();
    let mut idx = 2u32; // $1 is user_id

    if body.full_name.is_some() {
        sets.push(format!("full_name = ${idx}"));
        idx += 1;
    }
    if body.avatar_url.is_some() {
        sets.push(format!("avatar_url = ${idx}"));
        idx += 1;
    }
    if body.timezone.is_some() {
        sets.push(format!("timezone = ${idx}"));
        idx += 1;
    }
    if body.locale.is_some() {
        sets.push(format!("locale = ${idx}"));
        // idx not needed after last
    }

    if sets.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }

    sets.push("updated_at = NOW()".into());

    let sql = format!(
        "UPDATE users SET {} WHERE id = $1 RETURNING id, email, full_name, avatar_url, timezone, locale, email_verified, created_at",
        sets.join(", ")
    );

    let mut query = sqlx::query_as::<_, UserProfile>(&sql).bind(user.user_id);

    if let Some(ref v) = body.full_name {
        query = query.bind(v);
    }
    if let Some(ref v) = body.avatar_url {
        query = query.bind(v);
    }
    if let Some(ref v) = body.timezone {
        query = query.bind(v);
    }
    if let Some(ref v) = body.locale {
        query = query.bind(v);
    }

    let mut tx = tx.tx().await?;

    let profile = query
        .fetch_one(&mut **tx)
        .await
        .map_err(|_| ApiError::Internal("Failed to update profile".into()))?;

    Ok(Json(profile))
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct DeleteAccountRequest {
    /// Current account password, re-confirmed to authorize the erasure.
    #[validate(length(max = 128))]
    pub password: String,
}

/// Sentinel written into `users.password_hash` on account deletion.
///
/// Deliberately NOT a valid Argon2/PHC string, so `verify_password` can
/// never succeed against it — `PasswordHash::new` fails to parse it and the
/// verify path returns an error rather than `Ok(true)`. Defense in depth on
/// top of `deleted_at IS NOT NULL`, which the login/reset queries already
/// filter, so an anonymized row can never be reached for authentication.
const DELETED_PASSWORD_SENTINEL: &str = "!account-deleted-no-login";

/// DELETE /api/users/me — self-service account deletion (GDPR erasure).
///
/// Password-confirmed. Blocks (409) while the caller still owns any
/// organization that has other active members — they must transfer
/// ownership first. Otherwise: soft-deletes organizations where the caller
/// was the sole member, removes the caller's memberships, and anonymizes
/// the `users` row (PII scrubbed, `deleted_at` set). Research
/// sessions/responses are retained **pseudonymously** — the `user_id` link
/// is left intact so longitudinal/aggregate analysis survives while the
/// personal data on the users row is erased. Refresh tokens are revoked
/// after the request transaction commits.
#[utoipa::path(
    delete,
    path = "/api/users/me",
    request_body = DeleteAccountRequest,
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Account deleted and anonymized", body = crate::openapi::MessageResponse),
        (status = 401, description = "Password incorrect", body = crate::openapi::ErrorEnvelope),
        (status = 409, description = "Still owns shared organization(s); transfer ownership first", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["users"]
)]
pub async fn delete_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Json(body): Json<DeleteAccountRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let mut tx = tx.tx().await?;

    // (1) Re-confirm the caller's password. A missing/absent hash cannot be
    // confirmed, so it fails closed as an auth error.
    let stored_hash: Option<String> =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
            .bind(user.user_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let stored_hash =
        stored_hash.ok_or_else(|| ApiError::Unauthorized("Password incorrect".into()))?;
    if !crate::auth::password::verify_password(&body.password, &stored_hash)? {
        return Err(ApiError::Unauthorized("Password incorrect".into()));
    }

    // (2) Guard: block while the caller still owns any org that has other
    // active members. Naming them lets the UI point the user at the
    // transfer-ownership flow.
    let shared_owned: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT o.name
        FROM organizations o
        JOIN organization_members m
          ON m.organization_id = o.id AND m.user_id = $1 AND m.role = 'owner'
        WHERE o.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM organization_members m2
              WHERE m2.organization_id = o.id
                AND m2.user_id <> $1
                AND m2.status = 'active'
          )
        ORDER BY o.name
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&mut **tx)
    .await?;

    if !shared_owned.is_empty() {
        return Err(ApiError::Conflict(format!(
            "Transfer ownership before deleting your account. You still own: {}",
            shared_owned.join(", ")
        )));
    }

    // (3a) Soft-delete organizations where the caller is the sole member.
    // Computed BEFORE the membership DELETE so the "no other member" check
    // still sees the real membership set.
    sqlx::query(
        r#"
        UPDATE organizations o
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE o.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM organization_members m
              WHERE m.organization_id = o.id AND m.user_id = $1
          )
          AND NOT EXISTS (
              SELECT 1 FROM organization_members m2
              WHERE m2.organization_id = o.id AND m2.user_id <> $1
          )
        "#,
    )
    .bind(user.user_id)
    .execute(&mut **tx)
    .await?;

    // (3b) Remove all of the caller's memberships.
    sqlx::query("DELETE FROM organization_members WHERE user_id = $1")
        .bind(user.user_id)
        .execute(&mut **tx)
        .await?;

    // (3c) Anonymize the users row — scrub PII, set the sentinel hash and
    // deleted_at. Sessions/responses are intentionally left untouched
    // (pseudonymous retention).
    sqlx::query(
        r#"
        UPDATE users
        SET email = $2,
            full_name = NULL,
            avatar_url = NULL,
            password_hash = $3,
            deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(user.user_id)
    .bind(format!("deleted-{}@anonymized.invalid", user.user_id))
    .bind(DELETED_PASSWORD_SENTINEL)
    .execute(&mut **tx)
    .await?;

    // Release the tx guard; the middleware commits it on the success return.
    drop(tx);

    // (4) Revoke all refresh tokens on the pool (outside the RLS tx), matching
    // the auth.rs password-change / reset pattern. Running this inside the
    // request tx would scope it to the wrong connection.
    crate::auth::session::revoke_all_user_tokens(&state.pool, user.user_id).await?;

    Ok(Json(serde_json::json!({ "message": "Account deleted" })))
}
