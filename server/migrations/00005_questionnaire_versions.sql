-- Questionnaire version history
CREATE TABLE IF NOT EXISTS questionnaire_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    title TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_versions_qid
    ON questionnaire_versions(questionnaire_id, version DESC);
