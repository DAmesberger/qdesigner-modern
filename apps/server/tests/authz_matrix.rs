//! ADR 0030 — matrix test for the single `authz::authorize` entry point.
//!
//! Exercises `authorize()` end-to-end through its public interface across
//! the full matrix: system role × custom-role override × scope × read/write
//! permission. It proves the consolidation is behavior-preserving against
//! the two existing halves (`api::access::verify_*` + `RbacManager::
//! require_permission`) and, crucially, closes the ADR-0030 footgun: a
//! system-role member whose custom role omits a permission is DENIED
//! through `authorize()`, even though the coarse membership gate alone
//! admits them.
//!
//! Fixtures are seeded via `fixture_pool` (the `qdesigner` superuser,
//! BYPASSRLS) so the setup INSERTs aren't subject to RLS; `authorize`'s own
//! queries are plain membership/role lookups that read the seeded rows
//! directly, so RLS bypass on the fixture connection does not affect the
//! authorization verdict under test.

use sqlx::PgPool;
use uuid::Uuid;

use qdesigner_server::api::access;
use qdesigner_server::authz::{self, Scope};
use qdesigner_server::error::ApiError;
use qdesigner_server::rbac::manager::RbacManager;
use qdesigner_server::rbac::models::{Permission, ProjectRole};

mod common;
use common::fixture_pool;

// ── Seed helpers ──────────────────────────────────────────────────────

async fn create_user(pool: &PgPool) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("u-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user")
}

/// Create an org owned by `owner` (seeded as an active `owner` member; the
/// insert trigger also seeds the four system `org_roles`).
async fn create_org(pool: &PgPool, owner: Uuid) -> Uuid {
    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('Org', $1, $2) RETURNING id",
    )
    .bind(format!("org-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(owner)
    .fetch_one(pool)
    .await
    .expect("org");
    add_member(pool, org_id, owner, "owner", None).await;
    org_id
}

/// Add `user` to `org` at system `role`, optionally carrying a
/// `custom_role_id`.
async fn add_member(pool: &PgPool, org: Uuid, user: Uuid, role: &str, custom_role: Option<Uuid>) {
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status, custom_role_id) \
         VALUES ($1, $2, $3, 'active', $4)",
    )
    .bind(org)
    .bind(user)
    .bind(role)
    .bind(custom_role)
    .execute(pool)
    .await
    .expect("member");
}

/// Create a non-system custom role granting exactly `permissions`.
async fn create_custom_role(pool: &PgPool, org: Uuid, permissions: &[Permission]) -> Uuid {
    let perms: Vec<String> = permissions.iter().map(|p| p.as_str().to_string()).collect();
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO org_roles (organization_id, name, permissions, is_system) \
         VALUES ($1, $2, $3, false) RETURNING id",
    )
    .bind(org)
    .bind(format!("custom-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(&perms)
    .fetch_one(pool)
    .await
    .expect("custom role")
}

async fn create_project(pool: &PgPool, org: Uuid) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("p-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project")
}

/// Add `user` to `project` at `role` (a `project_members` row).
async fn add_project_member(pool: &PgPool, project: Uuid, user: Uuid, role: &str) {
    sqlx::query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)")
        .bind(project)
        .bind(user)
        .bind(role)
        .execute(pool)
        .await
        .expect("project member");
}

/// Seed an active `viewer` questionnaire share for `grantee` on `questionnaire`
/// within `org` — the cross-org guest analytics-access grant (E-RBAC-10).
async fn add_questionnaire_share(
    pool: &PgPool,
    org: Uuid,
    questionnaire: Uuid,
    grantee: Uuid,
    grantee_email: &str,
) {
    sqlx::query(
        r#"
        INSERT INTO resource_shares
            (resource_type, resource_id, organization_id, grantee_user_id,
             grantee_email, role, expires_at)
        VALUES ('questionnaire', $1, $2, $3, $4, 'viewer', NULL)
        "#,
    )
    .bind(questionnaire)
    .bind(org)
    .bind(grantee)
    .bind(grantee_email)
    .execute(pool)
    .await
    .expect("questionnaire share");
}

