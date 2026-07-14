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
    // The in-flight SELECT above and this INSERT are not one atomic step, so two
    // truly concurrent requests can both pass the gate. The partial unique index
    // `uq_data_exports_org_inflight` (00047) is the real arbiter: the loser's
    // INSERT raises a 23505, which we translate back to the same 409 (F-34).
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
    .await
    .map_err(|e| {
        if e.as_database_error().and_then(|d| d.code()).as_deref() == Some("23505") {
            ApiError::Conflict("An export is already in progress for this organization".into())
        } else {
            ApiError::Database(e)
        }
    })?;

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

    let external_identities = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT ei.provider, ei.issuer, ei.subject, ei.user_id,
                   ei.email_at_link, ei.email_verified_at_link,
                   ei.created_at, ei.last_seen_at
            FROM external_identities ei
            JOIN organization_members om ON om.user_id = ei.user_id
            WHERE om.organization_id = $1
            ORDER BY ei.created_at
        ) t"#,
        org_id,
    )
    .await?;

    let auth_sessions = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT s.user_id, s.provider, s.issuer, s.subject, s.mfa_verified,
                   s.idle_expires_at, s.absolute_expires_at, s.revoked_at,
                   s.user_agent_hash, s.ip_prefix, s.ip_hash,
                   s.created_at, s.last_seen_at
            FROM auth_sessions s
            JOIN organization_members om ON om.user_id = s.user_id
            WHERE om.organization_id = $1
            ORDER BY s.created_at
        ) t"#,
        org_id,
    )
    .await?;

    let security_events = fetch_json_array(
        &mut tx,
        r#"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
            SELECT se.event_type, se.outcome, se.user_id, se.provider,
                   se.issuer, se.subject, se.ip_prefix, se.ip_hash,
                   se.user_agent_hash, se.metadata, se.created_at
            FROM security_events se
            JOIN organization_members om ON om.user_id = se.user_id
            WHERE om.organization_id = $1
            ORDER BY se.created_at
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
            "external_identities": array_len(&external_identities),
            "auth_sessions": array_len(&auth_sessions),
            "security_events": array_len(&security_events),
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
        ("external_identities.json", external_identities),
        ("auth_sessions.json", auth_sessions),
        ("security_events.json", security_events),
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
    /// `complete` — every DB row destroyed AND every object confirmed deleted.
    /// `incomplete` — the DB destruction committed, but objects remain on the
    /// ledger. The keys are durable; retry via `POST …/erasure/retry`.
    pub status: String,
    pub projects_deleted: i64,
    pub sessions_deleted: i64,
    pub responses_deleted: i64,
    /// Objects confirmed deleted from storage by this call.
    pub objects_deleted: i64,
    /// Objects still awaiting deletion. Non-zero ⇒ the erasure is NOT complete.
    pub objects_pending: i64,
    /// The storage failure that left objects pending, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

/// State of an organization's outstanding object-deletion ledger.
#[derive(Debug, Serialize, ToSchema)]
pub struct ErasureStatus {
    pub organization_id: Uuid,
    /// `complete` (nothing outstanding) | `incomplete` (objects still pending).
    pub status: String,
    /// Objects confirmed deleted by THIS call. Always 0 for the status read.
    pub objects_deleted: i64,
    pub objects_pending: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

/// One key on the pending-deletion ledger: its row id and the object to kill.
type PendingObject = (Uuid, String);

/// What a purge pass actually achieved. Deliberately not a `Result`: a purge
/// that deletes 3 of 5 objects is neither a success nor a failure, and
/// collapsing it to either is how the old code came to report success while
/// leaving participant data in the bucket.
struct PurgeOutcome {
    deleted: i64,
    last_error: Option<String>,
}

/// Delete each staged object, clearing its ledger row ONLY on confirmed
/// success. A failure leaves the row in place — with `attempts` and
/// `last_error` — so the key is never lost and the work stays retryable.
///
/// Safe to re-run over a partially-purged batch: S3 `DeleteObject` is
/// idempotent, so a key whose object is already gone simply confirms again.
///
/// Runs on bare pooled connections with no `app.user_id` GUC (the background
/// sweeper has no user to offer), so the ledger writes go through the 00060
/// SECURITY DEFINER functions. They are not a convenience: a GUC-less
/// `DELETE … WHERE id = $1` is *silently* a no-op under the ledger's SELECT
/// policy — Postgres applies SELECT policies to an UPDATE/DELETE whose WHERE
/// clause reads a column — and it returns success while clearing nothing.
///
/// For the same reason `confirm_object_deletion` returns a ROW COUNT and a
/// deletion is counted only when a row really went away. Anything else is a
/// clear that never happened being reported as one, which is the exact class of
/// lie this whole change exists to remove.
async fn purge_objects(state: &AppState, rows: &[PendingObject]) -> PurgeOutcome {
    let mut deleted = 0i64;
    let mut last_error = None;

    for (row_id, key) in rows {
        match state.storage.delete(key).await {
            Ok(()) => {
                // Confirmed gone from storage → and only now may the ledger
                // forget it.
                let cleared: Result<i32, _> =
                    sqlx::query_scalar("SELECT confirm_object_deletion($1)")
                        .bind(row_id)
                        .fetch_one(&state.pool)
                        .await;
                match cleared {
                    Ok(1) => deleted += 1,
                    Ok(_) => {
                        // The object is gone but the row is still there. Not a
                        // confirmed clear, so it is not counted as one: the next
                        // pass re-deletes an absent key (a no-op) and retries.
                        // Erring this way leaves a stale ledger row; erring the
                        // other way loses the key.
                        tracing::error!(
                            "purge: object {key} deleted but ledger row {row_id} not cleared"
                        );
                        last_error = Some(format!("ledger row {row_id} not cleared"));
                    }
                    Err(e) => {
                        tracing::error!(
                            "purge: object {key} deleted but clearing row {row_id} failed: {e}"
                        );
                        last_error = Some(e.to_string());
                    }
                }
            }
            Err(e) => {
                let msg = e.to_string();
                tracing::warn!("purge: storage delete failed for {key}: {msg}");
                let _ = sqlx::query("SELECT fail_object_deletion($1, $2)")
                    .bind(row_id)
                    .bind(&msg)
                    .execute(&state.pool)
                    .await;
                last_error = Some(msg);
            }
        }
    }

    PurgeOutcome {
        deleted,
        last_error,
    }
}

/// Read the ARMED ledger rows for an org (RLS-admitted via the owner GUC).
///
/// Unarmed rows are deliberately invisible here: they describe data that has
/// not been destroyed and may never be.
async fn armed_rows_for_org(
    pool: &sqlx::PgPool,
    owner_id: Uuid,
    org_id: Uuid,
) -> Result<Vec<PendingObject>, ApiError> {
    let mut tx = pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;
    let rows: Vec<PendingObject> = sqlx::query_as(
        "SELECT id, storage_key FROM pending_object_deletions
         WHERE organization_id = $1 AND armed_at IS NOT NULL
         ORDER BY created_at",
    )
    .bind(org_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(rows)
}

/// The last recorded storage failure on an org's ledger, if any.
async fn last_ledger_error(
    pool: &sqlx::PgPool,
    owner_id: Uuid,
    org_id: Uuid,
) -> Result<Option<String>, ApiError> {
    let mut tx = pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;
    let err: Option<String> = sqlx::query_scalar(
        "SELECT last_error FROM pending_object_deletions
         WHERE organization_id = $1 AND armed_at IS NOT NULL AND last_error IS NOT NULL
         ORDER BY last_attempt_at DESC NULLS LAST LIMIT 1",
    )
    .bind(org_id)
    .fetch_optional(&mut *tx)
    .await?
    .flatten();
    tx.commit().await?;
    Ok(err)
}

/// Every object-storage key this organization owns, tagged with its source
/// column. These are the bytes an erasure must actually destroy.
///
/// All three sources, because for most of this system's life it was one:
///   * `media_assets.storage_key`  — designer-uploaded stimuli
///   * `session_media.s3_key`      — PARTICIPANT-uploaded binary answers
///   * `data_exports.artifact_key` — zips containing a full export of the above
async fn collect_org_object_keys(
    conn: &mut sqlx::PgConnection,
    org_id: Uuid,
) -> Result<Vec<(&'static str, String)>, ApiError> {
    let mut keys: Vec<(&'static str, String)> = Vec::new();

    let media: Vec<String> =
        sqlx::query_scalar("SELECT storage_key FROM media_assets WHERE organization_id = $1")
            .bind(org_id)
            .fetch_all(&mut *conn)
            .await?;
    keys.extend(media.into_iter().map(|k| ("media_assets", k)));

    // Reached through the org's projects — the same join the cascade will walk
    // when `DELETE FROM projects` takes these rows (and their keys) away.
    let session_media: Vec<String> = sqlx::query_scalar(
        r#"SELECT sm.s3_key FROM session_media sm
           JOIN sessions s ON s.id = sm.session_id
           JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
           JOIN projects p ON p.id = qd.project_id
           WHERE p.organization_id = $1"#,
    )
    .bind(org_id)
    .fetch_all(&mut *conn)
    .await?;
    keys.extend(session_media.into_iter().map(|k| ("session_media", k)));

    // The org is only SOFT-deleted, so these rows survive the cascade entirely.
    // Erasure must destroy them explicitly, zip and row alike.
    let exports: Vec<String> = sqlx::query_scalar(
        "SELECT artifact_key FROM data_exports
         WHERE organization_id = $1 AND artifact_key IS NOT NULL",
    )
    .bind(org_id)
    .fetch_all(&mut *conn)
    .await?;
    keys.extend(exports.into_iter().map(|k| ("data_export", k)));

    Ok(keys)
}

/// POST /api/organizations/{id}/erase
///
/// Owner-gated, password + typed-confirmation guarded, blocked under a legal
/// hold. Destroys the tenant's participant data — DB rows *and* the objects in
/// storage those rows name — and soft-deletes the organization, retaining
/// `audit_events`.
///
/// ## Durability (migration 00060)
///
/// The objects are the point. An erasure that drops the DB rows and then
/// *tries* to delete the objects has destroyed the only record of what it still
/// owes; if storage is down at that instant the keys are gone forever and the
/// participant files live on in the bucket, unfindable. So the keys are written
/// to a durable ledger BEFORE anything is destroyed:
///
///   1. **Stage** — every key (`media_assets`, `session_media`, `data_exports`)
///      is INSERTed into `pending_object_deletions` and COMMITTED on its own
///      connection. `armed_at` is NULL: nothing is destroyed yet, so the rows
///      are inert.
///   2. **Destroy** — one transaction: audit → delete the export rows → delete
///      the projects (cascading to sessions → responses / events / variables /
///      session_media) → delete the media rows → soft-delete the org → **arm
///      the staged rows**. The arming commits with the destruction, so an
///      intent becomes actionable exactly when — and only if — the data it
///      describes is really gone.
///   3. **Purge** — delete each armed object, clearing its ledger row only on
///      confirmed success.
///
/// Crash after (2) and the ledger holds every key, armed and durable: the
/// sweeper or `POST …/erasure/retry` finishes the job. Nothing is lost, and
/// nothing is claimed that isn't true — see the return contract below.
///
/// ## What it reports
///
/// * **200** `status: "complete"` — every row destroyed and every object
///   confirmed deleted from storage.
/// * **202** `status: "incomplete"` — the DB destruction committed (it is
///   irreversible), but `objects_pending` objects remain. The erasure is NOT
///   finished. The keys are on the durable ledger and the work is retryable.
///
/// A partial erasure never returns 200. That is the whole contract.
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/erase",
    request_body = EraseOrgRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Tenant data erased — rows AND objects", body = EraseResult),
        (status = 202, description = "DB erased; objects still pending — retryable", body = EraseResult),
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
) -> Result<(StatusCode, Json<EraseResult>), ApiError> {
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

    // Every object-storage key the org owns — all three sources. Read while the
    // rows still exist; after step 2 they are unrecoverable.
    let keys = collect_org_object_keys(&mut txg, org_id).await?;

    // The request tx is read-only from here on and its work is done. Release the
    // guard so the destructive transactions below don't run under it.
    drop(txg);

    let request_id = Uuid::new_v4();

    // ── 1. STAGE ─────────────────────────────────────────────────────
    // Commit the keys to the durable ledger, UNARMED, on their own connection —
    // before a single row is destroyed. If this fails, nothing has happened yet
    // and the erasure aborts with the tenant fully intact.
    stage_pending_deletions(&state.pool, user.user_id, org_id, request_id, &keys).await?;

    // ── 2. DESTROY ───────────────────────────────────────────────────
    // Audit + destroy + ARM, atomically. If this rolls back, the staged rows
    // stay unarmed — inert, and reaped by the next staging pass.
    destroy_tenant(
        &state,
        user.user_id,
        org_id,
        request_id,
        client_ip,
        (projects_count, sessions_count, responses_count),
        keys.len() as i64,
    )
    .await?;

    // ── 3. PURGE ─────────────────────────────────────────────────────
    // Past this line the DB destruction is committed and irreversible. Every
    // remaining key is armed and durable, so a failure here costs time, not
    // evidence.
    let armed = armed_rows_for_org(&state.pool, user.user_id, org_id).await?;
    let staged = armed.len() as i64;
    let outcome = purge_objects(&state, &armed).await;
    let objects_pending = staged - outcome.deleted;

    // ── 4. REPORT, honestly ──────────────────────────────────────────
    let complete = objects_pending == 0;
    let status_code = if complete {
        StatusCode::OK
    } else {
        StatusCode::ACCEPTED
    };
    let message = if complete {
        "Organization data erased".to_string()
    } else {
        format!(
            "Organization data erased from the database, but {objects_pending} object(s) could \
             not be deleted from storage. The erasure is NOT complete. The keys are recorded and \
             the deletion will be retried automatically; retry now with \
             POST /api/organizations/{org_id}/erasure/retry"
        )
    };

    Ok((
        status_code,
        Json(EraseResult {
            message,
            status: if complete { "complete" } else { "incomplete" }.into(),
            projects_deleted: projects_count,
            sessions_deleted: sessions_count,
            responses_deleted: responses_count,
            objects_deleted: outcome.deleted,
            objects_pending,
            last_error: outcome.last_error,
        }),
    ))
}

/// Step 1 — write the keys to the durable ledger and COMMIT, before any
/// destruction. Runs on its own pooled connection precisely so that its commit
/// is independent of (and prior to) the destructive transaction.
///
/// Also reaps this org's UNARMED leftovers first: rows from an earlier attempt
/// that staged and then died before destroying anything. They describe data that
/// still exists, so they are meaningless — and re-staging would double them.
async fn stage_pending_deletions(
    pool: &sqlx::PgPool,
    owner_id: Uuid,
    org_id: Uuid,
    request_id: Uuid,
    keys: &[(&'static str, String)],
) -> Result<(), ApiError> {
    let mut tx = pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;

    sqlx::query(
        "DELETE FROM pending_object_deletions WHERE organization_id = $1 AND armed_at IS NULL",
    )
    .bind(org_id)
    .execute(&mut *tx)
    .await?;

    if !keys.is_empty() {
        let sources: Vec<String> = keys.iter().map(|(s, _)| (*s).to_string()).collect();
        let storage_keys: Vec<String> = keys.iter().map(|(_, k)| k.clone()).collect();
        sqlx::query(
            r#"
            INSERT INTO pending_object_deletions
                (organization_id, request_id, reason, source, storage_key)
            SELECT $1, $2, 'org_erasure', t.source, t.storage_key
            FROM UNNEST($3::text[], $4::text[]) AS t(source, storage_key)
            "#,
        )
        .bind(org_id)
        .bind(request_id)
        .bind(&sources)
        .bind(&storage_keys)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// Step 2 — the destructive transaction. Audit, destroy, and ARM the staged
/// ledger rows, all or nothing.
///
/// The arming lives here, not in step 1 and not in step 3, and that placement is
/// the entire correctness argument: a staged-but-unarmed key must never be
/// purged (its data may still be live), and an armed key must never be
/// forgotten (its data is definitely gone). Committing `armed_at` in the same
/// transaction as the deletes is what makes those two statements simultaneously
/// true, with no window between them.
async fn destroy_tenant(
    state: &AppState,
    owner_id: Uuid,
    org_id: Uuid,
    request_id: Uuid,
    client_ip: ClientIp,
    counts: (i64, i64, i64),
    objects_staged: i64,
) -> Result<(), ApiError> {
    let (projects_count, sessions_count, responses_count) = counts;

    let mut tx = state.pool.begin().await?;
    set_owner_guc(&mut tx, owner_id).await?;

    // Audit BEFORE the deletes, in the same tx — the org row survives (soft
    // delete), so the org-scoped audit_events row persists through the erasure.
    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: owner_id,
            action: AuditAction::OrgDataErased,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({
                "projects_deleted": projects_count,
                "sessions_deleted": sessions_count,
                "responses_deleted": responses_count,
                "objects_staged": objects_staged,
                "erasure_request_id": request_id,
                "erased_at": chrono::Utc::now().to_rfc3339(),
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    // Export jobs FIRST. The org is only soft-deleted, so nothing cascades to
    // these rows — without this they survive an erasure still pointing at a zip
    // holding a complete copy of everything being erased. (Their artifacts are
    // on the ledger; this kills the rows.) Admitted by the 00060
    // `data_exports_delete` policy — 00040 shipped none, so before that policy
    // existed this DELETE would have silently matched zero rows.
    sqlx::query("DELETE FROM data_exports WHERE organization_id = $1")
        .bind(org_id)
        .execute(&mut *tx)
        .await?;

    // The tenant's projects — cascades through questionnaires → sessions →
    // responses / interaction_events / session_variables / session_media /
    // snapshots / quota / arm rows, and project_members. Admitted by the
    // permissive 00020 projects_delete_all policy; the cascade bypasses
    // child-row RLS (referential actions are not subject to row security).
    sqlx::query("DELETE FROM projects WHERE organization_id = $1")
        .bind(org_id)
        .execute(&mut *tx)
        .await?;

    // Org-level media metadata (session media already cascaded above).
    sqlx::query("DELETE FROM media_assets WHERE organization_id = $1")
        .bind(org_id)
        .execute(&mut *tx)
        .await?;

    // Soft-delete the organization itself. The row is RETAINED (not hard
    // deleted) so its audit_events survive; it drops out of every member's
    // org list via the deleted_at filter.
    sqlx::query("UPDATE organizations SET deleted_at = now(), updated_at = now() WHERE id = $1")
        .bind(org_id)
        .execute(&mut *tx)
        .await?;

    // ARM. Commits with the destruction above — see the doc comment.
    sqlx::query("UPDATE pending_object_deletions SET armed_at = now() WHERE request_id = $1")
        .bind(request_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

// ── Erasure completion: status + retry ───────────────────────────────

/// GET /api/organizations/{id}/erasure
///
/// Admin-gated. Reports whether an erasure is actually finished — i.e. whether
/// any objects remain on the durable ledger. This is what makes a half-failed
/// erasure *visible* rather than a warning in a log nobody reads.
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/erasure",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Erasure completion status", body = ErasureStatus),
        (status = 403, description = "Requires admin role", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn get_erasure_status(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<ErasureStatus>, ApiError> {
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
    drop(txg);

    let pending = armed_rows_for_org(&state.pool, user.user_id, org_id).await?;
    let objects_pending = pending.len() as i64;

    Ok(Json(ErasureStatus {
        organization_id: org_id,
        status: if objects_pending == 0 {
            "complete"
        } else {
            "incomplete"
        }
        .into(),
        objects_deleted: 0,
        objects_pending,
        last_error: last_ledger_error(&state.pool, user.user_id, org_id).await?,
    }))
}

/// POST /api/organizations/{id}/erasure/retry
///
/// Owner-gated. Re-attempts the object deletions still on the ledger for this
/// org. Idempotent, and safe to call when nothing is pending (reports
/// `complete`, deletes nothing).
///
/// Needs no password/confirmation guard: it can only ever delete objects whose
/// DB rows are already destroyed — the arming invariant guarantees it. The
/// destructive decision was made, audited, and committed at erase time; this
/// only finishes carrying it out.
///
/// Returns **200** once the ledger is clear, **202** while objects remain.
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/erasure/retry",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Ledger clear — erasure complete", body = ErasureStatus),
        (status = 202, description = "Objects still pending — retry again", body = ErasureStatus),
        (status = 403, description = "Requires owner role", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["gdpr"]
)]
pub async fn retry_erasure(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<(StatusCode, Json<ErasureStatus>), ApiError> {
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
    drop(txg);

    let armed = armed_rows_for_org(&state.pool, user.user_id, org_id).await?;
    let staged = armed.len() as i64;
    let outcome = purge_objects(&state, &armed).await;
    let objects_pending = staged - outcome.deleted;
    let complete = objects_pending == 0;

    Ok((
        if complete {
            StatusCode::OK
        } else {
            StatusCode::ACCEPTED
        },
        Json(ErasureStatus {
            organization_id: org_id,
            status: if complete { "complete" } else { "incomplete" }.into(),
            objects_deleted: outcome.deleted,
            objects_pending,
            last_error: outcome.last_error,
        }),
    ))
}

/// Background sweep — purge the armed backlog across ALL tenants.
///
/// Driven by the periodic task in `main.rs`, so a half-failed erasure completes
/// itself once storage recovers, with no operator in the loop. The retry
/// endpoint exists for when someone does not want to wait.
///
/// Reads via the 00060 SECURITY DEFINER function: this runs on a bare pool
/// connection with no `app.user_id` GUC, so the ledger's SELECT policy would
/// otherwise hide every row. The confirm/fail writes are permissive and need no
/// such escape hatch.
pub async fn sweep_pending_object_deletions(state: &AppState) -> Result<i64, ApiError> {
    let rows: Vec<PendingObject> =
        sqlx::query_as("SELECT id, storage_key FROM sweep_pending_object_deletions($1)")
            .bind(200i32)
            .fetch_all(&state.pool)
            .await?;

    if rows.is_empty() {
        return Ok(0);
    }

    let outcome = purge_objects(state, &rows).await;
    if let Some(err) = &outcome.last_error {
        tracing::warn!(
            "object-deletion sweep: {} of {} purged; last error: {err}",
            outcome.deleted,
            rows.len()
        );
    }
    Ok(outcome.deleted)
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
