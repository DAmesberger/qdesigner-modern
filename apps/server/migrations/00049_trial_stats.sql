-- 00049_trial_stats.sql
--
-- TRIAL-LEVEL SERVER AGGREGATES (RT-5 / ADR 0028).
--
-- Adds `fillout_trial_stats`, a sibling of 00030's `fillout_dataset_stats` that
-- aggregates the per-trial `trials` table (migration 00048) instead of responses
-- / session variables. It powers the offline participant-vs-cohort reaction box:
-- cohort quartiles of `trials.rt_us` (or per-trial accuracy), scoped by the same
-- designer-declared dataset filter (version / completion-date / where[] over
-- `session_variable_index`).
--
-- Shape parity: it returns the SAME stats bundle
-- {n, mean, std_dev, min, max, p10, p25, median, p75, p90, p95, p99} as
-- `fillout_dataset_stats`, so the `/server-variables` endpoint and the client
-- consume a trial-source declaration through the unchanged chart path.
--
-- Two deliberate differences from `fillout_dataset_stats`:
--   * `n` counts DISTINCT contributing SESSIONS, not raw trial rows — it is the
--     disclosure/anonymity count (how many people), while the moments/quartiles
--     are computed over the pooled per-trial values.
--   * No hardcoded anonymity floor lives in the function (ADR 0028 removes the
--     platform `n >= 5`). The `/server-variables` handler enforces each
--     declaration's explicit `minN` and withholds stats below it.
--
-- Authorization posture is identical to 00030: SECURITY DEFINER, owner
-- qdesigner, EXECUTE granted only to qdesigner_app; the anonymous client never
-- sends filter data — the endpoint injects only published-declaration filters.
--
-- `p_metric`:
--   'rt'        → value = trials.rt_us              (microseconds; NULL rows skip)
--   'accuracy'  → value = CASE trials.correct        (1.0 / 0.0; NULL correct skips)
-- `p_include_invalidated`: FALSE (default) excludes rows where invalidated IS NOT NULL.
-- `p_filter` shares 00030's shape (versionScope / versionMajor.. / completedAfter/
--   Before / where[]) and reuses `svi_clause_matches`.

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

-- ── Explicit-minN migration for PRE-EXISTING server declarations (ADR 0028) ──
--
-- The former platform floor was a hardcoded n>=5 inside the aggregate SQL. ADR
-- 0028 replaces it with a per-declaration `minN` that NEW declarations default
-- to 1 and existing ones migrate to 5 (so nothing changes silently). Server
-- declarations live in the definition JSONB (`content.variables[].server`), so
-- this rewrites every existing declaration that lacks an explicit `minN`, in
-- both the live registry and the version-pinned snapshots.
--
-- Idempotent: the EXISTS guard matches only variables whose `server` block is
-- missing `minN`, so a second application is a no-op.

UPDATE public.questionnaire_definitions d
SET content = jsonb_set(
    d.content,
    '{variables}',
    (
        SELECT jsonb_agg(
            CASE
                WHEN elem ? 'server'
                     AND jsonb_typeof(elem->'server') = 'object'
                     AND NOT (elem->'server' ? 'minN')
                THEN jsonb_set(elem, '{server,minN}', '5'::jsonb)
                ELSE elem
            END
        )
        FROM jsonb_array_elements(d.content->'variables') AS elem
    )
)
WHERE jsonb_typeof(d.content->'variables') = 'array'
  AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(d.content->'variables') AS e
        WHERE e ? 'server'
          AND jsonb_typeof(e->'server') = 'object'
          AND NOT (e->'server' ? 'minN')
    );

UPDATE public.questionnaire_snapshots s
SET content = jsonb_set(
    s.content,
    '{variables}',
    (
        SELECT jsonb_agg(
            CASE
                WHEN elem ? 'server'
                     AND jsonb_typeof(elem->'server') = 'object'
                     AND NOT (elem->'server' ? 'minN')
                THEN jsonb_set(elem, '{server,minN}', '5'::jsonb)
                ELSE elem
            END
        )
        FROM jsonb_array_elements(s.content->'variables') AS elem
    )
)
WHERE jsonb_typeof(s.content->'variables') = 'array'
  AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(s.content->'variables') AS e
        WHERE e ? 'server'
          AND jsonb_typeof(e->'server') = 'object'
          AND NOT (e->'server' ? 'minN')
    );