async fn create_questionnaire(pool: &PgPool, project: Uuid, author: Uuid) -> Uuid {
    sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by) \
         VALUES ($1, $2, '{}'::jsonb, 'draft', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("Q-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(author)
    .fetch_one(pool)
    .await
    .expect("questionnaire")
}

/// Run one `authorize` check on a fresh pooled connection.
async fn check(
    pool: &PgPool,
    rbac: &RbacManager,
    user: Uuid,
    scope: Scope,
    perm: Permission,
) -> Result<(), ApiError> {
    let mut conn = pool.acquire().await.expect("acquire");
    authz::authorize(&mut conn, rbac, user, scope, perm).await
}

fn is_forbidden(r: &Result<(), ApiError>) -> bool {
    matches!(r, Err(ApiError::Forbidden(_)))
}

/// A one-tenant fixture: org A with owner/admin/member/viewer system
/// members, one project, one questionnaire — plus a second tenant's user
/// (`outsider`) for cross-tenant denial.
struct Tenant {
    owner: Uuid,
    admin: Uuid,
    member: Uuid,
    viewer: Uuid,
    outsider: Uuid,
    org: Uuid,
    project: Uuid,
    questionnaire: Uuid,
}

async fn build_tenant(pool: &PgPool) -> Tenant {
    let owner = create_user(pool).await;
    let org = create_org(pool, owner).await;

    let admin = create_user(pool).await;
    add_member(pool, org, admin, "admin", None).await;
    let member = create_user(pool).await;
    add_member(pool, org, member, "member", None).await;
    let viewer = create_user(pool).await;
    add_member(pool, org, viewer, "viewer", None).await;

    // A member of a *different* org — never a member of `org`.
    let outsider = create_user(pool).await;
    let _other_org = create_org(pool, outsider).await;

    let project = create_project(pool, org).await;
    let questionnaire = create_questionnaire(pool, project, owner).await;

    Tenant {
        owner,
        admin,
        member,
        viewer,
        outsider,
        org,
        project,
        questionnaire,
    }
}

// ── System-role tiers at Organization scope ───────────────────────────

#[tokio::test]
async fn org_scope_read_admits_every_member() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // OrgRead → coarse min tier Viewer: all four system members pass.
    for user in [t.owner, t.admin, t.member, t.viewer] {
        assert!(
            check(
                &pool,
                &rbac,
                user,
                Scope::Organization(t.org),
                Permission::OrgRead
            )
            .await
            .is_ok(),
            "every active member should read the org"
        );
    }
}

#[tokio::test]
async fn org_scope_write_requires_admin_tier() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // OrgWrite → coarse min tier Admin: owner/admin allow, member/viewer deny.
    for user in [t.owner, t.admin] {
        assert!(
            check(
                &pool,
                &rbac,
                user,
                Scope::Organization(t.org),
                Permission::OrgWrite
            )
            .await
            .is_ok(),
            "owner/admin write the org"
        );
    }
    for user in [t.member, t.viewer] {
        assert!(
            is_forbidden(
                &check(
                    &pool,
                    &rbac,
                    user,
                    Scope::Organization(t.org),
                    Permission::OrgWrite
                )
                .await
            ),
            "plain member/viewer must not write the org"
        );
    }
}

#[tokio::test]
async fn org_scope_delete_requires_owner_tier() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // OrgDelete → coarse min tier Owner.
    assert!(check(
        &pool,
        &rbac,
        t.owner,
        Scope::Organization(t.org),
        Permission::OrgDelete
    )
    .await
    .is_ok());
    for user in [t.admin, t.member, t.viewer] {
        assert!(
            is_forbidden(
                &check(
                    &pool,
                    &rbac,
                    user,
                    Scope::Organization(t.org),
                    Permission::OrgDelete
                )
                .await
            ),
            "only the owner tier may delete the org"
        );
    }
}

// ── System-role tiers at Project scope ────────────────────────────────

#[tokio::test]
async fn project_scope_read_admits_org_members_under_default_visibility() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // ProjectRead → verify_project_read_access; default 'org' visibility
    // admits every active org member.
    for user in [t.owner, t.admin, t.member, t.viewer] {
        assert!(
            check(
                &pool,
                &rbac,
                user,
                Scope::Project(t.project),
                Permission::ProjectRead
            )
            .await
            .is_ok(),
            "org-wide visibility admits every member to project read"
        );
    }
}

