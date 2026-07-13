-- 00051_authz_rls_immune_functions.sql  (ADR 0032)
--
-- Realizes ADR 0032's core mechanism (5a): authorization is a self-contained
-- decision, INDEPENDENT of RLS. Every query that lives inside
-- `crate::authz::authorize` — the coarse tiered gates AND the org resolvers —
-- is expressed here as a SECURITY DEFINER function that sees TRUE rows. RLS
-- remains a second, independent defense-in-depth net on ordinary data
-- queries; it can no longer produce a wrong authorization answer (the
-- `resource_shares:486` 404 regression: a cross-org questionnaire-share guest
-- was admitted by the coarse gate but the RLS-subject org resolver could not
-- see the parent project row, so the read 404'd "not found" — an authorization
-- outcome held hostage to RLS-policy completeness).
--
-- Idiom mirrors 00041 exactly: LANGUAGE sql STABLE SECURITY DEFINER,
-- `SET search_path = public, pg_temp`, `OWNER TO qdesigner` (the BYPASSRLS
-- role — that ownership is HOW they bypass, so each function is itself a
-- privilege boundary), `REVOKE ALL … FROM PUBLIC` then `GRANT EXECUTE … TO
-- qdesigner_app`. The caller's user id is always an EXPLICIT argument (`uid`),
-- never `current_user`; no dynamic SQL. Each function reproduces its Rust
-- counterpart's predicate branch-for-branch so the conversion is strictly
-- behavior-preserving.

-- ── Tiered project access gate ───────────────────────────────────────
--
-- Backs `api/access::verify_project_access(…, required: ProjectRole)`, the one
-- gate that generalizes the read/write pair to four tiers. Each `required`
-- value reproduces EXACTLY the predicate the pre-0032 code enforced:
--   * 'viewer' ≡ verify_project_read_access — org owner/admin, ANY explicit
--     project member, org-visibility-default any active org member when
--     projectVisibility='org', OR an active project share.
--   * 'editor' ≡ verify_project_write_access — project member in
--     owner/admin/editor, org owner/admin, OR an active editor project share.
--     (Note: like the original, the editor branch does NOT filter deleted_at.)
--   * 'admin' ≡ RbacManager::has_project_role(Admin) — a project_members row
--     of role admin/owner. No share branch (shares cap at editor), no
--     visibility branch, no org-role override.
--   * 'owner' ≡ RbacManager::has_project_role(Owner) — a project_members row
--     of role owner.
-- Any other `required` string denies (fail-closed).
CREATE OR REPLACE FUNCTION public.user_has_project_access(
    pid uuid, uid uuid, required text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE required
        WHEN 'viewer' THEN EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organizations o ON o.id = p.organization_id
            WHERE p.id = pid AND p.deleted_at IS NULL
              AND (
                EXISTS (
                    SELECT 1 FROM public.organization_members om
                    WHERE om.organization_id = p.organization_id
                      AND om.user_id = uid AND om.status = 'active'
                      AND om.role IN ('owner', 'admin')
                )
                OR EXISTS (
                    SELECT 1 FROM public.project_members pm
                    WHERE pm.project_id = p.id AND pm.user_id = uid
                )
                OR (
                    COALESCE(o.settings->>'projectVisibility', 'org') = 'org'
                    AND EXISTS (
                        SELECT 1 FROM public.organization_members om
                        WHERE om.organization_id = p.organization_id
                          AND om.user_id = uid AND om.status = 'active'
                    )
                )
                OR public.user_has_active_share('project', p.id, uid)
              )
        )
        WHEN 'editor' THEN (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_id = pid AND user_id = uid
                  AND role IN ('owner', 'admin', 'editor')
            )
            OR EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om ON om.organization_id = p.organization_id
                WHERE p.id = pid AND om.user_id = uid AND om.status = 'active'
                  AND om.role IN ('owner', 'admin')
            )
            OR public.user_has_active_edit_share('project', pid, uid)
        )
        WHEN 'admin' THEN EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_id = pid AND user_id = uid
              AND role IN ('owner', 'admin')
        )
        WHEN 'owner' THEN EXISTS (
            SELECT 1 FROM public.project_members
            WHERE project_id = pid AND user_id = uid
              AND role = 'owner'
        )
        ELSE false
    END;
$$;

-- ── Questionnaire read gate ──────────────────────────────────────────
--
-- Backs `api/access::verify_questionnaire_access` — the whole share-aware
-- membership-or-share read predicate. Questionnaire scope is read-only under
-- ADR 0032; all questionnaire mutations authorize at Scope::Project.
CREATE OR REPLACE FUNCTION public.user_can_access_questionnaire(
    qid uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.questionnaire_definitions qd
        JOIN public.projects p ON p.id = qd.project_id
        JOIN public.organization_members om ON om.organization_id = p.organization_id
        WHERE qd.id = qid AND om.user_id = uid AND om.status = 'active'
          AND qd.deleted_at IS NULL AND p.deleted_at IS NULL
    ) OR public.user_can_read_questionnaire_via_share(qid, uid);
$$;

-- ── RLS-immune org resolvers ─────────────────────────────────────────
--
-- Back `api/access::get_project_org_id` / `get_questionnaire_org_id`. Return
-- NULL when the id truly does not resolve (soft-deleted or absent); the Rust
-- wrappers map NULL → NotFound, preserving the existing contract. Making these
-- SECURITY DEFINER is the direct fix for the 404 regression: org resolution no
-- longer depends on the caller's RLS visibility of the `projects` row.
CREATE OR REPLACE FUNCTION public.project_org_id(pid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT organization_id
    FROM public.projects
    WHERE id = pid AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.questionnaire_org_id(qid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.organization_id
    FROM public.questionnaire_definitions qd
    JOIN public.projects p ON p.id = qd.project_id
    WHERE qd.id = qid AND qd.deleted_at IS NULL AND p.deleted_at IS NULL;
$$;

-- ── Owner + grant hardening (per ADR 0032 acceptance criteria) ───────
ALTER FUNCTION public.user_has_project_access(uuid, uuid, text) OWNER TO qdesigner;
ALTER FUNCTION public.user_can_access_questionnaire(uuid, uuid) OWNER TO qdesigner;
ALTER FUNCTION public.project_org_id(uuid) OWNER TO qdesigner;
ALTER FUNCTION public.questionnaire_org_id(uuid) OWNER TO qdesigner;

REVOKE ALL ON FUNCTION public.user_has_project_access(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_questionnaire(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_org_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.questionnaire_org_id(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_has_project_access(uuid, uuid, text) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.user_can_access_questionnaire(uuid, uuid) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.project_org_id(uuid) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.questionnaire_org_id(uuid) TO qdesigner_app;
