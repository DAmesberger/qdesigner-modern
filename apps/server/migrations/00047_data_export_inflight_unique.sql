-- 00047_data_export_inflight_unique.sql — enforce "at most one in-flight
-- export per organization" at the schema layer (F-34).
--
-- The handler's SELECT-EXISTS gate for an in-flight export is not atomic: two
-- truly concurrent POST /export both observe "none in flight", both INSERT, and
-- both 202 — creating duplicate jobs (double work). A partial unique index on
-- organization_id (restricted to the in-flight statuses) makes the second INSERT
-- fail with a 23505, which the handler maps back to the existing 409.
--
-- `data_exports` is admin-RLS-bound (00040); the index is a plain schema object
-- and does not interact with row security.

-- Demote any pre-existing duplicate in-flight rows the TOCTOU race could have
-- created, so the unique index can build. Keep the newest in-flight row per org;
-- mark the rest failed with a diagnostic note.
UPDATE public.data_exports d
SET status = 'failed',
    error = 'superseded — duplicate in-flight export (F-34 backfill)',
    completed_at = now()
WHERE d.status IN ('pending', 'running')
  AND d.id <> (
      SELECT d2.id
      FROM public.data_exports d2
      WHERE d2.organization_id = d.organization_id
        AND d2.status IN ('pending', 'running')
      ORDER BY d2.created_at DESC, d2.id DESC
      LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_data_exports_org_inflight
    ON public.data_exports (organization_id)
    WHERE status IN ('pending', 'running');

COMMENT ON INDEX public.uq_data_exports_org_inflight IS
    'At most one in-flight (pending|running) data_export per organization — closes the TOCTOU race between the handler''s in-flight SELECT gate and the INSERT (F-34).';
