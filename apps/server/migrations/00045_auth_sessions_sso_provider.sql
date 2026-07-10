-- 00045_auth_sessions_sso_provider.sql
--
-- The primary session table is also used by the legacy per-org SSO callback
-- after moving it off browser-visible JWT fragments.

ALTER TABLE public.auth_sessions
    DROP CONSTRAINT IF EXISTS auth_sessions_provider_check;

ALTER TABLE public.auth_sessions
    ADD CONSTRAINT auth_sessions_provider_check
    CHECK (provider IN ('local', 'zitadel', 'sso'));
