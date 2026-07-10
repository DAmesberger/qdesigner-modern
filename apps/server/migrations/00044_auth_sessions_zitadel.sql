-- 00044_auth_sessions_zitadel.sql
--
-- Primary auth/session tables for Zitadel-backed OIDC and local-dev cookie
-- sessions. Browser cookies hold only an opaque random session token; the
-- database stores its hash. Upstream OIDC tokens and PKCE verifiers are stored
-- encrypted by the application using AUTH_TOKEN_ENC_KEY.

CREATE TABLE IF NOT EXISTS public.external_identities (
    id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    provider               text        NOT NULL CHECK (provider IN ('zitadel', 'local')),
    issuer                 text        NOT NULL,
    subject                text        NOT NULL,
    user_id                uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email_at_link          text,
    email_verified_at_link boolean     NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now(),
    last_seen_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user
    ON public.external_identities (user_id);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
    session_hash        text        PRIMARY KEY,
    user_id             uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider            text        NOT NULL CHECK (provider IN ('local', 'zitadel')),
    issuer              text,
    subject             text,
    encrypted_token_set text,
    mfa_verified        boolean     NOT NULL DEFAULT false,
    csrf_token_hash     text        NOT NULL,
    idle_expires_at     timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    revoked_at          timestamptz,
    user_agent_hash     text,
    ip_prefix           text,
    ip_hash             text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON public.auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
    ON public.auth_sessions (idle_expires_at, absolute_expires_at);

CREATE TABLE IF NOT EXISTS public.auth_login_states (
    state_hash             text        PRIMARY KEY,
    provider               text        NOT NULL CHECK (provider IN ('zitadel')),
    nonce_hash             text        NOT NULL,
    pkce_verifier_enc      text        NOT NULL,
    return_to              text        NOT NULL DEFAULT '/',
    redirect_uri           text        NOT NULL,
    issuer                 text        NOT NULL,
    authorization_endpoint text        NOT NULL,
    token_endpoint         text        NOT NULL,
    jwks_uri               text        NOT NULL,
    introspection_endpoint text,
    revocation_endpoint    text,
    client_id              text        NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    expires_at             timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_login_states_expiry
    ON public.auth_login_states (expires_at);

CREATE TABLE IF NOT EXISTS public.security_events (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      text        NOT NULL,
    outcome         text        NOT NULL CHECK (outcome IN ('success', 'failure')),
    user_id         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    provider        text,
    issuer          text,
    subject         text,
    ip_prefix       text,
    ip_hash         text,
    user_agent_hash text,
    metadata        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_created
    ON public.security_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_created
    ON public.security_events (created_at);
