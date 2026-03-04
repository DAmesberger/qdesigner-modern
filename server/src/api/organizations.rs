use axum::{
    extract::{Path, Query, State},
    Json,
};
use lettre::message::header::ContentType;
use lettre::transport::smtp::client::Tls;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;

// ── Helpers ──────────────────────────────────────────────────────────

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub domain: Option<String>,
    pub logo_url: Option<String>,
    pub settings: serde_json::Value,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateOrgRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub slug: Option<String>,
    pub domain: Option<String>,
    pub logo_url: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateOrgRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub domain: Option<String>,
    pub logo_url: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct OrgMember {
    pub user_id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub role: String,
    pub status: String,
    pub joined_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct AddMemberRequest {
    #[validate(email)]
    pub email: String,
    pub role: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Invitation {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub invited_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateInvitationRequest {
    #[validate(email)]
    pub email: String,
    pub role: String,
    pub custom_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DomainRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub domain: String,
    pub verification_token: Option<String>,
    pub verification_method: Option<String>,
    pub verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub auto_join_enabled: bool,
    pub include_subdomains: bool,
    pub default_role: String,
    pub email_whitelist: Vec<String>,
    pub email_blacklist: Vec<String>,
    pub welcome_message: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDomainRequest {
    pub domain: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDomainRequest {
    pub auto_join_enabled: Option<bool>,
    pub include_subdomains: Option<bool>,
    pub default_role: Option<String>,
    pub welcome_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AutoJoinQuery {
    pub email: String,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/organizations
pub async fn list_organizations(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<Organization>>, ApiError> {
    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let orgs = sqlx::query_as::<_, Organization>(
        r#"
        SELECT o.id, o.name, o.slug, o.domain, o.logo_url, o.settings, o.created_at, o.updated_at
        FROM organizations o
        JOIN organization_members om ON om.organization_id = o.id
        WHERE om.user_id = $1 AND om.status = 'active' AND o.deleted_at IS NULL
        ORDER BY o.name
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user.user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(orgs))
}

/// POST /api/organizations
pub async fn create_organization(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(body): Json<CreateOrgRequest>,
) -> Result<(axum::http::StatusCode, Json<Organization>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Generate slug from name if not provided
    let slug = body.slug.unwrap_or_else(|| slugify(&body.name));

    // Check slug uniqueness
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1)")
            .bind(&slug)
            .fetch_one(&state.pool)
            .await?;

    if exists {
        return Err(ApiError::Conflict("Organization slug already taken".into()));
    }

    let org_id = Uuid::new_v4();

    let org = sqlx::query_as::<_, Organization>(
        r#"
        INSERT INTO organizations (id, name, slug, domain, logo_url, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, slug, domain, logo_url, settings, created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(&body.name)
    .bind(&slug)
    .bind(&body.domain)
    .bind(&body.logo_url)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    // Add the creator as owner
    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
        VALUES ($1, $2, 'owner', 'active', NOW())
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .execute(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(org)))
}

/// GET /api/organizations/:id
pub async fn get_organization(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Organization>, ApiError> {
    // Verify membership
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden(
            "Not a member of this organization".into(),
        ));
    }

    let org = sqlx::query_as::<_, Organization>(
        r#"
        SELECT id, name, slug, domain, logo_url, settings, created_at, updated_at
        FROM organizations WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(org_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    Ok(Json(org))
}

/// PATCH /api/organizations/:id
pub async fn update_organization(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Json(body): Json<UpdateOrgRequest>,
) -> Result<Json<Organization>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Require at least admin role
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let mut sets: Vec<String> = Vec::new();
    let mut idx = 2u32;

    if body.name.is_some() {
        sets.push(format!("name = ${idx}"));
        idx += 1;
    }
    if body.domain.is_some() {
        sets.push(format!("domain = ${idx}"));
        idx += 1;
    }
    if body.logo_url.is_some() {
        sets.push(format!("logo_url = ${idx}"));
        idx += 1;
    }
    if body.settings.is_some() {
        sets.push(format!("settings = ${idx}"));
    }

    if sets.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }

    sets.push("updated_at = NOW()".into());

    let sql = format!(
        "UPDATE organizations SET {} WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, slug, domain, logo_url, settings, created_at, updated_at",
        sets.join(", ")
    );

    let mut query = sqlx::query_as::<_, Organization>(&sql).bind(org_id);

    if let Some(ref v) = body.name {
        query = query.bind(v);
    }
    if let Some(ref v) = body.domain {
        query = query.bind(v);
    }
    if let Some(ref v) = body.logo_url {
        query = query.bind(v);
    }
    if let Some(ref v) = body.settings {
        query = query.bind(v);
    }

    let org = query
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    Ok(Json(org))
}

/// DELETE /api/organizations/:id  (soft delete)
pub async fn delete_organization(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Owner)
        .await?
    {
        return Err(ApiError::Forbidden(
            "Only owner can delete organization".into(),
        ));
    }

    sqlx::query("UPDATE organizations SET deleted_at = NOW() WHERE id = $1")
        .bind(org_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(
        serde_json::json!({ "message": "Organization deleted" }),
    ))
}

// ── Members ──────────────────────────────────────────────────────────

/// GET /api/organizations/:id/members
pub async fn list_members(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<OrgMember>>, ApiError> {
    // Verify membership
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden("Not a member".into()));
    }

    let members = sqlx::query_as::<_, OrgMember>(
        r#"
        SELECT u.id AS user_id, u.email, u.full_name, om.role, om.status, om.joined_at
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = $1
        ORDER BY om.joined_at
        "#,
    )
    .bind(org_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(members))
}

/// POST /api/organizations/:id/members
pub async fn add_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Json(body): Json<AddMemberRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Validate role value
    if !matches!(body.role.as_str(), "owner" | "admin" | "member" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, member, viewer".into(),
        ));
    }

    // Only owners can assign the owner role
    if body.role == "owner"
        && !state
            .rbac
            .has_org_role(
                user.user_id,
                org_id,
                &crate::rbac::models::OrgRole::Owner,
            )
            .await?
    {
        return Err(ApiError::Forbidden("Only owners can assign the owner role".into()));
    }

    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let target_user = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

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
    .execute(&state.pool)
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "message": "Member added" })),
    ))
}

