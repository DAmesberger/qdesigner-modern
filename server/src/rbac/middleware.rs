use axum::{extract::Path, extract::Request, middleware::Next, response::Response};
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::rbac::models::{OrgRole, Permission, ProjectRole};
use crate::state::AppState;

/// Middleware factory: require an org-level role.
/// The route must contain an `org_id` path parameter.
#[allow(dead_code)]
pub async fn require_org_role(
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(org_id): Path<Uuid>,
    request: Request,
    next: Next,
    required_role: OrgRole,
) -> Result<Response, ApiError> {
    let user = request
        .extensions()
        .get::<AuthenticatedUser>()
        .ok_or_else(|| ApiError::Unauthorized("Not authenticated".into()))?;

    if !state
        .rbac
        .has_org_role(user.user_id, org_id, &required_role)
        .await?
    {
        return Err(ApiError::Forbidden(format!(
            "Requires at least '{}' role in this organization",
            required_role.as_str()
        )));
    }

    Ok(next.run(request).await)
}

/// Middleware factory: require a project-level role.
/// The route must contain a `project_id` path parameter.
#[allow(dead_code)]
pub async fn require_project_role(
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(project_id): Path<Uuid>,
    request: Request,
    next: Next,
    required_role: ProjectRole,
) -> Result<Response, ApiError> {
    let user = request
        .extensions()
        .get::<AuthenticatedUser>()
        .ok_or_else(|| ApiError::Unauthorized("Not authenticated".into()))?;

    if !state
        .rbac
        .has_project_role(user.user_id, project_id, &required_role)
        .await?
    {
        return Err(ApiError::Forbidden(format!(
            "Requires at least '{}' role in this project",
            required_role.as_str()
        )));
    }

    Ok(next.run(request).await)
}

/// Middleware factory: require a specific permission for an organisation.
#[allow(dead_code)]
pub async fn require_org_permission(
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(org_id): Path<Uuid>,
    request: Request,
    next: Next,
    permission: Permission,
) -> Result<Response, ApiError> {
    let user = request
        .extensions()
        .get::<AuthenticatedUser>()
        .ok_or_else(|| ApiError::Unauthorized("Not authenticated".into()))?;

    if !state
        .rbac
        .has_org_permission(user.user_id, org_id, permission)
        .await?
    {
        return Err(ApiError::Forbidden(format!(
            "Missing permission: {}",
            permission.as_str()
        )));
    }

    Ok(next.run(request).await)
}

/// Middleware factory: require a specific permission for a project.
#[allow(dead_code)]
pub async fn require_project_permission(
    axum::extract::State(state): axum::extract::State<AppState>,
    Path(project_id): Path<Uuid>,
    request: Request,
    next: Next,
    permission: Permission,
) -> Result<Response, ApiError> {
    let user = request
        .extensions()
        .get::<AuthenticatedUser>()
        .ok_or_else(|| ApiError::Unauthorized("Not authenticated".into()))?;

    if !state
        .rbac
        .has_project_permission(user.user_id, project_id, permission)
        .await?
    {
        return Err(ApiError::Forbidden(format!(
            "Missing permission: {}",
            permission.as_str()
        )));
    }

    Ok(next.run(request).await)
}
