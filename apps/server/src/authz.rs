//! Single application-layer authorization entry point (ADR 0030).
//!
//! Historically an authenticated handler ran **two** authorization calls: a
//! coarse membership / role-tier gate (`api::access::verify_*`) and then
//! `RbacManager::require_permission`, the custom-role *tightening* layer.
//! `require_permission` passes a system-role member straight through, so it
//! is only correct when paired with the coarse gate — a pairing the type
//! system knew nothing about, enforced by convention across ~70 call sites.
//!
//! [`authorize`] collapses the pair into one call. The caller names a
//! [`Scope`] (the org / project / questionnaire the check is made against)
//! and a [`Permission`]; `authorize` derives the coarse gate from
//! `(scope, permission)` internally, runs it, then runs the custom-role
//! tightening. A caller can no longer hold half the check. **Deny wins:**
//! the coarse gate runs first and short-circuits, so a custom role can only
//! *narrow* within what the coarse gate already admits — it can never widen
//! authority past the membership/role boundary.
//!
//! This composes the existing halves; it does not reimplement their SQL.
//! Per ADR 0030 the sweep of call sites and privatization of the two halves
//! is a later phase — the halves stay public and untouched here.
//!
//! Signature follows the ADR 0011 convention: `authorize` needs several
//! queries (coarse gate, org-id resolution, tightening) so it takes a
//! multi-shot `&mut PgConnection`, reborrowed `&mut *conn` per sub-call.
//! Handlers pass `&mut **tx` from the per-request transaction.

use sqlx::PgConnection;
use uuid::Uuid;

use crate::api::access;
use crate::error::ApiError;
use crate::rbac::manager::RbacManager;
use crate::rbac::models::{OrgRole, Permission, ProjectRole};

/// The resource a [`authorize`] check is made against. The coarse
/// membership gate and the org context for the custom-role tightening are
/// both derived from the variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    /// Authorize against an organization directly (`org_id`).
    Organization(Uuid),
    /// Authorize against a project; its owning org is resolved via
    /// `projects.organization_id`.
    Project(Uuid),
    /// Authorize against a questionnaire; its owning org is resolved via
    /// its project.
    Questionnaire(Uuid),
}

/// Authorize `user_id` for `permission` at `scope`, composing the coarse
/// membership/role-tier gate with the custom-role tightening in one call.
///
/// The `(scope, permission)` → coarse-gate mapping (behavior-equal to the
/// dominant existing pairing, ADR 0030):
///
/// | Scope           | Permission tier      | Coarse gate                                          |
/// |-----------------|----------------------|------------------------------------------------------|
/// | `Organization`  | any                  | `has_org_role(min system tier holding it)`           |
/// | `Project`       | any                  | `access::verify_project_access(min_project_role_for)` |
/// | `Questionnaire` | read only            | `access::verify_questionnaire_access`                |
///
/// ADR 0032: `Project` scope is **tiered** — `verify_project_access` enforces
/// the exact [`ProjectRole`] [`min_project_role_for`] maps the permission to,
/// generalizing the old binary read/write pair. `Questionnaire` scope is
/// **read-only** (a debug-assert trips on a non-read permission); questionnaire
/// mutations authorize at `Scope::Project`.
///
/// For `Organization` scope the coarse gate is the lowest built-in
/// [`OrgRole`] whose [`OrgRole::default_permissions`] set contains the
/// permission (see [`min_org_role_for`]). Because those sets are monotonic
/// (Viewer ⊆ Member ⊆ Admin ⊆ Owner), this reproduces the per-endpoint
/// `has_org_role` tiers the handlers use today — e.g. `MediaRead`→Viewer,
/// `MediaWrite`→Member, `MediaDelete`→Admin, `OrgWrite`→Admin,
/// `OrgDelete`→Owner.
///
/// After the coarse gate admits, [`RbacManager::require_permission`] runs
/// the custom-role tightening against the resolved org: a member on a
/// system role passes through; a member on a custom role must have
/// `permission` in that role's set, else `Forbidden`. The coarse gate runs
/// first, so deny always wins.
pub async fn authorize(
    conn: &mut PgConnection,
    rbac: &RbacManager,
    user_id: Uuid,
    scope: Scope,
    permission: Permission,
) -> Result<(), ApiError> {
    // 1. Run the coarse gate keyed on (scope, permission) and resolve the
    //    org context the tightening layer needs.
    let org_id = match scope {
        Scope::Organization(org_id) => {
            let required = min_org_role_for(permission);
            if !rbac
                .has_org_role(&mut *conn, user_id, org_id, &required)
                .await?
            {
                return Err(ApiError::Forbidden(
                    "Insufficient organization role for this action".into(),
                ));
            }
            org_id
        }
        Scope::Project(project_id) => {
            // ADR 0032: the tiered gate enforces the exact ProjectRole tier the
            // permission maps to (read → Viewer == old read gate; write / publish
            // → Editor == old write gate; manage-members → Admin; project delete /
            // transfer-ownership → Owner — the six inline sites folded in at
            // rollout step 2, ledger L5–L10).
            access::verify_project_access(
                &mut *conn,
                user_id,
                project_id,
                min_project_role_for(permission),
            )
            .await?;
            access::get_project_org_id(&mut *conn, project_id).await?
        }
        Scope::Questionnaire(questionnaire_id) => {
            // ADR 0032: questionnaire scope is READ-ONLY. All questionnaire
            // mutations authorize at `Scope::Project` against the parent
            // project's tier; the gate here is membership read only (org member
            // OR cross-org project member, ADR 0033). A write mis-routed here
            // would silently under-gate to membership, so trip loudly in debug
            // builds.
            debug_assert!(
                is_read_permission(permission),
                "non-read permission {permission:?} routed through Scope::Questionnaire — \
                 questionnaire scope is read-only (ADR 0032); authorize mutations at Scope::Project",
            );
            access::verify_questionnaire_access(&mut *conn, user_id, questionnaire_id).await?;
            access::get_questionnaire_org_id(&mut *conn, questionnaire_id).await?
        }
    };

    // 2. Custom-role tightening (deny wins — the coarse gate already ran).
    rbac.require_permission(&mut *conn, user_id, org_id, permission)
        .await
}

