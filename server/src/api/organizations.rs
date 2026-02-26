use axum::{
    extract::{Path, Query, State},
    Json,
};
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
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
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

    // In production, send invitation email via lettre here.
    tracing::info!("Invitation sent to {} for org {org_id}", body.email);

    Ok((axum::http::StatusCode::CREATED, Json(invitation)))
}
