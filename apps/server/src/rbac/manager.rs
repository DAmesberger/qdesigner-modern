use std::collections::HashSet;

use sqlx::PgExecutor;
use uuid::Uuid;

use crate::error::ApiError;
use crate::rbac::models::{OrgRole, Permission, ProjectRole};

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

    // ── Granular permissions (E-RBAC-3) ──────────────────────────────

    /// Resolve the caller's **effective** permission set inside `org_id`.
    ///
    /// One round-trip joins the member's row to any assigned custom role:
    ///   * member has a `custom_role_id` → the custom role's stored
    ///     `permissions text[]` is authoritative (it may narrow *or* widen
    ///     the base tier — this is how a bespoke "Analyst" restricts an
    ///     otherwise-privileged member to read + export).
    ///   * member has no custom role → the system role's
    ///     [`OrgRole::default_permissions`] preset.
    ///   * not an active member → the empty set.
    ///
    /// Unknown permission strings surviving in a custom row (e.g. a token
    /// retired in a later release) are skipped rather than erroring, so a
    /// stale row can never wedge the gate.
    pub async fn resolve_permissions<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        org_id: Uuid,
    ) -> Result<HashSet<Permission>, ApiError> {
        let row = sqlx::query_as::<_, (String, Option<Vec<String>>)>(
            r#"
            SELECT om.role, r.permissions
            FROM organization_members om
            LEFT JOIN org_roles r ON r.id = om.custom_role_id
            WHERE om.organization_id = $1
              AND om.user_id = $2
              AND om.status = 'active'
            "#,
        )
        .bind(org_id)
        .bind(user_id)
        .fetch_optional(executor)
        .await?;

        let Some((role, custom)) = row else {
            return Ok(HashSet::new());
        };

        match custom {
            Some(perms) => Ok(perms
                .iter()
                .filter_map(|p| Permission::from_str(p))
                .collect()),
            None => Ok(OrgRole::from_str(&role)
                .map(|r| r.default_permissions().iter().copied().collect())
                .unwrap_or_default()),
        }
    }

    /// Fine-grained gate used **alongside** the coarse role-tier checks on
    /// endpoints that warrant per-action control (analytics reads, export,
    /// publish — E-RBAC-3 step 4).
    ///
    /// Contract, chosen so migrating an endpoint to this call is behaviour-
    /// preserving for the four built-in roles:
    ///   * not an active member → `Forbidden` (membership is always required).
    ///   * member on a **system** role → admitted here (pass-through); their
    ///     authority is fully governed by the existing tier / project-scope
    ///     checks that remain in place, so no built-in role's behaviour
    ///     changes.
    ///   * member on a **custom** role → the permission must be present in
    ///     the custom set, else `Forbidden`. This is the override surface: a
    ///     custom role can deny an action its base tier would otherwise allow.
    ///
    /// Because a system-role member is passed through, this method must be
    /// paired with the endpoint's existing coarse gate — it is a *tightening*
    /// layer for custom roles, not a standalone authorization.
    pub async fn require_permission<'e>(
        &self,
        executor: impl PgExecutor<'e>,
        user_id: Uuid,
        org_id: Uuid,
        permission: Permission,
    ) -> Result<(), ApiError> {
        let row = sqlx::query_as::<_, (Option<Vec<String>>,)>(
            r#"
            SELECT r.permissions
            FROM organization_members om
            LEFT JOIN org_roles r ON r.id = om.custom_role_id
            WHERE om.organization_id = $1
              AND om.user_id = $2
              AND om.status = 'active'
            "#,
        )
        .bind(org_id)
        .bind(user_id)
        .fetch_optional(executor)
        .await?;

        match row {
            // Not a member.
            None => Err(ApiError::Forbidden(
                "Not a member of this organization".into(),
            )),
            // System role: governed by the coarse checks — pass through.
            Some((None,)) => Ok(()),
            // Custom role: enforce the granular set.
            Some((Some(perms),)) => {
                let granted = perms.iter().any(|p| p == permission.as_str());
                if granted {
                    Ok(())
                } else {
                    Err(ApiError::Forbidden(format!(
                        "Your role does not grant the '{}' permission",
                        permission.as_str()
                    )))
                }
            }
        }
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
