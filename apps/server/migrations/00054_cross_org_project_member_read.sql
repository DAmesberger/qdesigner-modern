-- 00054_cross_org_project_member_read.sql  (ADR 0033, rollout step 1)
--
-- Cross-org project membership replaces the external-guest / resource-shares
-- role. This migration lands the READ path only — a cross-org project member
-- can SELECT exactly that project's study data — and is strictly ADDITIVE:
-- every existing branch (org-member, `…_via_share`) stays fully intact and
-- OR-merged alongside the new project-member branch. Nothing an existing org
-- member or share guest can do today changes.
--
-- Two additions, both mirroring 00041's share estate branch-for-branch:
--
--   1. A SECURITY DEFINER predicate helper
--      `user_can_read_questionnaire_via_project_membership(qid, uid)` — TRUE
--      iff `uid` is an explicit `project_members` row of the questionnaire's
--      parent project. It resolves the project id and calls the existing
--      00033 `is_project_member` helper INSIDE the definer (owned by the
--      qdesigner BYPASSRLS role), so reading `questionnaire_definitions` /
--      `project_members` from a policy on ANOTHER table needs no RLS
--      visibility and introduces no recursion. Cross-tenant isolation is
--      preserved: the caller only ever probes its OWN membership (the
--      policies pass `current_app_user_id()`), so a cross-org member sees
--      only that one project's rows and nothing else in the org.
--
--   2. Separate permissive `…_select_via_project_member` SELECT policies on
--      the four study-data tables (sessions / responses / interaction_events
--      / session_variables), OR-merged by PostgreSQL with the existing dual
--      and share policies — the same additive shape 00041 used for shares.
--
--   3. `user_can_access_questionnaire` (the SECURITY DEFINER handler-gate
--      backing `verify_questionnaire_access`, from 00051) gains an
--      `OR is_project_member(<questionnaire's project>, uid)` branch so the
--      authorization decision admits a cross-org project member. Kept inside
--      the definer function so the authz decision stays RLS-independent
--      (ADR 0032 core, preserved by ADR 0033).

-- ── SECURITY DEFINER predicate helper ────────────────────────────────
--
-- True iff `uid` is a member of the parent project of questionnaire `qid`.
-- Same idiom as 00041's user_can_read_questionnaire_via_share: LANGUAGE sql
-- STABLE SECURITY DEFINER, `SET search_path = public, pg_temp`, owned by the
-- BYPASSRLS qdesigner role, explicit `uid` argument (never current_user).
CREATE OR REPLACE FUNCTION public.user_can_read_questionnaire_via_project_membership(
    qid uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT uid IS NOT NULL AND public.is_project_member(
        (SELECT qd.project_id
         FROM public.questionnaire_definitions qd
         WHERE qd.id = qid),
        uid
    );
$$;

-- NOTE: like the sibling policy-helpers this joins (00033 is_project_member,
-- 00041 user_can_read_questionnaire_via_share) the default PUBLIC EXECUTE is
-- intentionally LEFT in place — this function is referenced INSIDE the RLS
-- SELECT policies below, so every role that reads the study-data tables (incl.
-- the ad-hoc non-owner roles the RLS test harness switches to) must be able to
-- execute it. The SECURITY DEFINER boundary is the qdesigner ownership + the
-- explicit `uid` argument (a caller can only probe a given uid's membership),
-- not a PUBLIC revocation. The grant below is the explicit app-role grant.
ALTER FUNCTION public.user_can_read_questionnaire_via_project_membership(uuid, uuid)
    OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.user_can_read_questionnaire_via_project_membership(uuid, uuid)
    TO qdesigner_app;

-- ── Study-data project-member SELECT branches (step 1) ───────────────
--
-- Added as SEPARATE permissive policies so PostgreSQL OR-merges them with the
-- existing dual (00021) and share (00041) policies without rewriting those
-- statements — exactly how 00041 layered the share branches in.

-- sessions: a project member of the session's questionnaire's project reads
-- that session (the parallel of the org-member analytics branch in 00021 and
-- the share branch in 00041, keyed on project membership).
DROP POLICY IF EXISTS sessions_select_via_project_member ON public.sessions;
CREATE POLICY sessions_select_via_project_member ON public.sessions
    FOR SELECT USING (
        public.user_can_read_questionnaire_via_project_membership(
            sessions.questionnaire_id, public.current_app_user_id())
    );

-- responses / interaction_events / session_variables: admitted iff the
-- session they reference belongs to a questionnaire whose project the caller
-- is a member of.
DROP POLICY IF EXISTS responses_select_via_project_member ON public.responses;
CREATE POLICY responses_select_via_project_member ON public.responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = responses.session_id
              AND public.user_can_read_questionnaire_via_project_membership(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );

DROP POLICY IF EXISTS interaction_events_select_via_project_member ON public.interaction_events;
CREATE POLICY interaction_events_select_via_project_member ON public.interaction_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = interaction_events.session_id
              AND public.user_can_read_questionnaire_via_project_membership(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );

DROP POLICY IF EXISTS session_variables_select_via_project_member ON public.session_variables;
CREATE POLICY session_variables_select_via_project_member ON public.session_variables
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.sessions s
            WHERE s.id = session_variables.session_id
              AND public.user_can_read_questionnaire_via_project_membership(
                      s.questionnaire_id, public.current_app_user_id())
        )
    );

-- ── verify_questionnaire_access: project-member branch (step 2) ──────
--
-- CREATE OR REPLACE of the 00051 SECURITY DEFINER gate, adding
-- `OR is_project_member(<questionnaire's project>, uid)` alongside the
-- unchanged org-member and share branches. Behavior-preserving for existing
-- org members and share guests; additive for cross-org project members. The
-- decision stays RLS-independent (the is_project_member probe runs inside the
-- definer).
CREATE OR REPLACE FUNCTION public.user_can_access_questionnaire(
    qid uuid, uid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.questionnaire_definitions qd
        JOIN public.projects p ON p.id = qd.project_id
        JOIN public.organization_members om ON om.organization_id = p.organization_id
        WHERE qd.id = qid AND om.user_id = uid AND om.status = 'active'
          AND qd.deleted_at IS NULL AND p.deleted_at IS NULL
    )
    OR public.user_can_read_questionnaire_via_share(qid, uid)
    OR public.is_project_member(
        (SELECT qd.project_id
         FROM public.questionnaire_definitions qd
         WHERE qd.id = qid),
        uid
    );
$$;

-- CREATE OR REPLACE preserves owner + grants, but re-assert them so this
-- migration is self-describing and safe if replayed after an owner change.
ALTER FUNCTION public.user_can_access_questionnaire(uuid, uuid) OWNER TO qdesigner;
REVOKE ALL ON FUNCTION public.user_can_access_questionnaire(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_questionnaire(uuid, uuid) TO qdesigner_app;
