-- Anchored comments on questionnaire elements.
-- Each comment is anchored to a specific element (question, page, block, variable)
-- and supports threaded replies via parent_id.

CREATE TABLE IF NOT EXISTS questionnaire_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES questionnaire_comments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    -- Anchor: which element the comment is attached to
    anchor_type TEXT NOT NULL CHECK (anchor_type IN ('question', 'page', 'block', 'variable', 'general')),
    anchor_id TEXT,                        -- Element ID (null for general comments)
    body TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_questionnaire ON questionnaire_comments(questionnaire_id, created_at);
CREATE INDEX idx_comments_anchor ON questionnaire_comments(questionnaire_id, anchor_type, anchor_id);
CREATE INDEX idx_comments_parent ON questionnaire_comments(parent_id);
CREATE INDEX idx_comments_author ON questionnaire_comments(author_id);