/// DELETE /api/organizations/:id/members/:user_id
pub async fn remove_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((org_id, target_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    // Prevent removing the last owner
    if target_id != user.user_id {
        let target_role = sqlx::query_scalar::<_, String>(
            "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
        )
        .bind(org_id)
        .bind(target_id)
        .fetch_optional(&state.pool)
        .await?;

        if target_role.as_deref() == Some("owner") {
            let owner_count = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
            )
            .bind(org_id)
            .fetch_one(&state.pool)
            .await?;

            if owner_count <= 1 {
                return Err(ApiError::BadRequest("Cannot remove the last owner".into()));
            }
        }
    }

    sqlx::query("DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2")
        .bind(org_id)
        .bind(target_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Member removed" })))
}

// ── Invitations ──────────────────────────────────────────────────────

/// GET /api/organizations/:id/invitations
pub async fn list_invitations(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<Invitation>>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let invitations = sqlx::query_as::<_, Invitation>(
        r#"
        SELECT id, email, role, invited_by, created_at, expires_at
        FROM organization_invitations
        WHERE organization_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        "#,
    )
    .bind(org_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(invitations))
}

/// POST /api/organizations/:id/invitations
pub async fn create_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateInvitationRequest>,
) -> Result<(axum::http::StatusCode, Json<Invitation>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Validate role value
    if !matches!(body.role.as_str(), "owner" | "admin" | "member" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, member, viewer".into(),
        ));
    }

    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let expires_at = chrono::Utc::now() + chrono::Duration::days(7);

    let invitation = sqlx::query_as::<_, Invitation>(
        r#"
        INSERT INTO organization_invitations (organization_id, email, role, invited_by, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, role, invited_by, created_at, expires_at
        "#,
    )
    .bind(org_id)
    .bind(&body.email)
    .bind(&body.role)
    .bind(user.user_id)
    .bind(expires_at)
    .fetch_one(&state.pool)
    .await?;

    // Send invitation email
    let org_name = sqlx::query_scalar::<_, String>(
        "SELECT name FROM organizations WHERE id = $1",
    )
    .bind(org_id)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or_else(|| "your organization".to_string());

    let invite_link = format!("http://localhost:5173/invite/{}", invitation.id);

    let mut email_body = format!(
        "Hello,\n\n\
         You've been invited to join \"{}\" on QDesigner as a {}.\n\n",
        org_name, body.role
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
        .subject(format!("You've been invited to join {} on QDesigner", org_name))
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
            Ok(_) => tracing::info!("Invitation email sent to {}", recipient_email),
            Err(e) => tracing::error!("Failed to send invitation email: {e}"),
        }
    })
    .await
    .ok();

    Ok((axum::http::StatusCode::CREATED, Json(invitation)))
}

