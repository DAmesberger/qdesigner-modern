-- 002_users_auth.sql
-- Users table and authentication infrastructure
-- In the new architecture, users.id IS the identity (JWT sub = users.id).
-- No more auth_id indirection or separate auth.users table.

-- =============================================================================
-- Users table
-- =============================================================================

CREATE TABLE public.users (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           varchar(255) UNIQUE NOT NULL,
    encrypted_password text     NOT NULL,
    full_name       varchar(255),
    avatar_url      text,
    email_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    login_count     integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON public.users (email);

-- =============================================================================
-- Auth schema for token management
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Revoked JWT tokens (for logout / forced invalidation)
CREATE TABLE auth.revoked_tokens (
    jti         uuid        PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz NOT NULL DEFAULT now(),
    reason      varchar(255)
);

CREATE INDEX idx_revoked_tokens_user_id ON auth.revoked_tokens (user_id);
CREATE INDEX idx_revoked_tokens_expires_at ON auth.revoked_tokens (expires_at);

-- Refresh tokens
CREATE TABLE auth.refresh_tokens (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash  text        NOT NULL,
    expires_at  timestamptz NOT NULL,
    device_info jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON auth.refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON auth.refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON auth.refresh_tokens (expires_at);

-- =============================================================================
-- Trigger: auto-update updated_at on users
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
