-- 010_rls_policies.sql
-- Row-Level Security policies.
-- The Rust backend sets `current_setting('app.user_id', true)` on each connection
-- to the authenticated user's UUID. Policies use this instead of auth.uid().

-- Helper: extract the current user id from the connection setting.
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Helper: check if current user is a super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = public.current_app_user_id()
          AND r.name = 'super_admin'
          AND ur.scope_type IS NULL
    );
$$;

-- =============================================================================
-- USERS
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON public.users
    FOR SELECT USING (
        id = public.current_app_user_id()
        OR public.is_super_admin()
        -- Allow members of the same organization to see each other
        OR EXISTS (
            SELECT 1
            FROM public.organization_members om1
            JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
            WHERE om1.user_id = public.current_app_user_id()
              AND om2.user_id = users.id
              AND om1.status = 'active'
              AND om2.status = 'active'
        )
    );

CREATE POLICY users_update ON public.users
    FOR UPDATE USING (
        id = public.current_app_user_id()
        OR public.is_super_admin()
    );

-- =============================================================================
-- ORGANIZATIONS
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY organizations_insert ON public.organizations
    FOR INSERT WITH CHECK (
        created_by = public.current_app_user_id()
    );

CREATE POLICY organizations_update ON public.organizations
    FOR UPDATE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organizations.id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY organizations_delete ON public.organizations
    FOR DELETE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organizations.id
              AND om.user_id = public.current_app_user_id()
              AND om.role = 'owner'
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- ORGANIZATION_MEMBERS
-- =============================================================================

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_members_select ON public.organization_members
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_members.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY org_members_insert ON public.organization_members
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_members.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY org_members_update ON public.organization_members
    FOR UPDATE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_members.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY org_members_delete ON public.organization_members
    FOR DELETE USING (
        -- Users can remove themselves
        user_id = public.current_app_user_id()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_members.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- ORGANIZATION_INVITATIONS
-- =============================================================================

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_invitations_select ON public.organization_invitations
    FOR SELECT USING (
        public.is_super_admin()
        -- Org owners/admins can see all invitations for their org
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_invitations.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
        -- Invited user can see their own invitation
        OR (
            email = (SELECT email FROM public.users WHERE id = public.current_app_user_id())
        )
    );

CREATE POLICY org_invitations_insert ON public.organization_invitations
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_invitations.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY org_invitations_update ON public.organization_invitations
    FOR UPDATE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_invitations.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- ORGANIZATION_DOMAINS
-- =============================================================================

ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_domains_select ON public.organization_domains
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_domains.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY org_domains_manage ON public.organization_domains
    FOR ALL USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = organization_domains.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- PROJECTS
-- =============================================================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON public.projects
    FOR SELECT USING (
        is_public = true
        OR public.is_super_admin()
        -- Members of the project's organization can view
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = projects.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY projects_insert ON public.projects
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = projects.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin', 'member')
              AND om.status = 'active'
        )
    );

CREATE POLICY projects_update ON public.projects
    FOR UPDATE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = projects.id
              AND pm.user_id = public.current_app_user_id()
              AND pm.role IN ('owner', 'admin', 'editor')
        )
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = projects.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY projects_delete ON public.projects
    FOR DELETE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = projects.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- PROJECT_MEMBERS
-- =============================================================================

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_members_select ON public.project_members
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = project_members.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY project_members_manage ON public.project_members
    FOR ALL USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = project_members.project_id
              AND pm.user_id = public.current_app_user_id()
              AND pm.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = project_members.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- QUESTIONNAIRE_DEFINITIONS
-- =============================================================================

ALTER TABLE public.questionnaire_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY questionnaire_defs_select ON public.questionnaire_definitions
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = questionnaire_definitions.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY questionnaire_defs_insert ON public.questionnaire_definitions
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = questionnaire_definitions.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin', 'member')
              AND om.status = 'active'
        )
    );

CREATE POLICY questionnaire_defs_update ON public.questionnaire_definitions
    FOR UPDATE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.project_members pm ON pm.project_id = p.id
            WHERE p.id = questionnaire_definitions.project_id
              AND pm.user_id = public.current_app_user_id()
              AND pm.role IN ('owner', 'admin', 'editor')
        )
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = questionnaire_definitions.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY questionnaire_defs_delete ON public.questionnaire_definitions
    FOR DELETE USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.projects p
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = questionnaire_definitions.project_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- SESSIONS
-- =============================================================================

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Sessions are readable by org members of the questionnaire's project
CREATE POLICY sessions_select ON public.sessions
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.questionnaire_definitions qd
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE qd.id = sessions.questionnaire_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

