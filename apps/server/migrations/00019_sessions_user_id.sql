-- 00019_sessions_user_id.sql
--
-- Adds the user_id column on `sessions` so authenticated fillout
-- (an authenticated user filling out their own questionnaire) can be
-- linked to the user identity, which is what the dual-path RLS
-- policies in 00021 read. NULL is the historical default and the
-- correct value for anonymous fillout — existing and future anonymous
-- sessions are not migrated to a synthetic user.
--
-- The partial index is keyed on the `WHERE user_id IS NOT NULL`
-- predicate so anonymous-session reads don't pay the index cost; the
-- dual-path SELECT policy in 00021 walks this index when authenticated
-- users list their own sessions.

ALTER TABLE public.sessions
    ADD COLUMN user_id UUID NULL REFERENCES public.users(id);

CREATE INDEX idx_sessions_user_id
    ON public.sessions(user_id)
    WHERE user_id IS NOT NULL;
