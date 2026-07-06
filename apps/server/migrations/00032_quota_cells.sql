-- 00032_quota_cells.sql
--
-- Interlocking cross-quota per-cell counters + atomic completion claim
-- (E-FLOW-7). Builds on 00027's condition-aware counting to the SOTA
-- capability: independent counters per interlocking cell (e.g. age × gender)
-- with a hard, race-free cap enforced at completion.
--
-- Why a materialized counter table (not another aggregate COUNT like 00027):
-- 00027's `fillout_quota_condition_count` recomputes a cell's occupancy by
-- scanning completed sessions on every read — fine for a read-only status
-- probe, but it CANNOT enforce a cap atomically. Two concurrent completions
-- both read "cell = 4/5", both decide there's room, and both complete →
-- overfill. E-FLOW-7 needs the claim and the cap decision to be ONE atomic
-- step. We keep a per-cell counter row and claim it under a row lock:
-- `SELECT ... FOR UPDATE` serializes concurrent claimers on the SAME cell, so
-- the cap holds exactly; claims on DIFFERENT cells never contend (independent
-- fill). The counter is authoritative for the cap; 00027 remains the
-- condition-aware read model for flat/independent quotas.
--
-- Posture (same as 00027/00031, ADR 0013/0022): SECURITY DEFINER function
-- owned by the migration role `qdesigner` (SUPERUSER + BYPASSRLS). Because a
-- SECURITY DEFINER function runs inside the caller's transaction, the cell
-- increment and the session status UPDATE commit or roll back together — no
-- orphan claims. `SET search_path = public, pg_temp` pins name resolution.

-- ── Per-cell completion counters ─────────────────────────────────────
-- `cell_key` is the serialized interlocking tuple the client computes and
-- pins onto the session (metadata.quotaCell.key) — a stable, order-independent
-- encoding of `variable=value` pairs (see QuotaService.quotaCellKey). `target`
-- is the per-cell cap (0 ⇒ uncapped); `current` is the live occupancy.
CREATE TABLE public.quota_cells (
    questionnaire_id UUID   NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    cell_key         TEXT   NOT NULL,
    target           BIGINT NOT NULL DEFAULT 0,
    current          BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (questionnaire_id, cell_key)
);

-- Read-only for the app role: the anonymous GET /quota-cells status probe and
-- an authenticated designer readout query it directly. quota_cells carries no
-- RLS policy and is not FORCE'd, so a plain SELECT under `qdesigner_app`
-- returns aggregate occupancy without leaking any per-session row. Writes stay
-- definer-only (claim function below).
GRANT SELECT ON public.quota_cells TO qdesigner_app;

-- ── claim_quota_cell ─────────────────────────────────────────────────
-- Atomically claim one slot in a cell, enforcing the cap. Returns the
-- post-increment occupancy (>= 1) on a successful claim, or -1 when the cell
-- is already full (target reached) — the caller then routes the participant to
-- the over-quota completion state.
--
-- Concurrency: the counter row is materialized (idempotent INSERT) then locked
-- FOR UPDATE, so concurrent claimers on the same cell serialize and the cap is
-- exact — N concurrent claims against a target-K cell yield exactly K successes
-- and N-K rejections, never K+1 rows. Distinct cells never contend.
--
-- `p_target <= 0` means the cell is uncapped: always claim. `p_target` is
-- resolved server-side from the questionnaire definition at claim time (the
-- client-pinned cell KEY selects which cell; it does not set the cap).
CREATE OR REPLACE FUNCTION public.claim_quota_cell(
    qid        uuid,
    p_cell_key text,
    p_target   bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current bigint;
BEGIN
    -- Materialize the counter row (idempotent), pinning the latest target.
    INSERT INTO public.quota_cells (questionnaire_id, cell_key, target, current)
    VALUES (qid, p_cell_key, GREATEST(p_target, 0), 0)
    ON CONFLICT (questionnaire_id, cell_key)
    DO UPDATE SET target = GREATEST(p_target, 0);

    -- Lock the row so concurrent claimers on this cell serialize.
    SELECT qc.current INTO v_current
    FROM public.quota_cells qc
    WHERE qc.questionnaire_id = qid AND qc.cell_key = p_cell_key
    FOR UPDATE;

    -- Capped and already at target → reject (over quota for this cell).
    IF p_target > 0 AND v_current >= p_target THEN
        RETURN -1;
    END IF;

    UPDATE public.quota_cells qc
    SET current = qc.current + 1
    WHERE qc.questionnaire_id = qid AND qc.cell_key = p_cell_key
    RETURNING qc.current INTO v_current;

    RETURN v_current;
END;
$$;

ALTER FUNCTION public.claim_quota_cell(uuid, text, bigint) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.claim_quota_cell(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_quota_cell(uuid, text, bigint) TO qdesigner_app;
