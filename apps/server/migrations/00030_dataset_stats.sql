-- 00030_dataset_stats.sql
--
-- SERVER-COMPUTED VARIABLES (server-computed-variable / E-FEEDBACK-3).
--
-- Generalizes 00028's `fillout_cohort_stats` into `fillout_dataset_stats`: the
-- same anonymous-safe, aggregate-only SECURITY DEFINER posture, but with
-- (a) full quartiles (p10/p25/p75 added to the existing median/p90/p95/p99) and
-- (b) a designer-declared dataset filter (`p_filter jsonb`) that scopes the
-- cohort by questionnaire version, completion date, and per-clause predicates
-- over the `session_variable_index` projection (migration 00012).
--
-- Authorization model: the anonymous participant NEVER sends filter data. The
-- `/server-variables` endpoint evaluates ONLY the filters published on the
-- questionnaire definition, injecting the resolved version components into
-- `p_filter`. Only cohort AGGREGATES cross the definer boundary — never a
-- per-session value — and the public handler still applies the MIN_COHORT_N=5
-- floor as the deanonymization guard.
--
-- `fillout_cohort_stats` is left untouched so the live 'cohort' /
-- 'participant-vs-cohort' statistical-feedback modes keep working unchanged.
--
-- Value resolution mirrors `fillout_cohort_stats` / `load_numeric_samples`
-- exactly (same JSONB numeric coercion for both the 'response' and 'variable'
-- branches). Population std_dev (`stddev_pop`) matches `compute_numeric_stats`.
--
-- `p_filter` shape (all keys optional; server-injected version components make
-- the version predicate evaluable):
--   {
--     "versionScope": "any" | "sameMajor" | "exact",
--     "versionMajor": <int>, "versionMinor": <int>, "versionPatch": <int>,
--     "completedAfter":  "<ISO-8601>",
--     "completedBefore": "<ISO-8601>",
--     "where": [ { "var": "<name>", "op": "eq|ne|lt|lte|gt|gte|in",
--                  "value": <number|string|array> }, ... ]
--   }
-- A session is admitted only when, for EVERY where-clause, some
-- session_variable_index row for that session matches the clause.

CREATE OR REPLACE FUNCTION public.fillout_dataset_stats(
    qid uuid,
    p_source text,
    p_key text,
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
              -- Completion-date bounds.
              AND (f->>'completedAfter'  IS NULL OR s.completed_at >= (f->>'completedAfter')::timestamptz)
              AND (f->>'completedBefore' IS NULL OR s.completed_at <= (f->>'completedBefore')::timestamptz)
              -- where[]: every clause must be satisfied by some svi row.
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
        )
        SELECT
            count(*)::bigint,
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
        )
        SELECT
            count(*)::bigint,
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
    END IF;
END;
$$;

-- Per-clause predicate over one session_variable_index row. Applies the
-- clause operator against the row's numeric_value (numeric ops) or its
-- textual value (string ops). Pure/IMMUTABLE — a helper, not a data reader —
-- so no SECURITY DEFINER is needed here.
CREATE OR REPLACE FUNCTION public.svi_clause_matches(
    p_numeric float8,
    p_text text,
    w jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT CASE w->>'op'
        WHEN 'lt'  THEN p_numeric <  (w->>'value')::float8
        WHEN 'lte' THEN p_numeric <= (w->>'value')::float8
        WHEN 'gt'  THEN p_numeric >  (w->>'value')::float8
        WHEN 'gte' THEN p_numeric >= (w->>'value')::float8
        WHEN 'eq'  THEN CASE jsonb_typeof(w->'value')
                            WHEN 'number' THEN p_numeric = (w->'value')::text::float8
                            ELSE p_text = (w->>'value')
                        END
        WHEN 'ne'  THEN CASE jsonb_typeof(w->'value')
                            WHEN 'number' THEN p_numeric IS DISTINCT FROM (w->'value')::text::float8
                            ELSE p_text IS DISTINCT FROM (w->>'value')
                        END
        WHEN 'in'  THEN EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(
                                CASE jsonb_typeof(w->'value') WHEN 'array'
                                     THEN w->'value' ELSE '[]'::jsonb END) AS elem
                            WHERE CASE jsonb_typeof(elem)
                                      WHEN 'number' THEN p_numeric = (elem)::text::float8
                                      ELSE p_text = (elem #>> '{}')
                                  END
                        )
        ELSE false
    END;
$$;

ALTER FUNCTION public.svi_clause_matches(float8, text, jsonb) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.svi_clause_matches(float8, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.svi_clause_matches(float8, text, jsonb) TO qdesigner_app;

ALTER FUNCTION public.fillout_dataset_stats(uuid, text, text, jsonb) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.fillout_dataset_stats(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fillout_dataset_stats(uuid, text, text, jsonb) TO qdesigner_app;
