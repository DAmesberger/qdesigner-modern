-- Question template library: reusable question configurations across questionnaires and projects
CREATE TABLE IF NOT EXISTS question_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),       -- e.g., 'demographics', 'likert-scales', 'attention-checks', 'consent'
    tags TEXT[],                  -- searchable tags
    question_type VARCHAR(50) NOT NULL,
    question_config JSONB NOT NULL, -- full question configuration snapshot
    is_shared BOOLEAN DEFAULT false, -- shared across org or private to creator
    usage_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_templates_org ON question_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_question_templates_category ON question_templates(category);
CREATE INDEX IF NOT EXISTS idx_question_templates_type ON question_templates(question_type);
CREATE INDEX IF NOT EXISTS idx_question_templates_tags ON question_templates USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_question_templates_created_by ON question_templates(created_by);
