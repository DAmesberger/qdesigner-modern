use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;
use crate::rbac::models::{OrgRole, Permission, ProjectRole};

/// Central authority for checking roles and permissions.
#[derive(Clone)]
pub struct RbacManager {
    pool: PgPool,
}

impl RbacManager {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // ── Organisation membership ──────────────────────────────────────

    /// Return the user's role inside the given organisation, or None.
    pub async fn get_org_role(
        &self,
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
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.and_then(|r| OrgRole::from_str(&r)))
    }

    /// Check whether the user holds *at least* the required org role.
    pub async fn has_org_role(
        &self,
        user_id: Uuid,
        org_id: Uuid,
        required: &OrgRole,
    ) -> Result<bool, ApiError> {
        let role = self.get_org_role(user_id, org_id).await?;
        Ok(role.map_or(false, |r| org_role_level(&r) >= org_role_level(required)))
    }

    /// Return all organisation IDs + roles for a user.
    #[allow(dead_code)]
    pub async fn get_user_org_roles(&self, user_id: Uuid) -> Result<Vec<(Uuid, String)>, ApiError> {
        let rows = sqlx::query_as::<_, (Uuid, String)>(
            r#"
            SELECT organization_id, role
            FROM organization_members
            WHERE user_id = $1 AND status = 'active'
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows)
    }

    // ── Project membership ───────────────────────────────────────────

    /// Return the user's role inside the given project, or None.
    pub async fn get_project_role(
        &self,
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
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.and_then(|r| ProjectRole::from_str(&r)))
    }

    /// Check whether the user holds *at least* the required project role.
    pub async fn has_project_role(
        &self,
        user_id: Uuid,
        project_id: Uuid,
        required: &ProjectRole,
    ) -> Result<bool, ApiError> {
        let role = self.get_project_role(user_id, project_id).await?;
        Ok(role.map_or(false, |r| {
            project_role_level(&r) >= project_role_level(required)
        }))
    }

    // ── Permission checks ────────────────────────────────────────────

    /// Check whether a user has a given permission for an organisation.
    #[allow(dead_code)]
    pub async fn has_org_permission(
        &self,
        user_id: Uuid,
        org_id: Uuid,
        perm: Permission,
    ) -> Result<bool, ApiError> {
        let role = match self.get_org_role(user_id, org_id).await? {
            Some(r) => r,
            None => return Ok(false),
        };

        Ok(org_role_has_permission(&role, perm))
    }

    /// Check whether a user has a given permission for a project.
    /// Falls back to the org role if no project-level membership exists.
    #[allow(dead_code)]
    pub async fn has_project_permission(
        &self,
        user_id: Uuid,
        project_id: Uuid,
        perm: Permission,
    ) -> Result<bool, ApiError> {
        // Check project-level role first
        if let Some(role) = self.get_project_role(user_id, project_id).await? {
            if project_role_has_permission(&role, perm) {
                return Ok(true);
            }
        }

        // Fall back to org-level role
        let org_id =
            sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&self.pool)
                .await?;

        if let Some(oid) = org_id {
            return self.has_org_permission(user_id, oid, perm).await;
        }

        Ok(false)
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

#[allow(dead_code)]
fn org_role_has_permission(role: &OrgRole, perm: Permission) -> bool {
    match role {
        OrgRole::Owner => true, // owner can do everything
        OrgRole::Admin => !matches!(perm, Permission::OrgDelete),
        OrgRole::Member => matches!(
            perm,
            Permission::OrgRead
                | Permission::ProjectRead
                | Permission::ProjectWrite
                | Permission::QuestionnaireRead
                | Permission::QuestionnaireWrite
                | Permission::SessionRead
                | Permission::SessionWrite
                | Permission::ResponseRead
                | Permission::ResponseWrite
                | Permission::MediaRead
                | Permission::MediaWrite
        ),
        OrgRole::Viewer => matches!(
            perm,
            Permission::OrgRead
                | Permission::ProjectRead
                | Permission::QuestionnaireRead
                | Permission::SessionRead
                | Permission::ResponseRead
                | Permission::MediaRead
        ),
    }
}

#[allow(dead_code)]
fn project_role_has_permission(role: &ProjectRole, perm: Permission) -> bool {
    match role {
        ProjectRole::Owner => true,
        ProjectRole::Admin => !matches!(perm, Permission::ProjectDelete | Permission::OrgDelete),
        ProjectRole::Editor => matches!(
            perm,
            Permission::ProjectRead
                | Permission::QuestionnaireRead
                | Permission::QuestionnaireWrite
                | Permission::SessionRead
                | Permission::SessionWrite
                | Permission::ResponseRead
                | Permission::ResponseWrite
                | Permission::MediaRead
                | Permission::MediaWrite
        ),
        ProjectRole::Viewer => matches!(
            perm,
            Permission::ProjectRead
                | Permission::QuestionnaireRead
                | Permission::SessionRead
                | Permission::ResponseRead
                | Permission::MediaRead
        ),
    }
}
