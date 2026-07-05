-- 00028_cohort_stats.sql
--
-- Anonymous-safe cohort feedback path (resolves F060). The
-- statistical-feedback module's `cohort` and `participant-vs-cohort`
-- modes were dead for real participants: they fetched
-- `GET /api/sessions/aggregate`, which takes the `AuthenticatedUser`
-- extractor (a hard 401 BEFORE RLS) and then `verify_questionnaire_access`.
-- An anonymous fillout participant is never authenticated, so the fetch
-- failed and the panel rendered a null 'No data' point.
--
-- Fix (same posture as 00027's quota counters and ADR 0013/0022): a
-- SECURITY DEFINER aggregate-only function owned by the migration role
-- `qdesigner` (SUPERUSER + BYPASSRLS). `sessions` / `session_variables`
-- are not FORCE'd, so an owner-definer function bypasses the 00021
-- dual-path RLS and can aggregate across every COMPLETED session for the
-- questionnaire. Only cohort AGGREGATES (count + moments + percentiles)
-- ever cross the definer boundary — no per-session value is exposed to
-- the app-role caller, which keeps the participant path anonymous-safe.
-- The public handler additionally applies a min-N floor (n < 5 → null
-- stats) as the deanonymization guard.
--
-- `SET search_path = public, pg_temp` pins name resolution (standard
-- SECURITY DEFINER hardening). REVOKE-from-PUBLIC + explicit GRANT to
-- qdesigner_app scopes EXECUTE to exactly the application role.
--
-- Value resolution mirrors `load_numeric_samples` (sessions.rs) exactly:
--   source='variable' → session_variable_index.numeric_value, falling
--        back to a numeric parse of COALESCE(svi.raw_value,
--        session_variables.variable_value) (JSONB number / numeric string
--        / boolean / {"value": <number>}).
--   source='response' → responses.value for the matching question_id,
--        with the same JSONB numeric coercion.
-- Population std_dev (`stddev_pop`) matches `compute_numeric_stats`
-- (variance / count, not the sample n-1 form) so the SQL aggregate and
-- the Rust reference agree.

CREATE OR REPLACE FUNCTION public.fillout_cohort_stats(
    qid uuid,
    p_source text,
    p_key text
)
RETURNS TABLE(
    n bigint,
    mean float8,
    std_dev float8,
    min float8,
    max float8,
    median float8,
    p90 float8,
    p95 float8,
    p99 float8
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_source = 'response' THEN
        RETURN QUERY
        WITH vals AS (
            SELECT num.v AS v
            FROM public.sessions s
            JOIN public.responses r
                ON r.session_id = s.id
               AND r.question_id = p_key
            CROSS JOIN LATERAL (
                SELECT CASE jsonb_typeof(r.value)
                    WHEN 'number' THEN (r.value)::text::float8
                    WHEN 'string' THEN
                        CASE WHEN (r.value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
                             THEN (r.value #>> '{}')::float8 END
                    WHEN 'boolean' THEN
                        CASE WHEN (r.value)::text::boolean THEN 1 ELSE 0 END::float8
                    WHEN 'object' THEN
                        CASE WHEN jsonb_typeof(r.value->'value') = 'number'
                             THEN (r.value->'value')::text::float8 END
                    ELSE NULL
                END AS v
            ) num
            WHERE s.questionnaire_id = qid
              AND s.status = 'completed'
              AND num.v IS NOT NULL
        )
        SELECT
            count(*)::bigint,
            avg(vals.v),
            stddev_pop(vals.v),
            min(vals.v),
            max(vals.v),
            percentile_cont(0.5)  WITHIN GROUP (ORDER BY vals.v),
            percentile_cont(0.9)  WITHIN GROUP (ORDER BY vals.v),
            percentile_cont(0.95) WITHIN GROUP (ORDER BY vals.v),
            percentile_cont(0.99) WITHIN GROUP (ORDER BY vals.v)
        FROM vals;
    ELSE
        RETURN QUERY
        WITH vals AS (
            SELECT num.v AS v
            FROM public.sessions s
            LEFT JOIN public.session_variable_index svi
                ON svi.session_id = s.id
               AND svi.variable_name = p_key
            LEFT JOIN public.session_variables sv
                ON sv.session_id = s.id
               AND sv.variable_name = p_key
            CROSS JOIN LATERAL (
                SELECT COALESCE(
                    svi.numeric_value,
                    CASE jsonb_typeof(COALESCE(svi.raw_value, sv.variable_value))
                        WHEN 'number' THEN
                            (COALESCE(svi.raw_value, sv.variable_value))::text::float8
                        WHEN 'string' THEN
                            CASE WHEN (COALESCE(svi.raw_value, sv.variable_value) #>> '{}')
                                      ~ '^-?[0-9]+(\.[0-9]+)?$'
                                 THEN (COALESCE(svi.raw_value, sv.variable_value) #>> '{}')::float8 END
                        WHEN 'boolean' THEN
                            CASE WHEN (COALESCE(svi.raw_value, sv.variable_value))::text::boolean
                                 THEN 1 ELSE 0 END::float8
                        WHEN 'object' THEN
                            CASE WHEN jsonb_typeof(
                                     COALESCE(svi.raw_value, sv.variable_value)->'value') = 'number'
                                 THEN (COALESCE(svi.raw_value, sv.variable_value)->'value')::text::float8 END
                        ELSE NULL
                    END
                ) AS v
            ) num
            WHERE s.questionnaire_id = qid
              AND s.status = 'completed'
              AND (svi.variable_name IS NOT NULL OR sv.variable_name IS NOT NULL)
              AND num.v IS NOT NULL
        )
        SELECT
            count(*)::bigint,
            avg(vals.v),
            stddev_pop(vals.v),
            min(vals.v),
            max(vals.v),
            percentile_cont(0.5)  WITHIN GROUP (ORDER BY vals.v),
            percentile_cont(0.9)  WITHIN GROUP (ORDER BY vals.v),
            percentile_cont(0.95) WITHIN GROUP (ORDER BY vals.v),
            percentile_cont(0.99) WITHIN GROUP (ORDER BY vals.v)
        FROM vals;
    END IF;
END;
$$;

ALTER FUNCTION public.fillout_cohort_stats(uuid, text, text) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.fillout_cohort_stats(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fillout_cohort_stats(uuid, text, text) TO qdesigner_app;
