-- 00024_response_timing_provenance.sql
--
-- Adds `timing_provenance` on `responses` so the offline-first sync path
-- can persist the per-response timing-provenance blob alongside the
-- existing per-trial detail already carried inside `value`.
--
-- Shape (contract C-PROVENANCE, produced by the fillout runtime and sent
-- snake_case as `timing_provenance` in the sync payload):
--   { onsetMethod, responseMethod, displayLatencyMs?, outputLatencyMs?,
--     rawRtMs?, anticipatory?, frameStats?{fps,droppedFrames,jitter},
--     calibration? }
--
-- NULL is the correct default: historical rows and older clients that
-- omit the field simply carry no provenance. No RLS change is needed —
-- `responses` already carries the fillout-dual policies from 00021, and
-- adding a nullable column does not alter row visibility.

ALTER TABLE public.responses
    ADD COLUMN IF NOT EXISTS timing_provenance JSONB;
