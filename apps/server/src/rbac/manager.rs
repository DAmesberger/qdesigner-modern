use sqlx::PgExecutor;
use uuid::Uuid;

use crate::error::ApiError;
use crate::rbac::models::{OrgRole, ProjectRole};

/// Central authority for checking roles.
///
/// Stateless — every method takes an `executor` (`&PgPool` or
/// `&mut **tx` from the per-request transaction extractor). When a
/// handler runs inside `set_rls_context`, passing `&mut **tx` keeps
/// the role-check query on the same pinned connection as the
/// surrounding handler so RLS sees the same `app.user_id`.
#[derive(Clone, Default)]
pub struct RbacManager;

impl RbacManager {
    pub fn new() -> Self {
        Self
    }

    // ── Organisation membership ──────────────────────────────────────

    /// Return the user's role inside the given organisation, or None.
    pub async fn get_org_role<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        org_id: Uuid,
    ) -> Result<Option<OrgRole>, ApiError> {
        let row = sqlx::query_scalar::<_, String>(
            r#"
            SELECT role FROM organization_members
            WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
            "#,
        )
        .bind(user_id)
        .bind(org_id)
        .fetch_optional(executor)
        .await?;

        Ok(row.and_then(|r| OrgRole::from_str(&r)))
    }

    /// Check whether the user holds *at least* the required org role.
    pub async fn has_org_role<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        org_id: Uuid,
        required: &OrgRole,
    ) -> Result<bool, ApiError> {
        let role = self.get_org_role(executor, user_id, org_id).await?;
        Ok(role.is_some_and(|r| org_role_level(&r) >= org_role_level(required)))
    }

    /// Return all organisation IDs + roles for a user.
    #[allow(dead_code)]
    pub async fn get_user_org_roles<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
    ) -> Result<Vec<(Uuid, String)>, ApiError> {
        let rows = sqlx::query_as::<_, (Uuid, String)>(
            r#"
            SELECT organization_id, role
            FROM organization_members
            WHERE user_id = $1 AND status = 'active'
            "#,
        )
        .bind(user_id)
        .fetch_all(executor)
        .await?;

        Ok(rows)
    }

    // ── Project membership ───────────────────────────────────────────

    /// Return the user's role inside the given project, or None.
    pub async fn get_project_role<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        project_id: Uuid,
    ) -> Result<Option<ProjectRole>, ApiError> {
        let row = sqlx::query_scalar::<_, String>(
            r#"
            SELECT role FROM project_members
            WHERE user_id = $1 AND project_id = $2
            "#,
        )
        .bind(user_id)
        .bind(project_id)
        .fetch_optional(executor)
        .await?;

        Ok(row.and_then(|r| ProjectRole::from_str(&r)))
    }

    /// Check whether the user holds *at least* the required project role.
    pub async fn has_project_role<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        project_id: Uuid,
        required: &ProjectRole,
    ) -> Result<bool, ApiError> {
        let role = self
            .get_project_role(executor, user_id, project_id)
            .await?;
        Ok(role.is_some_and(|r| project_role_level(&r) >= project_role_level(required)))
    }

    /// Whether the user may *read* the project under its org's
    /// `projectVisibility` policy (E-RBAC-1).
    ///
    /// Convenience predicate delegating to
    /// [`crate::api::access::verify_project_read_access`] so UI/gate call
    /// sites can ask the same question without duplicating the SQL: org
    /// `owner`/`admin`s and explicit project members always may; plain org
    /// members may only under `'org'` visibility.
    #[allow(dead_code)]
    pub async fn has_project_read<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, ApiError> {
        match crate::api::access::verify_project_read_access(executor, user_id, project_id).await {
            Ok(()) => Ok(true),
            Err(ApiError::Forbidden(_)) => Ok(false),
            Err(e) => Err(e),
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

fn org_role_level(role: &OrgRole) -> u8 {
    match role {
        OrgRole::Viewer => 1,
        OrgRole::Member => 2,
        OrgRole::Admin => 3,
        OrgRole::Owner => 4,
    }
}

fn project_role_level(role: &ProjectRole) -> u8 {
    match role {
        ProjectRole::Viewer => 1,
        ProjectRole::Editor => 2,
        ProjectRole::Admin => 3,
        ProjectRole::Owner => 4,
    }
}
