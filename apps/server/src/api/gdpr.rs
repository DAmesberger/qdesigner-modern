//! Org-level GDPR: data export (DSAR), tenant erasure, residency tagging
//! (E-RBAC-9).
//!
//! Three capabilities, all owner-gated on the `organizations` admin surface:
//!
//! * **Export** — `POST /api/organizations/{id}/export` enqueues an async job
//!   (a `data_exports` row + a spawned task) that serializes every org
//!   resource — projects, questionnaires, sessions, responses, variables,
//!   interaction events, members, media metadata — into a single zip in object
//!   storage. `GET /api/organizations/{id}/export/{jobId}` polls status and,
//!   once `ready`, hands back a short-lived presigned download URL (artifacts
//!   expire after [`EXPORT_TTL_DAYS`]).
//!
//! * **Erasure** — `POST /api/organizations/{id}/erase` is the guarded
//!   right-to-erasure path: password re-confirmation + a typed slug
//!   confirmation, blocked while a `legal_hold` is active. It removes the
//!   tenant's participant data (deleting the org's projects cascades through
//!   questionnaires → sessions → responses / events / variables / media) and
//!   soft-deletes the organization, while deliberately RETAINING the
//!   `audit_events` (their org row survives the soft delete) so the compliance
//!   trail outlives the erasure.
//!
//! * **Residency** — `data_region` is chosen at org creation and threaded into
//!   the storage key prefix (`storage/s3.rs`). It is immutable in-app once the
//!   org owns any data; `PUT …/data-region` enforces that. `PUT …/legal-hold`
//!   toggles the erasure block.
//!
//! RLS note: the export background job runs on its own pooled connection and
//! sets `app.user_id` to the requesting owner as a tx-local GUC, so the 00021
//! dual-path SELECT policies admit it via their org-member branch (the owner is
//! an active member). Erasure runs inside the request's owner RLS tx; the
//! project DELETE is admitted by the permissive 00020 `projects_delete_all`
//! policy and its cascade bypasses child-row RLS (referential actions are not
//! subject to row security).

use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::state::AppState;
use crate::storage::s3::S3StorageService;

/// Supported data-residency regions (E-RBAC-9). Kept small and explicit so a
/// residency commitment maps to a known storage prefix rather than free text.
pub const SUPPORTED_REGIONS: &[&str] = &["eu", "us", "uk", "ca", "au", "ap"];

/// Days a completed export artifact stays downloadable before it is treated as
/// expired by the poll endpoint (step 8).
pub const EXPORT_TTL_DAYS: i64 = 7;

/// Validity window of the presigned download URL handed out for a ready export.
const DOWNLOAD_URL_TTL_SECS: u64 = 3600;

