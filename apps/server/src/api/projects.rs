use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

use crate::api::access;
use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::OrgRole;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub code: String,
    pub description: Option<String>,
    pub is_public: bool,
    pub status: String,
    pub max_participants: Option<i32>,
    pub irb_number: Option<String>,
    pub start_date: Option<chrono::NaiveDate>,
    pub end_date: Option<chrono::NaiveDate>,
    pub settings: serde_json::Value,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProjectRequest {
    pub organization_id: Uuid,
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    #[validate(length(min = 1, max = 50))]
    pub code: String,
    pub description: Option<String>,
    pub is_public: Option<bool>,
    pub max_participants: Option<i32>,
    pub irb_number: Option<String>,
    pub start_date: Option<chrono::NaiveDate>,
    pub end_date: Option<chrono::NaiveDate>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateProjectRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
    pub status: Option<String>,
    pub max_participants: Option<i32>,
    pub irb_number: Option<String>,
    pub start_date: Option<chrono::NaiveDate>,
    pub end_date: Option<chrono::NaiveDate>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ProjectListQuery {
    pub organization_id: Option<Uuid>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/projects
#[utoipa::path(
    get,
    path = "/api/projects",
    params(ProjectListQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Projects visible to the current user", body = [Project]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn list_projects(
    user: AuthenticatedUser,
    tx: Tx,
    Query(q): Query<ProjectListQuery>,
) -> Result<Json<Vec<Project>>, ApiError> {
    let mut tx = tx.tx().await?;

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let projects = if let Some(org_id) = q.organization_id {
        // Scope by the org's projectVisibility policy (E-RBAC-1). Under the
        // 'org' default every active member sees every project; under
        // 'members' only org owners/admins and explicit project_members do.
        match access::org_project_visibility(&mut **tx, org_id).await? {
            access::ProjectVisibility::Org => {
                sqlx::query_as::<_, Project>(
                    r#"
                    SELECT p.id, p.organization_id, p.name, p.code, p.description, p.is_public,
                           p.status, p.max_participants, p.irb_number, p.start_date, p.end_date,
                           p.settings, p.created_at, p.updated_at
                    FROM projects p
                    JOIN organization_members om ON om.organization_id = p.organization_id
                    WHERE om.user_id = $1 AND om.status = 'active'
                      AND p.organization_id = $2
                      AND p.deleted_at IS NULL
                    ORDER BY p.updated_at DESC
                    LIMIT $3 OFFSET $4
                    "#,
                )
                .bind(user.user_id)
                .bind(org_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(&mut **tx)
                .await?
            }
            access::ProjectVisibility::Members => {
                sqlx::query_as::<_, Project>(
                    r#"
                    SELECT p.id, p.organization_id, p.name, p.code, p.description, p.is_public,
                           p.status, p.max_participants, p.irb_number, p.start_date, p.end_date,
                           p.settings, p.created_at, p.updated_at
                    FROM projects p
                    WHERE p.organization_id = $2
                      AND p.deleted_at IS NULL
                      AND (
                        EXISTS (
                            SELECT 1 FROM organization_members om
                            WHERE om.organization_id = p.organization_id
                              AND om.user_id = $1 AND om.status = 'active'
                              AND om.role IN ('owner', 'admin')
                        )
                        OR EXISTS (
                            SELECT 1 FROM project_members pm
                            WHERE pm.project_id = p.id AND pm.user_id = $1
                        )
                      )
                    ORDER BY p.updated_at DESC
                    LIMIT $3 OFFSET $4
                    "#,
                )
                .bind(user.user_id)
                .bind(org_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(&mut **tx)
                .await?
            }
        }
    } else {
        // No org filter — evaluate each project against its OWN org's
        // projectVisibility so mixed-visibility orgs resolve per row. This
        // predicate mirrors access::verify_project_read_access exactly.
        sqlx::query_as::<_, Project>(
            r#"
            SELECT p.id, p.organization_id, p.name, p.code, p.description, p.is_public,
                   p.status, p.max_participants, p.irb_number, p.start_date, p.end_date,
                   p.settings, p.created_at, p.updated_at
            FROM projects p
            JOIN organizations o ON o.id = p.organization_id
            WHERE p.deleted_at IS NULL
              AND (
                EXISTS (
                    SELECT 1 FROM organization_members om
                    WHERE om.organization_id = p.organization_id
                      AND om.user_id = $1 AND om.status = 'active'
                      AND om.role IN ('owner', 'admin')
                )
                OR EXISTS (
                    SELECT 1 FROM project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = $1
                )
                OR (
                    COALESCE(o.settings->>'projectVisibility', 'org') = 'org'
                    AND EXISTS (
                        SELECT 1 FROM organization_members om
                        WHERE om.organization_id = p.organization_id
                          AND om.user_id = $1 AND om.status = 'active'
                    )
                )
              )
            ORDER BY p.updated_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user.user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&mut **tx)
        .await?
    };

    Ok(Json(projects))
}

/// POST /api/projects
#[utoipa::path(
    post,
    path = "/api/projects",
    request_body = CreateProjectRequest,
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Project created", body = Project),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn create_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Json(body): Json<CreateProjectRequest>,
) -> Result<(axum::http::StatusCode, Json<Project>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let mut tx = tx.tx().await?;

    // Require at least member role in the org
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            body.organization_id,
            &OrgRole::Member,
        )
        .await?
    {
        return Err(ApiError::Forbidden(
            "Requires member role in the organization".into(),
        ));
    }

    let project = sqlx::query_as::<_, Project>(
        r#"
        INSERT INTO projects (organization_id, name, code, description, is_public,
                              max_participants, irb_number, start_date, end_date, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, organization_id, name, code, description, is_public, status,
                  max_participants, irb_number, start_date, end_date, settings,
                  created_at, updated_at
        "#,
    )
    .bind(body.organization_id)
    .bind(&body.name)
    .bind(&body.code)
    .bind(&body.description)
    .bind(body.is_public.unwrap_or(false))
    .bind(body.max_participants)
    .bind(&body.irb_number)
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    // Add creator as project owner
    sqlx::query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')")
        .bind(project.id)
        .bind(user.user_id)
        .execute(&mut **tx)
        .await?;

    Ok((axum::http::StatusCode::CREATED, Json(project)))
}

/// GET /api/projects/:id
#[utoipa::path(
    get,
    path = "/api/projects/{id}",
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Project details", body = Project),
        (status = 404, description = "Project not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn get_project(
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Project>, ApiError> {
    let mut tx = tx.tx().await?;

    // Read access honours the org's projectVisibility policy (E-RBAC-1): org
    // owners/admins and explicit project members always pass; plain org members
    // pass only under 'org' visibility. Denied callers get 403 (not 404), so a
    // confidential project's existence is not leaked.
    access::verify_project_read_access(&mut **tx, user.user_id, project_id).await?;

    let project = sqlx::query_as::<_, Project>(
        r#"
        SELECT p.id, p.organization_id, p.name, p.code, p.description, p.is_public,
               p.status, p.max_participants, p.irb_number, p.start_date, p.end_date,
               p.settings, p.created_at, p.updated_at
        FROM projects p
        WHERE p.id = $1 AND p.deleted_at IS NULL
        "#,
    )
    .bind(project_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

    Ok(Json(project))
}

/// PATCH /api/projects/:id
#[utoipa::path(
    patch,
    path = "/api/projects/{id}",
    request_body = UpdateProjectRequest,
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Updated project", body = Project),
        (status = 400, description = "No fields to update", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project not found", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn update_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Json(body): Json<UpdateProjectRequest>,
) -> Result<Json<Project>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let mut tx = tx.tx().await?;

    // Check project-level permission
    if !state
        .rbac
        .has_project_role(
            &mut **tx,
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Editor,
        )
        .await?
    {
        // Fall back to org-level check
        let org_id =
            sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

        if !state
            .rbac
            .has_org_role(&mut **tx, user.user_id, org_id, &OrgRole::Admin)
            .await?
        {
            return Err(ApiError::Forbidden("Insufficient permissions".into()));
        }
    }

    // Build dynamic UPDATE
    let mut parts: Vec<String> = Vec::new();
    let mut bind_idx = 2u32;
    macro_rules! maybe_set {
        ($field:ident) => {
            if body.$field.is_some() {
                parts.push(format!("{} = ${bind_idx}", stringify!($field)));
                bind_idx += 1;
            }
        };
    }

    maybe_set!(name);
    maybe_set!(description);
    maybe_set!(is_public);
    maybe_set!(status);
    maybe_set!(max_participants);
    maybe_set!(irb_number);
    maybe_set!(start_date);
    maybe_set!(end_date);
    maybe_set!(settings);
    let _ = bind_idx; // suppress unused-assignment warning from last macro expansion

    if parts.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }
    parts.push("updated_at = NOW()".into());

    let sql = format!(
        r#"UPDATE projects SET {} WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, organization_id, name, code, description, is_public, status,
                  max_participants, irb_number, start_date, end_date, settings,
                  created_at, updated_at"#,
        parts.join(", ")
    );

    let mut query = sqlx::query_as::<_, Project>(&sql).bind(project_id);

    macro_rules! bind_opt {
        ($field:ident) => {
            if let Some(ref v) = body.$field {
                query = query.bind(v);
            }
        };
    }
    bind_opt!(name);
    bind_opt!(description);
    bind_opt!(is_public);
    bind_opt!(status);
    bind_opt!(max_participants);
    bind_opt!(irb_number);
    bind_opt!(start_date);
    bind_opt!(end_date);
    bind_opt!(settings);

    let project = query
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

    Ok(Json(project))
}

/// DELETE /api/projects/:id  (soft delete)
#[utoipa::path(
    delete,
    path = "/api/projects/{id}",
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Project deleted", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn delete_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(project_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    // Require project owner or org admin
    let org_id =
        sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM projects WHERE id = $1")
            .bind(project_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

    let is_project_owner = state
        .rbac
        .has_project_role(
            &mut **tx,
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Owner,
        )
        .await?;
    let is_org_admin = state
        .rbac
        .has_org_role(&mut **tx, user.user_id, org_id, &OrgRole::Admin)
        .await?;

    if !is_project_owner && !is_org_admin {
        return Err(ApiError::Forbidden(
            "Only project owner or org admin can delete".into(),
        ));
    }

    sqlx::query("UPDATE projects SET deleted_at = NOW(), status = 'deleted' WHERE id = $1")
        .bind(project_id)
        .execute(&mut **tx)
        .await?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ProjectDeleted,
            resource_type: resource::PROJECT,
            resource_id: Some(project_id),
            metadata: serde_json::json!({}),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Project deleted" })))
}

// ── Project Members ──────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ProjectMember {
    pub user_id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub role: String,
    pub joined_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct AddProjectMemberRequest {
    #[validate(email)]
    pub email: String,
    pub role: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateProjectMemberRequest {
    pub role: String,
}

/// Body for `POST /api/projects/:id/transfer-ownership` (E-RBAC-5).
#[derive(Debug, Deserialize, ToSchema)]
pub struct TransferProjectOwnershipRequest {
    /// The user who becomes the new project owner. Must be an active member
    /// of the project's parent organization (auto-added to the project as
    /// `owner` if not already a project member).
    pub new_owner_user_id: Uuid,
}

/// GET /api/projects/:id/members
#[utoipa::path(
    get,
    path = "/api/projects/{id}/members",
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Project members", body = [ProjectMember]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn list_project_members(
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<ProjectMember>>, ApiError> {
    let mut tx = tx.tx().await?;

    access::verify_project_read_access(&mut **tx, user.user_id, project_id).await?;

    let members = sqlx::query_as::<_, ProjectMember>(
        r#"
        SELECT u.id AS user_id, u.email, u.full_name, pm.role, pm.joined_at
        FROM project_members pm
        JOIN users u ON u.id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY pm.joined_at
        "#,
    )
    .bind(project_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(members))
}

/// POST /api/projects/:id/members
#[utoipa::path(
    post,
    path = "/api/projects/{id}/members",
    request_body = AddProjectMemberRequest,
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Project member added", body = crate::openapi::MessageResponse),
        (status = 400, description = "Invalid member request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project or user not found", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn add_project_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Json(body): Json<AddProjectMemberRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Validate role value
    if !matches!(body.role.as_str(), "owner" | "admin" | "editor" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, editor, viewer".into(),
        ));
    }

    let mut tx = tx.tx().await?;

    // Require project admin+ or org admin+
    let has_project_admin = state
        .rbac
        .has_project_role(
            &mut **tx,
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Admin,
        )
        .await?;

    if !has_project_admin {
        let org_id =
            sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

        if !state
            .rbac
            .has_org_role(&mut **tx, user.user_id, org_id, &OrgRole::Admin)
            .await?
        {
            return Err(ApiError::Forbidden("Requires admin role".into()));
        }
    }

    let target_user = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
    )
    .bind(&body.email)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    // Verify the target user is an active member of the project's parent org.
    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;
    access::verify_org_membership(&mut **tx, target_user, org_id)
        .await
        .map_err(|_| {
            ApiError::BadRequest(
                "User must be an active member of the organization before being added to a project"
                    .into(),
            )
        })?;

    sqlx::query(
        r#"
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
        "#,
    )
    .bind(project_id)
    .bind(target_user)
    .bind(&body.role)
    .execute(&mut **tx)
    .await?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ProjectMemberAdded,
            resource_type: resource::PROJECT_MEMBER,
            resource_id: Some(target_user),
            metadata: serde_json::json!({
                "project_id": project_id,
                "target_user_id": target_user,
                "email": body.email,
                "role": body.role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "message": "Member added" })),
    ))
}

