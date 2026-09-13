-- Durable creation receipts. The actor/project/key scope prevents cross-tenant
-- replay, while storing the original result makes retries independent of later edits.
CREATE TABLE public.qdef_apply_requests (
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(128) NOT NULL,
    request_digest TEXT NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, actor_user_id, idempotency_key)
);

ALTER TABLE public.qdef_apply_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qdef_apply_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY qdef_apply_requests_select ON public.qdef_apply_requests
    FOR SELECT USING (
        actor_user_id = public.current_app_user_id()
        AND public.user_has_project_access(project_id, actor_user_id, 'viewer')
    );
CREATE POLICY qdef_apply_requests_insert ON public.qdef_apply_requests
    FOR INSERT WITH CHECK (
        actor_user_id = public.current_app_user_id()
        AND public.user_has_project_access(project_id, actor_user_id, 'editor')
    );
REVOKE UPDATE, DELETE ON public.qdef_apply_requests FROM qdesigner_app;
GRANT SELECT, INSERT ON public.qdef_apply_requests TO qdesigner_app;
