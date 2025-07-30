-- Drop existing auth schema to start fresh
DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA auth;

-- Grant permissions
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA auth TO postgres, supabase_auth_admin;

-- Create comprehensive auth.users table
CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid,
    aud varchar(255),
    role varchar(255),
    email varchar(255) UNIQUE,
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    invited_at timestamptz,
    confirmation_token varchar(255),
    confirmation_sent_at timestamptz,
    recovery_token varchar(255),
    recovery_sent_at timestamptz,
    email_change_token varchar(255),
    email_change varchar(255),
    email_change_sent_at timestamptz,
    email_change_token_new varchar(255),
    email_change_confirm_status smallint DEFAULT 0,
    last_sign_in_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    phone varchar(255),
    phone_confirmed_at timestamptz,
    phone_change varchar(255),
    phone_change_token varchar(255),
    phone_change_sent_at timestamptz,
    banned_until timestamptz,
    reauthentication_token varchar(255),
    reauthentication_sent_at timestamptz,
    is_sso_user boolean DEFAULT false,
    deleted_at timestamptz
);

-- Create identities table
CREATE TABLE auth.identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    provider_id text NOT NULL,
    provider text NOT NULL,
    identity_data jsonb NOT NULL,
    last_sign_in_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    email text GENERATED ALWAYS AS (LOWER((identity_data->>'email'::text))) STORED,
    CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider)
);

-- Create sessions table
CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    factor_id uuid,
    aal varchar(255),
    not_after timestamptz,
    refreshed_at timestamptz,
    user_agent text,
    ip inet,
    tag text
);

-- Create refresh_tokens table
CREATE TABLE auth.refresh_tokens (
    id bigserial PRIMARY KEY,
    token varchar(255) UNIQUE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    revoked boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    parent varchar(255),
    session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE
);

-- Create audit_log_entries table
CREATE TABLE auth.audit_log_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid,
    payload json,
    created_at timestamptz DEFAULT now(),
    ip_address varchar(64) DEFAULT ''
);

-- Create schema_migrations table
CREATE TABLE auth.schema_migrations (
    version varchar(255) PRIMARY KEY
);

-- Insert current version
INSERT INTO auth.schema_migrations (version) VALUES ('20230727211600');

-- Create all indexes
CREATE INDEX users_instance_id_idx ON auth.users(instance_id);
CREATE INDEX users_instance_id_email_idx ON auth.users(instance_id, LOWER(email));
CREATE INDEX users_email_partial_key ON auth.users(email) WHERE is_sso_user = false;
CREATE INDEX identities_user_id_idx ON auth.identities(user_id);
CREATE INDEX identities_email_idx ON auth.identities(email);
CREATE INDEX sessions_user_id_idx ON auth.sessions(user_id);
CREATE INDEX sessions_not_after_idx ON auth.sessions(not_after);
CREATE INDEX refresh_tokens_user_id_idx ON auth.refresh_tokens(user_id);
CREATE INDEX refresh_tokens_token_idx ON auth.refresh_tokens(token);
CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries(instance_id);

-- Create auth functions
CREATE OR REPLACE FUNCTION auth.uid() 
RETURNS uuid 
LANGUAGE sql 
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() 
RETURNS text 
LANGUAGE sql 
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text;
$$;

CREATE OR REPLACE FUNCTION auth.email() 
RETURNS text 
LANGUAGE sql 
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.email', true), '')::text;
$$;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO supabase_auth_admin;

-- Insert demo user with proper structure
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    aud,
    role,
    created_at,
    updated_at
) VALUES (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'demo@example.com',
    '$2a$10$PnnIgfMwKMPiSK.vKs9MkuN0q5VU.REkILl7mdQGXmh/mzNhm2Lfy', -- bcrypt of 'demo123456'
    now(),
    '{"full_name": "Demo User"}'::jsonb,
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    'authenticated',
    'authenticated',
    now(),
    now()
) ON CONFLICT (email) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    aud = EXCLUDED.aud,
    role = EXCLUDED.role,
    updated_at = now();

-- Create identity for the user
INSERT INTO auth.identities (
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
) VALUES (
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'email',
    '{"sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "email": "demo@example.com", "email_verified": true}'::jsonb,
    now(),
    now(),
    now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Ensure public.users exists and has demo user
DO $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Check if user exists
    SELECT id INTO v_user_id FROM public.users WHERE auth_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    
    IF v_user_id IS NULL THEN
        INSERT INTO public.users (auth_id, email, full_name, created_at, updated_at)
        VALUES ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'demo@example.com', 'Demo User', now(), now());
    END IF;
END$$;

SELECT 'Auth schema fixed and demo user created!' AS result;