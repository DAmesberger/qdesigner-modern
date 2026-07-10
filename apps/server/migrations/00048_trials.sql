-- 00048_trials.sql  (RT-1b — per-trial persistence spine)
--
-- A reaction paradigm materializes its trials at generation time (ADR 0025)
-- and, when a block completes, persists rich per-trial data. Until now that
-- detail lived only inside a reaction question's single `responses.value`
-- (the `value.responses[]` array), which is opaque to SQL and impossible to
-- index/query as a first-class analytic object. This migration adds the
-- `trials` table so per-trial rows are queryable, RLS-scoped exactly like the
-- rest of the fillout estate, and synced through the same client_id dedup as
-- responses/events.
--
-- Sync path: the batch `POST /api/sessions/{id}/sync` gains an optional
-- `trials[]` array, inserted `ON CONFLICT (client_id) DO NOTHING` in the same
-- transaction as responses/events; accepted client_ids join the existing ack
-- set the client's SyncLedger consumes.
--
-- RLS: dual-path SELECT + share-grantee SELECT + fillout dual-path INSERT,
-- each a structural mirror of the corresponding `responses` policy (00021
-- dual, 00041 share). ENABLE (not FORCE), matching the fillout-dual posture
-- of `responses`/`sessions`. New table → qdesigner_app inherits SELECT/INSERT/
-- UPDATE/DELETE from 00018's ALTER DEFAULT PRIVILEGES (no explicit GRANT).
--
-- W-8 honesty: `responses.reaction_time_us` is a single scalar and is
-- meaningless for a multi-trial reaction response ("which trial?"). The
-- ingestion path NULLs it for multi-trial responses going forward; this
-- migration additionally NULLs it on the existing multi-trial rows so the
-- historical column can't be mistaken for a real per-response RT. The true
-- per-trial value lives in `trials.rt_us`.

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trials (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    question_id     text NOT NULL,
    trial_index     int  NOT NULL,
    -- The ResponseSet option the participant selected (semantic id), or the
    -- legacy response key. NULL for a timeout / no-response trial.
    option_id       text,
    -- ResponseSource the input arrived through (keyboard / hardware / …).
    source          text,
    -- Reaction time in MICROSECONDS (responses carry µs; ms detail stays in
    -- the response value). NULL when the trial produced no timed response.
    rt_us           bigint,
    correct         boolean,
    -- Generation-time sampled timings for this trial (ADR 0025). Backfilled
    -- rows carry the persisted phase timeline instead (no sampled spec existed).
    sampled_timings jsonb,
    -- Per-trial timing-provenance blob (degraded-timing stamps, latency model).
    provenance      jsonb,
    -- Non-null reason the trial is excluded from scored reanalysis
    -- (e.g. 'anticipatory', 'visibility', a render-failure reason); NULL = kept.
    invalidated     text,
    -- Offline dedup key: the client generates it per trial and the sync insert
    -- is idempotent on it, exactly like responses/interaction_events.
    client_id       uuid NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Primary analytic access pattern: a session's trials for a question, in order.
CREATE INDEX IF NOT EXISTS idx_trials_session_question_trial
    ON public.trials (session_id, question_id, trial_index);

-- ── RLS: mirror the responses estate ─────────────────────────────────
ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;

-- Dual-path SELECT — structural mirror of 00021 responses_select_dual:
-- super-admin, the session's authenticated owner, the session-GUC anonymous
-- participant, or an authenticated org member (read-only analytics path).
DROP POLICY IF EXISTS trials_select_dual ON public.trials;
CREATE POLICY trials_select_dual ON public.trials
    FOR SELECT USING (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = trials.session_id
              AND (
                (public.current_app_user_id() IS NOT NULL
                 AND s.user_id = public.current_app_user_id())
                OR (public.current_app_session_id() IS NOT NULL
                    AND s.id = public.current_app_session_id())
              )
        )
        OR EXISTS (
            SELECT 1
            FROM public.sessions s
            JOIN public.questionnaire_definitions qd ON qd.id = s.questionnaire_id
            JOIN public.projects p ON p.id = qd.project_id
            JOIN public.organization_members om
                 ON om.organization_id = p.organization_id
            WHERE s.id = trials.session_id
              AND om.user_id = public.current_app_user_id()
              AND om.status = 'active'
        )
    );

