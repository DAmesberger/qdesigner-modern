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
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
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
    /// Intrinsic pixel width for image assets; NULL for non-images or
    /// headers that could not be parsed (F-8).
    pub width: Option<i32>,
    /// Intrinsic pixel height for image assets; NULL for non-images or
    /// headers that could not be parsed (F-8).
    pub height: Option<i32>,
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

/// Bounded set of non-media document mimes accepted in addition to the
/// image/audio/video matcher classes (issue #48, ADR 0029 binary answers).
///
/// Gated by *exact sniffed mime* — never by matcher class — so the set stays
/// auditable and can't widen to sibling formats. `infer` reports PDF and zip
/// as `MatcherType::Archive` and the OOXML office formats as
/// `MatcherType::Doc`; matching on the concrete mime keeps other archive
/// members (rar/7z/gzip/tar) and legacy OLE office containers out. Executable
/// and script matcher classes (`App`, shell/text scripts) are never listed.
const ALLOWED_DOC_MIMES: &[&str] = &[
    "application/pdf",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // xlsx
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
];

/// Validate an uploaded blob before it reaches S3.
///
/// Enforces (in order): a hard size cap; a magic-byte sniff via `infer`;
/// membership of the sniffed type in the allowlist (image/audio/video by
/// matcher class, plus the bounded [`ALLOWED_DOC_MIMES`] set by exact mime);
/// and consistency between the sniffed type and the client-declared
/// `content_type`. Plain text has no magic bytes (`infer::get` returns
/// `None`), so it takes an explicit carve-out: a sniff-miss whose declared
/// type is `text/plain` or `text/csv` and whose bytes are valid UTF-8 is
/// accepted, with the declared type as its canonical mime.
///
/// Returns the canonical `(mime, extension)` derived from the sniffed bytes
/// (or, for the text carve-out, the declared text type) — never from the
/// untrusted filename.
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

    // Compare declared type on its essence (ignore parameters like
    // "; charset="), lowercased.
    let declared_essence = declared_content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();

    let kind = match infer::get(bytes) {
        Some(kind) => kind,
        None => {
            // No magic signature. The only sniff-miss we accept is a declared
            // text answer whose bytes are genuinely UTF-8 text; the declared
            // type becomes canonical because there is nothing to sniff.
            return match declared_essence.as_str() {
                "text/plain" | "text/csv" => {
                    if std::str::from_utf8(bytes).is_err() {
                        return Err(ApiError::BadRequest(
                            "Declared text upload is not valid UTF-8".into(),
                        ));
                    }
                    let ext = if declared_essence == "text/csv" {
                        "csv"
                    } else {
                        "txt"
                    };
                    Ok((declared_essence, ext.to_string()))
                }
                _ => Err(ApiError::BadRequest("Unrecognized file type".into())),
            };
        }
    };

    let sniffed_mime = kind.mime_type();
    let matcher = kind.matcher_type();
    let is_media = matches!(
        matcher,
        infer::MatcherType::Image | infer::MatcherType::Audio | infer::MatcherType::Video
    );
    let is_allowed = is_media || ALLOWED_DOC_MIMES.contains(&sniffed_mime);
    if !is_allowed {
        return Err(ApiError::BadRequest(format!(
            "File type not allowed: {sniffed_mime}"
        )));
    }

    // The declared header must agree with the sniffed content. Accept the
    // common `application/octet-stream` default as "unspecified" only when it
    // is the literal generic value — a mismatched concrete type is rejected.
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

