//! Cross-project & external-guest sharing (E-RBAC-10).
//!
//! Once E-RBAC-1 made projects confidential-by-default, the only way to let a
//! collaborator in another project — or a reviewer in another org — see a
//! project or a single questionnaire's analytics was full org membership. These
//! endpoints add an explicit, scoped, optionally time-limited grant instead.
//!
//! Surface:
//!   * `POST/GET/DELETE /api/projects/{id}/shares`
//!   * `POST/GET/DELETE /api/questionnaires/{id}/shares`
//!   * `GET  /api/shares/shared-with-me`
//!
//! Authorization to *manage* shares is project-admin/owner **or** org-admin/owner
//! (mirrors `add_project_member`). The grant itself flows only through the
//! `access::verify_*` read/write predicates and the RLS `…_via_share` branches
//! (`00041_resource_shares.sql`); it never creates an `organization_members` /
//! `project_members` row, so a guest can never list other org projects nor
//! manage members — the "guest cap" of step 5 is structural, not a special case.
//!
//! A share to an email that has no account yet is stored as a *pending* grant
//! (`grantee_user_id IS NULL`) and linked on that email's first
//! register/login via `resolve_pending_resource_shares` (see `api/auth`).

use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::api::access;
use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::manager::RbacManager;
use crate::rbac::models::Permission;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateShareRequest {
    #[validate(email)]
    pub email: String,
    /// `viewer` (read/analytics) or `editor` (read + scoped edit). A share can
    /// never confer `owner`/`admin` — those are member-management tiers.
    pub role: String,
    /// Optional expiry. When set it must be in the future; the grant is inert
    /// (denies at both handler and RLS layers) once it lapses.
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// One share row as returned by the management list / create endpoints.
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ShareRecord {
    pub id: Uuid,
    pub resource_type: String,
    pub resource_id: Uuid,
    pub organization_id: Uuid,
    pub grantee_user_id: Option<Uuid>,
    pub grantee_email: String,
    /// Resolved once the grantee has an account, else `null` (pending).
    pub grantee_name: Option<String>,
    pub role: String,
    pub created_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    /// `pending` (unlinked email), `active`, or `expired` — computed in SQL.
    pub status: String,
}

/// One resource shared *with* the current user, for the dashboard section.
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct SharedResource {
    /// The share row id (used as the list key + for revoke by the sharer).
    pub id: Uuid,
    pub resource_type: String,
    pub resource_id: Uuid,
    pub organization_id: Uuid,
    pub role: String,
    /// Project name or questionnaire name, resolved from the target.
    pub resource_name: Option<String>,
    pub shared_by_email: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

// ── Shared SQL fragments ─────────────────────────────────────────────

/// Column list + `status` + resolved grantee name, keyed off an alias `rs`.
/// Reused by create (via CTE) and list so both return the identical shape.
const SHARE_SELECT_COLUMNS: &str = r#"
    rs.id, rs.resource_type, rs.resource_id, rs.organization_id,
    rs.grantee_user_id, rs.grantee_email, gu.full_name AS grantee_name,
    rs.role, rs.created_by, rs.created_at, rs.expires_at,
    CASE
        WHEN rs.expires_at IS NOT NULL AND rs.expires_at <= now() THEN 'expired'
        WHEN rs.grantee_user_id IS NULL THEN 'pending'
        ELSE 'active'
    END AS status
"#;

// ── Authorization helper ─────────────────────────────────────────────

/// Managing shares requires project admin/owner **or** org admin/owner —
/// identical to the `add_project_member` gate. Runs on the caller's tx.
///
/// ADR 0030/0032: routes through the single [`authorize`] entry point at
/// [`Scope::Project`] with [`Permission::ProjectManageMembers`], whose tier is
/// `Admin`. The `00052` definer gate's `'admin'` arm is `project_members
/// (owner,admin) OR org_members(owner,admin)` — byte-identical to the former
/// inline `has_project_role(Admin) OR has_org_role(Admin)` pair. The fold adds
/// the org-scoped custom-role tightening (ADR 0030's intended deliverable). The
/// `org_id` argument is retained so the call sites (which resolve it for the
/// share insert / audit event) stay unchanged; `authorize` re-derives the org
/// from `project_id` internally.
async fn authorize_manage_shares(
    rbac: &RbacManager,
    conn: &mut PgConnection,
    user_id: Uuid,
    project_id: Uuid,
    _org_id: Uuid,
) -> Result<(), ApiError> {
    authorize(
        conn,
        rbac,
        user_id,
        Scope::Project(project_id),
        Permission::ProjectManageMembers,
    )
    .await
}

/// Validate the requested role string (shares are viewer/editor only).
fn parse_share_role(raw: &str) -> Result<&str, ApiError> {
    match raw {
        "viewer" | "editor" => Ok(raw),
        _ => Err(ApiError::BadRequest(
            "Invalid share role. Must be one of: viewer, editor".into(),
        )),
    }
}

// ── Core create / list / revoke over a (resource_type, resource_id) ──

/// A grant to upsert, bundled to keep [`insert_share`] to a single argument
/// (mirrors the `AuditEvent` struct idiom over long positional signatures).
struct NewShare<'a> {
    resource_type: &'a str,
    resource_id: Uuid,
    organization_id: Uuid,
    email: &'a str,
    role: &'a str,
    created_by: Uuid,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Upsert one grant and return the resolved [`ShareRecord`]. The
/// `grantee_user_id` is resolved in-SQL if the email already has an account;
/// otherwise it stays NULL (pending) until first login.
async fn insert_share(
    conn: &mut PgConnection,
    share: &NewShare<'_>,
) -> Result<ShareRecord, ApiError> {
    let sql = format!(
        r#"
        WITH upsert AS (
            INSERT INTO resource_shares
                (resource_type, resource_id, organization_id,
                 grantee_user_id, grantee_email, role, created_by, expires_at)
            VALUES (
                $1, $2, $3,
                (SELECT id FROM users WHERE lower(email) = lower($4) AND deleted_at IS NULL LIMIT 1),
                $4, $5, $6, $7
            )
            ON CONFLICT (resource_type, resource_id, lower(grantee_email))
            DO UPDATE SET
                role = EXCLUDED.role,
                expires_at = EXCLUDED.expires_at,
                created_by = EXCLUDED.created_by,
                grantee_user_id = COALESCE(resource_shares.grantee_user_id, EXCLUDED.grantee_user_id)
            RETURNING *
        )
        SELECT {SHARE_SELECT_COLUMNS}
        FROM upsert rs
        LEFT JOIN users gu ON gu.id = rs.grantee_user_id
        "#
    );

    let record = sqlx::query_as::<_, ShareRecord>(&sql)
        .bind(share.resource_type)
        .bind(share.resource_id)
        .bind(share.organization_id)
        .bind(share.email)
        .bind(share.role)
        .bind(share.created_by)
        .bind(share.expires_at)
        .fetch_one(conn)
        .await?;

    Ok(record)
}

async fn list_shares(
    conn: &mut PgConnection,
    resource_type: &str,
    resource_id: Uuid,
) -> Result<Vec<ShareRecord>, ApiError> {
    let sql = format!(
        r#"
        SELECT {SHARE_SELECT_COLUMNS}
        FROM resource_shares rs
        LEFT JOIN users gu ON gu.id = rs.grantee_user_id
        WHERE rs.resource_type = $1 AND rs.resource_id = $2
        ORDER BY rs.created_at DESC
        "#
    );
    let rows = sqlx::query_as::<_, ShareRecord>(&sql)
        .bind(resource_type)
        .bind(resource_id)
        .fetch_all(conn)
        .await?;
    Ok(rows)
}

/// Revoke a share by id, scoped to its resource. Returns the revoked row's
/// email + role for the audit trail, or `NotFound` when nothing matched.
async fn revoke_share(
    conn: &mut PgConnection,
    resource_type: &str,
    resource_id: Uuid,
    share_id: Uuid,
) -> Result<(String, String), ApiError> {
    let revoked = sqlx::query_as::<_, (String, String)>(
        r#"
        DELETE FROM resource_shares
        WHERE id = $1 AND resource_type = $2 AND resource_id = $3
        RETURNING grantee_email, role
        "#,
    )
    .bind(share_id)
    .bind(resource_type)
    .bind(resource_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| ApiError::NotFound("Share not found".into()))?;
    Ok(revoked)
}

fn validate_create(body: &CreateShareRequest) -> Result<&'static str, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;
    let role = parse_share_role(&body.role)?;
    if let Some(exp) = body.expires_at {
        if exp <= chrono::Utc::now() {
            return Err(ApiError::BadRequest(
                "expires_at must be in the future".into(),
            ));
        }
    }
    // parse_share_role returns a &str borrowed from body; re-map to 'static.
    Ok(match role {
        "editor" => "editor",
        _ => "viewer",
    })
}

/// Append a `share.created` / `share.revoked` row on the caller's tx. `detail`
/// carries the type-specific context (target email, role, share id, expiry).
async fn record_share_event(
    tx: &mut PgConnection,
    action: AuditAction,
    org_id: Uuid,
    actor: Uuid,
    resource_id: Uuid,
    ip: ClientIp,
    detail: serde_json::Value,
) -> Result<(), ApiError> {
    audit::record(
        tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: actor,
            action,
            resource_type: resource::SHARE,
            resource_id: Some(resource_id),
            metadata: detail,
            ip: ip.0,
        },
    )
    .await
}

