-- Version snapshots for questionnaire collaboration history.
-- Each snapshot captures a full JSONB state at a point in time,
-- allowing rollback and comparison of versions.

CREATE TABLE IF NOT EXISTS questionnaire_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id) ON DELETE CASCADE,
    version_major INTEGER NOT NULL DEFAULT 1,
    version_minor INTEGER NOT NULL DEFAULT 0,
    version_patch INTEGER NOT NULL DEFAULT 0,
    label TEXT,                           -- Optional human-readable label (e.g. "Pre-launch review")
    content JSONB NOT NULL,               -- Full questionnaire content at snapshot time
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_questionnaire ON questionnaire_snapshots(questionnaire_id, created_at DESC);
CREATE INDEX idx_snapshots_created_by ON questionnaire_snapshots(created_by);
