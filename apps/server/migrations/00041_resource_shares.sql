-- 00041_resource_shares.sql  (E-RBAC-10)
--
-- Cross-project & external-guest sharing. Once E-RBAC-1 made projects
-- confidential-by-default (`projectVisibility = 'members'`), the only way to
-- let a collaborator in ANOTHER project — or a reviewer in ANOTHER org — read
-- or edit a project / a questionnaire's analytics was to make them a full org
-- member. This table adds an explicit, scoped, time-limited grant instead.
--
--   resource_shares(resource_type, resource_id, grantee, role, expires_at)
--
-- A grant confers AT MOST the share's role on exactly the shared resource and
-- never any org-management capability (the guest has no organization_members /
-- project_members row, so every `has_org_role` / `has_project_role` /
-- membership-scoped list stays denied — the "guest cap" of step 5 is enforced
-- structurally, not by a special case).
--
-- NOTE ON NUMBERING: the E-RBAC-10 unit spec named this "00035", but that
-- number is already custom_roles and the live head is 00040. Authored as the
-- next free number (00041) per the "correct a stale reference" rule.
--
-- Layering, mirroring the rest of the RLS estate:
--   * Handler gate — api/access::verify_project_read_access /
--     verify_project_write_access / verify_questionnaire_access OR-in the same
--     predicates encoded here (the authoritative authorization layer).
--   * RLS defense-in-depth — projects_select and the four fillout-path SELECT
--     policies gain a parallel "…_via_share" branch so a compromised handler
--     that queries without an explicit check still can't over-read.
--
-- Expiry: grants are inert once `expires_at < now()` everywhere (every helper
-- filters `expires_at IS NULL OR expires_at > now()`), so an expired share
-- denies at BOTH layers with no cleanup step required. A purge helper is
-- provided for housekeeping but nothing depends on it running.

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resource_shares (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type   text NOT NULL CHECK (resource_type IN ('project', 'questionnaire')),
    resource_id     uuid NOT NULL,
    -- Denormalised owning org (project's org, or the questionnaire's project's
    -- org). Lets audit rows + the management list resolve tenancy without a
    -- polymorphic JOIN, and scopes the require_permission guest pass-through.
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Share target. `grantee_email` is always present (you share by email);
    -- `grantee_user_id` is NULL until that email first authenticates, at which
    -- point resolve_pending_resource_shares() links it (step 2 — pending grant).
    grantee_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    grantee_email   text NOT NULL,
    role            text NOT NULL CHECK (role IN ('viewer', 'editor')),
    created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz
);

-- One live grant per (resource, email); re-sharing updates role/expiry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_shares_resource_email
    ON public.resource_shares (resource_type, resource_id, lower(grantee_email));

-- Primary access pattern: "shares on this resource" (management list + the
-- share-branch RLS helpers).
CREATE INDEX IF NOT EXISTS idx_resource_shares_resource
    ON public.resource_shares (resource_type, resource_id);

-- "Shared with me" + the per-request access predicates key on the grantee.
CREATE INDEX IF NOT EXISTS idx_resource_shares_grantee_user
    ON public.resource_shares (grantee_user_id);

-- Pending-grant resolution on first login keys on the email.
CREATE INDEX IF NOT EXISTS idx_resource_shares_grantee_email
    ON public.resource_shares (lower(grantee_email));

-- ── SECURITY DEFINER predicate helpers ───────────────────────────────
--
-- Same pattern as 00033's is_project_member / 00023's is_member_of_org: the
-- functions run with the definer's (qdesigner, BYPASSRLS) rights so reading
-- resource_shares from inside a policy on ANOTHER table introduces no
-- recursion and needs no SELECT-visibility on resource_shares for the caller.
-- Cross-tenant isolation is preserved because every caller passes its OWN
-- current_app_user_id() as `uid`.

-- True iff `uid` holds ANY active (non-expired) share on the given resource.
CREATE OR REPLACE FUNCTION public.user_has_active_share(
    res_type text, res_id uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.resource_shares rs
        WHERE rs.resource_type = res_type
          AND rs.resource_id = res_id
          AND rs.grantee_user_id = uid
          AND (rs.expires_at IS NULL OR rs.expires_at > now())
    );
$$;

