use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize, sqlx::FromRow)]
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

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateProfileRequest {
    #[validate(length(min = 1, max = 255))]
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub timezone: Option<String>,
    pub locale: Option<String>,
}

/// GET /api/users/me
pub async fn get_profile(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<UserProfile>, ApiError> {
    let profile = sqlx::query_as::<_, UserProfile>(
        r#"
        SELECT id, email, full_name, avatar_url, timezone, locale, email_verified, created_at
        FROM users WHERE id = $1
        "#,
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    Ok(Json(profile))
}

/// PATCH /api/users/me
pub async fn update_profile(
    State(state): State<AppState>,
    user: AuthenticatedUser,
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

    let profile = query
        .fetch_one(&state.pool)
        .await
        .map_err(|_| ApiError::Internal("Failed to update profile".into()))?;

    Ok(Json(profile))
}