/// Recover an image's intrinsic pixel dimensions from its header (F-8).
///
/// Only images carry dimensions, so callers gate on the canonical mime
/// (`image/*`) before calling. `imagesize` reads the format header only —
/// it never decodes pixel data — so this is cheap even for large uploads.
/// Returns `None` for a non-image mime, a format it cannot parse (e.g.
/// `image/svg+xml`, which has no pixel header), or dimensions that overflow
/// `i32` — the column is nullable and the asset is still stored.
fn extract_image_dimensions(mime: &str, bytes: &[u8]) -> Option<(i32, i32)> {
    if !mime.starts_with("image/") {
        return None;
    }
    let size = imagesize::blob_size(bytes).ok()?;
    let width = i32::try_from(size.width).ok()?;
    let height = i32::try_from(size.height).ok()?;
    Some((width, height))
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

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(q.organization_id),
        Permission::MediaRead,
    )
    .await?;

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let assets = sqlx::query_as::<_, MediaAsset>(
        r#"
        SELECT id, organization_id, filename, content_type, size_bytes,
               storage_key, uploaded_by, created_at, width, height
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

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::MediaWrite,
    )
    .await?;

    let size_bytes = bytes.len() as i64;
    // Sniff intrinsic dimensions from the image header before the bytes are
    // moved into the S3 upload (F-8). Non-images / unparseable headers → NULL.
    let (width, height) = match extract_image_dimensions(&content_type, &bytes) {
        Some((w, h)) => (Some(w), Some(h)),
        None => (None, None),
    };
    // Route the object under the org's data-residency region prefix (E-RBAC-9):
    // the storage-key namespace is the enforcement point for residency claims.
    let region = crate::api::access::org_data_region(&mut **tx, org_id).await?;
    let storage_key = S3StorageService::generate_region_key(&region, org_id, &filename);

    // Upload to S3
    state
        .storage
        .upload(&storage_key, bytes, &content_type)
        .await?;

    // Store metadata in DB
    let asset = sqlx::query_as::<_, MediaAsset>(
        r#"
        INSERT INTO media_assets (organization_id, filename, content_type, size_bytes,
                                  storage_key, uploaded_by, width, height)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, organization_id, filename, content_type, size_bytes,
                  storage_key, uploaded_by, created_at, width, height
        "#,
    )
    .bind(org_id)
    .bind(&filename)
    .bind(&content_type)
    .bind(size_bytes)
    .bind(&storage_key)
    .bind(user.user_id)
    .bind(width)
    .bind(height)
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
               storage_key, uploaded_by, created_at, width, height
        FROM media_assets WHERE id = $1
        "#,
    )
    .bind(media_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Media asset not found".into()))?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(asset.organization_id),
        Permission::MediaRead,
    )
    .await?;

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
                   storage_key, uploaded_by, created_at, width, height
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
               storage_key, uploaded_by, created_at, width, height
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

/// Decide whether one more `incoming_bytes` file fits inside a session's media
/// quota, given what it has already stored.
///
/// Pure so the arithmetic (off-by-one on the count, the "this file alone
/// already busts the budget" case) is unit-testable without a database.
/// Returns the rejection message on violation.
fn check_session_media_quota(
    used_files: i64,
    used_bytes: i64,
    incoming_bytes: i64,
    max_files: i64,
    max_total_bytes: i64,
) -> Result<(), String> {
    if used_files + 1 > max_files {
        return Err(format!(
            "Session upload limit reached: {used_files} of {max_files} files already stored"
        ));
    }
    if used_bytes.saturating_add(incoming_bytes) > max_total_bytes {
        return Err(format!(
            "Session storage limit reached: {used_bytes} + {incoming_bytes} bytes exceeds the \
             {max_total_bytes} byte per-session budget"
        ));
    }
    Ok(())
}

/// Enforce the per-session media quota against the rows already in
/// `session_media`, before anything is written to S3.
///
/// COUNT/SUM over the session's existing rows — no migration, no counter column
/// to drift out of sync with reality. Runs on the caller's fillout-RLS
/// transaction, so it observes exactly the rows this session is admitted to see
/// (and its own uncommitted INSERTs, were there any).
async fn enforce_session_media_quota(
    conn: &mut sqlx::PgConnection,
    state: &AppState,
    session_id: Uuid,
    incoming_bytes: i64,
) -> Result<(), ApiError> {
    let (used_files, used_bytes) = sqlx::query_as::<_, (i64, i64)>(
        r#"
        SELECT COUNT(*)::bigint, COALESCE(SUM(size_bytes), 0)::bigint
        FROM session_media WHERE session_id = $1
        "#,
    )
    .bind(session_id)
    .fetch_one(conn)
    .await?;

    check_session_media_quota(
        used_files,
        used_bytes,
        incoming_bytes,
        state.config.session_media_max_files,
        state.config.session_media_max_total_bytes,
    )
    .map_err(ApiError::BadRequest)
}

