-- 00029_sessions_insert_user_id_guard.sql
--
-- F011 — Constrain the anonymous branches of `sessions_insert_dual` so a
-- forged non-null `user_id` cannot be inserted by an anonymous caller.
--
-- The 00021 `sessions_insert_dual` policy admits anonymous INSERTs via two
-- branches that only check `app.session_id` (or the true-bootstrap absence
-- of both GUCs). Neither constrained `sessions.user_id`, so an anonymous
-- caller could — if the handler were bypassed or compromised — INSERT a row
-- with a *victim's* user_id and thereby have that session admitted by the
-- authenticated `user_id = current_app_user_id()` branch of the dual-path
-- SELECT/UPDATE policies. RLS would not stop it.
--
-- This migration is purely additive defense-in-depth: the live handler
-- always writes `user_id = NULL` for anonymous callers (sessions.rs:409),
-- so the tightened WITH CHECK cannot break the real anonymous-create path.
-- The authenticated branch already constrained user_id and is unchanged.
--
-- Fix: require `sessions.user_id IS NULL` on BOTH anonymous branches — the
-- session-GUC branch and the true-bootstrap branch. Any non-null user_id
-- must now go through the authenticated branch, which pins it to the
-- caller's own id.

DROP POLICY IF EXISTS sessions_insert_dual ON public.sessions;

CREATE POLICY sessions_insert_dual ON public.sessions
    FOR INSERT WITH CHECK (
        public.is_super_admin()
        OR (public.current_app_user_id() IS NOT NULL
            AND sessions.user_id = public.current_app_user_id())
        -- Anonymous, session-bound: the caller may only materialize a row
        -- whose id matches the session GUC AND that claims no user_id.
        OR (public.current_app_session_id() IS NOT NULL
            AND sessions.id = public.current_app_session_id()
            AND sessions.user_id IS NULL)
        -- Bootstrap branch: anonymous session creation (no JWT, no
        -- session-bound GUC) is the entry point and cannot self-
        -- reference. The session URL becomes the credential immediately
        -- afterwards. It must not claim a user_id either.
        OR (public.current_app_user_id() IS NULL
            AND public.current_app_session_id() IS NULL
            AND sessions.user_id IS NULL)
    );
