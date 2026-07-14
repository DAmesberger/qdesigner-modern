-- 00060_pending_object_deletions.sql
--
-- DURABLE ERASURE: object-storage keys must outlive the rows that name them.
--
-- ── The bug this closes ──────────────────────────────────────────────────────
--
-- `api::gdpr::erase_org` promised the caller a completed right-to-erasure. It
-- did not deliver one. Three columns in this schema hold object-storage keys;
-- erasure handled exactly one of them:
--
--   * `media_assets.storage_key`  (00001) — designer stimuli. Captured before
--     the DELETE, then purged BEST-EFFORT afterwards: a storage outage at that
--     instant logged a warning and the erasure reported success, with the DB
--     rows (and therefore the keys) already gone. The objects survived, orphaned
--     and unfindable.
--
--   * `session_media.s3_key`      (00006) — PARTICIPANT-uploaded binary answers,
--     the most sensitive bytes in the system. Never captured at all. The row is
--     `session_id … ON DELETE CASCADE`, so `DELETE FROM projects` cascaded it
--     away and the key went with it. Every participant file ever uploaded is
--     still sitting in the bucket after an "erasure", with no record it exists.
--
--   * `data_exports.artifact_key` (00040) — a zip containing a FULL export of
--     precisely the data being erased. Never touched. Erasure only SOFT-deletes
--     the organization, so the `data_exports` rows survived the cascade
--     entirely: a live DB row still pointing at a downloadable archive of the
--     "erased" tenant.
--
-- Best-effort deletion after the destructive commit is not a small bug. It is a
-- false compliance claim: the one moment the cleanup can fail is the one moment
-- the evidence of what to clean up is destroyed.
--
-- ── The protocol ─────────────────────────────────────────────────────────────
--
-- This table is a write-ahead intent log for object destruction. A row means
-- exactly one thing:
--
--     "An object MAY still exist in storage that MUST NOT. Here is its key."
--
-- Rows are removed only on CONFIRMED deletion. Empty for a request id ⇒ nothing
-- outstanding. That invariant is what makes "is this erasure actually complete?"
-- a query rather than a hope.
--
-- The erasure runs as two commits:
--
--   1. STAGE  — INSERT every key, `armed_at IS NULL`. Committed on its own
--               connection BEFORE any destruction. Nothing has been destroyed
--               yet, so an unarmed row is inert.
--
--   2. DESTROY — one transaction: audit, DELETE data_exports, DELETE projects
--               (cascading to sessions → session_media), DELETE media_assets,
--               soft-delete the org, and — critically — `UPDATE … SET armed_at`
--               for this request's rows. **The arming is atomic with the
--               destruction.** Commit.
--
--   3. PURGE  — delete each armed object; drop the row only when storage
--               confirms. Failures stay, with `attempts` / `last_error`.
--
-- `armed_at` is the whole trick, and it is why this fixes the race rather than
-- moving it. Staging alone would be unsound in the other direction: rows
-- committed before a destruction that then rolls back would authorize a sweeper
-- to delete objects still referenced by live DB rows. Arming inside the
-- destructive transaction means the intent becomes actionable at the exact
-- instant, and only if, the data it describes is actually gone.
--
-- Crash at any point:
--   before (1)      → nothing staged, nothing destroyed.
--   between (1)/(2) → rows staged but UNARMED. Data intact, objects intact. The
--                     rows are inert litter, reaped by the next staging pass.
--   after (2)       → data gone, rows ARMED, every key durable. The purge is
--                     resumable, by the sweeper or by the retry endpoint. THIS
--                     is the case the old code lost forever.
--   during (3)      → confirmed keys are gone, the rest are still on the ledger.
--                     Re-running is safe: S3 DeleteObject is idempotent, so a
--                     retry over an already-purged key succeeds.
--
-- ── No foreign key, on purpose ───────────────────────────────────────────────
--
-- `organization_id` is a bare uuid. A REFERENCES … ON DELETE CASCADE here would
-- be self-defeating: it would let the destruction of an organization delete the
-- very record proving its objects still need purging. This table must outlive
-- everything it describes. That is its entire job.

CREATE TABLE IF NOT EXISTS public.pending_object_deletions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Bare uuid, deliberately not a FK (see above).
    organization_id uuid NOT NULL,
    -- Groups the keys staged by one erasure attempt, so the handler can report
    -- on exactly its own batch.
    request_id      uuid NOT NULL,
    -- Why the object is doomed. 'org_erasure' today; the ledger is reusable.
    reason          text NOT NULL DEFAULT 'org_erasure',
    -- Which column the key came from: media_assets | session_media | data_export.
    -- Diagnostic only — the purge treats every key identically.
    source          text NOT NULL,
    storage_key     text NOT NULL,
    -- NULL until the destructive transaction commits. A sweeper MUST ignore
    -- unarmed rows: the data they describe may still be live.
    armed_at        timestamptz,
    attempts        integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- The sweeper's working set: armed rows, oldest first.
CREATE INDEX IF NOT EXISTS idx_pending_object_deletions_armed
    ON public.pending_object_deletions (armed_at)
    WHERE armed_at IS NOT NULL;

-- The handler's batch lookups (stage, arm, report) and the per-org status read.
CREATE INDEX IF NOT EXISTS idx_pending_object_deletions_request
    ON public.pending_object_deletions (request_id);