// ── Project share handlers ───────────────────────────────────────────

/// POST /api/projects/{id}/shares
#[utoipa::path(
    post,
    path = "/api/projects/{id}/shares",
    request_body = CreateShareRequest,
    params(("id" = Uuid, Path, description = "Project id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "Share created", body = ShareRecord),
        (status = 400, description = "Invalid role/expiry", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["shares"]
)]
pub async fn create_project_share(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateShareRequest>,
) -> Result<(axum::http::StatusCode, Json<ShareRecord>), ApiError> {
    let role = validate_create(&body)?;
    let mut tx = tx.tx().await?;

    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;
    authorize_manage_shares(&state.rbac, &mut tx, user.user_id, project_id, org_id).await?;

    let record = insert_share(
        &mut tx,
        &NewShare {
            resource_type: "project",
            resource_id: project_id,
            organization_id: org_id,
            email: &body.email,
            role,
            created_by: user.user_id,
            expires_at: body.expires_at,
        },
    )
    .await?;

    record_share_event(
        &mut tx,
        AuditAction::ShareCreated,
        org_id,
        user.user_id,
        project_id,
        client_ip,
        serde_json::json!({
            "resource_type": "project",
            "share_id": record.id,
            "grantee_email": body.email,
            "role": role,
            "expires_at": record.expires_at,
        }),
    )
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(record)))
}

