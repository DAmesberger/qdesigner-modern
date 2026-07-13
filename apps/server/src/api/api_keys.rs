//! API keys / service accounts (E-RBAC-7).
//!
//! Two surfaces live here:
//!
//!   * **Admin CRUD** (`/api/organizations/{id}/api-keys`, owner/admin-gated,
//!     runs inside the per-request RLS transaction): mint / list / revoke keys.
//!     The plaintext `sk_<prefix>_<secret>` is returned exactly ONCE at creation
//!     and is unrecoverable thereafter — only the prefix and an Argon2id hash of
//!     the full token are stored.
//!
//!   * **Machine surface** (`/api/v1/*`, API-key-authenticated via
//!     [`crate::middleware::api_key`]): programmatic access to the read/export
//!     endpoints (and one gated mutation) without a human JWT. Every route calls
//!     [`ApiKey::require_scope`] first, so a key scoped to `session:read` +
//!     `response:read` can read analytics/export but is 403 on the member-
//!     provisioning mutation (`org:manage_members`).
//!
//! ADR NOTE (synthetic service principal): a machine request runs with
//! `app.user_id = api_keys.created_by` — the human who minted the key, a real
//! active org member. This realises E-RBAC-7's "synthetic service principal for
//! RLS" without introducing a new cross-cutting RLS policy or consuming a member
//! seat: the existing membership-scoped policies + `access::verify_*` gates admit
//! the key exactly to its creator's reach, and the key's `scopes` narrow it
//! further. Consequences, by design: a key can never exceed its creator's
//! access, and it stops working if the creator loses membership (belt-and-braces
//! with explicit revocation). The machine handlers additionally assert the
//! resolved org matches the key's org so a multi-org creator can't cross tenants.

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::api::access;
use crate::api::sessions::{
    compute_numeric_stats, load_numeric_samples, parse_aggregate_source, SessionAggregateResponse,
};
use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::auth::password::hash_password;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::api_key::ApiKey;
use crate::middleware::tx::Tx;
use crate::rbac::models::{OrgRole, Permission};
use crate::state::AppState;

// ── DTOs ─────────────────────────────────────────────────────────────

/// One API key with the secret redacted. `revoked` is a convenience flag
/// derived from `revoked_at`.
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ApiKeyRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    /// The public lookup handle (embedded verbatim in the plaintext token).
    pub prefix: String,
    pub scopes: Vec<String>,
    pub created_by: Option<Uuid>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub revoked_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

const KEY_SELECT: &str = r#"
    id, organization_id, name, prefix, scopes, created_by,
    last_used_at, expires_at, revoked_at, created_at
"#;

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateApiKeyRequest {
    pub name: String,
    /// Granular permission tokens (e.g. `["session:read", "response:read"]`).
    pub scopes: Vec<String>,
    /// Optional hard expiry; omit for a non-expiring key.
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Returned exactly once on creation — the only time the plaintext `key` is
/// ever available. Store it now or it is unrecoverable.
#[derive(Debug, Serialize, ToSchema)]
pub struct CreateApiKeyResponse {
    /// The full plaintext token `sk_<prefix>_<secret>`. Shown ONCE.
    pub key: String,
    pub api_key: ApiKeyRecord,
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Require the caller to be at least an org admin, else `Forbidden`.
async fn require_org_admin(
    state: &AppState,
    conn: &mut sqlx::PgConnection,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<(), ApiError> {
    if state
        .rbac
        .has_org_role(conn, user_id, org_id, &OrgRole::Admin)
        .await?
    {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Requires admin role to manage API keys".into(),
        ))
    }
}

/// Reject any scope token that does not map to a known [`Permission`], and
/// normalise/dedup. An empty scope set is rejected — a key with no scopes could
/// authenticate but reach nothing, which is almost always a mistake.
fn validate_scopes(raw: &[String]) -> Result<Vec<String>, ApiError> {
    if raw.is_empty() {
        return Err(ApiError::BadRequest(
            "An API key must have at least one scope".into(),
        ));
    }
    let mut out: Vec<String> = Vec::with_capacity(raw.len());
    for s in raw {
        let parsed = Permission::from_str(s)
            .ok_or_else(|| ApiError::BadRequest(format!("Unknown scope: {s}")))?;
        let token = parsed.as_str().to_string();
        if !out.contains(&token) {
            out.push(token);
        }
    }
    Ok(out)
}

fn validate_name(name: &str) -> Result<String, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 100 {
        return Err(ApiError::BadRequest(
            "API key name must be 1–100 characters".into(),
        ));
    }
    Ok(trimmed.to_string())
}

/// Generate a fresh `(plaintext_token, prefix)` pair. Layout:
/// `sk_<12 hex prefix>_<48 hex secret>`.
fn generate_key() -> (String, String) {
    use rand::RngCore;
    let mut pbytes = [0u8; 6];
    let mut sbytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut pbytes);
    rand::thread_rng().fill_bytes(&mut sbytes);
    let prefix = hex::encode(pbytes);
    let secret = hex::encode(sbytes);
    (format!("sk_{prefix}_{secret}"), prefix)
}