CREATE INDEX IF NOT EXISTS idx_pending_object_deletions_org
    ON public.pending_object_deletions (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_object_deletions TO qdesigner_app;

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- The keys themselves are not participant content, but they name it
-- (`sessions/{session_id}/media/…`), so the table is bound like `data_exports`.
ALTER TABLE public.pending_object_deletions ENABLE ROW LEVEL SECURITY;

-- SELECT: super-admin, or an ACTIVE owner/admin of the row's org. Mirrors
-- data_exports_select (00040). Note the org row is SOFT-deleted by erasure and
-- organization_members survives it, so the owner can still read — and retry —
-- the ledger of their own erasure after the fact. That is the point.
DROP POLICY IF EXISTS pending_object_deletions_select ON public.pending_object_deletions;
CREATE POLICY pending_object_deletions_select ON public.pending_object_deletions
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = pending_object_deletions.organization_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
        )
    );

-- INSERT/UPDATE/DELETE: permissive (ADR 0013 D2a posture). The owner-gated
-- handler is the gate for what may be written; the background sweeper runs with
-- no `app.user_id` GUC at all and must still be able to confirm a deletion.
DROP POLICY IF EXISTS pending_object_deletions_insert ON public.pending_object_deletions;
CREATE POLICY pending_object_deletions_insert ON public.pending_object_deletions
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS pending_object_deletions_update ON public.pending_object_deletions;
CREATE POLICY pending_object_deletions_update ON public.pending_object_deletions
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pending_object_deletions_delete ON public.pending_object_deletions;
CREATE POLICY pending_object_deletions_delete ON public.pending_object_deletions
    FOR DELETE USING (true);

-- ── data_exports: erasure must be able to destroy the export rows ────────────
--
-- 00040 deliberately shipped no DELETE policy ("rows are retained … for the
-- compliance trail"). That retention rule is right for an EXPIRED export and
-- catastrophic for an ERASED tenant: it is what left a live row pointing at a
-- downloadable zip of the erased data. Under RLS a `DELETE FROM data_exports`
-- by `qdesigner_app` with no DELETE policy silently affects ZERO rows — it does
-- not error — so the handler fix alone would have been a no-op.
--
-- Permissive, per the 00020/ADR 0013 D2a posture: the owner-gated + password-
-- confirmed + legal-hold-checked erase handler is the authorization gate. It is
-- the ONLY caller that deletes these rows.
DROP POLICY IF EXISTS data_exports_delete ON public.data_exports;
CREATE POLICY data_exports_delete ON public.data_exports
    FOR DELETE USING (true);

-- ── Purge machinery: SECURITY DEFINER, and why it must be ────────────────────
--
-- The purge runs from two places with no `app.user_id` GUC to offer: the
-- periodic sweeper in main.rs (no user at all), and — less obviously — the
-- request handlers, whose purge writes go out on separate pooled connections
-- rather than the request transaction.
--
-- Under the SELECT policy above, a GUC-less connection sees NO rows. And a
-- GUC-less write is not merely restricted, it is SILENT: Postgres applies
-- SELECT policies to any UPDATE/DELETE whose WHERE clause reads a column
-- (`WHERE id = $1` does), so the statement matches zero rows and returns
-- SUCCESS. The first cut of this migration relied on the permissive
-- INSERT/UPDATE/DELETE policies alone and did exactly that: every "confirmed"
-- deletion cleared nothing, the ledger never drained, and — because the caller
-- counted an `Ok` rather than a row — the erasure reported itself complete.
-- The test caught it. Hence: definer functions, and a caller that checks
-- rows_affected.
--
-- These three are the ONLY writes to the ledger that lack a user context, and
-- none of them takes a caller-chosen row: the sweep hands out what is owed, and
-- confirm/fail can only act on an id it was handed. There is no surface here
-- for a caller to reach another tenant's ledger.

-- Read the armed backlog across all tenants, oldest first. `attempts` orders
-- ahead of `armed_at` so a permanently-failing key (a bucket that no longer
-- exists, say) cannot starve the freshly-armed rows behind it.
CREATE OR REPLACE FUNCTION public.sweep_pending_object_deletions(p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, storage_key text, organization_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.id, d.storage_key, d.organization_id
    FROM public.pending_object_deletions d
    WHERE d.armed_at IS NOT NULL
    ORDER BY d.attempts, d.armed_at
    LIMIT p_limit;
$$;

-- Clear one row — the object is CONFIRMED gone from storage. Returns the number
-- of rows actually removed (0 or 1) so the caller can tell a real confirmation
-- from a no-op instead of assuming one.
CREATE OR REPLACE FUNCTION public.confirm_object_deletion(p_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n integer;
BEGIN
    DELETE FROM public.pending_object_deletions WHERE id = p_id AND armed_at IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- Record a failed attempt. The row SURVIVES — that is the entire point.
CREATE OR REPLACE FUNCTION public.fail_object_deletion(p_id uuid, p_error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.pending_object_deletions
    SET attempts = attempts + 1, last_attempt_at = now(), last_error = p_error
    WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_pending_object_deletions(integer) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.confirm_object_deletion(uuid) TO qdesigner_app;
GRANT EXECUTE ON FUNCTION public.fail_object_deletion(uuid, text) TO qdesigner_app;
