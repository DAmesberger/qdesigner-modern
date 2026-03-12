-- 007_sessions_responses.sql
-- Participant sessions, individual responses, interaction events, and session variables

-- =============================================================================
-- Sessions
-- =============================================================================

CREATE TABLE public.sessions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id uuid        NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    participant_id   varchar(255),
    status           varchar(50) NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'completed', 'abandoned', 'expired')),
    started_at       timestamptz NOT NULL DEFAULT now(),
    completed_at     timestamptz,
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    browser_info     jsonb,
    ip_address       inet,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_questionnaire_id ON public.sessions (questionnaire_id);
CREATE INDEX idx_sessions_participant_id ON public.sessions (participant_id);
CREATE INDEX idx_sessions_status ON public.sessions (status);

-- =============================================================================
-- Responses (per-question answers with microsecond timing)
-- =============================================================================

CREATE TABLE public.responses (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    question_id     varchar(255) NOT NULL,
    value           jsonb       NOT NULL,
    reaction_time_us bigint,
    presented_at    timestamptz,
    answered_at     timestamptz,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_responses_session_id ON public.responses (session_id);
CREATE INDEX idx_responses_question_id ON public.responses (question_id);

-- =============================================================================
-- Interaction events (fine-grained event log with microsecond timestamps)
-- =============================================================================

CREATE TABLE public.interaction_events (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    event_type   varchar(100) NOT NULL,
    question_id  varchar(255),
    timestamp_us bigint       NOT NULL,
    metadata     jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interaction_events_session_id ON public.interaction_events (session_id);
CREATE INDEX idx_interaction_events_event_type ON public.interaction_events (event_type);

-- =============================================================================
-- Session variables (runtime variable state per session)
-- =============================================================================

CREATE TABLE public.session_variables (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id     uuid        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    variable_name  varchar(255) NOT NULL,
    variable_value jsonb,
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_session_variables_unique ON public.session_variables (session_id, variable_name);

CREATE TRIGGER trg_session_variables_updated_at
    BEFORE UPDATE ON public.session_variables
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
