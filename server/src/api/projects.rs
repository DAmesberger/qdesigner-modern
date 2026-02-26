use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::rbac::models::OrgRole;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
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

#[derive(Debug, Deserialize, Validate)]
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

#[derive(Debug, Deserialize, Validate)]
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

#[derive(Debug, Deserialize)]
pub struct ProjectListQuery {
    pub organization_id: Option<Uuid>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/projects
pub async fn list_projects(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(q): Query<ProjectListQuery>,
) -> Result<Json<Vec<Project>>, ApiError> {
    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let projects = if let Some(org_id) = q.organization_id {
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
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query_as::<_, Project>(
            r#"
            SELECT p.id, p.organization_id, p.name, p.code, p.description, p.is_public,
                   p.status, p.max_participants, p.irb_number, p.start_date, p.end_date,
                   p.settings, p.created_at, p.updated_at
            FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE om.user_id = $1 AND om.status = 'active'
              AND p.deleted_at IS NULL
            ORDER BY p.updated_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(user.user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?
    };

    Ok(Json(projects))
}

/// POST /api/projects
pub async fn create_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(body): Json<CreateProjectRequest>,
) -> Result<(axum::http::StatusCode, Json<Project>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Require at least member role in the org
    if !state
        .rbac
        .has_org_role(user.user_id, body.organization_id, &OrgRole::Member)
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
    .fetch_one(&state.pool)
    .await?;

    // Add creator as project owner
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(project.id)
    .bind(user.user_id)
    .execute(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(project)))
}

/// GET /api/projects/:id
pub async fn get_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Project>, ApiError> {
    let project = sqlx::query_as::<_, Project>(
        r#"
        SELECT p.id, p.organization_id, p.name, p.code, p.description, p.is_public,
               p.status, p.max_participants, p.irb_number, p.start_date, p.end_date,
               p.settings, p.created_at, p.updated_at
        FROM projects p
        JOIN organization_members om ON om.organization_id = p.organization_id
        WHERE p.id = $1 AND om.user_id = $2 AND om.status = 'active'
          AND p.deleted_at IS NULL
        "#,
    )
    .bind(project_id)
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

    Ok(Json(project))
}

/// PATCH /api/projects/:id
pub async fn update_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(project_id): Path<Uuid>,
    Json(body): Json<UpdateProjectRequest>,
) -> Result<Json<Project>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Check project-level permission
    if !state
        .rbac
        .has_project_role(
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Editor,
        )
        .await?
    {
        // Fall back to org-level check
        let org_id = sqlx::query_scalar::<_, Uuid>(
            "SELECT organization_id FROM projects WHERE id = $1",
        )
        .bind(project_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

        if !state
            .rbac
            .has_org_role(user.user_id, org_id, &OrgRole::Admin)
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
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

    Ok(Json(project))
}

/// DELETE /api/projects/:id  (soft delete)
pub async fn delete_project(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(project_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Require project owner or org admin
    let org_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Project not found".into()))?;

    let is_project_owner = state
        .rbac
        .has_project_role(
            user.user_id,
            project_id,
            &crate::rbac::models::ProjectRole::Owner,
        )
        .await?;
    let is_org_admin = state
        .rbac
        .has_org_role(user.user_id, org_id, &OrgRole::Admin)
        .await?;

    if !is_project_owner && !is_org_admin {
        return Err(ApiError::Forbidden(
            "Only project owner or org admin can delete".into(),
        ));
    }

    sqlx::query("UPDATE projects SET deleted_at = NOW(), status = 'deleted' WHERE id = $1")
        .bind(project_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Project deleted" })))
}
