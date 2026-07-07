-- 00042_study_series.sql
--
-- Longitudinal / EMA (ecological-momentary-assessment) study series
-- (E-FLOW-2). Adds multi-session scheduling, reminder delivery, and
-- resume-link enrollment on top of the existing single-shot session
-- machinery.
--
-- Three tables:
--   study_series      — a scheduled repeated-measures design attached to
--                       ONE questionnaire. Carries the schedule kind, the
--                       per-wave definitions (JSONB), the reminder copy,
--                       and a base random seed (so `random-interval`
--                       schedules are reproducible / auditable).
--   series_enrollment — one participant enrolled into a series. Holds the
--                       unguessable `resume_token` (the credential the
--                       reminder link carries), the contact channel, the
--                       `next_prompt_at` scheduler cursor, and the current
--                       wave pointer.
--   series_prompt     — one scheduled prompt (wave occurrence) per
--                       enrollment. The scheduler's source of truth:
--                       `scheduled_at <= now() AND delivered_at IS NULL`
--                       is the due set; `session_id` binds the
--                       materialized fillout session back to its wave.
--
-- Plus `sessions.resume_token` so a session created from a reminder link
-- can be tied back to the enrollment on completion.
--
-- RLS posture — a THIRD context GUC, `app.enrollment_token`, sibling of
-- the `app.session_id` GUC from 00021 (set by the new
-- `series_rls_context.rs` middleware for the anonymous participant
-- endpoints). Dual-path admission mirrors 00021:
--   * researcher path  — an authenticated org member of the series'
--     questionnaire's project (via `app.user_id`, set by the existing
--     `set_rls_context` middleware) reads/writes everything for that
--     series.
--   * participant path — an anonymous caller bound to
--     `app.enrollment_token = enrollment.resume_token` reads/mutates only
--     that one enrollment + its prompts (self-service resume + completion
--     callback + unsubscribe).
--
-- Recursion note: study_series admits a participant "via one of its
-- enrollments' token" and series_enrollment admits a researcher "via its
-- series' org membership". Expressed as inline cross-table `EXISTS`
-- subqueries these two policies recurse into each other (Postgres errors
-- with "infinite recursion detected in policy"). Every cross-table
-- authorization probe therefore goes through a SECURITY DEFINER helper
-- (owned by qdesigner, BYPASSRLS) so the inner joins run WITHOUT
-- re-triggering RLS — the same pattern 00023's `is_member_of_org` uses to
-- keep `organization_members` self-reference from recursing. The only
-- direct (non-function) predicate is series_enrollment's own
-- `resume_token = current_app_enrollment_token()` column check.
--
-- Cross-tenant scheduler scan — the app pool connects as `qdesigner_app`
-- (non-BYPASSRLS), so a plain SELECT with no GUC set returns nothing.
-- The background scheduler therefore goes through SECURITY DEFINER
-- functions (`series_due_prompts` / `series_mark_delivered`): only the
-- aggregate rows needed to send a reminder ever cross the boundary.

-- ── Enrollment-token GUC helper ──────────────────────────────────────
-- Mirror of `current_app_session_id()` (00021) for the series GUC.
CREATE OR REPLACE FUNCTION public.current_app_enrollment_token()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.enrollment_token', true), '')::uuid;
$$;

-- ── study_series ─────────────────────────────────────────────────────
CREATE TABLE public.study_series (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    -- schedule_kind is a TEXT + CHECK rather than a Postgres ENUM: matches
    -- the project's convention (sessions.status, quotas, etc. are all
    -- TEXT+CHECK) and avoids the ALTER TYPE dance when a kind is added.
    schedule_kind    TEXT NOT NULL DEFAULT 'fixed'
                     CHECK (schedule_kind IN ('fixed', 'random-interval', 'event')),
    -- Array of wave definitions. Each element:
    --   { "label": "Baseline",
    --     "offsetSeconds": 0,            -- fixed: absolute offset from enrollment
    --     "minIntervalSeconds": 79200,   -- random: min gap from prior wave
    --     "maxIntervalSeconds": 93600 }  -- random: max gap from prior wave
    wave_defs        JSONB NOT NULL DEFAULT '[]'::jsonb,
    timezone         TEXT NOT NULL DEFAULT 'UTC',
    reminder_subject TEXT NOT NULL DEFAULT 'Your next questionnaire is ready',
    -- Reminder body template. `{{link}}` is substituted with the resume URL
    -- and `{{unsubscribe}}` with the opt-out URL at send time.
    reminder_body    TEXT NOT NULL DEFAULT
        'It is time for your next questionnaire. Open it here:\n\n{{link}}\n\nTo stop receiving these: {{unsubscribe}}',
    -- Base seed for reproducible random-interval schedules. Combined with a
    -- per-enrollment seed so each participant's jitter is deterministic and
    -- auditable but distinct.
    random_seed      BIGINT NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'archived')),
    created_by       UUID NULL REFERENCES public.users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_series_questionnaire ON public.study_series(questionnaire_id);