// ── Admin CRUD ───────────────────────────────────────────────────────

/// GET /api/organizations/:id/api-keys
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/api-keys",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "API keys (secrets redacted)", body = [ApiKeyRecord]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["api_keys"]
)]
pub async fn list_api_keys(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<ApiKeyRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let rows = sqlx::query_as::<_, ApiKeyRecord>(&format!(
        "SELECT {KEY_SELECT} FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC"
    ))
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(rows))
}

/// POST /api/organizations/:id/api-keys
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/api-keys",
    request_body = CreateApiKeyRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "API key created — plaintext shown once", body = CreateApiKeyResponse),
        (status = 400, description = "Invalid name or scope", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["api_keys"]
)]
pub async fn create_api_key(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateApiKeyRequest>,
) -> Result<(StatusCode, Json<CreateApiKeyResponse>), ApiError> {
    let name = validate_name(&body.name)?;
    let scopes = validate_scopes(&body.scopes)?;

    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let (plaintext, prefix) = generate_key();
    let key_hash = hash_password(&plaintext)?;

    let record = sqlx::query_as::<_, ApiKeyRecord>(&format!(
        r#"
        INSERT INTO api_keys
            (organization_id, name, key_hash, prefix, scopes, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING {KEY_SELECT}
        "#
    ))
    .bind(org_id)
    .bind(&name)
    .bind(&key_hash)
    .bind(&prefix)
    .bind(&scopes)
    .bind(user.user_id)
    .bind(body.expires_at)
    .fetch_one(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ApiKeyCreated,
            resource_type: resource::API_KEY,
            resource_id: Some(record.id),
            metadata: serde_json::json!({
                "name": record.name,
                "scopes": record.scopes,
                "prefix": record.prefix,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreateApiKeyResponse {
            key: plaintext,
            api_key: record,
        }),
    ))
}

/// DELETE /api/organizations/:id/api-keys/:key_id
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/api-keys/{key_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("key_id" = Uuid, Path, description = "API key id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "API key revoked", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Not found or already revoked", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["api_keys"]
)]
pub async fn revoke_api_key(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    // Soft-revoke (set revoked_at). DELETE is REVOKE'd from the app role so the
    // key + its usage history survive for the audit trail.
    let revoked = sqlx::query_scalar::<_, Uuid>(
        r#"
        UPDATE api_keys SET revoked_at = now()
        WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL
        RETURNING id
        "#,
    )
    .bind(key_id)
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?;

    if revoked.is_none() {
        return Err(ApiError::NotFound(
            "API key not found or already revoked".into(),
        ));
    }

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ApiKeyRevoked,
            resource_type: resource::API_KEY,
            resource_id: Some(key_id),
            metadata: serde_json::json!({}),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "API key revoked" })))
}

// ── Machine surface (/api/v1) ────────────────────────────────────────

/// Assert the resolved org matches the key's org so a multi-org creator cannot
/// use a key minted for org A to reach org B's data.
fn assert_org(
    ctx: &crate::middleware::api_key::ApiKeyContext,
    org_id: Uuid,
) -> Result<(), ApiError> {
    if ctx.organization_id == org_id {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "API key is not scoped to this organization".into(),
        ))
    }
}

#[derive(Debug, Deserialize)]
pub struct MachineAggregateQuery {
    pub source: Option<String>,
    pub key: String,
    pub participant_id: Option<String>,
}

/// GET /api/v1/questionnaires/:qid/aggregate — machine analytics read.
/// Requires the `session:read` scope.
pub async fn machine_aggregate(
    State(state): State<AppState>,
    api_key: ApiKey,
    tx: Tx,
    Path(qid): Path<Uuid>,
    Query(q): Query<MachineAggregateQuery>,
) -> Result<Json<SessionAggregateResponse>, ApiError> {
    let ctx = api_key.0;
    ctx.require_scope(Permission::SessionRead)?;

    let mut tx = tx.tx().await?;
    let org_id = access::get_questionnaire_org_id(&mut **tx, qid).await?;
    assert_org(&ctx, org_id)?;
    // Gate on the key creator's read access to the questionnaire (ADR 0030
    // single entry point; questionnaire scope is read-only under ADR 0032).
    authorize(
        &mut tx,
        &state.rbac,
        ctx.created_by,
        Scope::Questionnaire(qid),
        Permission::SessionRead,
    )
    .await?;

    let key = q.key.trim();
    if key.is_empty() {
        return Err(ApiError::BadRequest(
            "Aggregation key is required (variable name or question id)".into(),
        ));
    }
    let source = parse_aggregate_source(q.source.as_deref())?;
    let samples =
        load_numeric_samples(&mut **tx, source, qid, key, q.participant_id.as_deref()).await?;

    use std::collections::HashSet;
    let participant_count = samples
        .iter()
        .filter_map(|s| s.participant_id.as_ref().cloned())
        .collect::<HashSet<String>>()
        .len();
    let values: Vec<f64> = samples.iter().map(|s| s.value).collect();

    Ok(Json(SessionAggregateResponse {
        questionnaire_id: qid,
        source: source.as_str().to_string(),
        key: key.to_string(),
        participant_count,
        stats: compute_numeric_stats(&values),
    }))
}

