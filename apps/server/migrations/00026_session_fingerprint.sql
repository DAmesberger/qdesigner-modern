-- 00026_session_fingerprint.sql
--
-- Server-side, create-time duplicate-participation dedup that works for
-- anonymous fillout callers (Slice 2.5).
--
-- Background — the known regression (CLAUDE.md "Known TODOs" / the P6.3
-- deferred list): the OptionalUser `POST /api/sessions/check-duplicate`
-- handler counted other sessions' completed rows by fingerprint, but the
-- 00021 fillout dual-path SELECT policy hides other sessions from an
-- anonymous caller (no `app.user_id`, and `app.session_id` only matches
-- the caller's own session). Under the non-owner `qdesigner_app` role
-- that SELECT therefore always returned 0 → the dedup probe was a no-op.
--
-- Fix, two parts:
--   1. A dedicated nullable `fingerprint` column on `sessions`, written
--      at create time from the client-provided hash (the pre-00026
--      client stashed it in `metadata->>'fingerprint'`; we backfill that
--      below and the create handler now writes the column directly).
--   2. A SECURITY DEFINER counter that reads across ALL sessions with the
--      definer's (qdesigner — SUPERUSER + BYPASSRLS) rights, so the
--      existence check sees prior completed participants WITHOUT exposing
--      any other session's row to the app-role query. Mirrors the
--      `is_member_of_org` helper in 00023. The create handler
--      (`api/access::*` authorization gate, ADR 0013 D2a) is the boundary;
--      the function only ever returns an integer count of a client-
--      generated hash, never row data.
--
-- Deliberately NOT a `UNIQUE (questionnaire_id, fingerprint)` constraint.
-- Repeat participation may be permitted per questionnaire fraud-prevention
-- settings (`FraudPreventionSettings.preventDuplicates`); a hard unique
-- constraint would reject the INSERT outright and block legitimate
-- re-takes. Instead the create handler surfaces a `duplicate` flag and
-- lets the client / product rules decide. The index below only
-- accelerates the existence check.

-- ── Column ───────────────────────────────────────────────────────────
ALTER TABLE public.sessions
    ADD COLUMN fingerprint TEXT NULL;

-- ── Backfill from the historical metadata->>'fingerprint' location ───
-- Pre-00026 fillout stored the fingerprint inside `metadata`. Migrate
-- those into the dedicated column so the existence check (which reads
-- only the column, keeping it index-friendly) also covers participants
-- who completed before this migration. Runs as qdesigner (BYPASSRLS), so
-- every tenant's rows are backfilled regardless of RLS.
UPDATE public.sessions
    SET fingerprint = metadata->>'fingerprint'
    WHERE fingerprint IS NULL
      AND metadata ? 'fingerprint'
      AND NULLIF(metadata->>'fingerprint', '') IS NOT NULL;

-- ── Partial index for the existence check ────────────────────────────
-- Only completed sessions with a non-null fingerprint participate in
-- dedup, so the index is partial on exactly that set. Plain (not UNIQUE)
-- per the header note on repeat participation.
CREATE INDEX IF NOT EXISTS idx_sessions_fingerprint_completed
    ON public.sessions (questionnaire_id, fingerprint)
    WHERE fingerprint IS NOT NULL AND status = 'completed';

-- ── SECURITY DEFINER dedup counter ───────────────────────────────────
-- Counts prior COMPLETED sessions matching (questionnaire_id,
-- fingerprint). SECURITY DEFINER + owner qdesigner (SUPERUSER +
-- BYPASSRLS) so the internal read bypasses the 00021 dual-path RLS that
-- would otherwise hide other callers' sessions from an anonymous request.
-- A NULL fingerprint never matches (guarded below), so it can never dedup.
-- `SET search_path` pins name resolution — standard SECURITY DEFINER
-- hardening, same as 00023's helper.
CREATE OR REPLACE FUNCTION public.count_completed_fingerprint_sessions(
    p_questionnaire_id uuid,
    p_fingerprint text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::bigint
    FROM public.sessions s
    WHERE p_fingerprint IS NOT NULL
      AND s.questionnaire_id = p_questionnaire_id
      AND s.status = 'completed'
      AND s.fingerprint = p_fingerprint;
$$;

-- Function owner must be the migration role (qdesigner), which is
-- SUPERUSER + BYPASSRLS, so SECURITY DEFINER actually bypasses RLS.
-- Migrations run on the qdesigner DSN, so CREATE ... assigns that owner
-- by default; this is a belt-and-suspenders reassert (mirrors 00023).
ALTER FUNCTION public.count_completed_fingerprint_sessions(uuid, text) OWNER TO qdesigner;

-- PUBLIC already has EXECUTE on functions by default; make the app role's
-- access explicit (mirrors 00023).
GRANT EXECUTE ON FUNCTION public.count_completed_fingerprint_sessions(uuid, text) TO qdesigner_app;
