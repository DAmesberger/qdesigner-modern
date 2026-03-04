-- 00010_questionnaire_project_rls.sql
-- Tighten questionnaire RLS: org owners/admins see all questionnaires,
-- regular org members/viewers need explicit project membership.

DROP POLICY IF EXISTS questionnaire_defs_select ON public.questionnaire_definitions;

CREATE POLICY questionnaire_defs_select ON public.questionnaire_definitions
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = questionnaire_definitions.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = questionnaire_definitions.project_id
              AND pm.user_id = public.current_app_user_id()
        )
    );
