//! Shared access-control helpers used across API handlers.
//!
//! These functions centralise the most common authorization checks so that
//! individual route handlers don't need to duplicate SQL.
//!
//! Every helper takes an `executor: impl sqlx::PgExecutor<'_>`, which
//! accepts both `&PgPool` (for auth/dev routes that don't run inside the
//! `set_rls_context` middleware) and `&mut **tx` from the per-request
//! transaction (for protected routes). Running these checks on the same
//! transaction-pinned connection as the surrounding handler is what lets
//! them benefit from RLS once Phase 5 P5.3 lands the FORCE migration.

use sqlx::PgExecutor;
use uuid::Uuid;

use crate::error::ApiError;

/// Look up the organization that owns a project.
pub async fn get_project_org_id<'e>(
    executor: impl PgExecutor<'e>,
    project_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM projects WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(project_id)
    .fetch_optional(executor)
    .await?
    .ok_or_else(|| ApiError::NotFound("Project not found".into()))
}

/// Look up the organization that owns a questionnaire (via its project).
///
/// Used by the analytics/export handlers to resolve the org context needed
/// for a granular [`RbacManager::require_permission`](crate::rbac::manager::RbacManager::require_permission)
/// check after the coarse questionnaire-access gate has already run.
pub async fn get_questionnaire_org_id<'e>(
    executor: impl PgExecutor<'e>,
    questionnaire_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT p.organization_id
        FROM questionnaire_definitions qd
        JOIN projects p ON p.id = qd.project_id
        WHERE qd.id = $1 AND qd.deleted_at IS NULL AND p.deleted_at IS NULL
        "#,
    )
    .bind(questionnaire_id)
    .fetch_optional(executor)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))
}

/// Read an organization's data-residency region (E-RBAC-9), defaulting to
/// `eu` when the org row is missing or the column is somehow NULL. Used to
/// route new media/export storage keys under the org's region prefix.
pub async fn org_data_region<'e>(
    executor: impl PgExecutor<'e>,
    org_id: Uuid,
) -> Result<String, ApiError> {
    let region = sqlx::query_scalar::<_, Option<String>>(
        "SELECT data_region FROM organizations WHERE id = $1",
    )
    .bind(org_id)
    .fetch_optional(executor)
    .await?
    .flatten()
    .unwrap_or_else(|| "eu".to_string());
    Ok(region)
}

/// Verify that `user_id` is an active member of `org_id`.
pub async fn verify_org_membership<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<(), ApiError> {
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user_id)
    .fetch_one(executor)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden(
            "Not a member of this organization".into(),
        ));
    }
    Ok(())
}

/// Verify that `user_id` is an active member of the project's parent
/// organization — **org-wide** read visibility.
///
/// This admits *every* active org member to *every* project in the org,
/// regardless of `project_members`. It is retained only for call sites that
/// intentionally want org-wide visibility. For project-confidential resources
/// prefer [`verify_project_read_access`], which is the default read gate: it
/// honours the org's `projectVisibility` setting so a project can be made
/// confidential to org members who are not on it (see [`ProjectVisibility`]).
pub async fn verify_project_access<'e>(
    executor: impl PgExecutor<'e>,
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
    .fetch_one(executor)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden("No access to this project".into()));
    }
    Ok(())
}

/// An organization's project-visibility policy, read from
/// `organizations.settings->>'projectVisibility'`.
///
/// - [`Org`](Self::Org) (default): every active org member can read every
///   project in the org — the legacy behaviour, preserved for backward
///   compatibility so no existing org's read surface changes silently.
/// - [`Members`](Self::Members): only org `owner`/`admin`s and explicit
///   `project_members` can read a project. This makes `ProjectRole` a real
///   read boundary — a project becomes confidential to org members who have
///   not been added to it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProjectVisibility {
    Org,
    Members,
}

impl ProjectVisibility {
    /// Map the raw `settings->>'projectVisibility'` value to the enum,
    /// defaulting to [`Org`](Self::Org) for absent/NULL/unrecognised input.
    fn from_setting(raw: Option<&str>) -> Self {
        match raw {
            Some("members") => ProjectVisibility::Members,
            _ => ProjectVisibility::Org,
        }
    }
}

