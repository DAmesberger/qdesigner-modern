-- Semver version management + offline sync dedup

-- Add semver columns to questionnaire_definitions
ALTER TABLE questionnaire_definitions
  ADD COLUMN IF NOT EXISTS version_major INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_minor INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_patch INT NOT NULL DEFAULT 0;

-- Add semver to questionnaire_versions
ALTER TABLE questionnaire_versions
  ADD COLUMN IF NOT EXISTS version_major INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_minor INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_patch INT NOT NULL DEFAULT 0;

-- Add version tracking to sessions (which version was filled out)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS questionnaire_version_major INT,
  ADD COLUMN IF NOT EXISTS questionnaire_version_minor INT,
  ADD COLUMN IF NOT EXISTS questionnaire_version_patch INT;

-- Client-side dedup for offline sync
ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS client_id UUID UNIQUE;

ALTER TABLE interaction_events
  ADD COLUMN IF NOT EXISTS client_id UUID UNIQUE;
