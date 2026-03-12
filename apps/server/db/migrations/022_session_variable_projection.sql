-- Derived variable definitions and typed projections for queryable analytics

CREATE TABLE IF NOT EXISTS public.questionnaire_variable_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    version_major INT NOT NULL DEFAULT 1,
    version_minor INT NOT NULL DEFAULT 0,
    version_patch INT NOT NULL DEFAULT 0,
    variable_name VARCHAR(255) NOT NULL,
    declared_type VARCHAR(50) NOT NULL DEFAULT 'json',
    source_kind VARCHAR(50) NOT NULL DEFAULT 'script',
    storage_class VARCHAR(50) NOT NULL DEFAULT 'raw',
    index_strategy VARCHAR(50) NOT NULL DEFAULT 'none',
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (questionnaire_id, version_major, version_minor, version_patch, variable_name)
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_variable_definitions_lookup
    ON public.questionnaire_variable_definitions(questionnaire_id, version_major, version_minor, version_patch, variable_name);

CREATE TABLE IF NOT EXISTS public.session_variable_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    questionnaire_id UUID NOT NULL REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    questionnaire_version_major INT,
    questionnaire_version_minor INT,
    questionnaire_version_patch INT,
    variable_name VARCHAR(255) NOT NULL,
    value_type VARCHAR(50) NOT NULL DEFAULT 'json',
    source_kind VARCHAR(50) NOT NULL DEFAULT 'script',
    numeric_value DOUBLE PRECISION,
    text_value TEXT,
    boolean_value BOOLEAN,
    timestamp_value TIMESTAMPTZ,
    raw_value JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, variable_name)
);

CREATE INDEX IF NOT EXISTS idx_session_variable_index_numeric
    ON public.session_variable_index(questionnaire_id, questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch, variable_name, numeric_value)
    WHERE numeric_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_variable_index_text
    ON public.session_variable_index(questionnaire_id, questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch, variable_name, text_value)
    WHERE text_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_variable_index_boolean
    ON public.session_variable_index(questionnaire_id, questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch, variable_name, boolean_value)
    WHERE boolean_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_variable_index_timestamp
    ON public.session_variable_index(questionnaire_id, questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch, variable_name, timestamp_value)
    WHERE timestamp_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_variable_index_lookup
    ON public.session_variable_index(session_id, variable_name);
