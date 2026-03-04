//! Shared access-control helpers used across API handlers.
//!
//! These functions centralise the most common authorization checks so that
//! individual route handlers don't need to duplicate SQL.

use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;

/// Look up the organization that owns a project.
pub async fn get_project_org_id(pool: &PgPool, project_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM projects WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Project not found".into()))
}

/// Verify that `user_id` is an active member of `org_id`.
pub async fn verify_org_membership(
    pool: &PgPool,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<(), ApiError> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden(
            "Not a member of this organization".into(),
        ));
    }
    Ok(())
}

/// Verify that `user_id` can at least *read* the given project.
///
/// Access is granted when the user is an active member of the project's
/// parent organization.
pub async fn verify_project_access(
    pool: &PgPool,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = $1 AND om.user_id = $2 AND om.status = 'active'
              AND p.deleted_at IS NULL
        )
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden("No access to this project".into()));
    }
    Ok(())
}

/// Verify that `user_id` can *write* to the given project.
///
/// Write access is granted when the user is a project member with at least
/// `editor` role, **or** an org-level `admin`/`owner`.
pub async fn verify_project_write_access(
    pool: &PgPool,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let has_write = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM project_members
            WHERE project_id = $1 AND user_id = $2 AND role IN ('owner', 'admin', 'editor')
        ) OR EXISTS(
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = $1 AND om.user_id = $2 AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
        )
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !has_write {
        return Err(ApiError::Forbidden(
            "No write access to this project".into(),
        ));
    }
    Ok(())
}

/// Verify that `user_id` has access to a questionnaire through its project's
/// parent organization.
pub async fn verify_questionnaire_access(
    pool: &PgPool,
    user_id: Uuid,
    questionnaire_id: Uuid,
) -> Result<(), ApiError> {
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM questionnaire_definitions qd
            JOIN projects p ON p.id = qd.project_id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE qd.id = $1 AND om.user_id = $2 AND om.status = 'active'
              AND qd.deleted_at IS NULL AND p.deleted_at IS NULL
        )
        "#,
    )
    .bind(questionnaire_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden(
            "No access to this questionnaire".into(),
        ));
    }
    Ok(())
}