-- ── series_enrollment ────────────────────────────────────────────────
CREATE TABLE public.series_enrollment (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_id          UUID NOT NULL REFERENCES public.study_series(id) ON DELETE CASCADE,
    -- External participant identifier (panel id, subject code). Opaque to us.
    participant_ref    TEXT NULL,
    -- Delivery address for `channel_kind` (an email address for 'email').
    contact_channel    TEXT NOT NULL,
    channel_kind       TEXT NOT NULL DEFAULT 'email'
                       CHECK (channel_kind IN ('email')),
    status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'withdrawn')),
    -- Scheduler cursor: the scheduled_at of the earliest not-yet-delivered
    -- prompt. NULL when nothing is pending (finished / withdrawn / awaiting
    -- an event trigger). Indexed for the scheduler's due scan.
    next_prompt_at     TIMESTAMPTZ NULL,
    -- The unguessable credential the reminder link carries. UNIQUE so the
    -- GET /api/series/prompt/{resume_token} lookup is a single-row probe.
    resume_token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    current_wave_index INTEGER NOT NULL DEFAULT 0,
    -- Per-enrollment seed (mixed with study_series.random_seed) so a
    -- random-interval participant's schedule is reproducible.
    random_seed        BIGINT NOT NULL DEFAULT 0,
    enrolled_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_series_enrollment_series ON public.series_enrollment(series_id);
-- The scheduler's active-cursor scan (source-of-truth for "who is due").
CREATE INDEX idx_series_enrollment_next_prompt
    ON public.series_enrollment(next_prompt_at)
    WHERE status = 'active';

-- ── series_prompt ────────────────────────────────────────────────────
CREATE TABLE public.series_prompt (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES public.series_enrollment(id) ON DELETE CASCADE,
    wave_index    INTEGER NOT NULL,
    scheduled_at  TIMESTAMPTZ NOT NULL,
    delivered_at  TIMESTAMPTZ NULL,
    opened_at     TIMESTAMPTZ NULL,
    completed_at  TIMESTAMPTZ NULL,
    -- Binds the materialized fillout session back to this wave once the
    -- participant completes it. ON DELETE SET NULL so purging a session
    -- doesn't cascade-drop the prompt audit row.
    session_id    UUID NULL REFERENCES public.sessions(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'opened', 'completed', 'skipped')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id, wave_index)
);

CREATE INDEX idx_series_prompt_enrollment ON public.series_prompt(enrollment_id);
-- The scheduler's due set: pending, past-due, not yet delivered.
CREATE INDEX idx_series_prompt_due
    ON public.series_prompt(scheduled_at)
    WHERE delivered_at IS NULL AND status = 'pending';

-- ── sessions.resume_token ────────────────────────────────────────────
-- A session created from a reminder link stores the enrollment's
-- resume_token so completion can advance the correct enrollment.
ALTER TABLE public.sessions
    ADD COLUMN resume_token UUID NULL;

CREATE INDEX idx_sessions_resume_token
    ON public.sessions(resume_token)
    WHERE resume_token IS NOT NULL;

-- ── Authorization helper functions (SECURITY DEFINER, recursion-safe) ─
-- Each answers one cross-table admission question with the definer's
-- BYPASSRLS rights, so RLS policies can call them without re-triggering
-- another table's policy (which would recurse).

-- Researcher: is p_user_id an active org member of the questionnaire's
-- project? (study_series admits on its own questionnaire_id.)
CREATE OR REPLACE FUNCTION public.series_user_can_manage_questionnaire(
    p_questionnaire_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.questionnaire_definitions qd
        JOIN public.projects p ON p.id = qd.project_id
        JOIN public.organization_members om ON om.organization_id = p.organization_id
        WHERE qd.id = p_questionnaire_id
          AND om.user_id = p_user_id
          AND om.status = 'active'
    );
$$;

-- Researcher: can p_user_id manage the series (via its questionnaire)?
CREATE OR REPLACE FUNCTION public.series_user_can_manage_series(
    p_series_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.study_series ss
        JOIN public.questionnaire_definitions qd ON qd.id = ss.questionnaire_id
        JOIN public.projects p ON p.id = qd.project_id
        JOIN public.organization_members om ON om.organization_id = p.organization_id
        WHERE ss.id = p_series_id
          AND om.user_id = p_user_id
          AND om.status = 'active'
    );
$$;

