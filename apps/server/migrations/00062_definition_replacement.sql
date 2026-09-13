-- A replacement starts a new collaboration generation. Binary snapshots from
-- older generations must never be allowed to overwrite its document.
ALTER TABLE public.questionnaire_definitions
    ADD COLUMN collaboration_epoch INTEGER NOT NULL DEFAULT 0;

-- Historical settings were not captured separately before this migration.
-- NULL means unavailable; new snapshots preserve the complete settings value.
ALTER TABLE public.questionnaire_versions ADD COLUMN settings JSONB;
