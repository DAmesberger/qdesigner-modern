use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;
use crate::storage::s3::S3StorageService;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MediaAsset {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub filename: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub storage_key: String,
    pub uploaded_by: Uuid,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize)]
pub struct MediaAssetWithUrl {
    #[serde(flatten)]
    pub asset: MediaAsset,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct MediaListQuery {
    pub organization_id: Uuid,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/media
pub async fn list_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(q): Query<MediaListQuery>,
) -> Result<Json<Vec<MediaAsset>>, ApiError> {
    // Verify org membership
    if !state
        .rbac
        .has_org_role(
            user.user_id,
            q.organization_id,
            &crate::rbac::models::OrgRole::Viewer,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Not a member of this organization".into()));
    }

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let assets = sqlx::query_as::<_, MediaAsset>(
        r#"
        SELECT id, organization_id, filename, content_type, size_bytes,
               storage_key, uploaded_by, created_at
        FROM media_assets
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(q.organization_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(assets))
}

/// POST /api/media  (multipart upload)
pub async fn upload_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    mut multipart: Multipart,
) -> Result<(axum::http::StatusCode, Json<MediaAssetWithUrl>), ApiError> {
    let mut organization_id: Option<Uuid> = None;
    let mut file_data: Option<(String, Vec<u8>, String)> = None; // (filename, bytes, content_type)

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Multipart error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "organization_id" => {
                let text = field
                    .text()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("Invalid field: {e}")))?;
                organization_id =
                    Some(text.parse().map_err(|_| ApiError::BadRequest("Invalid UUID".into()))?);
            }
            "file" => {
                let filename = field
                    .file_name()
                    .unwrap_or("upload.bin")
                    .to_string();
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("File read error: {e}")))?;
                file_data = Some((filename, bytes.to_vec(), content_type));
            }
            _ => {} // ignore unknown fields
        }
    }

    let org_id =
        organization_id.ok_or_else(|| ApiError::BadRequest("organization_id is required".into()))?;
    let (filename, bytes, content_type) =
        file_data.ok_or_else(|| ApiError::BadRequest("file is required".into()))?;

    // Verify write access
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Member)
        .await?
    {
        return Err(ApiError::Forbidden("No write access".into()));
    }

    let size_bytes = bytes.len() as i64;
    let storage_key = S3StorageService::generate_key(org_id, &filename);

    // Upload to S3
    state
        .storage
        .upload(&storage_key, bytes, &content_type)
        .await?;

    // Store metadata in DB
    let asset = sqlx::query_as::<_, MediaAsset>(
        r#"
        INSERT INTO media_assets (organization_id, filename, content_type, size_bytes,
                                  storage_key, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, organization_id, filename, content_type, size_bytes,
                  storage_key, uploaded_by, created_at
        "#,
    )
    .bind(org_id)
    .bind(&filename)
    .bind(&content_type)
    .bind(size_bytes)
    .bind(&storage_key)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    let url = state
        .storage
        .presigned_url(&storage_key, Duration::from_secs(3600))
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(MediaAssetWithUrl { asset, url }),
    ))
}

/// GET /api/media/:id — returns a presigned URL.
pub async fn get_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(media_id): Path<Uuid>,
) -> Result<Json<MediaAssetWithUrl>, ApiError> {
    let asset = sqlx::query_as::<_, MediaAsset>(
        r#"
        SELECT id, organization_id, filename, content_type, size_bytes,
               storage_key, uploaded_by, created_at
        FROM media_assets WHERE id = $1
        "#,
    )
    .bind(media_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Media asset not found".into()))?;

    // Verify org access
    if !state
        .rbac
        .has_org_role(
            user.user_id,
            asset.organization_id,
            &crate::rbac::models::OrgRole::Viewer,
        )
        .await?
    {
        return Err(ApiError::Forbidden("No access to this asset".into()));
    }

    let url = state
        .storage
        .presigned_url(&asset.storage_key, Duration::from_secs(3600))
        .await?;

    Ok(Json(MediaAssetWithUrl { asset, url }))
}

/// DELETE /api/media/:id
pub async fn delete_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(media_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let asset = sqlx::query_as::<_, MediaAsset>(
        r#"
        SELECT id, organization_id, filename, content_type, size_bytes,
               storage_key, uploaded_by, created_at
        FROM media_assets WHERE id = $1
        "#,
    )
    .bind(media_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Media asset not found".into()))?;

    // Must be uploader or org admin
    let is_uploader = asset.uploaded_by == user.user_id;
    let is_admin = state
        .rbac
        .has_org_role(
            user.user_id,
            asset.organization_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?;

    if !is_uploader && !is_admin {
        return Err(ApiError::Forbidden("Cannot delete this asset".into()));
    }

    // Delete from S3
    state.storage.delete(&asset.storage_key).await?;

    // Delete from DB
    sqlx::query("DELETE FROM media_assets WHERE id = $1")
        .bind(media_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Media deleted" })))
}