-- Researcher: can p_user_id manage the enrollment (via its series)?
CREATE OR REPLACE FUNCTION public.series_user_can_manage_enrollment(
    p_enrollment_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_user_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.series_enrollment e
        JOIN public.study_series ss ON ss.id = e.series_id
        JOIN public.questionnaire_definitions qd ON qd.id = ss.questionnaire_id
        JOIN public.projects p ON p.id = qd.project_id
        JOIN public.organization_members om ON om.organization_id = p.organization_id
        WHERE e.id = p_enrollment_id
          AND om.user_id = p_user_id
          AND om.status = 'active'
    );
$$;

-- Participant: does the series own an enrollment whose token is p_token?
-- (study_series admits a participant so the resolve endpoint can read the
-- schedule + wave copy.)
CREATE OR REPLACE FUNCTION public.series_has_enrollment_token(
    p_series_id uuid,
    p_token uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.series_enrollment e
        WHERE e.series_id = p_series_id AND e.resume_token = p_token
    );
$$;

-- Participant: does the prompt's enrollment carry token p_token?
CREATE OR REPLACE FUNCTION public.series_prompt_token_matches(
    p_enrollment_id uuid,
    p_token uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_token IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.series_enrollment e
        WHERE e.id = p_enrollment_id AND e.resume_token = p_token
    );
$$;

DO $$
DECLARE
    fn text;
BEGIN
    FOR fn IN
        SELECT unnest(ARRAY[
            'public.series_user_can_manage_questionnaire(uuid, uuid)',
            'public.series_user_can_manage_series(uuid, uuid)',
            'public.series_user_can_manage_enrollment(uuid, uuid)',
            'public.series_has_enrollment_token(uuid, uuid)',
            'public.series_prompt_token_matches(uuid, uuid)'
        ])
    LOOP
        EXECUTE format('ALTER FUNCTION %s OWNER TO qdesigner', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO qdesigner_app', fn);
    END LOOP;
END $$;

-- ── RLS enable ───────────────────────────────────────────────────────
-- ENABLE (not FORCE), matching the fillout-dual posture of `sessions`
-- (00021): non-owner ENABLE already binds the app role; the migration
-- owner (qdesigner, BYPASSRLS) is what the SECURITY DEFINER helpers /
-- scheduler functions rely on.
ALTER TABLE public.study_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_prompt ENABLE ROW LEVEL SECURITY;

-- ── study_series policies ────────────────────────────────────────────
CREATE POLICY study_series_select ON public.study_series
    FOR SELECT USING (
        public.is_super_admin()
        OR public.series_user_can_manage_questionnaire(
               study_series.questionnaire_id, public.current_app_user_id())
        OR public.series_has_enrollment_token(
               study_series.id, public.current_app_enrollment_token())
    );

CREATE POLICY study_series_insert ON public.study_series
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.series_user_can_manage_questionnaire(
               study_series.questionnaire_id, public.current_app_user_id())
    );

CREATE POLICY study_series_update ON public.study_series
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.series_user_can_manage_questionnaire(
               study_series.questionnaire_id, public.current_app_user_id())
    );

CREATE POLICY study_series_delete ON public.study_series
    FOR DELETE USING (
        public.is_super_admin()
        OR public.series_user_can_manage_questionnaire(
               study_series.questionnaire_id, public.current_app_user_id())
    );

-- ── series_enrollment policies ───────────────────────────────────────
CREATE POLICY series_enrollment_select ON public.series_enrollment
    FOR SELECT USING (
        public.is_super_admin()
        OR (public.current_app_enrollment_token() IS NOT NULL
            AND series_enrollment.resume_token = public.current_app_enrollment_token())
        OR public.series_user_can_manage_series(
               series_enrollment.series_id, public.current_app_user_id())
    );

-- INSERT: researcher only (participants are enrolled by the researcher).
CREATE POLICY series_enrollment_insert ON public.series_enrollment
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.series_user_can_manage_series(
               series_enrollment.series_id, public.current_app_user_id())
    );

-- UPDATE: researcher OR self (participant advances the wave / withdraws).
CREATE POLICY series_enrollment_update ON public.series_enrollment
    FOR UPDATE USING (
        public.is_super_admin()
        OR (public.current_app_enrollment_token() IS NOT NULL
            AND series_enrollment.resume_token = public.current_app_enrollment_token())
        OR public.series_user_can_manage_series(
               series_enrollment.series_id, public.current_app_user_id())
    );

CREATE POLICY series_enrollment_delete ON public.series_enrollment
    FOR DELETE USING (
        public.is_super_admin()
        OR public.series_user_can_manage_series(
               series_enrollment.series_id, public.current_app_user_id())
    );

-- ── series_prompt policies ───────────────────────────────────────────
CREATE POLICY series_prompt_select ON public.series_prompt
    FOR SELECT USING (
        public.is_super_admin()
        OR public.series_prompt_token_matches(
               series_prompt.enrollment_id, public.current_app_enrollment_token())
        OR public.series_user_can_manage_enrollment(
               series_prompt.enrollment_id, public.current_app_user_id())
    );