/// Read an organization's [`ProjectVisibility`] from
/// `organizations.settings->>'projectVisibility'`.
///
/// Defaults to [`ProjectVisibility::Org`] when the key is absent, NULL, or
/// unrecognised — existing orgs keep org-wide project visibility until an
/// admin opts into strict per-member isolation. Mirrors the SQL helper
/// `public.org_project_visibility(org_id)` used by the `projects_select` RLS
/// policy so the handler gate and RLS agree.
pub async fn org_project_visibility<'e>(
    executor: impl PgExecutor<'e>,
    org_id: Uuid,
) -> Result<ProjectVisibility, ApiError> {
    let raw = sqlx::query_scalar::<_, Option<String>>(
        "SELECT settings->>'projectVisibility' FROM organizations WHERE id = $1",
    )
    .bind(org_id)
    .fetch_optional(executor)
    .await?
    .flatten();

    Ok(ProjectVisibility::from_setting(raw.as_deref()))
}

/// Verify that `user_id` can *read* the given project under its org's
/// configured [`ProjectVisibility`] — the **default** project read gate.
///
/// Access is granted when the user is an org `owner`/`admin`, **or** an
/// explicit `project_members` row exists, **or** the org's `projectVisibility`
/// setting is `'org'` (the default) and the user is any active org member.
/// This mirrors both the `questionnaire_definitions` RLS predicate (00014) and
/// the `projects_select*` policies (00033), so the handler-layer gate and RLS
/// agree that `ProjectRole` is load-bearing for reads under `'members'`
/// visibility.
///
/// Prefer this over [`verify_project_access`] (which grants org-wide read
/// unconditionally) for any project-confidential resource. Returns
/// [`ApiError::Forbidden`] when the user may not read the project (including
/// when the project does not exist, to avoid leaking existence).
///
/// E-RBAC-10: an active (non-expired) `resource_shares` grant on the project
/// also admits read, so an external collaborator gains scoped visibility
/// without any org/project membership. Guests never appear in the org project
/// list (that path stays membership-scoped) — they reach the project only
/// through this by-id gate and the "Shared with me" surface.
pub async fn verify_project_read_access<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM projects p
            JOIN organizations o ON o.id = p.organization_id
            WHERE p.id = $1 AND p.deleted_at IS NULL
              AND (
                -- org owner/admin: unconditional read
                EXISTS (
                    SELECT 1 FROM organization_members om
                    WHERE om.organization_id = p.organization_id
                      AND om.user_id = $2 AND om.status = 'active'
                      AND om.role IN ('owner', 'admin')
                )
                -- explicit project member: read regardless of visibility
                OR EXISTS (
                    SELECT 1 FROM project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = $2
                )
                -- org-wide visibility (default): any active org member
                OR (
                    COALESCE(o.settings->>'projectVisibility', 'org') = 'org'
                    AND EXISTS (
                        SELECT 1 FROM organization_members om
                        WHERE om.organization_id = p.organization_id
                          AND om.user_id = $2 AND om.status = 'active'
                    )
                )
                -- external guest with an active project share (E-RBAC-10)
                OR public.user_has_active_share('project', p.id, $2)
              )
        )
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(executor)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden("No access to this project".into()));
    }
    Ok(())
}

/// Verify that `user_id` can *write* to the given project.
///
/// Write access is granted when the user is a project member with at least
/// `editor` role, **or** an org-level `admin`/`owner`, **or** (E-RBAC-10) holds
/// an active `editor` `resource_shares` grant on the project — the scoped-edit
/// path for an external collaborator. A `viewer` share never confers write.
pub async fn verify_project_write_access<'e>(
    executor: impl PgExecutor<'e>,
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
        ) OR public.user_has_active_edit_share('project', $1, $2)
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(executor)
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
///
/// E-RBAC-10: an active `resource_shares` grant on the questionnaire itself, or
/// on its parent project, also admits access — this is the analytics-sharing
/// path (a guest reviewer in another org reads exactly the shared
/// questionnaire's data and nothing else). The grant confers read/analytics
/// only; org-management surfaces stay gated by membership.
pub async fn verify_questionnaire_access<'e>(
    executor: impl PgExecutor<'e>,
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
        ) OR public.user_can_read_questionnaire_via_share($1, $2)
        "#,
    )
    .bind(questionnaire_id)
    .bind(user_id)
    .fetch_one(executor)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden(
            "No access to this questionnaire".into(),
        ));
    }
    Ok(())
}
