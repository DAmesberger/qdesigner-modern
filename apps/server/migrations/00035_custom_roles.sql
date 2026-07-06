-- 00035_custom_roles.sql  (E-RBAC-3)
--
-- Activates the granular permission layer that sat dead in
-- `rbac::models::Permission` (19 actions) behind the coarse role tiers.
--
-- Data model:
--   * org_roles — one row per role definition in an org. The four built-in
--     system roles (owner/admin/member/viewer) are seeded here (is_system =
--     true, immutable) with the SAME default permission sets encoded in
--     `OrgRole::default_permissions` (Rust). Custom roles are is_system =
--     false rows an org admin authors in the permission-matrix editor.
--   * organization_members.custom_role_id — optional FK to an org_roles row.
--     When set, the member's EFFECTIVE permission set is that row's
--     `permissions` (authoritative — it may narrow or widen the base tier);
--     when null, the member resolves to their system role's default set.
--     ON DELETE SET NULL so deleting a custom role cleanly demotes its
--     holders back to their system-role defaults.
--
-- The permission strings are the `Permission::as_str` wire tokens
-- (`session:read`, `questionnaire:publish`, …). `RbacManager::resolve_permissions`
-- parses them back with `Permission::from_str`.
--
-- NUMBERING: the E-RBAC-3 unit spec named this "00029_custom_roles.sql", but
-- 00029 is already taken (00029_sessions_insert_user_id_guard) and the live
-- directory has reached 00034. Authored at the next free slot, 00035, per the
-- stale-reference correction rule.

-- ── org_roles table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    permissions     text[] NOT NULL DEFAULT '{}',
    is_system       boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_org_roles_org ON public.org_roles (organization_id);

-- ── organization_members.custom_role_id ──────────────────────────────
ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS custom_role_id uuid
        REFERENCES public.org_roles(id) ON DELETE SET NULL;

-- ── System-role seed helper ──────────────────────────────────────────
-- Idempotent: seeds the four immutable system roles for one org. Called by
-- the existing-org backfill below AND by the new-org trigger so every org —
-- past and future — carries the presets. The permission arrays are kept in
-- lockstep with OrgRole::default_permissions (Rust).
--
-- SECURITY DEFINER (owned by the migration superuser `qdesigner`, which has
-- BYPASSRLS — same posture as fillout_cohort_stats / the quota functions):
-- the new-org trigger fires from `create_organization` running as the
-- non-BYPASSRLS `qdesigner_app` role BEFORE the owner's membership row
-- exists and with no `app.session_id`/`app.user_id` bound, so the
-- `ON CONFLICT` arbiter's implicit read against org_roles' member-scoped
-- SELECT policy would raise an RLS violation. Running the seed as the owner
-- bypasses RLS for this privileged bootstrap. `SET search_path` pins name
-- resolution (standard definer hardening).
CREATE OR REPLACE FUNCTION public.seed_system_org_roles(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.org_roles (organization_id, name, permissions, is_system)
    VALUES
        (p_org, 'Owner', ARRAY[
            'org:read','org:write','org:manage_members','org:delete',
            'project:read','project:write','project:manage_members','project:delete',
            'questionnaire:read','questionnaire:write','questionnaire:publish','questionnaire:delete',
            'session:read','session:write','response:read','response:write',
            'media:read','media:write','media:delete'
        ], true),
        (p_org, 'Admin', ARRAY[
            'org:read','org:write','org:manage_members',
            'project:read','project:write','project:manage_members','project:delete',
            'questionnaire:read','questionnaire:write','questionnaire:publish','questionnaire:delete',
            'session:read','session:write','response:read','response:write',
            'media:read','media:write','media:delete'
        ], true),
        (p_org, 'Member', ARRAY[
            'org:read',
            'project:read','project:write',
            'questionnaire:read','questionnaire:write','questionnaire:publish',
            'session:read','session:write','response:read','response:write',
            'media:read','media:write'
        ], true),
        (p_org, 'Viewer', ARRAY[
            'org:read','project:read','questionnaire:read',
            'session:read','response:read','media:read'
        ], true)
    ON CONFLICT (organization_id, name) DO NOTHING;
END;
$$;

ALTER FUNCTION public.seed_system_org_roles(uuid) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.seed_system_org_roles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_system_org_roles(uuid) TO qdesigner_app;

-- ── Backfill existing orgs ────────────────────────────────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT id FROM public.organizations LOOP
        PERFORM public.seed_system_org_roles(r.id);
    END LOOP;
END;
$$;

-- ── New-org trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_seed_system_org_roles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.seed_system_org_roles(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_system_org_roles_after_insert ON public.organizations;
CREATE TRIGGER seed_system_org_roles_after_insert
    AFTER INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_seed_system_org_roles();

-- ── RLS ───────────────────────────────────────────────────────────────
-- Defense-in-depth mirroring the admin-table posture (ADR 0013): SELECT is
-- scoped to active members of the row's org; mutations are permissive
-- (WITH CHECK true) because api/roles.rs (owner/admin gate + is_system
-- immutability) is the authorization gate. The SELECT predicate reads the
-- caller's OWN organization_members row, which the 00014/00023 policies
-- already admit, so it does not recurse.
ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_roles_select ON public.org_roles;
CREATE POLICY org_roles_select ON public.org_roles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = org_roles.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

DROP POLICY IF EXISTS org_roles_insert ON public.org_roles;
CREATE POLICY org_roles_insert ON public.org_roles
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS org_roles_update ON public.org_roles;
CREATE POLICY org_roles_update ON public.org_roles
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS org_roles_delete ON public.org_roles;
CREATE POLICY org_roles_delete ON public.org_roles
    FOR DELETE USING (true);
