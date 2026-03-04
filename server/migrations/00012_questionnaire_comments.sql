CREATE TABLE IF NOT EXISTS questionnaire_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES questionnaire_comments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    anchor_type TEXT NOT NULL CHECK (anchor_type IN ('question', 'page', 'block', 'variable', 'general')),
    anchor_id TEXT,
    body TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_questionnaire ON questionnaire_comments(questionnaire_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_anchor ON questionnaire_comments(questionnaire_id, anchor_type, anchor_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON questionnaire_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON questionnaire_comments(author_id);