/// Validate + canonicalize a requested data-residency region against the
/// [`SUPPORTED_REGIONS`] allowlist, defaulting to `eu` when absent/empty.
/// Rejects anything outside the allowlist with a 422 so a residency claim can
/// never be recorded for a region the platform does not model.
pub fn normalize_data_region(raw: Option<&str>) -> Result<String, ApiError> {
    let region = raw.map(str::trim).unwrap_or("").to_ascii_lowercase();
    if region.is_empty() {
        return Ok("eu".to_string());
    }
    if SUPPORTED_REGIONS.contains(&region.as_str()) {
        Ok(region)
    } else {
        Err(ApiError::Validation(format!(
            "Unsupported data region '{region}'. Supported: {}",
            SUPPORTED_REGIONS.join(", ")
        )))
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────

/// Public view of a `data_exports` job row.
#[derive(Debug, Serialize, ToSchema)]
pub struct ExportJob {
    pub id: Uuid,
    pub organization_id: Uuid,
    /// pending | running | ready | failed | expired
    pub status: String,
    pub data_region: String,
    pub size_bytes: Option<i64>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Short-lived presigned download URL — present only when the artifact is
    /// ready and unexpired.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    /// Operator-facing failure reason, present only on a failed job.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct ExportRow {
    id: Uuid,
    organization_id: Uuid,
    status: String,
    artifact_key: Option<String>,
    data_region: String,
    size_bytes: Option<i64>,
    error: Option<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    downloaded_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Body for `POST /api/organizations/{id}/erase`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct EraseOrgRequest {
    /// Caller's current password, re-confirmed to authorize the destructive
    /// action.
    pub password: String,
    /// Typed confirmation — must equal the organization's slug (case
    /// insensitive), the standard "type the name to confirm" guard.
    pub confirmation: String,
}

/// Body for `PUT /api/organizations/{id}/data-region`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct SetDataRegionRequest {
    pub data_region: String,
}

/// Body for `PUT /api/organizations/{id}/legal-hold`.
#[derive(Debug, Deserialize, ToSchema)]
pub struct SetLegalHoldRequest {
    pub legal_hold: bool,
}

// ── Export: request ──────────────────────────────────────────────────

/// POST /api/organizations/{id}/export
///
/// Owner-gated. Enqueues an async export job: inserts a `pending`
/// `data_exports` row, spawns a background task that serializes the whole
/// tenant into a zip in object storage, and returns the job immediately.
/// Refuses (409) when an export is already in flight for the org (belt to the
/// route's rate-limit layer).
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/export",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 202, description = "Export job accepted", body = ExportJob),
        (status = 403, description = "Requires owner role", body = crate::openapi::ErrorEnvelope),
        (status = 409, description = "An export is already in progress", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn request_export(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<(StatusCode, Json<ExportJob>), ApiError> {
    let mut txg = tx.tx().await?;

    if !state
        .rbac
        .has_org_role(
            &mut **txg,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Owner,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires owner role".into()));
    }

    // One in-flight export per org (rate limiting, step 8).
    let in_flight = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM data_exports WHERE organization_id = $1 AND status IN ('pending','running'))",
    )
    .bind(org_id)
    .fetch_one(&mut **txg)
    .await?;
    if in_flight {
        return Err(ApiError::Conflict(
            "An export is already in progress for this organization".into(),
        ));
    }

    let region = crate::api::access::org_data_region(&mut **txg, org_id).await?;
    let job_id = Uuid::new_v4();

    audit::record(
        &mut txg,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgExportRequested,
            resource_type: resource::DATA_EXPORT,
            resource_id: Some(job_id),
            metadata: serde_json::json!({ "data_region": region }),
            ip: client_ip.0,
        },
    )
    .await?;

    // Persist the pending row on a SEPARATE connection so it is committed
    // before the background task starts (the task's status UPDATE keys on this
    // id). No RETURNING: on this bare pool connection there is no `app.user_id`
    // GUC, so the data_exports_select policy would hide a RETURNING row. The
    // request tx commits the audit row independently on success.
    sqlx::query(
        r#"
        INSERT INTO data_exports (id, organization_id, requested_by, status, data_region)
        VALUES ($1, $2, $3, 'pending', $4)
        "#,
    )
    .bind(job_id)
    .bind(org_id)
    .bind(user.user_id)
    .bind(&region)
    .execute(&state.pool)
    .await?;

    let job = ExportJob {
        id: job_id,
        organization_id: org_id,
        status: "pending".into(),
        data_region: region.clone(),
        size_bytes: None,
        created_at: Some(chrono::Utc::now()),
        completed_at: None,
        expires_at: None,
        download_url: None,
        error: None,
    };

    // Fire-and-forget: the job manages its own connection + RLS GUC.
    tokio::spawn(run_export_job(
        state.clone(),
        job_id,
        org_id,
        user.user_id,
        region,
    ));

    Ok((StatusCode::ACCEPTED, Json(job)))
}

// ── Export: background job ───────────────────────────────────────────

/// Drives one export job to completion, flipping `data_exports.status`
/// pending → running → ready (or → failed). Runs detached from the request.
///
/// Every `data_exports` write sets the owner's `app.user_id` GUC first: RLS
/// applies the `data_exports_select` policy to an UPDATE's row scan, so a write
/// on a GUC-less pool connection would silently match zero rows.
async fn run_export_job(
    state: AppState,
    job_id: Uuid,
    org_id: Uuid,
    owner_id: Uuid,
    region: String,
) {
    if let Err(e) = mark_export_status(&state.pool, owner_id, job_id, "running").await {
        tracing::error!("export {job_id}: failed to mark running: {e}");
    }

    match build_and_upload(&state, job_id, org_id, owner_id, &region).await {
        Ok((artifact_key, size_bytes)) => {
            if let Err(e) =
                finalize_export_ready(&state.pool, owner_id, job_id, &artifact_key, size_bytes)
                    .await
            {
                tracing::error!("export {job_id}: failed to mark ready: {e}");
            }
        }
        Err(e) => {
            tracing::error!("export {job_id} failed: {e}");
            let _ = finalize_export_failed(&state.pool, owner_id, job_id, &e.to_string()).await;
        }
    }
}

/// Set the requesting owner's `app.user_id` GUC (tx-local) so RLS admits the
/// job's reads/writes via the org-member branch.
async fn set_owner_guc(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    owner_id: Uuid,
) -> Result<(), ApiError> {
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(owner_id.to_string())
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn mark_export_status(
    pool: &sqlx::PgPool,
    owner_id: Uuid,
    job_id: Uuid,
    status: &str,
) -> Result<(), ApiError> {
    let mut tx = pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;
    sqlx::query("UPDATE data_exports SET status = $2 WHERE id = $1")
        .bind(job_id)
        .bind(status)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

async fn finalize_export_ready(
    pool: &sqlx::PgPool,
    owner_id: Uuid,
    job_id: Uuid,
    artifact_key: &str,
    size_bytes: i64,
) -> Result<(), ApiError> {
    let mut tx = pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;
    sqlx::query(
        r#"
        UPDATE data_exports
        SET status = 'ready', artifact_key = $2, size_bytes = $3,
            completed_at = now(), expires_at = now() + ($4 || ' days')::interval,
            error = NULL
        WHERE id = $1
        "#,
    )
    .bind(job_id)
    .bind(artifact_key)
    .bind(size_bytes)
    .bind(EXPORT_TTL_DAYS.to_string())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

async fn finalize_export_failed(
    pool: &sqlx::PgPool,
    owner_id: Uuid,
    job_id: Uuid,
    error: &str,
) -> Result<(), ApiError> {
    let mut tx = pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;
    sqlx::query(
        "UPDATE data_exports SET status = 'failed', error = $2, completed_at = now() WHERE id = $1",
    )
    .bind(job_id)
    .bind(error)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Serialize every org resource into a zip and upload it. Returns the storage
/// key and byte size. All reads run under a tx-local `app.user_id` GUC bound
/// to the owner so the dual-path RLS policies admit them.
async fn build_and_upload(
    state: &AppState,
    job_id: Uuid,
    org_id: Uuid,
    owner_id: Uuid,
    region: &str,
) -> Result<(String, i64), ApiError> {
    let mut tx = state.pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;

    let organization = fetch_json_object(
        &mut tx,
        r#"SELECT row_to_json(t) FROM (
            SELECT id, name, slug, domain, logo_url, settings, data_region, legal_hold,
                   created_at, updated_at, deleted_at
            FROM organizations WHERE id = $1
        ) t"#,
        org_id,
    )
    .await?;

    let members = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT u.id AS user_id, u.email, u.full_name, om.role, om.status, om.joined_at
            FROM organization_members om JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = $1 ORDER BY om.joined_at
        ) t"#,
        org_id,
    )
    .await?;

    let projects = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT p.* FROM projects p WHERE p.organization_id = $1 ORDER BY p.created_at
        ) t"#,
        org_id,
    )
    .await?;

    let questionnaires = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT qd.* FROM questionnaire_definitions qd
            JOIN projects p ON p.id = qd.project_id
            WHERE p.organization_id = $1 ORDER BY qd.created_at
        ) t"#,
        org_id,
    )
    .await?;

    let sessions = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT s.* FROM sessions s
            JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN projects p ON p.id = qd.project_id
            WHERE p.organization_id = $1 ORDER BY s.created_at
        ) t"#,
        org_id,
    )
    .await?;

    let responses = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT r.* FROM responses r
            JOIN sessions s ON s.id = r.session_id
            JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN projects p ON p.id = qd.project_id
            WHERE p.organization_id = $1 ORDER BY r.created_at
        ) t"#,
        org_id,
    )
    .await?;

    let session_variables = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT sv.* FROM session_variables sv
            JOIN sessions s ON s.id = sv.session_id
            JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN projects p ON p.id = qd.project_id
            WHERE p.organization_id = $1
        ) t"#,
        org_id,
    )
    .await?;

    let interaction_events = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT ie.* FROM interaction_events ie
            JOIN sessions s ON s.id = ie.session_id
            JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN projects p ON p.id = qd.project_id
            WHERE p.organization_id = $1
        ) t"#,
        org_id,
    )
    .await?;

    let media_assets = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT m.* FROM media_assets m WHERE m.organization_id = $1 ORDER BY m.created_at
        ) t"#,
        org_id,
    )
    .await?;

    // Read tx done; release the connection before the (potentially slow) upload.
    tx.commit().await?;

    let manifest = serde_json::json!({
        "schema_version": 1,
        "kind": "qdesigner.org_export",
        "organization_id": org_id,
        "data_region": region,
        "generated_at": chrono::Utc::now().to_rfc3339(),
        "requested_by": owner_id,
        "counts": {
            "members": array_len(&members),
            "projects": array_len(&projects),
            "questionnaires": array_len(&questionnaires),
            "sessions": array_len(&sessions),
            "responses": array_len(&responses),
            "session_variables": array_len(&session_variables),
            "interaction_events": array_len(&interaction_events),
            "media_assets": array_len(&media_assets),
        }
    });

    let files: Vec<(&str, serde_json::Value)> = vec![
        ("manifest.json", manifest),
        ("organization.json", organization),
        ("members.json", members),
        ("projects.json", projects),
        ("questionnaires.json", questionnaires),
        ("sessions.json", sessions),
        ("responses.json", responses),
        ("session_variables.json", session_variables),
        ("interaction_events.json", interaction_events),
        ("media_assets.json", media_assets),
    ];

    let zip_bytes = build_export_zip(&files)?;
    let size = zip_bytes.len() as i64;
    let key = S3StorageService::export_key(region, org_id, job_id);
    state
        .storage
        .upload(&key, zip_bytes, "application/zip")
        .await?;

    Ok((key, size))
}

