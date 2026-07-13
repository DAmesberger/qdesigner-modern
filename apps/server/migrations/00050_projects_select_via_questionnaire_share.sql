-- 00050_projects_select_via_questionnaire_share.sql
--
-- Closes a gap left by 00041's read-side estate. 00041 added questionnaire-share
-- SELECT branches on sessions / responses / interaction_events / session_variables
-- (all keyed on user_can_read_questionnaire_via_share), and a PROJECT-share branch
-- on projects (projects_select_via_share). But it added NO questionnaire-share
-- branch on projects itself.
--
-- That omission bites the analytics read path. A cross-org guest holding a
-- QUESTIONNAIRE share is admitted at the handler layer by the SECURITY DEFINER
-- coarse gate verify_questionnaire_access, and can read the session/response rows
-- via the four branches above. But org resolution — the plain
--   SELECT p.organization_id FROM questionnaire_definitions qd JOIN projects p …
-- in api/access::get_questionnaire_org_id — is subject to RLS on projects, and the
-- guest has no project-share and no project_members row, so the parent project row
-- is invisible. Org resolution returns None and the request 404s "Questionnaire
-- not found", even though every downstream policy would have admitted the read.
--
-- Fix: admit SELECT on a project row when the current app user holds a share
-- (direct questionnaire share OR parent-project share) on ANY questionnaire under
-- that project. This reuses the existing SECURITY DEFINER helper from 00041 —
-- questionnaire_definitions is RLS-exempt and the helper runs as the definer, so
-- there is no policy recursion. Added as a SEPARATE permissive policy so
-- PostgreSQL OR-merges it with the existing membership / projects_select_via_share
-- branches without rewriting those statements. Expiry stays inert automatically
-- (the helper filters expires_at IS NULL OR expires_at > now()).

DROP POLICY IF EXISTS projects_select_via_questionnaire_share ON public.projects;
CREATE POLICY projects_select_via_questionnaire_share ON public.projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.questionnaire_definitions qd
            WHERE qd.project_id = projects.id
              AND public.user_can_read_questionnaire_via_share(
                      qd.id, public.current_app_user_id())
        )
    );
