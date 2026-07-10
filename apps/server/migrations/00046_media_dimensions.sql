-- 00046_media_dimensions.sql
--
-- F-8 — record pixel dimensions for image media assets.
--
-- The designer media library and the reaction/stimulus pillar need an
-- asset's intrinsic width/height to lay images out without blind-cropping
-- previews or guessing aspect ratios. Dimensions are extracted server-side
-- at upload time (header-only sniff via `imagesize`) and stored here.
--
-- Both columns are nullable: non-image assets (audio/video) carry NULL, and
-- so do any image whose header could not be parsed. Existing rows are left
-- untouched — there is intentionally NO backfill, so assets uploaded before
-- this migration simply report no dimensions until re-uploaded.

ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS width  INTEGER,
    ADD COLUMN IF NOT EXISTS height INTEGER;
