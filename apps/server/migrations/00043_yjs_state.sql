-- 00043_yjs_state.sql — authoritative Yjs CRDT binary state for the
-- collaborative designer (fixes the page-duplication corruption).
--
-- Root cause of the corruption: the collaborative document was seeded from the
-- `content` JSON *independently on every client mount*. Because a Yjs array
-- merges by concatenating independently-created CRDT items (not by content),
-- each fresh client seed that synced into the long-lived, never-evicted server
-- room appended another full copy of every page/block — with identical IDs.
--
-- The fix makes the SERVER the sole seeder: it derives the CRDT once from
-- `content`, stores the binary state here, reloads it verbatim thereafter
-- (preserving CRDT item identity across reconnects and restarts), and clients
-- become pure sync consumers that never seed independently. `encode_state_as_
-- update_v1(StateVector::default())` is the stored form.
--
-- `questionnaire_definitions` is RLS-exempt (ADR 0012 / migration 00021), so
-- the non-BYPASSRLS `qdesigner_app` role reads/writes this column without a GUC.

ALTER TABLE public.questionnaire_definitions
    ADD COLUMN IF NOT EXISTS yjs_state BYTEA;

COMMENT ON COLUMN public.questionnaire_definitions.yjs_state IS
    'Authoritative Yjs CRDT binary state (encode_state_as_update_v1) for the collaborative designer room. NULL until first collaborated; the server is the sole seeder (derives it once from content) so independent client seeds can no longer concatenate into duplicate pages.';