/// GET /api/projects/{id}/shares
#[utoipa::path(
    get,
    path = "/api/projects/{id}/shares",
    params(("id" = Uuid, Path, description = "Project id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Shares on the project", body = [ShareRecord]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["shares"]
)]
pub async fn list_project_shares(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<ShareRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;
    authorize_manage_shares(&state.rbac, &mut tx, user.user_id, project_id, org_id).await?;
    let rows = list_shares(&mut tx, "project", project_id).await?;
    Ok(Json(rows))
}

/// DELETE /api/projects/{id}/shares/{share_id}
#[utoipa::path(
    delete,
    path = "/api/projects/{id}/shares/{share_id}",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("share_id" = Uuid, Path, description = "Share id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Share revoked", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Share not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["shares"]
)]
pub async fn revoke_project_share(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((project_id, share_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;
    authorize_manage_shares(&state.rbac, &mut tx, user.user_id, project_id, org_id).await?;

    let (email, role) = revoke_share(&mut tx, "project", project_id, share_id).await?;

    record_share_event(
        &mut tx,
        AuditAction::ShareRevoked,
        org_id,
        user.user_id,
        project_id,
        client_ip,
        serde_json::json!({
            "resource_type": "project",
            "share_id": share_id,
            "grantee_email": email,
            "role": role,
        }),
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Share revoked" })))
}

// ── Questionnaire share handlers ─────────────────────────────────────

/// Resolve `(project_id, org_id)` for a questionnaire, or `NotFound`.
async fn questionnaire_project_org(
    conn: &mut PgConnection,
    questionnaire_id: Uuid,
) -> Result<(Uuid, Uuid), ApiError> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        r#"
        SELECT qd.project_id, p.organization_id
        FROM questionnaire_definitions qd
        JOIN projects p ON p.id = qd.project_id
        WHERE qd.id = $1 AND qd.deleted_at IS NULL AND p.deleted_at IS NULL
        "#,
    )
    .bind(questionnaire_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))
}