#[tokio::test]
async fn project_scope_write_requires_org_admin_or_project_editor() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // QuestionnaireWrite at Project scope → verify_project_write_access:
    // org owner/admin allow; a plain org member (no project_members row) and
    // viewer deny.
    for user in [t.owner, t.admin] {
        assert!(
            check(
                &pool,
                &rbac,
                user,
                Scope::Project(t.project),
                Permission::QuestionnaireWrite
            )
            .await
            .is_ok(),
            "org owner/admin may write in the project"
        );
    }
    for user in [t.member, t.viewer] {
        assert!(
            is_forbidden(
                &check(
                    &pool,
                    &rbac,
                    user,
                    Scope::Project(t.project),
                    Permission::QuestionnaireWrite
                )
                .await
            ),
            "plain member/viewer without project editor role cannot write"
        );
    }
}

// ── System-role tiers at Questionnaire scope ──────────────────────────

#[tokio::test]
async fn questionnaire_scope_resolves_through_project_and_admits_members() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // verify_questionnaire_access admits any active org member; the
    // custom-role tightening is pass-through for system roles, so all four
    // system members are admitted at questionnaire scope for both a read
    // (SessionRead) and a mutation (QuestionnaireDelete) permission. This
    // mirrors the existing analytics/series pairing exactly.
    for user in [t.owner, t.admin, t.member, t.viewer] {
        assert!(
            check(
                &pool,
                &rbac,
                user,
                Scope::Questionnaire(t.questionnaire),
                Permission::SessionRead
            )
            .await
            .is_ok(),
            "questionnaire scope resolves org via project and admits members"
        );
    }
}

// ── Cross-tenant denial at every scope ────────────────────────────────

#[tokio::test]
async fn non_member_denied_at_every_scope() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // The outsider belongs only to another org.
    assert!(is_forbidden(
        &check(
            &pool,
            &rbac,
            t.outsider,
            Scope::Organization(t.org),
            Permission::OrgRead
        )
        .await
    ));
    assert!(is_forbidden(
        &check(
            &pool,
            &rbac,
            t.outsider,
            Scope::Project(t.project),
            Permission::ProjectRead
        )
        .await
    ));
    assert!(is_forbidden(
        &check(
            &pool,
            &rbac,
            t.outsider,
            Scope::Questionnaire(t.questionnaire),
            Permission::QuestionnaireRead
        )
        .await
    ));
}

// ── Custom-role tightening: the ADR-0030 footgun ──────────────────────

#[tokio::test]
async fn custom_role_denial_is_enforced_where_coarse_gate_alone_admits() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // A custom role that grants ONLY project:read — it omits questionnaire:
    // read, session:read, and org:read.
    let narrow = create_custom_role(&pool, t.org, &[Permission::ProjectRead]).await;
    let tightened = create_user(&pool).await;
    add_member(&pool, t.org, tightened, "member", Some(narrow)).await;

    // The coarse gate alone admits this member everywhere a plain member is
    // admitted (they ARE an active member) — this is the footgun: a
    // single-layer check would let them through. authorize() adds the
    // tightening, so the custom denial bites.

    // DENIED: questionnaire:read is absent from the custom set, though
    // verify_questionnaire_access admits the member.
    assert!(
        is_forbidden(
            &check(
                &pool,
                &rbac,
                tightened,
                Scope::Questionnaire(t.questionnaire),
                Permission::QuestionnaireRead
            )
            .await
        ),
        "custom role omitting questionnaire:read must be denied through authorize()"
    );

    // DENIED: org:read absent from the custom set (coarse org gate admits a
    // member for OrgRead, tightening denies).
    assert!(
        is_forbidden(
            &check(
                &pool,
                &rbac,
                tightened,
                Scope::Organization(t.org),
                Permission::OrgRead
            )
            .await
        ),
        "custom role omitting org:read must be denied at org scope"
    );

    // ALLOWED: project:read IS in the custom set, and the coarse read gate
    // admits — so the one granted read passes through both layers.
    assert!(
        check(
            &pool,
            &rbac,
            tightened,
            Scope::Project(t.project),
            Permission::ProjectRead
        )
        .await
        .is_ok(),
        "the one permission the custom role grants (and the coarse gate allows) passes"
    );
}

