use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Json,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::state::AppState;
use crate::storage::s3::S3StorageService;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
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

#[derive(Debug, Serialize, ToSchema)]
pub struct MediaAssetWithUrl {
    #[serde(flatten)]
    pub asset: MediaAsset,
    pub url: String,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct MediaListQuery {
    pub organization_id: Uuid,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[allow(dead_code)]
#[derive(Debug, ToSchema)]
pub struct MediaUploadRequest {
    pub organization_id: Uuid,
    #[schema(value_type = String, format = Binary)]
    pub file: String,
}

// ── Upload validation ────────────────────────────────────────────────

/// Maximum accepted upload size (bytes). Kept just under the per-route
/// `DefaultBodyLimit` so the body layer rejects gross oversends before we
/// buffer, and this check catches anything that slips through.
pub const MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024; // 25 MiB

/// Validate an uploaded blob before it reaches S3.
///
/// Enforces (in order): a hard size cap; a magic-byte sniff via `infer`;
/// membership of the sniffed type in the image/audio/video allowlist; and
/// consistency between the sniffed type and the client-declared
/// `content_type`. Returns the canonical `(mime, extension)` derived from
/// the sniffed bytes — never from the untrusted filename or declared header.
///
/// This is the ONLY content gate on the anonymous `upload_session_media`
/// path (no JWT), so it must be self-contained.
pub fn validate_upload(
    bytes: &[u8],
    declared_content_type: &str,
) -> Result<(String, String), ApiError> {
    if bytes.is_empty() {
        return Err(ApiError::BadRequest("Uploaded file is empty".into()));
    }
    if bytes.len() > MAX_UPLOAD_BYTES {
        return Err(ApiError::BadRequest(format!(
            "File too large: {} bytes exceeds the {} byte limit",
            bytes.len(),
            MAX_UPLOAD_BYTES
        )));
    }

    let kind =
        infer::get(bytes).ok_or_else(|| ApiError::BadRequest("Unrecognized file type".into()))?;

    let sniffed_mime = kind.mime_type();
    let matcher = kind.matcher_type();
    let is_allowed = matches!(
        matcher,
        infer::MatcherType::Image | infer::MatcherType::Audio | infer::MatcherType::Video
    );
    if !is_allowed {
        return Err(ApiError::BadRequest(format!(
            "File type not allowed: {sniffed_mime}"
        )));
    }

    // The declared header must agree with the sniffed content. Compare on the
    // essence (ignore parameters like "; charset=") and accept the common
    // `application/octet-stream` default as "unspecified" only when it is the
    // literal generic value — a mismatched concrete type is rejected.
    let declared_essence = declared_content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let declared_ok = declared_essence == sniffed_mime
        || declared_essence == "application/octet-stream"
        || declared_essence.is_empty();
    if !declared_ok {
        return Err(ApiError::BadRequest(format!(
            "Declared content type '{declared_essence}' does not match sniffed type '{sniffed_mime}'"
        )));
    }

    Ok((sniffed_mime.to_string(), kind.extension().to_string()))
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/media
#[utoipa::path(
    get,
    path = "/api/media",
    params(MediaListQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Media assets in an organization", body = [MediaAsset]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn list_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Query(q): Query<MediaListQuery>,
) -> Result<Json<Vec<MediaAsset>>, ApiError> {
    let mut tx = tx.tx().await?;

    // Verify org membership
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            q.organization_id,
            &crate::rbac::models::OrgRole::Viewer,
        )
        .await?
    {
        return Err(ApiError::Forbidden(
            "Not a member of this organization".into(),
        ));
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
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(assets))
}

/// POST /api/media  (multipart upload)
#[utoipa::path(
    post,
    path = "/api/media",
    request_body(content = MediaUploadRequest, content_type = "multipart/form-data"),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Media asset uploaded", body = MediaAssetWithUrl),
        (status = 400, description = "Invalid upload request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn upload_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
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
                organization_id = Some(
                    text.parse()
                        .map_err(|_| ApiError::BadRequest("Invalid UUID".into()))?,
                );
            }
            "file" => {
                let filename = field.file_name().unwrap_or("upload.bin").to_string();
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

    let org_id = organization_id
        .ok_or_else(|| ApiError::BadRequest("organization_id is required".into()))?;
    let (filename, bytes, content_type) =
        file_data.ok_or_else(|| ApiError::BadRequest("file is required".into()))?;

    // Same content gate as the anonymous path: size cap + magic-byte
    // allowlist. Use the canonical sniffed mime for storage/DB.
    let (canonical_mime, _ext) = validate_upload(&bytes, &content_type)?;
    let content_type = canonical_mime;

    let mut tx = tx.tx().await?;

    // Verify write access
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Member,
        )
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
    .fetch_one(&mut **tx)
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
#[utoipa::path(
    get,
    path = "/api/media/{id}",
    params(
        ("id" = Uuid, Path, description = "Media asset id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Media asset with a presigned URL", body = MediaAssetWithUrl),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Media asset not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn get_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(media_id): Path<Uuid>,
) -> Result<Json<MediaAssetWithUrl>, ApiError> {
    let mut tx = tx.tx().await?;

    let asset = sqlx::query_as::<_, MediaAsset>(
        r#"
        SELECT id, organization_id, filename, content_type, size_bytes,
               storage_key, uploaded_by, created_at
        FROM media_assets WHERE id = $1
        "#,
    )
    .bind(media_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Media asset not found".into()))?;

    // Verify org access
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
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

/// GET /api/media/:id/content — same-origin streaming proxy (contract D1).
///
/// Streams the S3 object bytes on the API origin instead of redirecting to
/// an expiring presigned MinIO URL. This is what fixes cross-origin WebGL
/// texture taint, COEP `require-corp` on the fillout route, and the
/// Cache-API keying problem (a presigned URL expires and re-issues, so it
/// can't be a durable cache key).
///
/// Authorization is by RLS admission, mirroring the by-code anonymous-read
/// posture (ADR 0012/0015): this route runs under `set_fillout_rls_context`
/// (optional JWT), and the `SELECT` below is admitted either by the 00014
/// `media_assets_select` org-member policy (authenticated project member)
/// or by the 00025 `media_assets_select_via_published_questionnaire` policy
/// (asset referenced by a published questionnaire — anonymous fillout). A
/// non-admitted row simply isn't returned → 404.
///
/// Honors a single `Range` (`bytes=start-end`) by passing it through to S3
/// and replying `206` with `Content-Range`; otherwise `200` full body.
/// The response carries `Content-Type` (from the stored mime), an `ETag`
/// (the immutable storage key), `Accept-Ranges: bytes`, and
/// `Cache-Control: public, max-age=31536000, immutable`.
#[utoipa::path(
    get,
    path = "/api/media/{id}/content",
    params(
        ("id" = Uuid, Path, description = "Media asset id")
    ),
    responses(
        (status = 200, description = "Media object bytes", content_type = "application/octet-stream"),
        (status = 206, description = "Partial media object bytes (range request)", content_type = "application/octet-stream"),
        (status = 404, description = "Media asset not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn stream_media_content(
    State(state): State<AppState>,
    tx: Tx,
    Path(media_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    // Look the asset up inside the fillout RLS transaction. Admission by
    // the OR-merged SELECT policies decides visibility; a hidden row
    // resolves to 404, which is exactly the anonymous-authz behaviour we
    // want. The guard is scoped so the tx lock is released before the S3
    // stream is set up (and before the middleware commits the read-only tx).
    let asset = {
        let mut tx = tx.tx().await?;

        sqlx::query_as::<_, MediaAsset>(
            r#"
            SELECT id, organization_id, filename, content_type, size_bytes,
                   storage_key, uploaded_by, created_at
            FROM media_assets WHERE id = $1
            "#,
        )
        .bind(media_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Media asset not found".into()))?
    };

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let object = state
        .storage
        .get_object(&asset.storage_key, range.as_deref())
        .await?;

    // Build a streaming Body directly over the S3 ByteStream — the object
    // is never fully buffered in memory. `ByteStream::next` yields
    // `Result<Bytes, _>` chunks; `unfold` threads the stream as state.
    let body = Body::from_stream(futures_util::stream::unfold(
        object.body,
        |mut stream| async move { stream.next().await.map(|chunk| (chunk, stream)) },
    ));

    // The storage key is immutable and unique per asset → a stable, strong
    // cache validator.
    let etag = format!("\"{}\"", asset.storage_key);

    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, asset.content_type.as_str())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ETAG, etag)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable");

    // S3 populates content_range only when it actually served a range.
    let is_partial = range.is_some() && object.content_range.is_some();
    if is_partial {
        builder = builder.status(StatusCode::PARTIAL_CONTENT);
        if let Some(cr) = object.content_range.as_deref() {
            builder = builder.header(header::CONTENT_RANGE, cr);
        }
        if let Some(len) = object.content_length {
            builder = builder.header(header::CONTENT_LENGTH, len);
        }
    } else {
        builder = builder.status(StatusCode::OK);
        // Prefer S3's authoritative length for the bytes actually streamed;
        // fall back to the DB size only when S3 omits it. Using the DB value in
        // preference would truncate/hang the connection if the row's size_bytes
        // ever diverges from the real object (e.g. replaced out-of-band).
        let len = object
            .content_length
            .filter(|&n| n > 0)
            .unwrap_or(asset.size_bytes);
        builder = builder.header(header::CONTENT_LENGTH, len);
    }

    builder
        .body(body)
        .map_err(|e| ApiError::Internal(format!("Failed to build media response: {e}")))
}

/// DELETE /api/media/:id
#[utoipa::path(
    delete,
    path = "/api/media/{id}",
    params(
        ("id" = Uuid, Path, description = "Media asset id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Media asset deleted", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Media asset not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn delete_media(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(media_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    let asset = sqlx::query_as::<_, MediaAsset>(
        r#"
        SELECT id, organization_id, filename, content_type, size_bytes,
               storage_key, uploaded_by, created_at
        FROM media_assets WHERE id = $1
        "#,
    )
    .bind(media_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Media asset not found".into()))?;

    // Must be uploader or org admin
    let is_uploader = asset.uploaded_by == user.user_id;
    let is_admin = state
        .rbac
        .has_org_role(
            &mut **tx,
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
        .execute(&mut **tx)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Media deleted" })))
}

// ── Session-scoped anonymous media upload ────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct SessionMediaAsset {
    pub id: Uuid,
    pub session_id: Uuid,
    pub filename: String,
    pub s3_key: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SessionMediaWithUrl {
    #[serde(flatten)]
    pub asset: SessionMediaAsset,
    pub url: String,
}

#[allow(dead_code)]
#[derive(Debug, ToSchema)]
pub struct SessionMediaUploadRequest {
    #[schema(value_type = String, format = Binary)]
    pub file: String,
}

/// POST /api/sessions/:id/media — anonymous multipart upload scoped to a session.
/// No JWT required; validates the session exists and is active.
#[utoipa::path(
    post,
    path = "/api/sessions/{id}/media",
    request_body(content = SessionMediaUploadRequest, content_type = "multipart/form-data"),
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 201, description = "Session-scoped media uploaded", body = SessionMediaWithUrl),
        (status = 400, description = "Invalid upload request", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn upload_session_media(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<(axum::http::StatusCode, Json<SessionMediaWithUrl>), ApiError> {
    // Validate session exists and is active
    let session_status =
        sqlx::query_scalar::<_, String>("SELECT status FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if session_status != "active" {
        return Err(ApiError::BadRequest("Session is not active".into()));
    }

    // Extract the file from multipart
    let mut file_data: Option<(String, Vec<u8>, String)> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Multipart error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("upload.bin").to_string();
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
    }

    let (filename, bytes, content_type) =
        file_data.ok_or_else(|| ApiError::BadRequest("file is required".into()))?;

    // Content gate: size cap + magic-byte allowlist. This is the only
    // validation on the anonymous path, so it runs before we touch S3. The
    // returned mime/ext come from the sniffed bytes, never the client input.
    let (canonical_mime, ext) = validate_upload(&bytes, &content_type)?;

    let size_bytes = bytes.len() as i64;
    let file_id = Uuid::new_v4();
    // Drop the untrusted client filename from the S3 key entirely; it is kept
    // only in the DB `filename` column for display.
    let s3_key = format!("sessions/{session_id}/media/{file_id}.{ext}");

    // Upload to S3
    state
        .storage
        .upload(&s3_key, bytes, &canonical_mime)
        .await?;

    // Store metadata in DB
    let asset = sqlx::query_as::<_, SessionMediaAsset>(
        r#"
        INSERT INTO session_media (session_id, filename, s3_key, content_type, size_bytes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, session_id, filename, s3_key, content_type, size_bytes, created_at
        "#,
    )
    .bind(session_id)
    .bind(&filename)
    .bind(&s3_key)
    .bind(&canonical_mime)
    .bind(size_bytes)
    .fetch_one(&state.pool)
    .await?;

    let url = state
        .storage
        .presigned_url(&s3_key, Duration::from_secs(3600))
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(SessionMediaWithUrl { asset, url }),
    ))
}

#[cfg(test)]
mod validate_upload_tests {
    use super::*;

    // 8-byte PNG signature followed by a minimal IHDR chunk header so the
    // sniffer has enough to work with.
    fn png_bytes() -> Vec<u8> {
        let mut b = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        b.extend_from_slice(&[0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R']);
        b.extend_from_slice(&[0u8; 32]);
        b
    }

    // MP3 with an ID3v2 tag header — infer recognizes this as audio/mpeg.
    fn mp3_bytes() -> Vec<u8> {
        let mut b = vec![b'I', b'D', b'3', 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        b.extend_from_slice(&[0u8; 32]);
        b
    }

    #[test]
    fn accepts_real_png_with_matching_declared_type() {
        let (mime, ext) = validate_upload(&png_bytes(), "image/png").expect("png should pass");
        assert_eq!(mime, "image/png");
        assert_eq!(ext, "png");
    }

    #[test]
    fn accepts_png_with_generic_octet_stream_declared() {
        let (mime, ext) =
            validate_upload(&png_bytes(), "application/octet-stream").expect("png should pass");
        assert_eq!(mime, "image/png");
        assert_eq!(ext, "png");
    }

    #[test]
    fn accepts_real_mp3() {
        let (mime, ext) = validate_upload(&mp3_bytes(), "audio/mpeg").expect("mp3 should pass");
        assert_eq!(mime, "audio/mpeg");
        assert_eq!(ext, "mp3");
    }

    #[test]
    fn rejects_text_renamed_as_png() {
        // Plain text has no magic signature — the sniffer returns None even
        // though the client called it a .png / image/png.
        let err = validate_upload(b"just some plain text, not an image", "image/png")
            .expect_err("text must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_declared_type_mismatch() {
        // Real PNG bytes but the client lies about the type.
        let err = validate_upload(&png_bytes(), "audio/mpeg")
            .expect_err("declared/sniffed mismatch must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_disallowed_type() {
        // A PDF sniffs as application/pdf — not in the image/audio/video
        // allowlist.
        let pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        let err = validate_upload(pdf, "application/pdf").expect_err("pdf must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_oversize() {
        let mut big = png_bytes();
        big.resize(MAX_UPLOAD_BYTES + 1, 0);
        let err = validate_upload(&big, "image/png").expect_err("oversize must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_empty() {
        let err = validate_upload(&[], "image/png").expect_err("empty must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }
}
