//! Project-scoped invitations (ADR 0033, Unit 3).
//!
//! The structural replacement for resource-share's invite-by-email: a
//! `project_invitations` row means "collaborate on ONE project". Accepting one
//! lands a `project_members` row with the invited [`ProjectRole`] — which,
//! post-Unit-1/2 (org-check trigger dropped in 00055, `require_permission`
//! project-member pass-through), is admitted cross-org. Supports
//! not-yet-registered emails: the invite is keyed on the email string, and the
//! `project_members` row is only created when a registered user whose email
//! matches accepts.
//!
//! This module deliberately MIRRORS the `organization_invitations` handlers in
//! `api/organizations.rs` at project scope — same token/status/expiry/
//! email-match semantics, same email-send mechanism, same
//! `authorize(...ManageMembers)` gate for create/list/revoke. The only
//! deliberate divergences from the org flow:
//!   * the gate is `Scope::Project(id)` + `Permission::ProjectManageMembers`;
//!   * accept inserts a `project_members` row (not `organization_members`);
//!   * a partial-unique index guards duplicate PENDING invites (00056), so a
//!     duplicate create surfaces as a 409 Conflict.

use axum::{
    extract::{Path, State},
    Json,
};
use lettre::message::header::ContentType;
use lettre::transport::smtp::client::Tls;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::api::access;
use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ProjectInvitation {
    pub id: Uuid,
    pub project_id: Uuid,
    pub email: String,
    pub role: String,
    pub token: Uuid,
    pub status: String,
    pub invited_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub custom_message: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProjectInvitationRequest {
    #[validate(email)]
    pub email: String,
    pub role: String,
    pub custom_message: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectInvitationProjectSummary {
    pub id: Uuid,
    pub name: String,
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectInvitationInviterSummary {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectInvitationDetail {
    pub id: Uuid,
    pub project_id: Uuid,
    pub email: String,
    pub role: String,
    pub token: Uuid,
    pub status: String,
    pub invited_by: Option<ProjectInvitationInviterSummary>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub custom_message: Option<String>,
    pub project: ProjectInvitationProjectSummary,
}

// ── List ─────────────────────────────────────────────────────────────

/// GET /api/projects/:id/invitations
#[utoipa::path(
    get,
    path = "/api/projects/{id}/invitations",
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Pending project invitations", body = [ProjectInvitation]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn list_project_invitations(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<ProjectInvitation>>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectManageMembers,
    )
    .await?;

    let invitations = sqlx::query_as::<_, ProjectInvitation>(
        r#"
        SELECT id, project_id, email, role, token, status, invited_by, created_at, expires_at, accepted_at, custom_message
        FROM project_invitations
        WHERE project_id = $1 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC
        "#,
    )
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(invitations))
}

// ── Create ───────────────────────────────────────────────────────────

/// POST /api/projects/:id/invitations
#[utoipa::path(
    post,
    path = "/api/projects/{id}/invitations",
    request_body = CreateProjectInvitationRequest,
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Invitation created", body = ProjectInvitation),
        (status = 400, description = "Invalid invitation request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 409, description = "A pending invitation already exists for this email", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn create_project_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateProjectInvitationRequest>,
) -> Result<(axum::http::StatusCode, Json<ProjectInvitation>), ApiError> {
    let mut tx = tx.tx().await?;
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Validate role value against the ProjectRole set.
    if !matches!(body.role.as_str(), "owner" | "admin" | "editor" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, editor, viewer".into(),
        ));
    }

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectManageMembers,
    )
    .await?;

    // Resolve the org for the audit record (project must exist).
    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;

    let expires_at = chrono::Utc::now() + chrono::Duration::days(7);

    // The partial-unique index (00056) rejects a second PENDING invite for the
    // same (project, email); `From<sqlx::Error>` maps 23505 → 409 Conflict.
    let invitation = sqlx::query_as::<_, ProjectInvitation>(
        r#"
        INSERT INTO project_invitations (project_id, email, role, invited_by, expires_at, custom_message)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, project_id, email, role, token, status, invited_by, created_at, expires_at, accepted_at, custom_message
        "#,
    )
    .bind(project_id)
    .bind(&body.email)
    .bind(&body.role)
    .bind(user.user_id)
    .bind(expires_at)
    .bind(&body.custom_message)
    .fetch_one(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::InvitationCreated,
            resource_type: resource::INVITATION,
            resource_id: Some(invitation.id),
            metadata: serde_json::json!({
                "project_id": project_id,
                "email": body.email,
                "role": body.role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    // Send invitation email (same mechanism as organization invitations).
    let project_name = sqlx::query_scalar::<_, String>(
        "SELECT name FROM projects WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(project_id)
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or_else(|| "a project".to_string());

    let invite_link = format!(
        "{}/project-invite/{}",
        state.config.app_origin(),
        invitation.token
    );

    let mut email_body = format!(
        "Hello,\n\n\
         You've been invited to collaborate on the project \"{}\" on QDesigner as a {}.\n\n",
        project_name, body.role
    );

    if let Some(ref msg) = body.custom_message {
        email_body.push_str(&format!("Message from the inviter:\n{}\n\n", msg));
    }

    email_body.push_str(&format!(
        "Click the link below to accept the invitation:\n{}\n\n\
         This invitation expires in 7 days.\n\n\
         - QDesigner Team",
        invite_link
    ));

    let email_msg = Message::builder()
        .from(
            state
                .config
                .smtp_from
                .parse()
                .unwrap_or_else(|_| "noreply@qdesigner.local".parse().unwrap()),
        )
        .to(body
            .email
            .parse()
            .map_err(|_| ApiError::BadRequest("Invalid email address".into()))?)
        .subject(format!(
            "You've been invited to collaborate on {} on QDesigner",
            project_name
        ))
        .header(ContentType::TEXT_PLAIN)
        .body(email_body)
        .map_err(|e| ApiError::Internal(format!("Failed to build email: {e}")))?;

    let smtp_host = state.config.smtp_host.clone();
    let smtp_port = state.config.smtp_port;
    let recipient_email = body.email.clone();

    tokio::task::spawn_blocking(move || {
        let mailer = SmtpTransport::builder_dangerous(&smtp_host)
            .port(smtp_port)
            .tls(Tls::None)
            .build();

        match mailer.send(&email_msg) {
            Ok(_) => tracing::info!("Project invitation email sent to {}", recipient_email),
            Err(e) => tracing::error!("Failed to send project invitation email: {e}"),
        }
    })
    .await
    .ok();

    Ok((axum::http::StatusCode::CREATED, Json(invitation)))
}

// ── Get by token ─────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
struct ProjectInvitationLookupRow {
    id: Uuid,
    project_id: Uuid,
    email: String,
    role: String,
    token: Uuid,
    status: String,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    custom_message: Option<String>,
    project_name: String,
    project_code: String,
    invited_by_id: Option<Uuid>,
    invited_by_email: Option<String>,
    invited_by_full_name: Option<String>,
}

/// GET /api/project-invitations/:token
///
/// Public accept-page lookup keyed on the token (mirrors `get_invitation`).
/// Computes `expired` dynamically without mutating the row.
#[utoipa::path(
    get,
    path = "/api/project-invitations/{token}",
    params(
        ("token" = Uuid, Path, description = "Invitation token")
    ),
    responses(
        (status = 200, description = "Invitation detail", body = ProjectInvitationDetail),
        (status = 404, description = "Invitation not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn get_project_invitation(
    State(state): State<AppState>,
    Path(invitation_token): Path<Uuid>,
) -> Result<Json<ProjectInvitationDetail>, ApiError> {
    let row = sqlx::query_as::<_, ProjectInvitationLookupRow>(
        r#"
        SELECT
            i.id,
            i.project_id,
            i.email,
            i.role,
            i.token,
            CASE
                WHEN i.status = 'pending' AND i.expires_at <= NOW() THEN 'expired'
                ELSE i.status
            END AS status,
            i.created_at,
            i.expires_at,
            i.accepted_at,
            i.custom_message,
            p.name AS project_name,
            p.code AS project_code,
            u.id AS invited_by_id,
            u.email AS invited_by_email,
            u.full_name AS invited_by_full_name
        FROM project_invitations i
        -- `projects` is RLS-bound and this endpoint is anonymous, so an
        -- ordinary join returns nothing; the RLS-immune definer helper (00057)
        -- surfaces only the project's display fields. INNER LATERAL: a
        -- soft-deleted / missing project drops the row → 404 (matching org get).
        JOIN LATERAL public.project_invitation_project(i.project_id) p ON TRUE
        LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.token = $1
        "#,
    )
    .bind(invitation_token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invitation not found".into()))?;

    Ok(Json(ProjectInvitationDetail {
        id: row.id,
        project_id: row.project_id,
        email: row.email,
        role: row.role,
        token: row.token,
        status: row.status,
        invited_by: row.invited_by_id.map(|id| ProjectInvitationInviterSummary {
            id,
            email: row.invited_by_email.unwrap_or_default(),
            full_name: row.invited_by_full_name,
        }),
        created_at: row.created_at,
        expires_at: row.expires_at,
        accepted_at: row.accepted_at,
        custom_message: row.custom_message,
        project: ProjectInvitationProjectSummary {
            id: row.project_id,
            name: row.project_name,
            code: row.project_code,
        },
    }))
}

// ── Accept ───────────────────────────────────────────────────────────

/// POST /api/project-invitations/:token/accept
///
/// The security-sensitive path: the authenticated caller may only accept an
/// invitation addressed to THEIR email, that is still `pending` and unexpired.
/// On success it lands a `project_members` row with the invited role (cross-org
/// allowed post-Unit-1/2) and marks the invitation accepted. Idempotency
/// mirrors the org flow: the membership INSERT upserts on the project-member PK.
#[utoipa::path(
    post,
    path = "/api/project-invitations/{token}/accept",
    params(
        ("token" = Uuid, Path, description = "Invitation token")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Invitation accepted", body = crate::openapi::MessageResponse),
        (status = 404, description = "Invitation not found or expired", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn accept_project_invitation(
    user: AuthenticatedUser,
    tx: Tx,
    Path(invitation_token): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    // Resolve the caller's email — the invitation is keyed on it.
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    // Fetch the invitation — must be pending, unexpired, and addressed to this
    // user's (case-insensitive) email. A mismatch, wrong status, or expiry all
    // collapse to the same NotFound so the token never confirms an email guess.
    let row = sqlx::query_as::<_, (Uuid, String)>(
        r#"
        SELECT project_id, role
        FROM project_invitations
        WHERE token = $1 AND lower(email) = lower($2) AND status = 'pending' AND expires_at > NOW()
        "#,
    )
    .bind(invitation_token)
    .bind(&email)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invitation not found or expired".into()))?;

    let (project_id, role) = row;

    // Mark invitation as accepted.
    sqlx::query(
        "UPDATE project_invitations SET status = 'accepted', accepted_at = NOW() WHERE token = $1",
    )
    .bind(invitation_token)
    .execute(&mut **tx)
    .await?;

    // Land the project membership. Cross-org is allowed post-Unit-1/2 (the
    // 00009 org-check trigger was dropped in 00055). Upsert so a re-accept or a
    // pre-existing membership converges on the invited role rather than 500ing.
    sqlx::query(
        r#"
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
        "#,
    )
    .bind(project_id)
    .bind(user.user_id)
    .bind(&role)
    .execute(&mut **tx)
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Invitation accepted" }),
    ))
}

// ── Decline ──────────────────────────────────────────────────────────

/// POST /api/project-invitations/:token/decline
#[utoipa::path(
    post,
    path = "/api/project-invitations/{token}/decline",
    params(
        ("token" = Uuid, Path, description = "Invitation token")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Invitation declined", body = crate::openapi::MessageResponse),
        (status = 404, description = "Invitation not found or already processed", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn decline_project_invitation(
    user: AuthenticatedUser,
    tx: Tx,
    Path(invitation_token): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let rows_affected = sqlx::query(
        r#"
        UPDATE project_invitations
        SET status = 'declined', declined_at = NOW()
        WHERE token = $1 AND lower(email) = lower($2) AND status = 'pending'
        "#,
    )
    .bind(invitation_token)
    .bind(&email)
    .execute(&mut **tx)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound(
            "Invitation not found or already processed".into(),
        ));
    }

    Ok(Json(
        serde_json::json!({ "message": "Invitation declined" }),
    ))
}

// ── Revoke ───────────────────────────────────────────────────────────

/// DELETE /api/projects/:id/invitations/:inv_id  (revoke)
#[utoipa::path(
    delete,
    path = "/api/projects/{id}/invitations/{inv_id}",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("inv_id" = Uuid, Path, description = "Invitation id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Invitation revoked", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Invitation not found or already processed", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn revoke_project_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((project_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectManageMembers,
    )
    .await?;

    let revoked = sqlx::query_scalar::<_, String>(
        r#"
        UPDATE project_invitations
        SET status = 'revoked'
        WHERE id = $1 AND project_id = $2 AND status = 'pending'
        RETURNING email
        "#,
    )
    .bind(invitation_id)
    .bind(project_id)
    .fetch_optional(&mut **tx)
    .await?;

    let Some(email) = revoked else {
        return Err(ApiError::NotFound(
            "Invitation not found or already processed".into(),
        ));
    };

    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::InvitationRevoked,
            resource_type: resource::INVITATION,
            resource_id: Some(invitation_id),
            metadata: serde_json::json!({ "project_id": project_id, "email": email }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Invitation revoked" })))
}