-- INSERT: researcher (materialization) OR self (event-triggered next wave).
CREATE POLICY series_prompt_insert ON public.series_prompt
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR public.series_prompt_token_matches(
               series_prompt.enrollment_id, public.current_app_enrollment_token())
        OR public.series_user_can_manage_enrollment(
               series_prompt.enrollment_id, public.current_app_user_id())
    );

CREATE POLICY series_prompt_update ON public.series_prompt
    FOR UPDATE USING (
        public.is_super_admin()
        OR public.series_prompt_token_matches(
               series_prompt.enrollment_id, public.current_app_enrollment_token())
        OR public.series_user_can_manage_enrollment(
               series_prompt.enrollment_id, public.current_app_user_id())
    );

CREATE POLICY series_prompt_delete ON public.series_prompt
    FOR DELETE USING (
        public.is_super_admin()
        OR public.series_user_can_manage_enrollment(
               series_prompt.enrollment_id, public.current_app_user_id())
    );

-- ── SECURITY DEFINER scheduler functions ─────────────────────────────
-- The background scheduler runs on the app pool (qdesigner_app,
-- non-BYPASSRLS). A plain cross-tenant scan returns nothing under RLS, so
-- both the due-scan and the mark-delivered mutation go through definer
-- functions owned by qdesigner (SUPERUSER + BYPASSRLS). `SET search_path`
-- pins name resolution (standard SECURITY DEFINER hardening).

-- Due set: pending, past-due, undelivered prompts for ACTIVE enrollments,
-- joined to everything the reminder send needs. The fillout code is the
-- first 8 hex chars of the questionnaire UUID (matching the by-code
-- endpoint's derivation), so the scheduler can build the /q/{code} link
-- without a second query.
CREATE OR REPLACE FUNCTION public.series_due_prompts(p_limit integer)
RETURNS TABLE (
    prompt_id          uuid,
    enrollment_id      uuid,
    series_id          uuid,
    wave_index         integer,
    resume_token       uuid,
    contact_channel    text,
    channel_kind       text,
    reminder_subject   text,
    reminder_body      text,
    questionnaire_id   uuid,
    questionnaire_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        sp.id,
        e.id,
        ss.id,
        sp.wave_index,
        e.resume_token,
        e.contact_channel,
        e.channel_kind,
        ss.reminder_subject,
        ss.reminder_body,
        qd.id,
        UPPER(SUBSTRING(REPLACE(qd.id::text, '-', ''), 1, 8))
    FROM public.series_prompt sp
    JOIN public.series_enrollment e ON e.id = sp.enrollment_id
    JOIN public.study_series ss ON ss.id = e.series_id
    JOIN public.questionnaire_definitions qd ON qd.id = ss.questionnaire_id
    WHERE sp.delivered_at IS NULL
      AND sp.status = 'pending'
      AND sp.scheduled_at <= now()
      AND e.status = 'active'
      AND ss.status = 'active'
    ORDER BY sp.scheduled_at ASC
    LIMIT GREATEST(p_limit, 0);
$$;

ALTER FUNCTION public.series_due_prompts(integer) OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.series_due_prompts(integer) TO qdesigner_app;

-- Mark a prompt delivered and recompute the enrollment's next_prompt_at to
-- the earliest still-undelivered prompt (NULL when none remain). Returns
-- true when a pending row was actually transitioned (idempotent: a second
-- call for the same prompt returns false). Runs as the definer so it can
-- update across tenants without the scheduler holding any GUC.
CREATE OR REPLACE FUNCTION public.series_mark_delivered(p_prompt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_enrollment_id uuid;
BEGIN
    UPDATE public.series_prompt
       SET delivered_at = now(),
           status = 'delivered'
     WHERE id = p_prompt_id
       AND delivered_at IS NULL
       AND status = 'pending'
    RETURNING enrollment_id INTO v_enrollment_id;

    IF v_enrollment_id IS NULL THEN
        RETURN false;
    END IF;

    UPDATE public.series_enrollment e
       SET next_prompt_at = (
               SELECT MIN(sp.scheduled_at)
               FROM public.series_prompt sp
               WHERE sp.enrollment_id = v_enrollment_id
                 AND sp.delivered_at IS NULL
                 AND sp.status = 'pending'
           ),
           updated_at = now()
     WHERE e.id = v_enrollment_id;

    RETURN true;
END;
$$;

ALTER FUNCTION public.series_mark_delivered(uuid) OWNER TO qdesigner;
GRANT EXECUTE ON FUNCTION public.series_mark_delivered(uuid) TO qdesigner_app;