/// POST /api/sessions/:id/media — anonymous multipart upload scoped to a session.
/// No JWT required; validates the session exists and is active.
///
/// Bounded on three axes, all of which must hold for the S3 write to happen:
/// the route's per-IP rate limit (default 120/60s), [`validate_upload`]'s 25 MiB
/// per-file cap + magic-byte allowlist, and the per-session file-count /
/// total-bytes quota ([`enforce_session_media_quota`], default 20 files /
/// 100 MiB).
#[utoipa::path(
    post,
    path = "/api/sessions/{id}/media",
    request_body(content = SessionMediaUploadRequest, content_type = "multipart/form-data"),
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 201, description = "Session-scoped media uploaded", body = SessionMediaWithUrl),
        (status = 400, description = "Invalid upload request, or the per-session file-count / total-bytes quota is exhausted", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope),
        (status = 429, description = "Upload rate limit exceeded", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["media"]
)]
pub async fn upload_session_media(
    State(state): State<AppState>,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<(axum::http::StatusCode, Json<SessionMediaWithUrl>), ApiError> {
    // This route runs under `set_fillout_rls_context`, which opens the
    // per-request tx and sets `app.session_id` from the URL path. The
    // session lookup MUST go through that tx — the raw pool has no GUCs, so
    // the fillout-RLS-dual policies on `sessions` deny the row and the
    // upload 404s ("Session not found") for the anonymous participant.
    let mut tx = tx.tx().await?;

    // Validate the session exists and is in an uploadable state. ADR 0029
    // binary answers upload deferred and routinely arrive AFTER the session
    // completes (pending → uploaded patching), so `completed` is accepted
    // alongside `active`; other statuses (e.g. abandoned) are rejected.
    let session_status =
        sqlx::query_scalar::<_, String>("SELECT status FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if session_status != "active" && session_status != "completed" {
        return Err(ApiError::BadRequest(format!(
            "Session is not accepting uploads (status: {session_status})"
        )));
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

    // Per-session storage quota (anonymous, unauthenticated path). `validate_
    // upload` caps ONE file at 25 MiB but said nothing about how MANY: without
    // this, a caller could push unlimited 25 MiB blobs into S3 and `session_media`
    // under a single session id — unbounded storage and egress cost on a public
    // route. Enforce a file COUNT and a total BYTES budget from the rows already
    // stored for this session, BEFORE the S3 write, so a rejected upload leaves
    // no object and no row.
    //
    // Derived from `session_media` itself (COUNT/SUM) — no schema change and no
    // counter to drift. The read runs inside the same fillout-RLS tx as the
    // INSERT below, so it sees exactly the rows this session may see.
    enforce_session_media_quota(&mut tx, &state, session_id, size_bytes).await?;

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
    .fetch_one(&mut **tx)
    .await?;

    // Session-media answers can be documents (issue #48); serve every one as
    // a download so nothing renders inline from our origin. The disposition
    // filename is derived from the (untrusted) display name but sanitized by
    // the storage layer.
    let url = state
        .storage
        .presigned_download_url(&s3_key, Duration::from_secs(3600), &filename)
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

    // Minimal PDF header — infer's archive matcher keys on `%PDF-`.
    fn pdf_bytes() -> Vec<u8> {
        b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec()
    }

    // A bare zip local-file header (`PK\x03\x04`) whose entry name at offset
    // 0x1E is NOT one of the OOXML subdirs, so `infer` falls through the
    // office matchers to `application/zip`.
    fn zip_bytes() -> Vec<u8> {
        let mut b = vec![0x50, 0x4B, 0x03, 0x04];
        b.extend_from_slice(&[0u8; 26]); // rest of the 30-byte local file header
        b.extend_from_slice(b"payload.bin");
        b
    }

    // A minimal OOXML (docx) container: the zip local-file header followed by
    // a `word/` entry name at offset 0x1E, which is exactly what infer's
    // `msooxml` matcher checks for.
    fn docx_bytes() -> Vec<u8> {
        let mut b = vec![0x50, 0x4B, 0x03, 0x04];
        b.extend_from_slice(&[0u8; 26]); // rest of the 30-byte local file header
        b.extend_from_slice(b"word/document.xml");
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
    fn accepts_pdf() {
        let (mime, ext) =
            validate_upload(&pdf_bytes(), "application/pdf").expect("pdf should pass");
        assert_eq!(mime, "application/pdf");
        assert_eq!(ext, "pdf");
    }

    #[test]
    fn accepts_pdf_with_generic_octet_stream_declared() {
        let (mime, _ext) = validate_upload(&pdf_bytes(), "application/octet-stream")
            .expect("pdf should pass with generic declared type");
        assert_eq!(mime, "application/pdf");
    }

    #[test]
    fn accepts_zip() {
        let (mime, ext) =
            validate_upload(&zip_bytes(), "application/zip").expect("zip should pass");
        assert_eq!(mime, "application/zip");
        assert_eq!(ext, "zip");
    }

    #[test]
    fn accepts_docx() {
        // The docx container sniffs as the OOXML wordprocessing mime, ahead of
        // the generic zip matcher.
        let (mime, _ext) = validate_upload(
            &docx_bytes(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        .expect("docx should pass");
        assert_eq!(
            mime,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
    }

    #[test]
    fn accepts_plain_text_via_carve_out() {
        // No magic bytes: infer returns None; declared text/plain + valid UTF-8
        // is accepted with the declared type as canonical.
        let (mime, ext) = validate_upload(b"a free-text answer, plainly UTF-8", "text/plain")
            .expect("utf-8 text should pass");
        assert_eq!(mime, "text/plain");
        assert_eq!(ext, "txt");
    }

    #[test]
    fn accepts_csv_via_carve_out() {
        let (mime, ext) =
            validate_upload(b"col_a,col_b\n1,2\n3,4\n", "text/csv").expect("csv should pass");
        assert_eq!(mime, "text/csv");
        assert_eq!(ext, "csv");
    }

    #[test]
    fn rejects_text_carve_out_with_invalid_utf8() {
        // Declared text but the bytes are not valid UTF-8 (lone 0xFF).
        let err = validate_upload(&[b'h', b'i', 0xFF, 0xFE, 0x00], "text/plain")
            .expect_err("invalid utf-8 text must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_elf_executable() {
        // ELF magic → MatcherType::App, never allowlisted.
        let mut elf = vec![0x7F, b'E', b'L', b'F', 0x02, 0x01, 0x01, 0x00];
        elf.extend_from_slice(&[0u8; 32]);
        let err =
            validate_upload(&elf, "application/octet-stream").expect_err("ELF must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_pe_executable() {
        // DOS/PE (MZ) header → MatcherType::App, never allowlisted.
        let mut exe = vec![b'M', b'Z', 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
        exe.extend_from_slice(&[0u8; 64]);
        let err = validate_upload(&exe, "application/octet-stream")
            .expect_err("PE executable must be rejected");
        assert!(matches!(err, ApiError::BadRequest(_)), "got {err:?}");
    }

    #[test]
    fn rejects_untyped_binary_without_carve_out() {
        // Sniff-miss with a non-text declared type is not the carve-out and
        // stays rejected.
        let err = validate_upload(
            b"\x00\x01\x02 arbitrary binary blob \x00",
            "application/octet-stream",
        )
        .expect_err("unrecognized binary must be rejected");
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

    /// A PNG whose IHDR carries real `width`×`height` big-endian dimensions.
    /// `imagesize` reads them from the header without needing pixel data.
    fn png_with_dims(width: u32, height: u32) -> Vec<u8> {
        let mut b = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        b.extend_from_slice(&[0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R']);
        b.extend_from_slice(&width.to_be_bytes());
        b.extend_from_slice(&height.to_be_bytes());
        b.extend_from_slice(&[0x08, 0x06, 0x00, 0x00, 0x00]); // depth, colour, compression, filter, interlace
        b
    }

    #[test]
    fn extracts_png_dimensions() {
        let dims = extract_image_dimensions("image/png", &png_with_dims(1920, 1080));
        assert_eq!(dims, Some((1920, 1080)));
    }

    #[test]
    fn returns_none_for_non_image_mime() {
        // Even with parseable image bytes, an audio mime carries no dimensions.
        assert_eq!(
            extract_image_dimensions("audio/mpeg", &png_with_dims(4, 2)),
            None
        );
    }

    #[test]
    fn returns_none_for_unparseable_image_bytes() {
        // image/* mime but no valid raster header (e.g. svg / garbage).
        assert_eq!(
            extract_image_dimensions("image/png", b"not a real png"),
            None
        );
    }

    // ── per-session media quota (anonymous path) ─────────────────────

    #[test]
    fn quota_admits_upload_within_both_budgets() {
        assert!(check_session_media_quota(3, 1_000, 500, 20, 100_000).is_ok());
    }

    #[test]
    fn quota_admits_the_exact_last_file() {
        // 19 stored + this one == the 20-file cap: still allowed.
        assert!(check_session_media_quota(19, 0, 1, 20, 100_000).is_ok());
        // And the byte budget is inclusive of its own boundary.
        assert!(check_session_media_quota(0, 99_000, 1_000, 20, 100_000).is_ok());
    }

    #[test]
    fn quota_rejects_when_file_count_is_exhausted() {
        // 20 already stored → the 21st is refused even though it is tiny.
        let err = check_session_media_quota(20, 0, 1, 20, 100_000)
            .expect_err("file-count cap must reject");
        assert!(err.contains("files already stored"), "{err}");
    }

    #[test]
    fn quota_rejects_when_byte_budget_is_exhausted() {
        // Under the file cap, but this file tips the session over its bytes.
        let err = check_session_media_quota(1, 99_500, 1_000, 20, 100_000)
            .expect_err("byte cap must reject");
        assert!(err.contains("per-session budget"), "{err}");
    }

    #[test]
    fn quota_rejects_a_single_file_larger_than_the_whole_budget() {
        let err = check_session_media_quota(0, 0, 200_000, 20, 100_000)
            .expect_err("a first file over the total budget must reject");
        assert!(err.contains("per-session budget"), "{err}");
    }
}
