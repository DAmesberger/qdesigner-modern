-- 00020_admin_mutation_policies.sql
--
-- Two things in this migration, landing together because both came out
-- of the P6.2 verification round:
--
-- 1) Anonymous-read RLS exemptions on `users` and `organizations`.
--    Recorded in ADR 0015 (mid-P6.2 discovery). Same pattern as
--    `questionnaire_definitions` in ADR 0012: tables whose read path
--    is intentionally public-anonymous can't be defended by RLS in a
--    coherent way. `users` is read by email at login / register /
--    password-reset / verify-email; `organizations` is read by domain
--    at /api/domains/auto-join.
--
-- 2) Permissive INSERT/UPDATE/DELETE policies on the remaining admin
--    tables (the four still under RLS: organization_members, projects,
--    project_members, media_assets), plus on `users` and `organizations`
--    even though they no longer enforce SELECT (the policies are still
--    declared so a future re-enable of RLS on those tables doesn't
--    silently default-deny writes). ADR 0013 (D2a): RLS enforces
--    cross-tenant SELECT denial; api/access::* remains the sole
--    authorization layer for mutations.
--
-- The `_all` suffix on policy names is intentional. Future schema-grep
-- audits should treat the `_all` suffix as "permissive — does not
-- encode rules; api/access::* is the gate." When a future ADR
-- supersedes 0013 with rule-encoding policies, these are the policies
-- it replaces.
--
-- Pattern, repeated per table:
--   <table>_insert_all  FOR INSERT WITH CHECK (true)
--   <table>_update_all  FOR UPDATE USING (true) WITH CHECK (true)
--   <table>_delete_all  FOR DELETE USING (true)

-- ── Anonymous-read RLS exemptions (ADR 0015) ─────────────────────────
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

-- USERS ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS users_insert_all ON public.users;
CREATE POLICY users_insert_all ON public.users
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS users_update_all ON public.users;
CREATE POLICY users_update_all ON public.users
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS users_delete_all ON public.users;
CREATE POLICY users_delete_all ON public.users
    FOR DELETE USING (true);

-- ORGANIZATIONS ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS organizations_insert_all ON public.organizations;
CREATE POLICY organizations_insert_all ON public.organizations
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS organizations_update_all ON public.organizations;
CREATE POLICY organizations_update_all ON public.organizations
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS organizations_delete_all ON public.organizations;
CREATE POLICY organizations_delete_all ON public.organizations
    FOR DELETE USING (true);

-- ORGANIZATION_MEMBERS ───────────────────────────────────────────────
DROP POLICY IF EXISTS organization_members_insert_all ON public.organization_members;
CREATE POLICY organization_members_insert_all ON public.organization_members
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS organization_members_update_all ON public.organization_members;
CREATE POLICY organization_members_update_all ON public.organization_members
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS organization_members_delete_all ON public.organization_members;
CREATE POLICY organization_members_delete_all ON public.organization_members
    FOR DELETE USING (true);

-- PROJECTS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS projects_insert_all ON public.projects;
CREATE POLICY projects_insert_all ON public.projects
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS projects_update_all ON public.projects;
CREATE POLICY projects_update_all ON public.projects
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS projects_delete_all ON public.projects;
CREATE POLICY projects_delete_all ON public.projects
    FOR DELETE USING (true);

-- PROJECT_MEMBERS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS project_members_insert_all ON public.project_members;
CREATE POLICY project_members_insert_all ON public.project_members
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS project_members_update_all ON public.project_members;
CREATE POLICY project_members_update_all ON public.project_members
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS project_members_delete_all ON public.project_members;
CREATE POLICY project_members_delete_all ON public.project_members
    FOR DELETE USING (true);

-- MEDIA_ASSETS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS media_assets_insert_all ON public.media_assets;
CREATE POLICY media_assets_insert_all ON public.media_assets
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS media_assets_update_all ON public.media_assets;
CREATE POLICY media_assets_update_all ON public.media_assets
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS media_assets_delete_all ON public.media_assets;
CREATE POLICY media_assets_delete_all ON public.media_assets
    FOR DELETE USING (true);