-- Share-grantee SELECT — mirror of 00041 responses_select_via_share: an
-- external guest holding an active share on the session's questionnaire (or
-- its project) reads that session's trials.
DROP POLICY IF EXISTS trials_select_via_share ON public.trials;
CREATE POLICY trials_select_via_share ON public.trials
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = trials.session_id
              AND public.user_can_read_questionnaire_via_share(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );

-- Fillout dual-path INSERT — structural mirror of 00021 responses_insert_dual:
-- the row is admitted iff the referenced session is admitted under the
-- user-owned OR session-GUC predicate.
DROP POLICY IF EXISTS trials_insert_dual ON public.trials;
CREATE POLICY trials_insert_dual ON public.trials
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = trials.session_id
              AND (
                (public.current_app_user_id() IS NOT NULL
                 AND s.user_id = public.current_app_user_id())
                OR (public.current_app_session_id() IS NOT NULL
                    AND s.id = public.current_app_session_id())
              )
        )
    );

-- ── Backfill from existing reaction responses ────────────────────────
--
-- Explode every reaction response's `value.responses[]` into one trials row
-- each. Runs as the migration role (qdesigner, BYPASSRLS) so RLS does not
-- block the write.
--
-- Idempotency: client_id is DERIVED deterministically as
-- md5(response_id || ':' || array_ordinal)::uuid — stable across re-runs, so
-- `ON CONFLICT (client_id) DO NOTHING` makes a second application a no-op. The
-- md5→uuid cast yields a valid (if non-versioned) uuid; determinism is the only
-- requirement here.
--
-- Non-reaction responses contribute nothing: the CASE feeds an empty array to
-- jsonb_array_elements when `value.responses` is not a JSON array, so the
-- LATERAL never errors on a scalar/absent value.
INSERT INTO public.trials
    (session_id, question_id, trial_index, option_id, source, rt_us, correct,
     sampled_timings, provenance, invalidated, client_id)
SELECT
    r.session_id,
    r.question_id,
    COALESCE((elem->>'trialNumber')::int, (ord - 1)::int)             AS trial_index,
    elem->>'key'                                                       AS option_id,
    elem->>'responseDevice'                                            AS source,
    CASE WHEN jsonb_typeof(elem->'reactionTime') = 'number'
         THEN round((elem->>'reactionTime')::numeric * 1000)::bigint
         ELSE NULL END                                                 AS rt_us,
    CASE WHEN jsonb_typeof(elem->'isCorrect') = 'boolean'
         THEN (elem->>'isCorrect')::boolean
         ELSE NULL END                                                 AS correct,
    elem->'phaseTimeline'                                              AS sampled_timings,
    jsonb_strip_nulls(jsonb_build_object(
        'backfilled', true,
        'responseTimingMethod', elem->'responseTimingMethod',
        'stimulusTimingMethod', elem->'stimulusTimingMethod',
        'displayLatencyMs',     elem->'displayLatencyMs',
        'outputLatencyMs',      elem->'outputLatencyMs',
        'offsetMethod',         elem->'offsetMethod'
    ))                                                                 AS provenance,
    CASE
        WHEN jsonb_typeof(elem->'invalid') = 'boolean'
             AND (elem->>'invalid')::boolean
            THEN COALESCE(elem->>'invalidReason', 'invalid')
        WHEN jsonb_typeof(elem->'anticipatory') = 'boolean'
             AND (elem->>'anticipatory')::boolean
            THEN 'anticipatory'
        ELSE NULL
    END                                                                AS invalidated,
    md5(r.id::text || ':' || ord::text)::uuid                          AS client_id
FROM public.responses r
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.value->'responses') = 'array'
         THEN r.value->'responses'
         ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(elem, ord)
ON CONFLICT (client_id) DO NOTHING;

-- W-8 honesty on existing data: NULL the scalar reaction_time_us for
-- multi-trial reaction responses (the per-trial truth is now in trials.rt_us).
-- Single-trial responses keep their value. Idempotent — re-running NULLs an
-- already-NULL column.
UPDATE public.responses r
   SET reaction_time_us = NULL
 WHERE jsonb_typeof(r.value->'responses') = 'array'
   AND jsonb_array_length(r.value->'responses') > 1
   AND r.reaction_time_us IS NOT NULL;
