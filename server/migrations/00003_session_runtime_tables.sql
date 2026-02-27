-- Session runtime supporting tables for variable snapshots and interaction logs

CREATE TABLE IF NOT EXISTS session_variables (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    variable_name VARCHAR(255) NOT NULL,
    variable_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, variable_name)
);

CREATE INDEX IF NOT EXISTS idx_session_variables_session
    ON session_variables(session_id);

CREATE INDEX IF NOT EXISTS idx_session_variables_name
    ON session_variables(variable_name);

CREATE TABLE IF NOT EXISTS interaction_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    question_id VARCHAR(255),
    timestamp_us BIGINT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_events_session
    ON interaction_events(session_id);

CREATE INDEX IF NOT EXISTS idx_interaction_events_type
    ON interaction_events(event_type);

CREATE INDEX IF NOT EXISTS idx_interaction_events_question
    ON interaction_events(question_id);
