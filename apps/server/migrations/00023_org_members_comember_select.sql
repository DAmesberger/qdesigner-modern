-- 00023_org_members_comember_select.sql
--
-- Fix: on the admin Users page an org Admin/Owner saw ONLY THEMSELVES in
-- the members list. Every co-member was hidden.
--
-- Root cause: the 00014 `organization_members_select` policy admitted a
-- row only when `user_id = current_app_user_id()` — i.e. the caller's own
-- membership. Because the app connects as the non-owner, non-BYPASSRLS
-- role `qdesigner_app` (00018, ADR 0014), that policy is enforced on
-- application traffic. The `list_members` handler's
-- `SELECT ... FROM organization_members JOIN users ...` therefore
-- returned only the caller's row, making member management (role change,
-- remove) impossible.
--
-- The 00014 comment noted that a policy which self-references
-- `organization_members` recurses in PostgreSQL's rewrite phase. We break
-- that recursion with a SECURITY DEFINER helper: `is_member_of_org`
-- executes with the function owner's rights (the migration role
-- `qdesigner`, SUPERUSER + BYPASSRLS), so the SELECT it issues against
-- `organization_members` bypasses RLS and never re-invokes the policy.
--
-- Cross-tenant isolation is preserved: a caller sees an
-- `organization_members` row only if they are an active member of that
-- same `organization_id`. A caller outside the org (or anonymous, with a
-- NULL app.user_id) gets `false` → the row is denied.

-- ── SECURITY DEFINER membership helper ───────────────────────────────
--
-- Returns true iff `uid` is an *active* member of `org`. SECURITY DEFINER
-- so the internal read of organization_members runs with the definer's
-- (qdesigner) rights and bypasses RLS — this is what prevents the
-- self-referential policy from recursing. `SET search_path` pins name
-- resolution, the standard hardening for SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.is_member_of_org(org uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = org
          AND om.user_id = uid
          AND om.status = 'active'
    );
$$;

-- Function owner must be the migration role (qdesigner), which is
-- SUPERUSER + BYPASSRLS, so SECURITY DEFINER actually bypasses RLS.
-- Migrations run on the qdesigner DSN, so CREATE ... assigns that owner
-- by default; this is a belt-and-suspenders reassert.
ALTER FUNCTION public.is_member_of_org(uuid, uuid) OWNER TO qdesigner;

-- PUBLIC already has EXECUTE on functions by default (mirrors the 00014
-- helpers), but make the app role's access explicit.
GRANT EXECUTE ON FUNCTION public.is_member_of_org(uuid, uuid) TO qdesigner_app;

-- ── Corrected SELECT policy ──────────────────────────────────────────
--
-- A user sees:
--   * their own membership rows (even if not 'active' — preserves the
--     00014 behaviour for pending/invited/removed self rows), and
--   * every membership row of any org they are an active member of.
DROP POLICY IF EXISTS organization_members_select ON public.organization_members;
CREATE POLICY organization_members_select ON public.organization_members
    FOR SELECT USING (
        public.is_super_admin()
        OR user_id = public.current_app_user_id()
        OR public.is_member_of_org(organization_id, public.current_app_user_id())
    );