#[tokio::test]
async fn system_role_member_without_custom_role_is_admitted_where_tightened_one_is_denied() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // Baseline: a plain system `member` (no custom role) IS admitted to
    // questionnaire:read — proving it is the custom role, not the system
    // tier, that flips the tightened member above to denied.
    assert!(
        check(
            &pool,
            &rbac,
            t.member,
            Scope::Questionnaire(t.questionnaire),
            Permission::QuestionnaireRead
        )
        .await
        .is_ok(),
        "a plain system member reads the questionnaire"
    );
}

// ── Custom-role grant is bounded by the coarse gate ───────────────────

#[tokio::test]
async fn custom_role_grant_cannot_widen_past_the_coarse_gate() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // A custom role granting media:delete to a system `member`. At Org
    // scope MediaDelete's coarse gate is has_org_role(Admin); the member's
    // SYSTEM role is `member` (< Admin), so the coarse gate denies BEFORE
    // the tightening ever sees the grant. This documents the existing
    // property (ADR 0030 divergence-ledger note): a custom grant can only
    // narrow within the coarse ceiling — it never widens authority past the
    // membership/role boundary.
    let granting = create_custom_role(&pool, t.org, &[Permission::MediaDelete]).await;
    let widened = create_user(&pool).await;
    add_member(&pool, t.org, widened, "member", Some(granting)).await;

    assert!(
        is_forbidden(
            &check(
                &pool,
                &rbac,
                widened,
                Scope::Organization(t.org),
                Permission::MediaDelete
            )
            .await
        ),
        "custom grant of media:delete does not clear the Admin-tier coarse gate at org scope"
    );
}

// ── ADR 0032: tiered project gate ─────────────────────────────────────

/// A project `editor` (project_members row, no org role) is admitted at the
/// Viewer and Editor tiers of the new tiered gate but DENIED at Admin. Locks
/// the ADR 0032 guardrail (a): the tier is load-bearing, and raising a
/// permission to Admin genuinely narrows who passes.
#[tokio::test]
async fn tiered_gate_project_editor_denied_admin_allowed_editor_and_viewer() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let t = build_tenant(&pool).await;

    // A project `editor`. A schema trigger requires a project member to also
    // be an active org member, so seed the lowest org role (`viewer`) — the
    // Admin/Owner tiers have NO org branch, so this org role never admits them;
    // the project role is what's under test.
    let editor = create_user(&pool).await;
    add_member(&pool, t.org, editor, "viewer", None).await;
    add_project_member(&pool, t.project, editor, "editor").await;

    let mut conn = pool.acquire().await.expect("acquire");

    // Viewer tier (== old read gate): allowed (they are an explicit project member).
    assert!(
        access::verify_project_access(&mut *conn, editor, t.project, ProjectRole::Viewer)
            .await
            .is_ok(),
        "a project editor may read the project (Viewer tier)"
    );
    // Editor tier (== old write gate): allowed (project role editor).
    assert!(
        access::verify_project_access(&mut *conn, editor, t.project, ProjectRole::Editor)
            .await
            .is_ok(),
        "a project editor passes the Editor tier"
    );
    // Admin tier: DENIED (editor < admin; no share/visibility branch admits).
    assert!(
        matches!(
            access::verify_project_access(&mut *conn, editor, t.project, ProjectRole::Admin).await,
            Err(ApiError::Forbidden(_))
        ),
        "a project editor is denied the Admin tier"
    );
    // Owner tier: DENIED as well.
    assert!(
        matches!(
            access::verify_project_access(&mut *conn, editor, t.project, ProjectRole::Owner).await,
            Err(ApiError::Forbidden(_))
        ),
        "a project editor is denied the Owner tier"
    );
}