/// Whether `permission` is a read-tier action. Read-tier project checks
/// use the read gate; every other tier (write / publish / manage / delete)
/// uses the write gate — mirroring how the handlers pair
/// `verify_project_read_access` vs `verify_project_write_access`.
fn is_read_permission(permission: Permission) -> bool {
    matches!(
        permission,
        Permission::OrgRead
            | Permission::ProjectRead
            | Permission::QuestionnaireRead
            | Permission::SessionRead
            | Permission::ResponseRead
            | Permission::MediaRead
    )
}

/// The lowest built-in [`OrgRole`] whose default permission set contains
/// `permission` — the org-scope coarse gate.
///
/// [`OrgRole::default_permissions`] is monotonic across the tier ladder, so
/// "lowest tier that has it by default" is exactly the role a handler
/// gating this action would require. A permission absent from every default
/// set (none today) falls back to `Owner` — the safe, most-restrictive
/// choice.
fn min_org_role_for(permission: Permission) -> OrgRole {
    for role in [
        OrgRole::Viewer,
        OrgRole::Member,
        OrgRole::Admin,
        OrgRole::Owner,
    ] {
        if role.default_permissions().contains(&permission) {
            return role;
        }
    }
    OrgRole::Owner
}

/// The [`ProjectRole`] tier the project-scope coarse gate requires for
/// `permission` (ADR 0032). Mirrors [`min_org_role_for`] but for project
/// scope: it names the exact tier [`access::verify_project_access`] enforces.
///
/// **Behavior-preserving** with the pre-0032 gates once the six inline sites
/// fold in (ADR 0032 rollout step 2, ledger L5–L10): the read-family maps to
/// `Viewer` (the old `verify_project_read_access`) and the write-family to
/// `Editor` (the old `verify_project_write_access`), so every already-swept
/// `Scope::Project` site is unchanged. `ProjectManageMembers` → `Admin` (the
/// tier the three project-member sites enforce), `MediaDelete` → `Admin`.
/// `ProjectDelete` and the new `ProjectTransferOwnership` → `Owner` — the two
/// destructive sites (`delete_project`, `transfer_project_ownership`) require a
/// project *owner* (or an org owner/admin via the L5 override), not merely
/// Admin (ledger L6/L7; the grill's "ProjectDelete→Admin" was corrected). The
/// org-family lands on `Owner` as a fail-closed floor: those permissions never
/// legitimately reach project scope.
///
/// Exhaustive with **no wildcard arm** — a newly-added [`Permission`] fails to
/// compile until its project-scope tier is declared here. Per the ADR 0032
/// divergence ledger, `QuestionnaireDelete` stays `Editor` (candidate C1 to
/// raise it to `Admin` is deferred to a separately-reviewed change).
fn min_project_role_for(permission: Permission) -> ProjectRole {
    match permission {
        // Read family → Viewer (== old verify_project_read_access).
        Permission::ProjectRead
        | Permission::QuestionnaireRead
        | Permission::SessionRead
        | Permission::ResponseRead
        | Permission::MediaRead => ProjectRole::Viewer,
        // Write / publish / delete family → Editor (== old
        // verify_project_write_access). QuestionnaireDelete stays Editor (C1).
        Permission::ProjectWrite
        | Permission::QuestionnaireWrite
        | Permission::QuestionnairePublish
        | Permission::QuestionnaireDelete
        | Permission::SessionWrite
        | Permission::ResponseWrite
        | Permission::MediaWrite => ProjectRole::Editor,
        // Manage-members / media-delete → Admin (the three project-member
        // sites + media delete, folded in at rollout step 2).
        Permission::ProjectManageMembers | Permission::MediaDelete => ProjectRole::Admin,
        // Destructive project ownership ops → Owner (delete_project /
        // transfer_project_ownership; ledger L6/L7). The org owner/admin
        // override lives in the definer gate's 'owner' arm (L5).
        Permission::ProjectDelete | Permission::ProjectTransferOwnership => ProjectRole::Owner,
        // Org-family permissions never legitimately reach project scope —
        // fail closed at the top tier.
        Permission::OrgRead
        | Permission::OrgWrite
        | Permission::OrgManageMembers
        | Permission::OrgDelete => ProjectRole::Owner,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn min_org_role_matches_handler_tiers() {
        // These reproduce the has_org_role tiers used by the media / org /
        // gdpr handlers today (ADR 0030 mapping check).
        assert_eq!(min_org_role_for(Permission::MediaRead), OrgRole::Viewer);
        assert_eq!(min_org_role_for(Permission::MediaWrite), OrgRole::Member);
        assert_eq!(min_org_role_for(Permission::MediaDelete), OrgRole::Admin);
        assert_eq!(min_org_role_for(Permission::OrgRead), OrgRole::Viewer);
        assert_eq!(min_org_role_for(Permission::OrgWrite), OrgRole::Admin);
        assert_eq!(
            min_org_role_for(Permission::OrgManageMembers),
            OrgRole::Admin
        );
        assert_eq!(min_org_role_for(Permission::OrgDelete), OrgRole::Owner);
        assert_eq!(min_org_role_for(Permission::ProjectRead), OrgRole::Viewer);
        assert_eq!(min_org_role_for(Permission::ProjectDelete), OrgRole::Admin);
    }

    #[test]
    fn min_project_role_matches_handler_tiers() {
        // ADR 0032: behavior-preserving tiers. Read-family → Viewer (old read
        // gate); write/publish/delete → Editor (old write gate);
        // manage-members / media-delete → Admin; project-delete /
        // transfer-ownership → Owner (ledger L6/L7); org-family → Owner
        // (fail-closed floor).
        for p in [
            Permission::ProjectRead,
            Permission::QuestionnaireRead,
            Permission::SessionRead,
            Permission::ResponseRead,
            Permission::MediaRead,
        ] {
            assert_eq!(min_project_role_for(p), ProjectRole::Viewer, "{p:?}");
        }
        for p in [
            Permission::ProjectWrite,
            Permission::QuestionnaireWrite,
            Permission::QuestionnairePublish,
            Permission::QuestionnaireDelete,
            Permission::SessionWrite,
            Permission::ResponseWrite,
            Permission::MediaWrite,
        ] {
            assert_eq!(min_project_role_for(p), ProjectRole::Editor, "{p:?}");
        }
        for p in [Permission::ProjectManageMembers, Permission::MediaDelete] {
            assert_eq!(min_project_role_for(p), ProjectRole::Admin, "{p:?}");
        }
        // Owner tier: destructive project ops (ledger L6/L7) + org-family floor.
        for p in [
            Permission::ProjectDelete,
            Permission::ProjectTransferOwnership,
            Permission::OrgRead,
            Permission::OrgWrite,
            Permission::OrgManageMembers,
            Permission::OrgDelete,
        ] {
            assert_eq!(min_project_role_for(p), ProjectRole::Owner, "{p:?}");
        }
        // C1 (ledger): QuestionnaireDelete deliberately stays Editor, not Admin.
        assert_eq!(
            min_project_role_for(Permission::QuestionnaireDelete),
            ProjectRole::Editor
        );
    }

    #[test]
    fn read_permissions_classified() {
        assert!(is_read_permission(Permission::ProjectRead));
        assert!(is_read_permission(Permission::ResponseRead));
        assert!(!is_read_permission(Permission::QuestionnaireWrite));
        assert!(!is_read_permission(Permission::ProjectDelete));
        assert!(!is_read_permission(Permission::QuestionnairePublish));
    }
}