/// PATCH /api/projects/:id/members/:uid
#[utoipa::path(
    patch,
    path = "/api/projects/{id}/members/{uid}",
    request_body = UpdateProjectMemberRequest,
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("uid" = Uuid, Path, description = "User id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Project member updated", body = crate::openapi::MessageResponse),
        (status = 400, description = "Invalid member request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project member not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn update_project_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((project_id, target_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateProjectMemberRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Validate role value
    if !matches!(body.role.as_str(), "owner" | "admin" | "editor" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, editor, viewer".into(),
        ));
    }

    let mut tx = tx.tx().await?;

    // Require project admin+ or org admin+
    let has_project_admin = state
        .rbac
        .has_project_role(
            &mut **tx,
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Admin,
        )
        .await?;

    if !has_project_admin {
        let org_id =
            sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

        if !state
            .rbac
            .has_org_role(&mut **tx, user.user_id, org_id, &OrgRole::Admin)
            .await?
        {
            return Err(ApiError::Forbidden("Requires admin role".into()));
        }
    }

    let rows_affected =
        sqlx::query("UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3")
            .bind(&body.role)
            .bind(project_id)
            .bind(target_id)
            .execute(&mut **tx)
            .await?
            .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("Project member not found".into()));
    }

    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;
    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ProjectMemberRoleChanged,
            resource_type: resource::PROJECT_MEMBER,
            resource_id: Some(target_id),
            metadata: serde_json::json!({
                "project_id": project_id,
                "target_user_id": target_id,
                "after": body.role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Member updated" })))
}

/// DELETE /api/projects/:id/members/:uid
#[utoipa::path(
    delete,
    path = "/api/projects/{id}/members/{uid}",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("uid" = Uuid, Path, description = "User id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Project member removed", body = crate::openapi::MessageResponse),
        (status = 400, description = "Cannot remove the last owner", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project member not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn remove_project_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((project_id, target_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    // Require project admin+ or org admin+
    let has_project_admin = state
        .rbac
        .has_project_role(
            &mut **tx,
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Admin,
        )
        .await?;

    if !has_project_admin {
        let org_id =
            sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

        if !state
            .rbac
            .has_org_role(&mut **tx, user.user_id, org_id, &OrgRole::Admin)
            .await?
        {
            return Err(ApiError::Forbidden("Requires admin role".into()));
        }
    }

    // Prevent removing the last owner
    let target_role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(target_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Project member not found".into()))?;

    if target_role == "owner" {
        let owner_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND role = 'owner'",
        )
        .bind(project_id)
        .fetch_one(&mut **tx)
        .await?;

        if owner_count <= 1 {
            return Err(ApiError::BadRequest(
                "Cannot remove the last project owner".into(),
            ));
        }
    }

    sqlx::query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2")
        .bind(project_id)
        .bind(target_id)
        .execute(&mut **tx)
        .await?;

    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;
    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ProjectMemberRemoved,
            resource_type: resource::PROJECT_MEMBER,
            resource_id: Some(target_id),
            metadata: serde_json::json!({
                "project_id": project_id,
                "target_user_id": target_id,
                "role": target_role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Member removed" })))
}

/// Guarded, atomic project-ownership mutation used by
/// [`transfer_project_ownership`].
///
/// Extracted from the handler for SQL-level testing (`tests/ownership_transfer.rs`)
/// without constructing the full `AppState`. Runs on the caller's transaction:
///   1. the new owner must be an active member of `org_id` (rejects transfer
///      to a non-member),
///   2. upsert the new owner into `project_members` as `owner` (auto-add when
///      they are an org member but not yet on the project),
///   3. demote any *other* existing owner to `admin`,
///   4. re-count owners and refuse to commit if the project would be left
///      without one.
pub async fn transfer_project_ownership_tx(
    conn: &mut sqlx::PgConnection,
    project_id: Uuid,
    org_id: Uuid,
    from_user_id: Uuid,
    new_owner_user_id: Uuid,
) -> Result<(), ApiError> {
    // (1) New owner must be an active member of the project's parent org.
    let is_org_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(new_owner_user_id)
    .fetch_one(&mut *conn)
    .await?;

    if !is_org_member {
        return Err(ApiError::BadRequest(
            "New owner must be an active member of the organization".into(),
        ));
    }

    // (2) Promote (or auto-add) the new owner.
    sqlx::query(
        r#"
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner'
        "#,
    )
    .bind(project_id)
    .bind(new_owner_user_id)
    .execute(&mut *conn)
    .await?;

    // (3) Demote every *other* current owner to admin so ownership is singular.
    sqlx::query(
        "UPDATE project_members SET role = 'admin' WHERE project_id = $1 AND user_id <> $2 AND role = 'owner'",
    )
    .bind(project_id)
    .bind(new_owner_user_id)
    .execute(&mut *conn)
    .await?;

    let _ = from_user_id;

    // (4) Never leave the project without an owner.
    let owner_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND role = 'owner'",
    )
    .bind(project_id)
    .fetch_one(&mut *conn)
    .await?;

    if owner_count < 1 {
        return Err(ApiError::BadRequest(
            "Ownership transfer would leave the project without an owner".into(),
        ));
    }

    Ok(())
}

/// POST /api/projects/:id/transfer-ownership (E-RBAC-5)
///
/// Reassigns the sole project owner. The caller must be the current project
/// owner or an org owner/admin. The new owner must already be an org member;
/// if they are not yet a project member they are auto-added as `owner`. Any
/// previous project owner is demoted to `admin` in the same transaction.
#[utoipa::path(
    post,
    path = "/api/projects/{id}/transfer-ownership",
    request_body = TransferProjectOwnershipRequest,
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Ownership transferred", body = crate::openapi::MessageResponse),
        (status = 400, description = "Target is not a member / would leave no owner", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Caller may not transfer this project", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Project not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["projects"]
)]
pub async fn transfer_project_ownership(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Json(body): Json<TransferProjectOwnershipRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    let org_id = access::get_project_org_id(&mut **tx, project_id).await?;

    // Caller must be the project owner, or an org owner/admin.
    let is_project_owner = state
        .rbac
        .has_project_role(
            &mut **tx,
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Owner,
        )
        .await?;

    let is_org_admin = state
        .rbac
        .has_org_role(&mut **tx, user.user_id, org_id, &OrgRole::Admin)
        .await?;

    if !is_project_owner && !is_org_admin {
        return Err(ApiError::Forbidden(
            "Only the project owner or an org admin can transfer ownership".into(),
        ));
    }

    transfer_project_ownership_tx(
        &mut **tx,
        project_id,
        org_id,
        user.user_id,
        body.new_owner_user_id,
    )
    .await?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ProjectOwnershipTransferred,
            resource_type: resource::PROJECT,
            resource_id: Some(project_id),
            metadata: serde_json::json!({
                "project_id": project_id,
                "transferred_from": user.user_id,
                "transferred_to": body.new_owner_user_id,
                "transferred_at": chrono::Utc::now().to_rfc3339(),
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Ownership transferred" }),
    ))
}