/// POST /api/questionnaires/{id}/shares
#[utoipa::path(
    post,
    path = "/api/questionnaires/{id}/shares",
    request_body = CreateShareRequest,
    params(("id" = Uuid, Path, description = "Questionnaire id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "Share created", body = ShareRecord),
        (status = 400, description = "Invalid role/expiry", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["shares"]
)]
pub async fn create_questionnaire_share(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(questionnaire_id): Path<Uuid>,
    Json(body): Json<CreateShareRequest>,
) -> Result<(axum::http::StatusCode, Json<ShareRecord>), ApiError> {
    let role = validate_create(&body)?;
    let mut tx = tx.tx().await?;

    let (project_id, org_id) = questionnaire_project_org(&mut tx, questionnaire_id).await?;
    authorize_manage_shares(&state.rbac, &mut tx, user.user_id, project_id, org_id).await?;

    let record = insert_share(
        &mut tx,
        &NewShare {
            resource_type: "questionnaire",
            resource_id: questionnaire_id,
            organization_id: org_id,
            email: &body.email,
            role,
            created_by: user.user_id,
            expires_at: body.expires_at,
        },
    )
    .await?;

    record_share_event(
        &mut tx,
        AuditAction::ShareCreated,
        org_id,
        user.user_id,
        questionnaire_id,
        client_ip,
        serde_json::json!({
            "resource_type": "questionnaire",
            "share_id": record.id,
            "grantee_email": body.email,
            "role": role,
            "expires_at": record.expires_at,
        }),
    )
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(record)))
}

/// GET /api/questionnaires/{id}/shares
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/shares",
    params(("id" = Uuid, Path, description = "Questionnaire id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Shares on the questionnaire", body = [ShareRecord]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["shares"]
)]
pub async fn list_questionnaire_shares(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(questionnaire_id): Path<Uuid>,
) -> Result<Json<Vec<ShareRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    let (project_id, org_id) = questionnaire_project_org(&mut tx, questionnaire_id).await?;
    authorize_manage_shares(&state.rbac, &mut tx, user.user_id, project_id, org_id).await?;
    let rows = list_shares(&mut tx, "questionnaire", questionnaire_id).await?;
    Ok(Json(rows))
}

/// DELETE /api/questionnaires/{id}/shares/{share_id}
#[utoipa::path(
    delete,
    path = "/api/questionnaires/{id}/shares/{share_id}",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        ("share_id" = Uuid, Path, description = "Share id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Share revoked", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Share not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["shares"]
)]
pub async fn revoke_questionnaire_share(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((questionnaire_id, share_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    let (project_id, org_id) = questionnaire_project_org(&mut tx, questionnaire_id).await?;
    authorize_manage_shares(&state.rbac, &mut tx, user.user_id, project_id, org_id).await?;

    let (email, role) = revoke_share(&mut tx, "questionnaire", questionnaire_id, share_id).await?;

    record_share_event(
        &mut tx,
        AuditAction::ShareRevoked,
        org_id,
        user.user_id,
        questionnaire_id,
        client_ip,
        serde_json::json!({
            "resource_type": "questionnaire",
            "share_id": share_id,
            "grantee_email": email,
            "role": role,
        }),
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Share revoked" })))
}

// ── Shared-with-me ───────────────────────────────────────────────────

/// GET /api/shares/shared-with-me
///
/// Every resource shared *with* the current user by someone else, for the
/// dashboard "Shared with me" section. Expired grants are omitted. This is the
/// ONLY surface that lists shared resources — the org project list stays
/// membership-scoped, so a guest cannot enumerate other org projects.
#[utoipa::path(
    get,
    path = "/api/shares/shared-with-me",
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Resources shared with the caller", body = [SharedResource])
    ),
    tags = ["shares"]
)]
pub async fn list_shared_with_me(
    user: AuthenticatedUser,
    tx: Tx,
) -> Result<Json<Vec<SharedResource>>, ApiError> {
    let mut tx = tx.tx().await?;

    let rows = sqlx::query_as::<_, SharedResource>(
        r#"
        SELECT
            rs.id, rs.resource_type, rs.resource_id, rs.organization_id, rs.role,
            COALESCE(p.name, qd.name) AS resource_name,
            creator.email AS shared_by_email,
            rs.created_at, rs.expires_at
        FROM resource_shares rs
        LEFT JOIN projects p
               ON rs.resource_type = 'project' AND p.id = rs.resource_id
        LEFT JOIN questionnaire_definitions qd
               ON rs.resource_type = 'questionnaire' AND qd.id = rs.resource_id
        LEFT JOIN users creator ON creator.id = rs.created_by
        WHERE rs.grantee_user_id = $1
          AND (rs.expires_at IS NULL OR rs.expires_at > now())
        ORDER BY rs.created_at DESC
        "#,
    )
    .bind(user.user_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(rows))
}