/// ADR 0032 ledger L5: the Admin and Owner tiers of the tiered gate gain the
/// org owner/admin override (Viewer/Editor already had it), so folding the six
/// inline `has_project_role(Admin/Owner) OR has_org_role(Admin)` sites into
/// `authorize` is behavior-preserving. An **org admin who is NOT a project
/// member** must be ADMITTED at both the Admin and Owner tiers via that
/// override, while a **project Editor** (org viewer) stays DENIED at both — the
/// override keys on org role, not project role.
#[tokio::test]
async fn tiered_gate_org_admin_override_admits_admin_and_owner_tiers() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let t = build_tenant(&pool).await;

    // t.admin is an active org `admin` with NO project_members row on t.project.
    let mut conn = pool.acquire().await.expect("acquire");

    // L5 override: org admin passes the Admin tier despite no project membership.
    assert!(
        access::verify_project_access(&mut *conn, t.admin, t.project, ProjectRole::Admin)
            .await
            .is_ok(),
        "an org admin (no project row) must pass the Admin tier via the L5 org override"
    );
    // L5 override: org admin also passes the Owner tier (owner arm admits org
    // owner/admin) — this is what makes delete/transfer folds byte-identical.
    assert!(
        access::verify_project_access(&mut *conn, t.admin, t.project, ProjectRole::Owner)
            .await
            .is_ok(),
        "an org admin (no project row) must pass the Owner tier via the L5 org override"
    );

    // A project Editor (org viewer, project editor) is DENIED both tiers — the
    // override is org-role-scoped, so a mere project role never clears Admin/Owner.
    let editor = create_user(&pool).await;
    add_member(&pool, t.org, editor, "viewer", None).await;
    add_project_member(&pool, t.project, editor, "editor").await;

    assert!(
        matches!(
            access::verify_project_access(&mut *conn, editor, t.project, ProjectRole::Admin).await,
            Err(ApiError::Forbidden(_))
        ),
        "a project editor is still denied the Admin tier (no org override applies)"
    );
    assert!(
        matches!(
            access::verify_project_access(&mut *conn, editor, t.project, ProjectRole::Owner).await,
            Err(ApiError::Forbidden(_))
        ),
        "a project editor is still denied the Owner tier (no org override applies)"
    );
}

/// ADR 0032 guardrail (b): questionnaire scope is READ-ONLY. Routing a WRITE
/// permission through `Scope::Questionnaire` trips the read-only invariant
/// (a `debug_assert` in `authorize`) rather than silently under-gating to
/// membership. Verified via a spawned task so the panic surfaces as a
/// `JoinError`; only meaningful under `debug_assertions` (cargo test default).
#[tokio::test]
async fn questionnaire_scope_write_permission_trips_read_only_invariant() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // t.owner can access the questionnaire; the invariant fires BEFORE the
    // gate query, so the verdict of the underlying gate is irrelevant.
    let questionnaire = t.questionnaire;
    let owner = t.owner;
    let joined = tokio::spawn(async move {
        let mut conn = pool.acquire().await.expect("acquire");
        // QuestionnaireWrite is a non-read permission — illegal at questionnaire scope.
        authz::authorize(
            &mut conn,
            &rbac,
            owner,
            Scope::Questionnaire(questionnaire),
            Permission::QuestionnaireWrite,
        )
        .await
    })
    .await;

    if cfg!(debug_assertions) {
        assert!(
            joined.is_err(),
            "a write permission at questionnaire scope must trip the read-only debug-assert"
        );
    }
}

/// ADR 0032 guardrail (c) — the R1 regression, locked. A cross-org guest who
/// holds only a questionnaire SHARE (no org/project membership) is ADMITTED
/// through the full `authorize(Scope::Questionnaire, SessionRead)` path: the
/// share-aware coarse gate admits, the `SECURITY DEFINER` org resolver resolves
/// the org (this is exactly where the sweep previously 404'd), and the
/// custom-role tightening passes a guest through on the live share.
#[tokio::test]
async fn cross_org_questionnaire_share_guest_admitted_through_authorize() {
    let Some(pool) = fixture_pool().await else {
        return;
    };
    let rbac = RbacManager::new();
    let t = build_tenant(&pool).await;

    // A guest whose only tie to t.org is a questionnaire share. They belong to
    // their own separate org (never a member of t.org), mirroring a reviewer in
    // another tenant.
    let guest = create_user(&pool).await;
    let guest_email = format!("guest-{}@test.local", Uuid::new_v4());
    let _guest_org = create_org(&pool, guest).await;
    add_questionnaire_share(&pool, t.org, t.questionnaire, guest, &guest_email).await;

    // Full authorize path admits the guest for a read.
    assert!(
        check(
            &pool,
            &rbac,
            guest,
            Scope::Questionnaire(t.questionnaire),
            Permission::SessionRead
        )
        .await
        .is_ok(),
        "a cross-org questionnaire-share guest must be admitted through authorize() \
         (R1 regression lock): coarse gate + definer org resolver + guest-share tightening"
    );
}
