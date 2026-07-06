-- 00034_audit_log.sql  (E-RBAC-2)
--
-- Append-only audit log of privileged administrative actions. Every role
-- change, invitation create/revoke, member removal, domain verification,
-- org update/delete, project delete, and project-member mutation writes
-- exactly one immutable row here, on the SAME request transaction as the
-- mutation it records — so the audit entry commits iff the mutation does.
--
-- Immutability is enforced at two layers:
--   * schema:  REVOKE UPDATE, DELETE ON audit_events FROM qdesigner_app
--              (the app role can only INSERT + SELECT — no rewrite/erase).
--   * policy:  RLS ENABLE with a SELECT policy (org admin/owner only) and
--              a permissive INSERT policy. There is deliberately NO
--              UPDATE/DELETE policy, so even if the REVOKE were ever
--              re-granted, RLS default-denies mutation for the app role.
--
-- NOTE ON NUMBERING: the E-RBAC-2 unit spec named this "00028", but the
-- live migration directory already reached 00033; 00028 is cohort_stats.
-- Authored as the next free number (00034) — corrected per the "if a
-- file/line reference is stale, correct it and note the correction" rule.

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    actor_user_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
    action          text NOT NULL,
    resource_type   text NOT NULL,
    resource_id     uuid,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip              inet,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Reverse-chronological reads scoped to one organization are the only
-- access pattern (admin timeline + cursor pagination over created_at).
CREATE INDEX IF NOT EXISTS idx_audit_events_org_created
    ON public.audit_events (organization_id, created_at DESC, id DESC);

-- Actor filter (admin UI "by actor" facet).
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
    ON public.audit_events (organization_id, actor_user_id);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- SELECT: super-admin, or an ACTIVE owner/admin of the row's org. The
-- EXISTS subquery reads the caller's OWN organization_members row
-- (user_id = current_app_user_id()), which the 00014/00023
-- organization_members SELECT policy already admits — so this does not
-- recurse and needs no SECURITY DEFINER helper.
DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = audit_events.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
        )
    );

-- INSERT: permissive. The application layer (audit::record, only called
-- from already-authorized privileged handlers) is the gate for WHAT gets
-- written; RLS just admits the write for the app role.
DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
CREATE POLICY audit_events_insert ON public.audit_events
    FOR INSERT WITH CHECK (true);

-- No UPDATE and no DELETE policy: append-only at the policy layer.

-- ── Append-only grant posture ────────────────────────────────────────
-- 00018 ALTER DEFAULT PRIVILEGES grants INSERT/UPDATE/DELETE to
-- qdesigner_app on every future table, so this table was born with
-- UPDATE/DELETE. Strip them back to INSERT + SELECT so the row can never
-- be altered or erased through the application connection.
REVOKE UPDATE, DELETE ON public.audit_events FROM qdesigner_app;
GRANT SELECT, INSERT ON public.audit_events TO qdesigner_app;
