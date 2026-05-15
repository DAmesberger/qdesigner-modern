-- 00014_rls_policies.sql
--
-- RLS policies and helper functions, authored per ADR 0009 against the
-- LIVE schema (apps/server/migrations/00001_initial_schema.sql and
-- follow-ups). The dead-dir `db/migrations/010_rls_policies.sql` was
-- written against a different (Supabase-era) schema; this migration is a
-- fresh authoring, not a port.
--
-- IMPORTANT — enforcement status:
-- These policies use ENABLE ROW LEVEL SECURITY, not FORCE. The Rust
-- backend connects as the table owner, which bypasses RLS by default.
-- So these policies are defense-in-depth against ad-hoc DB access
-- (e.g., psql sessions, future read-replica analyst roles) but do NOT
-- enforce on application traffic. Application-level checks in
-- api/access::* remain the live authorization layer.
--
-- The connection-pinning refactor that would make these policies enforce
-- on application traffic is deferred to Phase 5 (requires every
-- authenticated handler to take &mut Transaction; out of P3.4 budget).

-- ── Helper functions ─────────────────────────────────────────────────

-- Returns the user ID set on the current connection via
-- `SELECT set_config('app.user_id', '<uuid>', ...)`, or NULL if unset.
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Returns the role string set on the current connection via
-- `SELECT set_config('app.user_role', '<role>', ...)`, or empty string.
CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
    SELECT coalesce(current_setting('app.user_role', true), '');
$$;

-- Super-admin bypass. Always false in current model — super-admin status
-- is enforced application-side, not via DB roles. Function exists so
-- policies can be written portably; flipping the body to a real check
-- (e.g., reading a roles claim) is a future option.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT false;
$$;

-- ── Policies ─────────────────────────────────────────────────────────
-- Convention used below:
--   - One policy per (table, action) where the rule differs.
--   - Membership chains use EXISTS subqueries against organization_members
--     and project_members.
--   - Soft-deleted rows (deleted_at IS NOT NULL) are excluded.

-- USERS: a user sees their own row plus org-co-members.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
    FOR SELECT USING (
        public.is_super_admin()
        OR id = public.current_app_user_id()
        OR EXISTS (
            SELECT 1
            FROM public.organization_members om_self
            JOIN public.organization_members om_other
                 ON om_self.organization_id = om_other.organization_id
            WHERE om_self.user_id = public.current_app_user_id()
              AND om_self.status = 'active'
              AND om_other.user_id = users.id
              AND om_other.status = 'active'
        )
    );

DROP POLICY IF EXISTS users_update ON public.users;
CREATE POLICY users_update ON public.users
    FOR UPDATE USING (
        public.is_super_admin()
        OR id = public.current_app_user_id()
    );

-- ORGANIZATIONS: members can read their orgs.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organizations.id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

-- ORGANIZATION_MEMBERS: each user sees only their own membership rows.
-- (Listing other members in the same org is exposed via the api/access::*
-- layer with an explicit JOIN; an RLS policy that self-references
-- organization_members causes infinite recursion in PostgreSQL's
-- rewrite phase.)
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
CREATE POLICY organization_members_select ON public.organization_members
    FOR SELECT USING (
        public.is_super_admin()
        OR user_id = public.current_app_user_id()
    );

-- PROJECTS: org members see their org's projects.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = projects.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

-- PROJECT_MEMBERS: members of the project, plus org admins, can see.
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_members_select ON public.project_members;
CREATE POLICY project_members_select ON public.project_members
    FOR SELECT USING (
        public.is_super_admin()
        OR user_id = public.current_app_user_id()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om
                 ON om.organization_id = p.organization_id
            WHERE p.id = project_members.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- QUESTIONNAIRE_DEFINITIONS: org members or explicit project members.
ALTER TABLE public.questionnaire_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questionnaire_definitions_select ON public.questionnaire_definitions;
CREATE POLICY questionnaire_definitions_select ON public.questionnaire_definitions
    FOR SELECT USING (
        public.is_super_admin()
        OR deleted_at IS NULL AND (
            EXISTS (
                SELECT 1 FROM public.projects p
                JOIN public.organization_members om
                     ON om.organization_id = p.organization_id
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
        )
    );

-- SESSIONS: project members through the questionnaire.
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_select ON public.sessions;
CREATE POLICY sessions_select ON public.sessions
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.questionnaire_definitions qd
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om
                 ON om.organization_id = p.organization_id
            WHERE qd.id = sessions.questionnaire_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

-- RESPONSES, INTERACTION_EVENTS, SESSION_VARIABLES: through the session.
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS responses_select ON public.responses;
CREATE POLICY responses_select ON public.responses
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om
                 ON om.organization_id = p.organization_id
            WHERE s.id = responses.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

ALTER TABLE public.interaction_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interaction_events_select ON public.interaction_events;
CREATE POLICY interaction_events_select ON public.interaction_events
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om
                 ON om.organization_id = p.organization_id
            WHERE s.id = interaction_events.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

ALTER TABLE public.session_variables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_variables_select ON public.session_variables;
CREATE POLICY session_variables_select ON public.session_variables
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om
                 ON om.organization_id = p.organization_id
            WHERE s.id = session_variables.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

-- MEDIA_ASSETS: org members.
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select ON public.media_assets
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_assets.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );
