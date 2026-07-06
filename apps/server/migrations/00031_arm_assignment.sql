-- 00031_arm_assignment.sql
--
-- Server-atomic between-subjects arm assignment + monotonic participant
-- numbering (E-FLOW-6).
--
-- Background — the live correctness bug this closes:
--   * `participantNumber` was never threaded into the fillout runtime, so
--     `ConditionAssigner` and `getBlockOrder` always computed for participant
--     0 — every participant received Latin-square row 0, defeating
--     counterbalancing.
--   * Client-side allocation over a fetched `condition-counts` SNAPSHOT races
--     under concurrent starts (two participants read the same counts and pick
--     the same "least-full" arm), so a balanced design drifts.
--
-- Fix posture (same as 00026/00027 and ADR 0013/0022): the allocation is done
-- SERVER-SIDE, ATOMICALLY, inside the session-create request transaction via
-- SECURITY DEFINER functions owned by the migration role `qdesigner`
-- (SUPERUSER + BYPASSRLS). Because a SECURITY DEFINER function runs in the
-- caller's transaction, the arm increment and the session INSERT commit or
-- roll back together — no orphan arm counts. `sessions` is not FORCE'd, so the
-- owner-definer bypasses the 00021 dual-path RLS and can maintain per-arm
-- counters across all (anonymous) callers. Only the chosen arm name/index and
-- the allocated participant number ever cross the definer boundary.

-- ── Persisted assignment columns on sessions ─────────────────────────
-- The arm survives to the dataset as first-class columns (not only in the
-- JSONB metadata blob). `participant_number` is the 0-based monotonic index
-- the client seeds counterbalancing with.
ALTER TABLE public.sessions
    ADD COLUMN participant_number       BIGINT  NULL,
    ADD COLUMN assigned_condition       TEXT    NULL,
    ADD COLUMN assigned_condition_index INTEGER NULL;

-- ── Per-questionnaire arm counters (assignment balance) ──────────────
CREATE TABLE public.arm_counts (
    questionnaire_id UUID   NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    condition_name   TEXT   NOT NULL,
    assigned_count   BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (questionnaire_id, condition_name)
);

-- Read-only access for the app role so an authenticated designer/admin
-- readout of live per-arm counts can query it (writes stay definer-only).
GRANT SELECT ON public.arm_counts TO qdesigner_app;

-- ── Per-questionnaire monotonic participant sequence ─────────────────
CREATE TABLE public.participant_counters (
    questionnaire_id UUID   PRIMARY KEY REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    next_number      BIGINT NOT NULL DEFAULT 0
);

-- ── allocate_participant_number ──────────────────────────────────────
-- Atomically allocate and return a 0-based monotonic participant index for a
-- questionnaire. Concurrent callers serialize on the counter row lock, so no
-- two sessions ever receive the same number. First caller → 0, second → 1, …
CREATE OR REPLACE FUNCTION public.allocate_participant_number(qid uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    INSERT INTO public.participant_counters (questionnaire_id, next_number)
    VALUES (qid, 1)
    ON CONFLICT (questionnaire_id)
    DO UPDATE SET next_number = public.participant_counters.next_number + 1
    RETURNING next_number - 1;
$$;

ALTER FUNCTION public.allocate_participant_number(uuid) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.allocate_participant_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_participant_number(uuid) TO qdesigner_app;

-- ── claim_experiment_arm ─────────────────────────────────────────────
-- Atomically claim an experimental arm for a questionnaire and increment its
-- counter, returning the chosen (condition_name, 0-based condition_index,
-- post-increment assigned_count).
--
-- Concurrency: all candidate arm rows are locked FOR UPDATE in a deterministic
-- order (condition_name) before the least-full pick, so concurrent claimers
-- serialize over the WHOLE arm set — guaranteeing perfect balance (counts
-- differ by <= 1) and no over-fill. Deterministic lock order ⇒ deadlock-free.
-- Arm cardinality is tiny (2–8), so whole-set locking is cheap.
--
-- Strategies:
--   * 'sequential' — round-robin: the (total_assigned mod n)-th arm in the
--     supplied order. Falls back to least-full when that arm is at cap.
--   * 'balanced' (default) / 'random' — least-full uncapped arm, ties broken
--     by supplied order. (Weighted random remains a client-side/offline
--     concern; server-side we normalize to fair least-full so concurrent
--     starts stay balanced.)
--
-- p_caps is an optional per-arm cap array aligned to p_conditions; a NULL
-- array, or a cap <= 0, means unlimited. When every eligible arm is at cap the
-- function returns NO row (over quota) and the caller leaves the session
-- unassigned.
CREATE OR REPLACE FUNCTION public.claim_experiment_arm(
    qid          uuid,
    p_conditions text[],
    p_strategy   text,
    p_caps       bigint[]
)
-- OUT columns are prefixed `o_` so they don't shadow the identically named
-- `arm_counts` columns inside the body (plpgsql treats OUT names as variables,
-- which would make bare `condition_name` / `assigned_count` ambiguous in the
-- INSERT / ON CONFLICT / least-full SELECT below).
RETURNS TABLE(o_condition_name text, o_condition_index int, o_assigned_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_n      int;
    v_name   text;
    v_total  bigint;
    v_pos    int;
    v_ok     boolean;
BEGIN
    v_n := array_length(p_conditions, 1);
    IF v_n IS NULL OR v_n = 0 THEN
        RETURN;  -- no conditions supplied → no assignment
    END IF;

    -- Ensure a counter row exists for every arm.
    INSERT INTO public.arm_counts (questionnaire_id, condition_name, assigned_count)
    SELECT qid, c, 0 FROM unnest(p_conditions) AS c
    ON CONFLICT (questionnaire_id, condition_name) DO NOTHING;

    -- Lock the whole candidate arm set (deterministic order) so concurrent
    -- claims serialize and the least-full read below sees committed counts.
    PERFORM 1
    FROM public.arm_counts ac
    WHERE ac.questionnaire_id = qid
      AND ac.condition_name = ANY(p_conditions)
    ORDER BY ac.condition_name
    FOR UPDATE;

    -- Sequential round-robin candidate.
    IF p_strategy = 'sequential' THEN
        SELECT COALESCE(SUM(ac.assigned_count), 0) INTO v_total
        FROM public.arm_counts ac
        WHERE ac.questionnaire_id = qid
          AND ac.condition_name = ANY(p_conditions);

        v_pos  := (v_total % v_n)::int;          -- 0-based position
        v_name := p_conditions[v_pos + 1];       -- arrays are 1-based

        -- Reject the round-robin pick if it is at cap; fall through to least-full.
        IF p_caps IS NOT NULL THEN
            SELECT (p_caps[v_pos + 1] IS NULL
                    OR p_caps[v_pos + 1] <= 0
                    OR ac.assigned_count < p_caps[v_pos + 1])
            INTO v_ok
            FROM public.arm_counts ac
            WHERE ac.questionnaire_id = qid AND ac.condition_name = v_name;
            IF NOT COALESCE(v_ok, false) THEN
                v_name := NULL;
            END IF;
        END IF;
    END IF;

    -- Least-full uncapped arm (default path, and sequential cap fallback).
    IF v_name IS NULL THEN
        SELECT ac.condition_name INTO v_name
        FROM public.arm_counts ac
        WHERE ac.questionnaire_id = qid
          AND ac.condition_name = ANY(p_conditions)
          AND (
              p_caps IS NULL
              OR array_position(p_conditions, ac.condition_name) IS NULL
              OR p_caps[array_position(p_conditions, ac.condition_name)] IS NULL
              OR p_caps[array_position(p_conditions, ac.condition_name)] <= 0
              OR ac.assigned_count < p_caps[array_position(p_conditions, ac.condition_name)]
          )
        ORDER BY ac.assigned_count ASC,
                 array_position(p_conditions, ac.condition_name) ASC
        LIMIT 1;
    END IF;

    IF v_name IS NULL THEN
        RETURN;  -- all eligible arms at cap → over quota
    END IF;

    UPDATE public.arm_counts ac
    SET assigned_count = ac.assigned_count + 1
    WHERE ac.questionnaire_id = qid AND ac.condition_name = v_name
    RETURNING ac.condition_name,
              (array_position(p_conditions, ac.condition_name) - 1)::int,
              ac.assigned_count
    INTO o_condition_name, o_condition_index, o_assigned_count;

    RETURN NEXT;
END;
$$;

ALTER FUNCTION public.claim_experiment_arm(uuid, text[], text, bigint[]) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.claim_experiment_arm(uuid, text[], text, bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_experiment_arm(uuid, text[], text, bigint[]) TO qdesigner_app;