/// Build a deflate-compressed zip from `(name, json)` entries, in memory.
fn build_export_zip(files: &[(&str, serde_json::Value)]) -> Result<Vec<u8>, ApiError> {
    use std::io::Write;

    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::<u8>::new()));
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for (name, value) in files {
        let bytes = serde_json::to_vec_pretty(value)
            .map_err(|e| ApiError::Internal(format!("serialize {name}: {e}")))?;
        zip.start_file(*name, opts)
            .map_err(|e| ApiError::Internal(format!("zip start {name}: {e}")))?;
        zip.write_all(&bytes)
            .map_err(|e| ApiError::Internal(format!("zip write {name}: {e}")))?;
    }

    let cursor = zip
        .finish()
        .map_err(|e| ApiError::Internal(format!("zip finish: {e}")))?;
    Ok(cursor.into_inner())
}

async fn fetch_json_object(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    sql: &str,
    org_id: Uuid,
) -> Result<serde_json::Value, ApiError> {
    let value: Option<serde_json::Value> = sqlx::query_scalar(sql)
        .bind(org_id)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(value.unwrap_or(serde_json::Value::Null))
}

async fn fetch_json_array(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    sql: &str,
    org_id: Uuid,
) -> Result<serde_json::Value, ApiError> {
    let value: serde_json::Value = sqlx::query_scalar(sql)
        .bind(org_id)
        .fetch_one(&mut **tx)
        .await?;
    Ok(value)
}

