-- 00059_trial_practice_flag.sql
--
-- PRACTICE TRIALS MUST NOT ENTER COHORT AGGREGATES (ADR 0028).
--
-- Three related defects, all of which let untrustworthy per-trial data into the
-- cohort statistics a PARTICIPANT is shown:
--
--  1. **Practice trials were pooled in.** The runtime fired `onTrialComplete` for
--     every trial, but `isPractice` was dropped at `buildRuntimeTrialEvent`, never
--     reached `RuntimeTrialEvent`, and had no column to land in. Warm-up trials —
--     systematically slower, which is the entire point of a warm-up — went into the
--     cohort quartiles. (The FILE export always kept `is_practice`; only the server
--     aggregate path lost it.)
--
--  2. **Anticipatory (false-start) trials were not invalidated on the live path.**
--     `trialEvent.ts` mapped `visibilityInvalidated` and `invalid` to `invalidated`
--     but never `anticipatory`, even though the 00048 BACKFILL always did
--     (00048_trials.sql:171-175). The same false start was therefore excluded when
--     it arrived by backfill and pooled when it arrived live.
--
--  3. **Visibility-invalidated trials were not excluded by the backfill.** The
--     mirror of (2): the live path stamps `invalidated = 'visibility'`, but the
--     00048 backfill never read `visibilityInvalidated` out of the response blob,
--     so backfilled rows whose timing is known-untrustworthy came through as clean.
--
-- The TS half of (1) and (2) is fixed in the runtime. This migration adds the
-- column, RECOVERS the truth for rows already ingested, repairs the two
-- invalidation gaps, and teaches `fillout_trial_stats` to admit test trials only.
--
-- ── Data semantics: NULL means UNKNOWN, and unknown never counts ──────────────
--
-- `is_practice` is NULLABLE, three-valued on purpose:
--
--     true   — known practice          → never aggregated
--     false  — known test trial        → aggregated
--     NULL   — UNKNOWN provenance      → never aggregated
--
-- A `false` default would have been a lie: it asserts "we are sure this was not a
-- warm-up trial" about rows recorded by a runtime that never tracked the
-- distinction. We cannot retroactively know, so we say so.
--
-- `fillout_trial_stats` is therefore FAIL-CLOSED — it admits `is_practice = false`
-- and nothing else. A trial of unknown provenance is held out of a published
-- cohort quartile rather than silently contaminating it. The visible consequence
-- is honest: an unrecoverable study's cohort n falls (possibly under its `minN`,
-- surfacing as "insufficient data") instead of continuing to report a number
-- nobody can vouch for. ADR 0028 already mandates that n is always disclosed, so
-- this is legible to researcher and participant alike.
--
-- ── Where NULL can actually come from (the residual, stated explicitly) ──────
--
-- The LIVE path writes `is_practice` directly: the flag rides
-- `RuntimeTrialEvent` → `SyncTrialItem.is_practice` → the `trials` INSERT in
-- `api/sessions/sync.rs`. A current client therefore never produces an UNKNOWN
-- row, and the steady state does not depend on the repair below having run.
--
-- NULL is reachable from exactly three places, all of them tails:
--
--  1. **A stale client** (one predating this change) syncs queued offline trials
--     without the flag. Its block summary DOES carry `isPractice` — the runtimes
--     dual-write the full `TrialResponse` into `responses.value.responses[]` —
--     so `repair_trial_provenance` recovers it. `sync.rs` runs the repair on every
--     batch, session-scoped, so this heals itself with no operator action.
--  2. **Rows whose block summary predates the rich trial record**, i.e. its
--     elements have no `isPractice` key at all. Nothing can recover these: the
--     practice status was never written down anywhere. They stay UNKNOWN.
--  3. **Rows with no block summary at all** (00048-backfilled from a response
--     that has since been pruned). Same: unknowable, stays UNKNOWN.
--
-- (2) and (3) are the accepted residual. They are held OUT of every cohort
-- aggregate — fail-closed — and that exclusion is visible, not silent: ADR 0028
-- mandates that `n` is always disclosed, so a study whose trials are unknowable
-- reports a shrunken cohort (possibly below its `minN`, surfacing as "insufficient
-- data") rather than a confident number nobody can vouch for. That is the intended
-- outcome, and it is the whole reason this column is nullable.

-- ── 1. The column ────────────────────────────────────────────────────────────
ALTER TABLE public.trials
    ADD COLUMN IF NOT EXISTS is_practice boolean;

COMMENT ON COLUMN public.trials.is_practice IS
    'Practice (warm-up) trial. NULL = UNKNOWN provenance (pre-00059 row whose '
    'source could not be recovered), which is NOT the same as false. Cohort '
    'aggregates admit only is_practice = false (ADR 0028).';

-- The aggregate access pattern is now (question_id, is_practice, invalidated);
-- keep the practice predicate index-supported so the cohort read stays cheap.
CREATE INDEX IF NOT EXISTS idx_trials_question_practice
    ON public.trials (question_id, is_practice)
    WHERE invalidated IS NULL;

-- ── 2. The repair, as a re-runnable function ─────────────────────────────────
--
-- Recovers what the trial rows lost, from the block summary they were dual-written
-- alongside. Every reaction question persists BOTH per-trial `trials` rows and a
-- question-level `responses.value.responses[]` array whose elements carry
-- `isPractice`, `anticipatory`, `visibilityInvalidated` and `trialNumber`. Join on
-- (session, question, trial index) and copy the truth across.
--
-- A FUNCTION rather than two bare UPDATEs, for three reasons:
--
--  * **It has to run again after the migration.** A client running the PREVIOUS
--    build writes a rich block summary (its `responses[]` elements carry
--    `isPractice`) but a trial row WITHOUT the flag — that was the bug. An offline
--    client sitting on un-synced trials will therefore keep syncing NULL-practice
--    rows long after this migration has run, and those rows are repairable the
--    moment their block summary lands. `api/sessions/sync.rs` calls this at the end
--    of every sync batch, scoped to that session. Without it, the fail-closed
--    aggregate would quietly drop those trials FOREVER — making cohort statistics
--    silently emptier rather than more honest, which is the opposite of the point.
--  * Sync is CHUNKED: a session's trials and its block summary can land in
--    different HTTP requests. A per-request Rust-side join could not see across
--    them; a session-scoped SQL repair run on each batch converges regardless of
--    which chunk arrives first.
--  * It lets the test suite exercise the SHIPPED repair rather than a copy of it
--    pasted into a test file.
--
-- `p_session_id` NULL means "every session" (the migration's one-time sweep);
-- the request path always passes a concrete session id.
--
-- SECURITY DEFINER because `trials` has SELECT + INSERT policies but no UPDATE
-- policy (00048), so the non-BYPASSRLS `qdesigner_app` role cannot write these
-- columns directly. The function is safe to expose: it only ever copies a
-- session's own block summary onto that same session's own trials (the join is
-- `t.session_id = r.session_id`), so it can neither cross a tenant boundary nor
-- return anything but counts.
--
-- Returns (practice_filled, invalidated_filled) so a run is auditable.
CREATE OR REPLACE FUNCTION public.repair_trial_provenance(p_session_id uuid DEFAULT NULL)
RETURNS TABLE(practice_filled bigint, invalidated_filled bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_practice bigint;
    v_invalidated bigint;
BEGIN
    -- (a) Recover the practice flag. Guarded on IS NULL, so a known value — from a
    -- current client, or from an earlier run — is never overwritten.
    WITH filled AS (
        UPDATE public.trials t
           SET is_practice = (elem->>'isPractice')::boolean
          FROM public.responses r
          CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(r.value->'responses') = 'array'
                     THEN r.value->'responses'
                     ELSE '[]'::jsonb END
          ) AS elem
         WHERE t.is_practice IS NULL
           AND (p_session_id IS NULL OR t.session_id = p_session_id)
           AND r.session_id = t.session_id
           AND r.question_id = t.question_id
           AND jsonb_typeof(elem->'isPractice') = 'boolean'
           AND jsonb_typeof(elem->'trialNumber') = 'number'
           AND (elem->>'trialNumber')::int = t.trial_index
        RETURNING 1
    )
    SELECT count(*) INTO v_practice FROM filled;

    -- (b) Repair the two invalidation gaps. Only fills rows where `invalidated IS
    -- NULL`, so an existing reason is never overwritten. Precedence matches the live
    -- runtime: visibility (the clock itself is untrustworthy) outranks anticipatory
    -- (a false start against a stimulus not yet shown).
    --
    --   * live-ingested rows are missing 'anticipatory' (defect 2)
    --   * 00048-backfilled rows are missing 'visibility'  (defect 3)
    --
    -- One statement covers both.
    WITH filled AS (
        UPDATE public.trials t
           SET invalidated = CASE
                   WHEN jsonb_typeof(elem->'visibilityInvalidated') = 'boolean'
                        AND (elem->>'visibilityInvalidated')::boolean
                       THEN 'visibility'
                   ELSE 'anticipatory'
               END
          FROM public.responses r
          CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(r.value->'responses') = 'array'
                     THEN r.value->'responses'
                     ELSE '[]'::jsonb END
          ) AS elem
         WHERE t.invalidated IS NULL
           AND (p_session_id IS NULL OR t.session_id = p_session_id)
           AND r.session_id = t.session_id
           AND r.question_id = t.question_id
           AND jsonb_typeof(elem->'trialNumber') = 'number'
           AND (elem->>'trialNumber')::int = t.trial_index
           AND (
                 (jsonb_typeof(elem->'visibilityInvalidated') = 'boolean'
                  AND (elem->>'visibilityInvalidated')::boolean)
              OR (jsonb_typeof(elem->'anticipatory') = 'boolean'
                  AND (elem->>'anticipatory')::boolean)
               )
        RETURNING 1
    )
    SELECT count(*) INTO v_invalidated FROM filled;

    RETURN QUERY SELECT v_practice, v_invalidated;
END;
$$;

-- The pre-DEFAULT signature from the first cut of this migration, if it is still
-- around on a dev DB that applied it. Dropped so the name resolves unambiguously.
DROP FUNCTION IF EXISTS public.repair_trial_provenance();

ALTER FUNCTION public.repair_trial_provenance(uuid) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.repair_trial_provenance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_trial_provenance(uuid) TO qdesigner_app;

-- ── 3. Run it once over everything already ingested ──────────────────────────
SELECT * FROM public.repair_trial_provenance(NULL);

-- ── 4. The aggregate admits test trials only ─────────────────────────────────
--
-- Byte-for-byte 00049 apart from ONE new predicate in `vals`:
--
--     AND t.is_practice = false
--
-- Written as an equality (not `IS NOT TRUE`) precisely so NULL — unknown — is
-- excluded too. Fail-closed: a trial we cannot vouch for never reaches a cohort
-- quartile a participant is shown.
--
-- The signature is unchanged, so the `/server-variables` handler, its `minN`
-- disclosure floor, and the offline reaction box all keep working untouched.
CREATE OR REPLACE FUNCTION public.fillout_trial_stats(
    qid uuid,
    p_question_id text,
    p_metric text,
    p_include_invalidated boolean,
    p_filter jsonb
)
RETURNS TABLE(
    n bigint,
    mean float8,
    std_dev float8,
    min float8,
    max float8,
    p10 float8,
    p25 float8,
    median float8,
    p75 float8,
    p90 float8,
    p95 float8,
    p99 float8
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    f jsonb := COALESCE(p_filter, '{}'::jsonb);
BEGIN
    RETURN QUERY
    WITH admitted AS (
        -- Sessions that pass the dataset filter (version / date / where[]).
        SELECT s.id
        FROM public.sessions s
        WHERE s.questionnaire_id = qid
          AND s.status = 'completed'
          -- Version scope (server injects the resolved components).
          AND (
                COALESCE(f->>'versionScope', 'any') = 'any'
             OR (f->>'versionScope' = 'sameMajor'
                 AND s.questionnaire_version_major = (f->>'versionMajor')::int)
             OR (f->>'versionScope' = 'exact'
                 AND s.questionnaire_version_major = (f->>'versionMajor')::int
                 AND s.questionnaire_version_minor = (f->>'versionMinor')::int
                 AND s.questionnaire_version_patch = (f->>'versionPatch')::int)
              )
          AND (f->>'completedAfter'  IS NULL OR s.completed_at >= (f->>'completedAfter')::timestamptz)
          AND (f->>'completedBefore' IS NULL OR s.completed_at <= (f->>'completedBefore')::timestamptz)
          AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(COALESCE(f->'where', '[]'::jsonb)) AS w
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM public.session_variable_index svi2
                    WHERE svi2.session_id = s.id
                      AND svi2.variable_name = (w->>'var')
                      AND public.svi_clause_matches(svi2.numeric_value,
                                                    COALESCE(svi2.text_value, svi2.raw_value #>> '{}'),
                                                    w)
                )
              )
    ),
    vals AS (
        SELECT
            t.session_id,
            CASE
                WHEN p_metric = 'accuracy'
                     THEN CASE WHEN t.correct THEN 1.0::float8 ELSE 0.0::float8 END
                ELSE t.rt_us::float8
            END AS v
        FROM public.trials t
        JOIN admitted a ON a.id = t.session_id
        WHERE t.question_id = p_question_id
          -- ADR 0028: only trials KNOWN to be test trials. Practice warm-ups are
          -- systematically slower; a trial of unknown provenance might be one.
          AND t.is_practice = false
          AND (COALESCE(p_include_invalidated, false) OR t.invalidated IS NULL)
          -- Skip rows with no value for the chosen metric.
          AND (
                (p_metric = 'accuracy' AND t.correct IS NOT NULL)
             OR (p_metric IS DISTINCT FROM 'accuracy' AND t.rt_us IS NOT NULL)
              )
    )
    SELECT
        -- Anonymity count is DISTINCT sessions, not raw trial rows.
        count(DISTINCT vals.session_id)::bigint,
        avg(vals.v),
        stddev_pop(vals.v),
        min(vals.v),
        max(vals.v),
        percentile_cont(0.10) WITHIN GROUP (ORDER BY vals.v),
        percentile_cont(0.25) WITHIN GROUP (ORDER BY vals.v),
        percentile_cont(0.5)  WITHIN GROUP (ORDER BY vals.v),
        percentile_cont(0.75) WITHIN GROUP (ORDER BY vals.v),
        percentile_cont(0.9)  WITHIN GROUP (ORDER BY vals.v),
        percentile_cont(0.95) WITHIN GROUP (ORDER BY vals.v),
        percentile_cont(0.99) WITHIN GROUP (ORDER BY vals.v)
    FROM vals;
END;
$$;

ALTER FUNCTION public.fillout_trial_stats(uuid, text, text, boolean, jsonb) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.fillout_trial_stats(uuid, text, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fillout_trial_stats(uuid, text, text, boolean, jsonb) TO qdesigner_app;