-- Sessions can be created by anyone (participants don't need auth)
-- The backend handles session creation directly, bypassing RLS for participant endpoints.
CREATE POLICY sessions_insert ON public.sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY sessions_update ON public.sessions
    FOR UPDATE USING (true);

-- =============================================================================
-- RESPONSES
-- =============================================================================

ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY responses_select ON public.responses
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE s.id = responses.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY responses_insert ON public.responses
    FOR INSERT WITH CHECK (true);

-- =============================================================================
-- INTERACTION_EVENTS
-- =============================================================================

ALTER TABLE public.interaction_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY interaction_events_select ON public.interaction_events
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE s.id = interaction_events.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY interaction_events_insert ON public.interaction_events
    FOR INSERT WITH CHECK (true);

-- =============================================================================
-- SESSION_VARIABLES
-- =============================================================================

ALTER TABLE public.session_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_variables_select ON public.session_variables
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE s.id = session_variables.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY session_variables_insert ON public.session_variables
    FOR INSERT WITH CHECK (true);

CREATE POLICY session_variables_update ON public.session_variables
    FOR UPDATE USING (true);

-- =============================================================================
-- MEDIA_ASSETS
-- =============================================================================

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_assets_select ON public.media_assets
    FOR SELECT USING (
        access_level = 'public'
        OR uploaded_by = public.current_app_user_id()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_assets.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
        OR EXISTS (
            SELECT 1 FROM public.media_permissions mp
            WHERE mp.media_id = media_assets.id
              AND mp.user_id = public.current_app_user_id()
              AND mp.permission IN ('view', 'edit', 'delete', 'share')
              AND (mp.expires_at IS NULL OR mp.expires_at > now())
        )
    );

CREATE POLICY media_assets_insert ON public.media_assets
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_assets.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY media_assets_update ON public.media_assets
    FOR UPDATE USING (
        uploaded_by = public.current_app_user_id()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_assets.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

CREATE POLICY media_assets_delete ON public.media_assets
    FOR DELETE USING (
        uploaded_by = public.current_app_user_id()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_assets.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- MEDIA_COLLECTIONS
-- =============================================================================

ALTER TABLE public.media_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_collections_select ON public.media_collections
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_collections.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY media_collections_manage ON public.media_collections
    FOR ALL USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = media_collections.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin', 'member')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- MEDIA_COLLECTION_ITEMS
-- =============================================================================

ALTER TABLE public.media_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_collection_items_select ON public.media_collection_items
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.media_collections mc
            JOIN public.organization_members om ON om.organization_id = mc.organization_id
            WHERE mc.id = media_collection_items.collection_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY media_collection_items_manage ON public.media_collection_items
    FOR ALL USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.media_collections mc
            JOIN public.organization_members om ON om.organization_id = mc.organization_id
            WHERE mc.id = media_collection_items.collection_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin', 'member')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- MEDIA_USAGE
-- =============================================================================

ALTER TABLE public.media_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_usage_select ON public.media_usage
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.questionnaire_definitions qd
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om ON om.organization_id = p.organization_id
            WHERE qd.id = media_usage.questionnaire_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

CREATE POLICY media_usage_manage ON public.media_usage
    FOR ALL USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.questionnaire_definitions qd
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.project_members pm ON pm.project_id = p.id
            WHERE qd.id = media_usage.questionnaire_id
              AND pm.user_id = public.current_app_user_id()
              AND pm.role IN ('owner', 'admin', 'editor')
        )
    );

-- =============================================================================
-- MEDIA_PERMISSIONS
-- =============================================================================

ALTER TABLE public.media_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY media_permissions_select ON public.media_permissions
    FOR SELECT USING (
        user_id = public.current_app_user_id()
        OR public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.media_assets ma
            WHERE ma.id = media_permissions.media_id
              AND ma.uploaded_by = public.current_app_user_id()
        )
    );

CREATE POLICY media_permissions_manage ON public.media_permissions
    FOR ALL USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.media_assets ma
            WHERE ma.id = media_permissions.media_id
              AND ma.uploaded_by = public.current_app_user_id()
        )
        OR EXISTS (
            SELECT 1 FROM public.media_assets ma
            JOIN public.organization_members om ON om.organization_id = ma.organization_id
            WHERE ma.id = media_permissions.media_id
              AND om.user_id = public.current_app_user_id()
              AND om.role IN ('owner', 'admin')
              AND om.status = 'active'
        )
    );

-- =============================================================================
-- ONBOARDING_EVENTS
-- =============================================================================

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_events_select ON public.onboarding_events
    FOR SELECT USING (
        user_id = public.current_app_user_id()
        OR public.is_super_admin()
    );

CREATE POLICY onboarding_events_insert ON public.onboarding_events
    FOR INSERT WITH CHECK (true);

-- =============================================================================
-- EMAIL_VERIFICATIONS
-- =============================================================================

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_verifications_select ON public.email_verifications
    FOR SELECT USING (
        user_id = public.current_app_user_id()
        OR public.is_super_admin()
    );

-- Insert/update handled by backend with elevated privileges

-- =============================================================================
-- AUTH SCHEMA TABLES (revoked_tokens, refresh_tokens)
-- These are managed exclusively by the backend with a service role connection,
-- so we enable RLS but add no user-facing policies (backend bypasses RLS).
-- =============================================================================

ALTER TABLE auth.revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- ROLES / PERMISSIONS / ROLE_PERMISSIONS / USER_ROLES
-- Admin-only tables: only super_admins can read/write.
-- =============================================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_select ON public.roles
    FOR SELECT USING (true);  -- Roles are public metadata

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_select ON public.permissions
    FOR SELECT USING (true);  -- Permissions are public metadata

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_select ON public.role_permissions
    FOR SELECT USING (true);  -- Role-permission mappings are public metadata

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_select ON public.user_roles
    FOR SELECT USING (
        user_id = public.current_app_user_id()
        OR public.is_super_admin()
    );

CREATE POLICY user_roles_manage ON public.user_roles
    FOR ALL USING (
        public.is_super_admin()
    );