// ── Invitation accept / decline / revoke ─────────────────────────────

/// Model returned for pending-invitation list (includes org context).
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PendingInvitation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub email: String,
    pub role: String,
    pub invited_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// GET /api/invitations/pending
/// Returns all pending invitations addressed to the authenticated user's email.
pub async fn list_pending_invitations(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<PendingInvitation>>, ApiError> {
    // Look up the user's email
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let invitations = sqlx::query_as::<_, PendingInvitation>(
        r#"
        SELECT i.id, i.organization_id, o.name AS organization_name,
               i.email, i.role, i.invited_by, i.created_at, i.expires_at
        FROM organization_invitations i
        JOIN organizations o ON o.id = i.organization_id AND o.deleted_at IS NULL
        WHERE i.email = $1 AND i.status = 'pending' AND i.expires_at > NOW()
        ORDER BY i.created_at DESC
        "#,
    )
    .bind(&email)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(invitations))
}

/// POST /api/invitations/:id/accept
pub async fn accept_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(invitation_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Look up the user's email
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    // Fetch the invitation — must be pending, not expired, and addressed to this user
    let row = sqlx::query_as::<_, (Uuid, String)>(
        r#"
        SELECT organization_id, role
        FROM organization_invitations
        WHERE id = $1 AND email = $2 AND status = 'pending' AND expires_at > NOW()
        "#,
    )
    .bind(invitation_id)
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invitation not found or expired".into()))?;

    let (org_id, role) = row;

    // Mark invitation as accepted
    sqlx::query(
        "UPDATE organization_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1",
    )
    .bind(invitation_id)
    .execute(&state.pool)
    .await?;

    // Add user as org member (upsert in case they were previously removed)
    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
        VALUES ($1, $2, $3, 'active', NOW())
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3, status = 'active', joined_at = NOW()
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .bind(&role)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({ "message": "Invitation accepted" })))
}

/// POST /api/invitations/:id/decline
pub async fn decline_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(invitation_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let rows_affected = sqlx::query(
        r#"
        UPDATE organization_invitations
        SET status = 'declined', declined_at = NOW()
        WHERE id = $1 AND email = $2 AND status = 'pending'
        "#,
    )
    .bind(invitation_id)
    .bind(&email)
    .execute(&state.pool)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("Invitation not found or already processed".into()));
    }

    Ok(Json(serde_json::json!({ "message": "Invitation declined" })))
}

/// DELETE /api/organizations/:id/invitations/:inv_id  (revoke)
pub async fn revoke_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((org_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let rows_affected = sqlx::query(
        r#"
        UPDATE organization_invitations
        SET status = 'revoked'
        WHERE id = $1 AND organization_id = $2 AND status = 'pending'
        "#,
    )
    .bind(invitation_id)
    .bind(org_id)
    .execute(&state.pool)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("Invitation not found or already processed".into()));
    }

    Ok(Json(serde_json::json!({ "message": "Invitation revoked" })))
}

// ── Domains ──────────────────────────────────────────────────────────

/// GET /api/organizations/:id/domains
pub async fn list_domains(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<DomainRecord>>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let domains = sqlx::query_as::<_, DomainRecord>(
        r#"
        SELECT id, organization_id, domain, verification_token, verification_method,
               verified_at, auto_join_enabled, include_subdomains, default_role,
               email_whitelist, email_blacklist, welcome_message, created_at, updated_at
        FROM organization_domains
        WHERE organization_id = $1
        ORDER BY created_at
        "#,
    )
    .bind(org_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(domains))
}

/// POST /api/organizations/:id/domains
pub async fn create_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateDomainRequest>,
) -> Result<(axum::http::StatusCode, Json<DomainRecord>), ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let verification_token = Uuid::new_v4().to_string();

    let record = sqlx::query_as::<_, DomainRecord>(
        r#"
        INSERT INTO organization_domains (organization_id, domain, verification_token, verification_method)
        VALUES ($1, $2, $3, 'dns_txt')
        RETURNING id, organization_id, domain, verification_token, verification_method,
                  verified_at, auto_join_enabled, include_subdomains, default_role,
                  email_whitelist, email_blacklist, welcome_message, created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(&body.domain)
    .bind(&verification_token)
    .fetch_one(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(record)))
}

