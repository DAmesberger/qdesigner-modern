-- 00053_project_transfer_ownership_permission.sql  (ADR 0032 — ledger L7)
--
-- Adds the new closed-enum permission `project:transfer_ownership`
-- (`Permission::ProjectTransferOwnership`, Owner tier) to the seeded system
-- `org_roles` rows so the SQL presets stay the "same data in two places" as
-- `OrgRole::default_permissions` (Rust). Owner and Admin gain it; Member and
-- Viewer do NOT (an org member/viewer may never transfer project ownership).
--
-- Two parts, mirroring 00035:
--   1. UPDATE the already-seeded `is_system` Owner/Admin rows for every
--      existing org (idempotent — array_append only when absent).
--   2. CREATE OR REPLACE `seed_system_org_roles` with the permission added to
--      the Owner and Admin arrays so every FUTURE org's seed carries it too.

-- ── 1. Backfill existing system rows ─────────────────────────────────
UPDATE public.org_roles
SET permissions = array_append(permissions, 'project:transfer_ownership'),
    updated_at = now()
WHERE is_system = true
  AND name IN ('Owner', 'Admin')
  AND NOT ('project:transfer_ownership' = ANY (permissions));

-- ── 2. Keep the seed function in lockstep for new orgs ───────────────
-- Owner and Admin arrays now include 'project:transfer_ownership'; Member and
-- Viewer arrays are byte-identical to 00035. Attributes (SECURITY DEFINER,
-- search_path, owner, grants) persist across CREATE OR REPLACE.
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
            'project:read','project:write','project:manage_members','project:delete','project:transfer_ownership',
            'questionnaire:read','questionnaire:write','questionnaire:publish','questionnaire:delete',
            'session:read','session:write','response:read','response:write',
            'media:read','media:write','media:delete'
        ], true),
        (p_org, 'Admin', ARRAY[
            'org:read','org:write','org:manage_members',
            'project:read','project:write','project:manage_members','project:delete','project:transfer_ownership',
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
