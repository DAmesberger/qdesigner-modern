-- Backfill compatibility for deployments that created questionnaire_versions
-- before the id / semver columns became part of the live contract.

ALTER TABLE questionnaire_versions
    ADD COLUMN IF NOT EXISTS id UUID;

UPDATE questionnaire_versions
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE questionnaire_versions
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE questionnaire_versions
    ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'questionnaire_versions'::regclass
          AND contype = 'p'
    ) THEN
        ALTER TABLE questionnaire_versions
            ADD CONSTRAINT questionnaire_versions_pkey PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE questionnaire_versions
    ADD COLUMN IF NOT EXISTS version_major INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS version_minor INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS version_patch INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_questionnaire_versions_identity
    ON questionnaire_versions(questionnaire_id, version);
