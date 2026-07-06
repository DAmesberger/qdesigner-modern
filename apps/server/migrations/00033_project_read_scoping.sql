-- 00033_project_read_scoping.sql
--
-- E-RBAC-1 — make ProjectRole a real READ boundary.
--
-- Until now the `projects_select` policy (00014) admitted ANY active org
-- member to read EVERY project in the org, so ProjectRole::Viewer/Editor
-- only ever gated writes. Meanwhile the (now-inert, disabled in 00021)
-- questionnaire_definitions_select predicate scoped reads to project
-- members. This migration lets an organization mark its projects
-- confidential-to-members via a typed setting and updates the projects
-- SELECT posture so RLS agrees with the handler-layer
-- `api/access::verify_project_read_access` gate.
--
--   organizations.settings->>'projectVisibility'
--     'org'      (default / absent)  — every active org member reads every
--                                      project in the org (legacy behaviour).
--     'members'                      — only org owner/admins and explicit
--                                      project_members read a project.
--
-- Backward compat: absent / NULL / unrecognised => 'org'. No existing org's
-- behaviour changes until an admin opts into 'members' (E-RBAC-8 wires the
-- admin UI; the value is already settable via PATCH /api/organizations/{id}).
--
-- Note on the anonymous by-code path: `projects_select_via_published_
-- questionnaire` (00021) is intentionally NOT gated behind visibility — the
-- public fillout JOIN needs it and it exposes only name/dates for projects
-- that own a PUBLISHED questionnaire (documented trade in ADR 0012). For
-- those projects the handler gate (verify_project_read_access) is the
-- authoritative stricter boundary: it denies list/get for non-members even
-- though the row remains anonymously readable-by-id.

-- ── Setting reader ───────────────────────────────────────────────────
-- Typed accessor for the org's project-visibility policy. STABLE so the
-- planner can fold it into the projects_select policy. organizations RLS is
-- DISABLED (00020) so this is readable by every role with SELECT on the
-- table and introduces no policy recursion.
CREATE OR REPLACE FUNCTION public.org_project_visibility(org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT NULLIF(o.settings->>'projectVisibility', '')
         FROM public.organizations o
         WHERE o.id = org_id),
        'org'
    );
$$;

-- ── projects: org-wide SELECT now gated behind visibility = 'org' ────
-- Under 'members' this policy stops admitting plain org members; the
-- membership policy below is then the only authenticated read path.
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
    FOR SELECT USING (
        public.is_super_admin()
        OR (
            public.org_project_visibility(projects.organization_id) = 'org'
            AND EXISTS (
                SELECT 1 FROM public.organization_members om
                WHERE om.organization_id = projects.organization_id
                  AND om.user_id = public.current_app_user_id()
                  AND om.status = 'active'
            )
        )
    );

-- ── SECURITY DEFINER project-membership helper ───────────────────────
--
-- Returns true iff `uid` has an explicit `project_members` row for `proj`.
-- SECURITY DEFINER (owned by the qdesigner migration role — SUPERUSER +
-- BYPASSRLS) so the internal read of project_members runs with the
-- definer's rights and bypasses RLS. This is what prevents infinite
-- recursion: the `project_members_select` policy (00014) itself references
-- `projects`, so a projects SELECT policy that read project_members
-- directly would recurse projects → project_members → projects. Mirrors the
-- 00023 `is_member_of_org` pattern exactly. Cross-tenant isolation is
-- preserved: callers only ever probe their OWN membership (the policy below
-- passes `current_app_user_id()`).
CREATE OR REPLACE FUNCTION public.is_project_member(proj uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = proj
          AND pm.user_id = uid
    );
$$;

ALTER FUNCTION public.is_project_member(uuid, uuid) OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO qdesigner_app;

-- ── projects: membership SELECT (admits owner/admin + explicit members) ─
-- OR-merged (permissive) with projects_select above and with 00021's
-- projects_select_via_published_questionnaire. Admits regardless of the
-- org's projectVisibility, so org owners/admins and project members keep
-- read access even under 'members'. The org-owner/admin branch reads
-- organization_members (whose policy does not reference projects, so no
-- recursion); the project-member branch goes through the SECURITY DEFINER
-- helper above to break the projects ⇄ project_members policy cycle.
DROP POLICY IF EXISTS projects_select_via_membership ON public.projects;
CREATE POLICY projects_select_via_membership ON public.projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = projects.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
        OR public.is_project_member(projects.id, public.current_app_user_id())
    );
