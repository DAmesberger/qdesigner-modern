-- 021_comments_rls.sql
-- Enable RLS on questionnaire_comments and add access policies.

ALTER TABLE questionnaire_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: project members can read comments on questionnaires they have access to.
CREATE POLICY comments_select ON questionnaire_comments
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM questionnaire_definitions qd
            JOIN project_members pm ON pm.project_id = qd.project_id
            WHERE qd.id = questionnaire_comments.questionnaire_id
              AND pm.user_id = public.current_app_user_id()
              AND qd.deleted_at IS NULL
        )
        OR EXISTS (
            SELECT 1 FROM questionnaire_definitions qd
            JOIN projects p ON p.id = qd.project_id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE qd.id = questionnaire_comments.questionnaire_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
              AND qd.deleted_at IS NULL
        )
    );

-- INSERT: project members can create comments.
CREATE POLICY comments_insert ON questionnaire_comments
    FOR INSERT WITH CHECK (
        author_id = public.current_app_user_id()
        AND (
            public.is_super_admin()
            OR EXISTS (
                SELECT 1 FROM questionnaire_definitions qd
                JOIN project_members pm ON pm.project_id = qd.project_id
                WHERE qd.id = questionnaire_comments.questionnaire_id
                  AND pm.user_id = public.current_app_user_id()
                  AND qd.deleted_at IS NULL
            )
        )
    );

-- UPDATE: author can edit body; any project member can resolve/unresolve.
CREATE POLICY comments_update ON questionnaire_comments
    FOR UPDATE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM questionnaire_definitions qd
            JOIN project_members pm ON pm.project_id = qd.project_id
            WHERE qd.id = questionnaire_comments.questionnaire_id
              AND pm.user_id = public.current_app_user_id()
              AND qd.deleted_at IS NULL
        )
    );

-- DELETE: only the comment author can delete.
CREATE POLICY comments_delete ON questionnaire_comments
    FOR DELETE USING (
        author_id = public.current_app_user_id()
        OR public.is_super_admin()
    );
