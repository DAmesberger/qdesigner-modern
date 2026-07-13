-- 00058_drop_resource_shares.sql  (ADR 0033, Unit 4a — teardown)
--
-- Deletes the `resource_shares` / external-guest role machinery entirely. The
-- guest role is superseded by cross-org project membership (ADR 0033 units 1+3:
-- the org-check trigger dropped in 00055, cross-org `add_project_member`, and
-- `project_invitations` in 00056/00057). Shares are now dead weight.
--
-- Append-only estate: the historical migrations that CREATE this machinery
-- (00041 resource_shares, 00048 trials share branch, 00050 questionnaire-share
-- projects branch, 00052 project-access org override, 00054 cross-org read)
-- keep their text; this migration removes their live objects.
--
-- Drop ORDER matters — a function cannot be dropped while a policy references
-- it, and the two authz gates reference the share helpers, so:
--   1. Drop the `…_via_share` SELECT branches on the read-side estate.
--   2. Rewrite `user_has_project_access` (00052) minus the two share arms.
--   3. Rewrite `user_can_access_questionnaire` (00054) minus the share branch.
--   4. Drop the now-unreferenced share SECURITY DEFINER helpers + purge/resolve.
--   5. Drop the `resource_shares` table (cascades its own RLS policies + data).
--   6. Drop `can_manage_resource_share` (only the table's own policies used it).

-- ── 1. Share SELECT branches on the read-side estate ─────────────────
-- projects (00041 project-share branch + 00050 questionnaire-share branch)
DROP POLICY IF EXISTS projects_select_via_share ON public.projects;
DROP POLICY IF EXISTS projects_select_via_questionnaire_share ON public.projects;

-- study-data tables (00041)
DROP POLICY IF EXISTS sessions_select_via_share ON public.sessions;
DROP POLICY IF EXISTS responses_select_via_share ON public.responses;
DROP POLICY IF EXISTS interaction_events_select_via_share ON public.interaction_events;
DROP POLICY IF EXISTS session_variables_select_via_share ON public.session_variables;

-- trials (00048)
DROP POLICY IF EXISTS trials_select_via_share ON public.trials;

-- ── 2. user_has_project_access — 00052 body minus the two share arms ─
-- Reverts ADR 0032 L8 (the editor-project-share write path). The org
-- owner/admin override arms from 00052 (L5) are kept byte-for-byte; only the
-- `OR public.user_has_active_share(...)` (viewer) and
-- `OR public.user_has_active_edit_share(...)` (editor) lines are removed.
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
        )
        WHEN 'admin' THEN (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_id = pid AND user_id = uid
                  AND role IN ('owner', 'admin')
            )
            OR EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om ON om.organization_id = p.organization_id
                WHERE p.id = pid AND om.user_id = uid AND om.status = 'active'
                  AND om.role IN ('owner', 'admin')
            )
        )
        WHEN 'owner' THEN (
            EXISTS (
                SELECT 1 FROM public.project_members
                WHERE project_id = pid AND user_id = uid
                  AND role = 'owner'
            )
            OR EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om ON om.organization_id = p.organization_id
                WHERE p.id = pid AND om.user_id = uid AND om.status = 'active'
                  AND om.role IN ('owner', 'admin')
            )
        )
        ELSE false
    END;
$$;

-- ── 3. user_can_access_questionnaire — 00054 body minus share branch ─
-- Keeps the org-member branch and the is_project_member (cross-org project
-- member) branch; removes `OR public.user_can_read_questionnaire_via_share(...)`.
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
    )
    OR public.is_project_member(
        (SELECT qd.project_id
         FROM public.questionnaire_definitions qd
         WHERE qd.id = qid),
        uid
    );
$$;

-- CREATE OR REPLACE preserves owner + grants; re-assert per the 00054 pattern.
ALTER FUNCTION public.user_can_access_questionnaire(uuid, uuid) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.user_can_access_questionnaire(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_questionnaire(uuid, uuid) TO qdesigner_app;

-- ── 4. Drop the now-unreferenced share helpers (00041) ───────────────
DROP FUNCTION IF EXISTS public.user_has_active_share(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.user_has_active_edit_share(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.user_can_read_questionnaire_via_share(uuid, uuid);
DROP FUNCTION IF EXISTS public.resolve_pending_resource_shares(text, uuid);
DROP FUNCTION IF EXISTS public.purge_expired_resource_shares();

-- ── 5. Drop the table (cascades its own RLS policies + data) ─────────
DROP TABLE IF EXISTS public.resource_shares;

-- ── 6. Drop the share-management helper (only the table used it) ─────
DROP FUNCTION IF EXISTS public.can_manage_resource_share(uuid, text, uuid, uuid);
