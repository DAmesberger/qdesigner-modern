-- 00027_quota_counting.sql
--
-- Real per-cell quota counting for the anonymous fillout quota gate
-- (resolves F014). Fixes two defects in the `quota_status` handler:
--
--   (a) It pushed `total_completed` as EVERY enabled quota's `current`,
--       ignoring each quota's `condition` — so a "gender == male" cell and
--       a "gender == female" cell both reported the same grand total.
--
--   (b) WORSE — both counts ran on the bare app pool (`&state.pool`) with
--       NO RLS GUC set. The 00021 fillout dual-path SELECT policy admits a
--       `sessions` row only when `app.user_id = sessions.user_id`
--       (authenticated) OR `app.session_id = sessions.id` (the caller's own
--       session). The quota endpoint is anonymous and sets neither GUC, so
--       under the non-owner `qdesigner_app` role that COUNT always returned
--       0 → quotas were completely inert in production.
--
-- Fix (same posture as 00023/00026 and ADR 0013/0022): SECURITY DEFINER
-- aggregate-only counters owned by the migration role `qdesigner`
-- (SUPERUSER + BYPASSRLS). `sessions` is not FORCE'd, so an owner-definer
-- function bypasses the dual-path RLS and can count across all sessions
-- for the questionnaire. Only a bigint count ever crosses the definer
-- boundary — no per-session row is exposed to the app-role caller.
--
-- `SET search_path = public, pg_temp` pins name resolution (standard
-- SECURITY DEFINER hardening). REVOKE-from-PUBLIC + explicit GRANT to
-- qdesigner_app scopes EXECUTE to exactly the application role.

-- ── Completed-session counter (catch-all / fallback) ─────────────────
-- Total completed sessions for a questionnaire. Used for catch-all quotas
-- (empty / 'true' / '1' conditions) and as the safe fallback for an
-- unparseable condition (mirrors the client's allow-by-default). Also
-- powers `total_completed`, whose pre-00027 value was the always-0 bug.
CREATE OR REPLACE FUNCTION public.fillout_completed_count(
    qid uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::bigint
    FROM public.sessions s
    WHERE s.questionnaire_id = qid
      AND s.status = 'completed';
$$;

ALTER FUNCTION public.fillout_completed_count(uuid) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.fillout_completed_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fillout_completed_count(uuid) TO qdesigner_app;

-- ── Per-quota condition counter ──────────────────────────────────────
-- Counts completed sessions whose resolved value for `var_name` satisfies
-- `op cmp_value`. The value is resolved per session as, in order:
--   1. metadata->'urlParams'->>var_name  (URL-param quota keys), then
--   2. the session_variables snapshot for that name (#>> '{}' unwraps the
--      scalar JSONB to text).
-- Grammar is kept in LOCKSTEP with the client (QuotaService.evaluateQuotaCondition):
--   ==, != : text equality (a NULL value is DISTINCT-FROM cmp, so it counts
--            for != and never for ==).
--   >,<,>=,<= : numeric comparison, guarded by a numeric regex on BOTH
--            operands so non-numeric / missing data counts as a NON-match.
-- Aggregate-only bigint return — no per-session data crosses the definer.
CREATE OR REPLACE FUNCTION public.fillout_quota_condition_count(
    qid uuid,
    var_name text,
    op text,
    cmp_value text
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::bigint
    FROM (
        SELECT COALESCE(
                   s.metadata->'urlParams'->>var_name,
                   (SELECT sv.variable_value #>> '{}'
                      FROM public.session_variables sv
                     WHERE sv.session_id = s.id
                       AND sv.variable_name = var_name)
               ) AS val
        FROM public.sessions s
        WHERE s.questionnaire_id = qid
          AND s.status = 'completed'
    ) t
    WHERE CASE op
        WHEN '==' THEN t.val IS NOT NULL AND t.val = cmp_value
        WHEN '!=' THEN t.val IS DISTINCT FROM cmp_value
        WHEN '>'  THEN t.val ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND cmp_value ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND t.val::numeric >  cmp_value::numeric
        WHEN '<'  THEN t.val ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND cmp_value ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND t.val::numeric <  cmp_value::numeric
        WHEN '>=' THEN t.val ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND cmp_value ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND t.val::numeric >= cmp_value::numeric
        WHEN '<=' THEN t.val ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND cmp_value ~ '^-?[0-9]+(\.[0-9]+)?$'
                       AND t.val::numeric <= cmp_value::numeric
        ELSE false
    END;
$$;

ALTER FUNCTION public.fillout_quota_condition_count(uuid, text, text, text) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.fillout_quota_condition_count(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fillout_quota_condition_count(uuid, text, text, text) TO qdesigner_app;