fn array_len(value: &serde_json::Value) -> usize {
    value.as_array().map(|a| a.len()).unwrap_or(0)
}

// ── Export: poll / download ──────────────────────────────────────────

/// GET /api/organizations/{id}/export/{job_id}
///
/// Admin/owner-gated. Reports job status and, once the artifact is `ready` and
/// unexpired, hands back a short-lived presigned download URL. A ready artifact
/// past its TTL is reported as `expired` with no URL.
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/export/{job_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("job_id" = Uuid, Path, description = "Export job id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Export job status", body = ExportJob),
        (status = 403, description = "Requires admin role", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Export job not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn get_export(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, job_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ExportJob>, ApiError> {
    let mut txg = tx.tx().await?;

    if !state
        .rbac
        .has_org_role(
            &mut **txg,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let row: ExportRow = sqlx::query_as::<_, ExportRow>(
        r#"
        SELECT id, organization_id, status, artifact_key, data_region, size_bytes,
               error, created_at, completed_at, expires_at, downloaded_at
        FROM data_exports WHERE id = $1 AND organization_id = $2
        "#,
    )
    .bind(job_id)
    .bind(org_id)
    .fetch_optional(&mut **txg)
    .await?
    .ok_or_else(|| ApiError::NotFound("Export job not found".into()))?;

    let now = chrono::Utc::now();
    let expired = row.expires_at.map(|e| e < now).unwrap_or(false);

    // A ready, unexpired artifact yields a presigned URL; first issuance is
    // audited once and stamped so repeated polls don't re-audit.
    let download_url = if row.status == "ready" && !expired {
        if let Some(key) = row.artifact_key.as_deref() {
            let url = state
                .storage
                .presigned_url(key, Duration::from_secs(DOWNLOAD_URL_TTL_SECS))
                .await?;

            if row.downloaded_at.is_none() {
                sqlx::query("UPDATE data_exports SET downloaded_at = now() WHERE id = $1")
                    .bind(job_id)
                    .execute(&mut **txg)
                    .await?;
                audit::record(
                    &mut txg,
                    AuditEvent {
                        organization_id: org_id,
                        actor_user_id: user.user_id,
                        action: AuditAction::OrgExportDownloaded,
                        resource_type: resource::DATA_EXPORT,
                        resource_id: Some(job_id),
                        metadata: serde_json::json!({}),
                        ip: client_ip.0,
                    },
                )
                .await?;
            }
            Some(url)
        } else {
            None
        }
    } else {
        None
    };

    Ok(Json(export_row_to_job(row, download_url)))
}

fn export_row_to_job(row: ExportRow, download_url: Option<String>) -> ExportJob {
    let now = chrono::Utc::now();
    let expired = row.expires_at.map(|e| e < now).unwrap_or(false);
    // Surface an expired-but-ready artifact as 'expired'.
    let status = if row.status == "ready" && expired {
        "expired".to_string()
    } else {
        row.status
    };
    ExportJob {
        id: row.id,
        organization_id: row.organization_id,
        status,
        data_region: row.data_region,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
        completed_at: row.completed_at,
        expires_at: row.expires_at,
        download_url,
        error: row.error,
    }
}

// ── Erasure ──────────────────────────────────────────────────────────

/// Summary returned by the erase endpoint.
#[derive(Debug, Serialize, ToSchema)]
pub struct EraseResult {
    pub message: String,
    pub projects_deleted: i64,
    pub sessions_deleted: i64,
    pub responses_deleted: i64,
}

/// POST /api/organizations/{id}/erase
///
/// Owner-gated, password + typed-confirmation guarded, blocked under a legal
/// hold. Removes the tenant's participant data (deleting the org's projects
/// cascades through questionnaires → sessions → responses / events / variables
/// / media rows) and soft-deletes the organization, retaining `audit_events`.
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/erase",
    request_body = EraseOrgRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Tenant data erased", body = EraseResult),
        (status = 400, description = "Confirmation mismatch", body = crate::openapi::ErrorEnvelope),
        (status = 401, description = "Password incorrect", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Requires owner role", body = crate::openapi::ErrorEnvelope),
        (status = 409, description = "Legal hold active — erasure blocked", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn erase_org(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<EraseOrgRequest>,
) -> Result<Json<EraseResult>, ApiError> {
    let mut txg = tx.tx().await?;

    if !state
        .rbac
        .has_org_role(
            &mut **txg,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Owner,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires owner role".into()));
    }

    let (slug, legal_hold): (String, bool) = sqlx::query_as(
        "SELECT slug, legal_hold FROM organizations WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(org_id)
    .fetch_optional(&mut **txg)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    // Legal hold blocks the destructive path (export is unaffected — it does
    // not violate a hold).
    if legal_hold {
        return Err(ApiError::Conflict(
            "A legal hold is active on this organization; erasure is blocked until it is released"
                .into(),
        ));
    }

    // Re-confirm the caller's password (fails closed on a missing hash).
    let stored_hash: Option<String> =
        sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL")
            .bind(user.user_id)
            .fetch_optional(&mut **txg)
            .await?
            .flatten();
    let stored_hash =
        stored_hash.ok_or_else(|| ApiError::Unauthorized("Password incorrect".into()))?;
    if !crate::auth::password::verify_password(&body.password, &stored_hash)? {
        return Err(ApiError::Unauthorized("Password incorrect".into()));
    }

    // Typed confirmation must match the org slug (case-insensitive).
    if !body.confirmation.trim().eq_ignore_ascii_case(&slug) {
        return Err(ApiError::BadRequest(format!(
            "Confirmation does not match. Type the organization slug '{slug}' to confirm."
        )));
    }

    // Counts for the audit metadata + response (computed before the deletes).
    let projects_count = scoped_count(
        &mut txg,
        "SELECT COUNT(*) FROM projects WHERE organization_id = $1",
        org_id,
    )
    .await?;
    let sessions_count = scoped_count(
        &mut txg,
        r#"SELECT COUNT(*) FROM sessions s
           JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
           JOIN projects p ON p.id = qd.project_id
           WHERE p.organization_id = $1"#,
        org_id,
    )
    .await?;
    let responses_count = scoped_count(
        &mut txg,
        r#"SELECT COUNT(*) FROM responses r
           JOIN sessions s ON s.id = r.session_id
           JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
           JOIN projects p ON p.id = qd.project_id
           WHERE p.organization_id = $1"#,
        org_id,
    )
    .await?;

    // Capture media storage keys for best-effort object cleanup after the DB
    // rows are gone.
    let media_keys: Vec<String> =
        sqlx::query_scalar("SELECT storage_key FROM media_assets WHERE organization_id = $1")
            .bind(org_id)
            .fetch_all(&mut **txg)
            .await?;

    // Audit BEFORE the deletes — the org row survives (soft delete), so the
    // audit_events row (org-scoped) persists through the erasure.
    audit::record(
        &mut txg,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgDataErased,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({
                "projects_deleted": projects_count,
                "sessions_deleted": sessions_count,
                "responses_deleted": responses_count,
                "erased_at": chrono::Utc::now().to_rfc3339(),
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    // Delete the tenant's projects — cascades through questionnaires → sessions
    // → responses / interaction_events / session_variables / session_media /
    // snapshots / quota / arm rows, and project_members. Admitted by the
    // permissive 00020 projects_delete_all policy; the cascade bypasses
    // child-row RLS (referential actions are not subject to row security).
    sqlx::query("DELETE FROM projects WHERE organization_id = $1")
        .bind(org_id)
        .execute(&mut **txg)
        .await?;

    // Org-level media metadata (session media already cascaded above).
    sqlx::query("DELETE FROM media_assets WHERE organization_id = $1")
        .bind(org_id)
        .execute(&mut **txg)
        .await?;

    // Soft-delete the organization itself. The row is RETAINED (not hard
    // deleted) so its audit_events survive; it drops out of every member's
    // org list via the deleted_at filter.
    sqlx::query("UPDATE organizations SET deleted_at = now(), updated_at = now() WHERE id = $1")
        .bind(org_id)
        .execute(&mut **txg)
        .await?;

    // Best-effort purge of the media objects themselves (never fail the
    // erasure on a storage hiccup — the DB rows are already gone).
    for key in &media_keys {
        if let Err(e) = state.storage.delete(key).await {
            tracing::warn!("erase {org_id}: failed to delete media object {key}: {e}");
        }
    }

    Ok(Json(EraseResult {
        message: "Organization data erased".into(),
        projects_deleted: projects_count,
        sessions_deleted: sessions_count,
        responses_deleted: responses_count,
    }))
}

async fn scoped_count(
    conn: &mut sqlx::PgConnection,
    sql: &str,
    org_id: Uuid,
) -> Result<i64, ApiError> {
    let count: i64 = sqlx::query_scalar(sql)
        .bind(org_id)
        .fetch_one(&mut *conn)
        .await?;
    Ok(count)
}

// ── Residency + legal hold ───────────────────────────────────────────

/// PUT /api/organizations/{id}/data-region
///
/// Owner-gated. Sets the data-residency region, allowed ONLY while the org
/// owns no data yet (no projects, no sessions) — a residency commitment is
/// immutable once data has landed under the current region's storage prefix.
#[utoipa::path(
    put,
    path = "/api/organizations/{id}/data-region",
    request_body = SetDataRegionRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Updated organization", body = crate::api::organizations::Organization),
        (status = 403, description = "Requires owner role", body = crate::openapi::ErrorEnvelope),
        (status = 409, description = "Immutable — org already owns data", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Unsupported region", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn set_data_region(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<SetDataRegionRequest>,
) -> Result<Json<crate::api::organizations::Organization>, ApiError> {
    let mut txg = tx.tx().await?;

    if !state
        .rbac
        .has_org_role(
            &mut **txg,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Owner,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires owner role".into()));
    }

    let region = normalize_data_region(Some(&body.data_region))?;

    // Immutable once data exists: any project under the org locks the region.
    let has_data = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE organization_id = $1)",
    )
    .bind(org_id)
    .fetch_one(&mut **txg)
    .await?;
    if has_data {
        return Err(ApiError::Conflict(
            "Data region is immutable once the organization owns data".into(),
        ));
    }

    let org = sqlx::query_as::<_, crate::api::organizations::Organization>(
        r#"
        UPDATE organizations SET data_region = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name, slug, domain, logo_url, settings,
                  data_region, legal_hold, created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(&region)
    .fetch_optional(&mut **txg)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    audit::record(
        &mut txg,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgDataRegionSet,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({ "data_region": region }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(org))
}

/// PUT /api/organizations/{id}/legal-hold
///
/// Owner-gated. Enables or releases the legal hold that blocks tenant erasure.
#[utoipa::path(
    put,
    path = "/api/organizations/{id}/legal-hold",
    request_body = SetLegalHoldRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Updated organization", body = crate::api::organizations::Organization),
        (status = 403, description = "Requires owner role", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Organization not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn set_legal_hold(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<SetLegalHoldRequest>,
) -> Result<Json<crate::api::organizations::Organization>, ApiError> {
    let mut txg = tx.tx().await?;

    if !state
        .rbac
        .has_org_role(
            &mut **txg,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Owner,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires owner role".into()));
    }

    let org = sqlx::query_as::<_, crate::api::organizations::Organization>(
        r#"
        UPDATE organizations SET legal_hold = $2, updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, name, slug, domain, logo_url, settings,
                  data_region, legal_hold, created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(body.legal_hold)
    .fetch_optional(&mut **txg)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    audit::record(
        &mut txg,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgLegalHoldChanged,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({ "legal_hold": body.legal_hold }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(org))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_defaults_to_eu() {
        assert_eq!(normalize_data_region(None).unwrap(), "eu");
        assert_eq!(normalize_data_region(Some("")).unwrap(), "eu");
        assert_eq!(normalize_data_region(Some("  ")).unwrap(), "eu");
    }

    #[test]
    fn normalize_accepts_allowlist_case_insensitive() {
        assert_eq!(normalize_data_region(Some("US")).unwrap(), "us");
        assert_eq!(normalize_data_region(Some(" eu ")).unwrap(), "eu");
    }

    #[test]
    fn normalize_rejects_unknown_region() {
        assert!(normalize_data_region(Some("mars")).is_err());
    }

    #[test]
    fn zip_roundtrips_entries() {
        use std::io::Read;
        let files: Vec<(&str, serde_json::Value)> = vec![
            ("manifest.json", serde_json::json!({ "a": 1 })),
            ("sessions.json", serde_json::json!([{ "id": 1 }])),
        ];
        let bytes = build_export_zip(&files).expect("zip builds");
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("valid zip archive");
        assert_eq!(archive.len(), 2);
        let mut names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["manifest.json", "sessions.json"]);
        let mut s = String::new();
        archive
            .by_name("sessions.json")
            .unwrap()
            .read_to_string(&mut s)
            .unwrap();
        assert!(s.contains("\"id\""));
    }
}
