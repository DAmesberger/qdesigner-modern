-- 00040_org_gdpr.sql  (E-RBAC-9)
--
-- Org-level GDPR data export + tenant erasure + data-residency tagging.
--
-- Three schema additions:
--
-- 1) organizations.data_region — a residency/region tag (default 'eu').
--    Threaded into the storage key prefix (storage/s3.rs) so new media and
--    export artifacts land under a per-region key namespace; this is the
--    enforcement point for data-location commitments. Immutable in-app once
--    the org owns any data (enforced by the /data-region setter handler).
--
-- 2) organizations.legal_hold — when true, destructive tenant erasure is
--    blocked (a legal hold preserves data against deletion). Export is
--    read-only and is not blocked by a hold.
--
-- 3) data_exports — tracks async DSAR export jobs. One row per requested
--    org export; the background job serializes all org resources into a
--    zip in object storage and flips status pending → ready (or failed).
--    The poll endpoint issues a presigned download for a 'ready', unexpired
--    artifact.
--
-- NOTE ON NUMBERING: the E-RBAC-9 unit spec named this "00034"; the live
-- migration directory already reached 00039 (00034 is audit_log). Authored
-- as the next free number (00040) per the "correct stale references" rule.

-- ── organizations: residency tag + legal hold ───────────────────────
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS data_region text NOT NULL DEFAULT 'eu',
    ADD COLUMN IF NOT EXISTS legal_hold  boolean NOT NULL DEFAULT false;

-- ── data_exports: async DSAR export job tracking ────────────────────
CREATE TABLE IF NOT EXISTS public.data_exports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requested_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
    -- pending | running | ready | failed | expired
    status          text NOT NULL DEFAULT 'pending',
    -- object-storage key of the finished zip (NULL until ready).
    artifact_key    text,
    -- residency region the artifact was written under (mirrors the org's
    -- data_region at request time).
    data_region     text NOT NULL DEFAULT 'eu',
    size_bytes      bigint,
    -- populated on a failed job for operator diagnosis.
    error           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    -- artifacts expire N days after completion; the poll endpoint refuses to
    -- re-presign an expired artifact (status reported as 'expired').
    expires_at      timestamptz,
    -- first time a ready artifact's presigned URL was issued (audited once).
    downloaded_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_data_exports_org_created
    ON public.data_exports (organization_id, created_at DESC);

-- Active-job probe (rate limit: at most one in-flight export per org).
CREATE INDEX IF NOT EXISTS idx_data_exports_org_status
    ON public.data_exports (organization_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;

-- SELECT: super-admin, or an ACTIVE owner/admin of the row's org. Mirrors
-- audit_events_select (00034): reads the caller's OWN organization_members
-- row, which the 00014/00023 policies already admit, so no recursion.
DROP POLICY IF EXISTS data_exports_select ON public.data_exports;
CREATE POLICY data_exports_select ON public.data_exports
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = data_exports.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
        )
    );

-- INSERT/UPDATE: permissive. The gate for WHAT gets written is the
-- owner-gated handler (api::gdpr) and the background job; RLS just admits
-- the write for the app role (ADR 0013 D2a posture). The background job
-- updates the row from a connection whose app.user_id may not match, so a
-- permissive UPDATE keeps the status-transition write unblocked.
DROP POLICY IF EXISTS data_exports_insert ON public.data_exports;
CREATE POLICY data_exports_insert ON public.data_exports
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS data_exports_update ON public.data_exports;
CREATE POLICY data_exports_update ON public.data_exports
    FOR UPDATE USING (true) WITH CHECK (true);

-- No DELETE policy: rows are retained (expired artifacts flip status but the
-- job record persists for the compliance trail).
