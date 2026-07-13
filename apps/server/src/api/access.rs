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
//!
//! ADR 0030: the coarse `verify_*` gates below are `pub(crate)` — the single
//! application-layer authorization entry point is
//! [`crate::authz::authorize`], which composes the right `verify_*` gate with
//! the custom-role tightening. New authenticated handlers call `authorize`;
//! these gates stay reachable only for `authorize` itself and the handful of
//! still-divergent sites recorded in the ADR-0030 divergence ledger.

use sqlx::PgExecutor;
use uuid::Uuid;

use crate::error::ApiError;
use crate::rbac::models::ProjectRole;

/// Look up the organization that owns a project.
///
/// ADR 0032: resolves through the `SECURITY DEFINER` `public.project_org_id`
/// so org resolution is RLS-immune — an authorization decision can no longer
/// 404 because the caller cannot *see* the `projects` row under RLS. The
/// function returns NULL for an absent/soft-deleted project, which maps to
/// the same `NotFound` as before.
pub async fn get_project_org_id<'e>(
    executor: impl PgExecutor<'e>,
    project_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Option<Uuid>>("SELECT public.project_org_id($1)")
        .bind(project_id)
        .fetch_one(executor)
        .await?
        .ok_or_else(|| ApiError::NotFound("Project not found".into()))
}

/// Look up the organization that owns a questionnaire (via its project).
///
/// Used by the analytics/export handlers to resolve the org context needed
/// for a granular [`RbacManager::require_permission`](crate::rbac::manager::RbacManager::require_permission)
/// check after the coarse questionnaire-access gate has already run.
///
/// ADR 0032/0033: resolves through the `SECURITY DEFINER` `public.questionnaire_org_id`
/// so a cross-org project member — admitted by the membership-aware coarse gate
/// `verify_questionnaire_access` — no longer 404s here because the parent
/// `projects` row is invisible to them under RLS. NULL (absent/soft-deleted)
/// maps to `NotFound` exactly as before.
pub async fn get_questionnaire_org_id<'e>(
    executor: impl PgExecutor<'e>,
    questionnaire_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Option<Uuid>>("SELECT public.questionnaire_org_id($1)")
        .bind(questionnaire_id)
        .fetch_one(executor)
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
///
/// ADR 0033: `add_project_member` no longer requires the target to be an org
/// member (external collaboration is cross-org project membership), which was
/// this helper's only caller. Retained for the org-membership probes reused by
/// later units (e.g. `project_invitations`) and the org read gate.
#[allow(dead_code)]
pub(crate) async fn verify_org_membership<'e>(
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

/// The tiered project access gate (ADR 0032). Generalizes the read/write pair
/// to all four [`ProjectRole`] tiers in one gate, keyed on `required`, so
/// `authorize`'s `Scope::Project` arm can enforce the exact tier
/// `min_project_role_for` maps a permission to. Each tier reproduces the
/// pre-0032 predicate branch-for-branch
/// (see the `public.user_has_project_access` migration comment):
///
/// - [`Viewer`](ProjectRole::Viewer) ≡ [`verify_project_read_access`]: org
///   owner/admin, any project member (ADR 0033: including a cross-org project
///   member), or an org-visibility-default active org member.
/// - [`Editor`](ProjectRole::Editor) ≡ [`verify_project_write_access`]: project
///   member owner/admin/editor, or org owner/admin. (ADR 0033 reverted the
///   former editor-share branch, ledger L8/S2 — an external editor is now a
///   project `Editor` member.)
/// - [`Admin`](ProjectRole::Admin) / [`Owner`](ProjectRole::Owner) ≡
///   [`RbacManager::has_project_role`](crate::rbac::manager::RbacManager::has_project_role)
///   OR the org owner/admin override (ledger L5): a `project_members` row of at
///   least that role, or an org owner/admin. No visibility branch.
///
/// ADR 0032: runs through the `SECURITY DEFINER` `public.user_has_project_access`
/// so the authorization decision is RLS-immune. On denial returns
/// [`ApiError::Forbidden`] with the message the corresponding pre-0032 gate
/// used, so the read/write wrappers and `authorize`'s Project arm stay
/// byte-identical.
pub async fn verify_project_access<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    project_id: Uuid,
    required: ProjectRole,
) -> Result<(), ApiError> {
    let has_access =
        sqlx::query_scalar::<_, bool>("SELECT public.user_has_project_access($1, $2, $3)")
            .bind(project_id)
            .bind(user_id)
            .bind(required.as_str())
            .fetch_one(executor)
            .await?;

    if !has_access {
        let message = match required {
            ProjectRole::Viewer => "No access to this project",
            ProjectRole::Editor => "No write access to this project",
            ProjectRole::Admin | ProjectRole::Owner => "Insufficient project role for this action",
        };
        return Err(ApiError::Forbidden(message.into()));
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
/// Prefer this over the org-wide-visibility path for any project-confidential
/// resource. Returns [`ApiError::Forbidden`] when the user may not read the
/// project (including when the project does not exist, to avoid leaking
/// existence).
///
/// ADR 0033: external collaboration is cross-org project membership — an
/// explicit `project_members` row (possibly for a user who is not an org
/// member) admits read here, so an outside collaborator gains scoped visibility
/// to that one project. Such a member is invisible at org scope (the org
/// project list stays membership-scoped); they reach the project only through
/// this by-id gate.
///
/// ADR 0032: a thin wrapper over the tiered [`verify_project_access`] at the
/// [`Viewer`](ProjectRole::Viewer) tier — same predicate, same
/// `"No access to this project"` message, so every caller stays byte-identical.
pub(crate) async fn verify_project_read_access<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    verify_project_access(executor, user_id, project_id, ProjectRole::Viewer).await
}

/// Verify that `user_id` can *write* to the given project.
///
/// Write access is granted when the user is a project member with at least
/// `editor` role (ADR 0033: including a cross-org project `Editor` — the
/// scoped-edit path for an external collaborator, which replaced the former
/// editor-share grant), **or** an org-level `admin`/`owner`.
///
/// ADR 0032: a thin wrapper over the tiered [`verify_project_access`] at the
/// [`Editor`](ProjectRole::Editor) tier — same predicate, same
/// `"No write access to this project"` message, so every caller stays
/// byte-identical. Currently reached only via `authorize`'s Editor-tier
/// permissions (which call `verify_project_access` directly) and the sweep
/// sites still to be converted, so it is retained as the named write gate.
#[allow(dead_code)]
pub(crate) async fn verify_project_write_access<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    verify_project_access(executor, user_id, project_id, ProjectRole::Editor).await
}

/// Verify that `user_id` has access to a questionnaire through its project's
/// parent organization.
///
/// ADR 0033: access is granted to an active org member of the questionnaire's
/// parent org, **or** to a member of the questionnaire's parent project
/// (`is_project_member`) — a cross-org project member reads exactly that
/// project's questionnaires and nothing else in the org. This replaced the
/// former external-guest share grant path (ADR 0033).
///
/// ADR 0032: resolves through the `SECURITY DEFINER`
/// `public.user_can_access_questionnaire` so this read gate is RLS-immune.
/// Questionnaire scope is **read-only** under ADR 0032 — all questionnaire
/// mutations authorize at `Scope::Project` against the parent project's tier.
pub(crate) async fn verify_questionnaire_access<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    questionnaire_id: Uuid,
) -> Result<(), ApiError> {
    let has_access =
        sqlx::query_scalar::<_, bool>("SELECT public.user_can_access_questionnaire($1, $2)")
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