/// POST /api/organizations/:id/domains/:did/verify
pub async fn verify_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((org_id, domain_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    // In development, auto-verify the domain
    let rows_affected = sqlx::query(
        "UPDATE organization_domains SET verified_at = NOW(), updated_at = NOW() WHERE id = $1 AND organization_id = $2",
    )
    .bind(domain_id)
    .bind(org_id)
    .execute(&state.pool)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("Domain not found".into()));
    }

    Ok(Json(serde_json::json!({ "message": "Domain verified" })))
}

/// PATCH /api/organizations/:id/domains/:did
pub async fn update_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((org_id, domain_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateDomainRequest>,
) -> Result<Json<DomainRecord>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let mut sets: Vec<String> = Vec::new();
    let mut idx = 3u32;

    if body.auto_join_enabled.is_some() {
        sets.push(format!("auto_join_enabled = ${idx}"));
        idx += 1;
    }
    if body.include_subdomains.is_some() {
        sets.push(format!("include_subdomains = ${idx}"));
        idx += 1;
    }
    if body.default_role.is_some() {
        sets.push(format!("default_role = ${idx}"));
        idx += 1;
    }
    if body.welcome_message.is_some() {
        sets.push(format!("welcome_message = ${idx}"));
        let _ = idx; // suppress unused warning
    }

    if sets.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }

    sets.push("updated_at = NOW()".into());

    let sql = format!(
        "UPDATE organization_domains SET {} WHERE id = $1 AND organization_id = $2 \
         RETURNING id, organization_id, domain, verification_token, verification_method, \
         verified_at, auto_join_enabled, include_subdomains, default_role, \
         email_whitelist, email_blacklist, welcome_message, created_at, updated_at",
        sets.join(", ")
    );

    let mut query = sqlx::query_as::<_, DomainRecord>(&sql)
        .bind(domain_id)
        .bind(org_id);

    if let Some(v) = body.auto_join_enabled {
        query = query.bind(v);
    }
    if let Some(v) = body.include_subdomains {
        query = query.bind(v);
    }
    if let Some(ref v) = body.default_role {
        query = query.bind(v);
    }
    if let Some(ref v) = body.welcome_message {
        query = query.bind(v);
    }

    let record = query
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Domain not found".into()))?;

    Ok(Json(record))
}

/// DELETE /api/organizations/:id/domains/:did
pub async fn delete_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((org_id, domain_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &crate::rbac::models::OrgRole::Admin)
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let rows_affected =
        sqlx::query("DELETE FROM organization_domains WHERE id = $1 AND organization_id = $2")
            .bind(domain_id)
            .bind(org_id)
            .execute(&state.pool)
            .await?
            .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("Domain not found".into()));
    }

    Ok(Json(serde_json::json!({ "message": "Domain deleted" })))
}

/// GET /api/domains/auto-join?email=user@example.com
pub async fn check_auto_join(
    State(state): State<AppState>,
    Query(q): Query<AutoJoinQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let email_domain = q
        .email
        .rsplit_once('@')
        .map(|(_, d)| d.to_lowercase())
        .ok_or_else(|| ApiError::BadRequest("Invalid email format".into()))?;

    #[derive(sqlx::FromRow)]
    struct AutoJoinRow {
        organization_id: Uuid,
        organization_name: String,
        default_role: String,
        welcome_message: Option<String>,
    }

    let row = sqlx::query_as::<_, AutoJoinRow>(
        r#"
        SELECT od.organization_id, o.name AS organization_name,
               od.default_role, od.welcome_message
        FROM organization_domains od
        JOIN organizations o ON o.id = od.organization_id
        WHERE od.domain = $1
          AND od.verified_at IS NOT NULL
          AND od.auto_join_enabled = true
          AND o.deleted_at IS NULL
        LIMIT 1
        "#,
    )
    .bind(&email_domain)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "can_auto_join": true,
            "organization_id": r.organization_id,
            "organization_name": r.organization_name,
            "default_role": r.default_role,
            "welcome_message": r.welcome_message,
        }))),
        None => Ok(Json(serde_json::json!({
            "can_auto_join": false,
        }))),
    }
}