/// GET /api/v1/questionnaires/:qid/export — machine CSV export of raw responses.
/// Requires the `response:read` scope.
pub async fn machine_export(
    State(state): State<AppState>,
    api_key: ApiKey,
    tx: Tx,
    Path(qid): Path<Uuid>,
) -> Result<Response, ApiError> {
    let ctx = api_key.0;
    ctx.require_scope(Permission::ResponseRead)?;

    let mut tx = tx.tx().await?;
    let org_id = access::get_questionnaire_org_id(&mut **tx, qid).await?;
    assert_org(&ctx, org_id)?;
    // Resolve the owning project to run the confidential-read gate.
    let project_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT project_id FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(qid)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;
    // Gate on the key creator's project read access (ADR 0030 single entry
    // point; ProjectRead → Viewer tier == the former verify_project_read_access).
    authorize(
        &mut tx,
        &state.rbac,
        ctx.created_by,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

    #[derive(sqlx::FromRow)]
    struct ExportRow {
        session_id: Uuid,
        participant_id: Option<String>,
        session_status: String,
        question_id: Option<String>,
        value: Option<serde_json::Value>,
        reaction_time_us: Option<i64>,
        answered_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let rows = sqlx::query_as::<_, ExportRow>(
        r#"
        SELECT
            s.id AS session_id,
            s.participant_id,
            s.status AS session_status,
            r.question_id,
            r.value,
            r.reaction_time_us,
            r.answered_at
        FROM sessions s
        JOIN responses r ON r.session_id = s.id
        WHERE s.questionnaire_id = $1
        ORDER BY s.created_at ASC, r.created_at ASC
        "#,
    )
    .bind(qid)
    .fetch_all(&mut **tx)
    .await?;

    let mut csv = String::from(
        "session_id,participant_id,session_status,question_id,value,reaction_time_us,answered_at\n",
    );
    for row in &rows {
        let value = row
            .value
            .as_ref()
            .map(|v| match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_default();
        let fields = [
            row.session_id.to_string(),
            row.participant_id.clone().unwrap_or_default(),
            row.session_status.clone(),
            row.question_id.clone().unwrap_or_default(),
            value,
            row.reaction_time_us
                .map(|n| n.to_string())
                .unwrap_or_default(),
            row.answered_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
        ];
        let line = fields
            .iter()
            .map(|f| csv_escape(f))
            .collect::<Vec<_>>()
            .join(",");
        csv.push_str(&line);
        csv.push('\n');
    }

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"responses.csv\"",
            ),
        ],
        csv,
    )
        .into_response())
}

/// Minimal RFC-4180 CSV field escaping: quote when the field contains a comma,
/// quote, CR, or LF, doubling any embedded quotes.
fn csv_escape(field: &str) -> String {
    if field.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct MachineAddMemberRequest {
    pub email: String,
    /// `admin` | `member` | `viewer` (a machine key cannot grant `owner`).
    pub role: String,
}

/// POST /api/v1/organizations/:org/members — machine member provisioning.
/// Requires the `org:manage_members` scope. This is the write endpoint that an
/// export/read-only key is denied (403), proving scope enforcement.
pub async fn machine_add_member(
    api_key: ApiKey,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<MachineAddMemberRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    let ctx = api_key.0;
    ctx.require_scope(Permission::OrgManageMembers)?;
    assert_org(&ctx, org_id)?;

    if !matches!(body.role.as_str(), "admin" | "member" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: admin, member, viewer".into(),
        ));
    }

    let mut tx = tx.tx().await?;

    let target_user = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL",
    )
    .bind(&body.email)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let already_active = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(target_user)
    .fetch_one(&mut **tx)
    .await?;

    if !already_active {
        let (limit, active, pending) =
            crate::api::organizations::seat_usage(&mut tx, org_id).await?;
        if let Some(limit) = limit {
            if active + pending >= limit {
                return Err(ApiError::SeatLimitReached(format!(
                    "Organization seat limit reached ({} of {} seats used)",
                    active + pending,
                    limit
                )));
            }
        }
    }

    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
        VALUES ($1, $2, $3, 'active', NOW())
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3, status = 'active'
        "#,
    )
    .bind(org_id)
    .bind(target_user)
    .bind(&body.role)
    .execute(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: ctx.created_by,
            action: AuditAction::MemberAdded,
            resource_type: resource::ORG_MEMBER,
            resource_id: Some(target_user),
            metadata: serde_json::json!({
                "target_user_id": target_user,
                "email": body.email,
                "role": body.role,
                "via": "api_key",
                "api_key_id": ctx.key_id,
            }),
            ip: None,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "message": "Member provisioned" })),
    ))
}