-- True iff `uid` holds an active EDITOR share on the given resource (write).
CREATE OR REPLACE FUNCTION public.user_has_active_edit_share(
    res_type text, res_id uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.resource_shares rs
        WHERE rs.resource_type = res_type
          AND rs.resource_id = res_id
          AND rs.grantee_user_id = uid
          AND rs.role = 'editor'
          AND (rs.expires_at IS NULL OR rs.expires_at > now())
    );
$$;

-- True iff `uid` may read questionnaire `qid` through a share — either a
-- direct questionnaire share OR a share on the questionnaire's parent project
-- (sharing a project cascades to its questionnaires' analytics).
CREATE OR REPLACE FUNCTION public.user_can_read_questionnaire_via_share(
    qid uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT uid IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.resource_shares rs
        WHERE rs.grantee_user_id = uid
          AND (rs.expires_at IS NULL OR rs.expires_at > now())
          AND (
            (rs.resource_type = 'questionnaire' AND rs.resource_id = qid)
            OR (rs.resource_type = 'project'
                AND rs.resource_id = (
                    SELECT qd.project_id
                    FROM public.questionnaire_definitions qd
                    WHERE qd.id = qid
                ))
          )
    );
$$;

-- True iff `uid` may MANAGE (list/revoke) shares on the given resource: an
-- owner/admin of the share's org, or an owner/admin project member of the
-- target project (resolved from the share target). Powers the resource_shares
-- SELECT/DELETE policies so the handler-authorized manager can also see the
-- rows under RLS even when they are neither the grantee nor the creator.
CREATE OR REPLACE FUNCTION public.can_manage_resource_share(
    share_org uuid, res_type text, res_id uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT uid IS NOT NULL AND (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = share_org
              AND om.user_id = uid
              AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.user_id = uid
              AND pm.role IN ('owner', 'admin')
              AND pm.project_id = CASE
                    WHEN res_type = 'project' THEN res_id
                    WHEN res_type = 'questionnaire' THEN (
                        SELECT qd.project_id
                        FROM public.questionnaire_definitions qd
                        WHERE qd.id = res_id
                    )
                    ELSE NULL
                  END
        )
    );
$$;

ALTER FUNCTION public.user_has_active_share(text, uuid, uuid) OWNER TO qdesigner;
ALTER FUNCTION public.user_has_active_edit_share(text, uuid, uuid) OWNER TO qdesigner;
ALTER FUNCTION public.user_can_read_questionnaire_via_share(uuid, uuid) OWNER TO qdesigner;
ALTER FUNCTION public.can_manage_resource_share(uuid, text, uuid, uuid) OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.user_has_active_share(text, uuid, uuid) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.user_has_active_edit_share(text, uuid, uuid) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.user_can_read_questionnaire_via_share(uuid, uuid) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.can_manage_resource_share(uuid, text, uuid, uuid) TO qdesigner_app;

-- ── Pending-grant resolution (step 2) ────────────────────────────────
--
-- Called by register/login on the plain (GUC-less) app pool, so it must run
-- as the definer to bypass RLS on resource_shares (there is no UPDATE policy
-- for the app role — grants are create/revoke only through the handler). Links
-- every dangling grant for `p_email` to the freshly-authenticated user id.
CREATE OR REPLACE FUNCTION public.resolve_pending_resource_shares(
    p_email text, p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    n integer;
BEGIN
    UPDATE public.resource_shares
       SET grantee_user_id = p_user_id
     WHERE grantee_user_id IS NULL
       AND lower(grantee_email) = lower(p_email);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

ALTER FUNCTION public.resolve_pending_resource_shares(text, uuid) OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.resolve_pending_resource_shares(text, uuid) TO qdesigner_app;

-- Housekeeping: hard-delete grants that expired before now(). Nothing depends
-- on this running (helpers already treat expired grants as inert); a scheduled
-- job / manual call keeps the table tidy and lets the revoke audit trail note
-- lapsed grants. Returns the number of rows removed.
CREATE OR REPLACE FUNCTION public.purge_expired_resource_shares()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    n integer;
BEGIN
    DELETE FROM public.resource_shares
     WHERE expires_at IS NOT NULL AND expires_at <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

ALTER FUNCTION public.purge_expired_resource_shares() OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.purge_expired_resource_shares() TO qdesigner_app;

-- ── RLS on resource_shares itself ────────────────────────────────────
ALTER TABLE public.resource_shares ENABLE ROW LEVEL SECURITY;

-- SELECT: super-admin, the grantee (powers "Shared with me"), the creator, or
-- anyone who may manage shares on the target resource (management list). No
-- recursion — can_manage_resource_share is SECURITY DEFINER.
DROP POLICY IF EXISTS resource_shares_select ON public.resource_shares;
CREATE POLICY resource_shares_select ON public.resource_shares
    FOR SELECT USING (
        public.is_super_admin()
        OR grantee_user_id = public.current_app_user_id()
        OR created_by = public.current_app_user_id()
        OR public.can_manage_resource_share(
               organization_id, resource_type, resource_id,
               public.current_app_user_id())
    );

-- INSERT: permissive — api/shares::* (project-admin/owner gated) is the
-- authorization gate, mirroring the admin-table posture of ADR 0013 D2a. The
-- RETURNING row still passes the SELECT policy above via the created_by branch.
DROP POLICY IF EXISTS resource_shares_insert ON public.resource_shares;
CREATE POLICY resource_shares_insert ON public.resource_shares
    FOR INSERT WITH CHECK (true);

-- UPDATE: re-sharing the same (resource, email) upserts role/expiry via
-- ON CONFLICT DO UPDATE, so the creator or a resource manager may update. The
-- pending-grant link (grantee_user_id) is written by the SECURITY DEFINER
-- resolve function, which bypasses RLS, so it does not depend on this policy.
DROP POLICY IF EXISTS resource_shares_update ON public.resource_shares;
CREATE POLICY resource_shares_update ON public.resource_shares
    FOR UPDATE
    USING (
        public.is_super_admin()
        OR created_by = public.current_app_user_id()
        OR public.can_manage_resource_share(
               organization_id, resource_type, resource_id,
               public.current_app_user_id())
    )
    WITH CHECK (
        public.is_super_admin()
        OR created_by = public.current_app_user_id()
        OR public.can_manage_resource_share(
               organization_id, resource_type, resource_id,
               public.current_app_user_id())
    );

-- DELETE (revoke): the creator or a resource manager.
DROP POLICY IF EXISTS resource_shares_delete ON public.resource_shares;
CREATE POLICY resource_shares_delete ON public.resource_shares
    FOR DELETE USING (
        public.is_super_admin()
        OR created_by = public.current_app_user_id()
        OR public.can_manage_resource_share(
               organization_id, resource_type, resource_id,
               public.current_app_user_id())
    );

-- ── Share branches on the read-side estate (step 4) ──────────────────
--
-- Added as SEPARATE permissive policies so PostgreSQL OR-merges them with the
-- existing membership/dual policies without rewriting those big statements.

-- projects: a project share admits SELECT on that project row.
DROP POLICY IF EXISTS projects_select_via_share ON public.projects;
CREATE POLICY projects_select_via_share ON public.projects
    FOR SELECT USING (
        public.user_has_active_share('project', projects.id,
                                     public.current_app_user_id())
    );

-- sessions / responses / interaction_events / session_variables: a share on
-- the session's questionnaire (or its project) admits read of that session's
-- analytics data — the parallel of the existing org-member analytics branch
-- in 00021, but for external guests.
DROP POLICY IF EXISTS sessions_select_via_share ON public.sessions;
CREATE POLICY sessions_select_via_share ON public.sessions
    FOR SELECT USING (
        public.user_can_read_questionnaire_via_share(
            sessions.questionnaire_id, public.current_app_user_id())
    );

DROP POLICY IF EXISTS responses_select_via_share ON public.responses;
CREATE POLICY responses_select_via_share ON public.responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = responses.session_id
              AND public.user_can_read_questionnaire_via_share(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );

DROP POLICY IF EXISTS interaction_events_select_via_share ON public.interaction_events;
CREATE POLICY interaction_events_select_via_share ON public.interaction_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = interaction_events.session_id
              AND public.user_can_read_questionnaire_via_share(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );

DROP POLICY IF EXISTS session_variables_select_via_share ON public.session_variables;
CREATE POLICY session_variables_select_via_share ON public.session_variables
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = session_variables.session_id
              AND public.user_can_read_questionnaire_via_share(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );
