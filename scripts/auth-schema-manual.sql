-- Create auth schema if not exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Create auth users table with minimal structure for now
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) UNIQUE,
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
    aud varchar(255),
    role varchar(255),
    last_sign_in_at timestamptz,
    is_super_admin boolean DEFAULT false,
    instance_id uuid,
    confirmation_token varchar(255),
    recovery_token varchar(255),
    email_change_token varchar(255),
    email_change varchar(255),
    phone varchar(255),
    phone_confirmed_at timestamptz,
    phone_change varchar(255),
    phone_change_token varchar(255),
    reauthentication_token varchar(255),
    is_sso_user boolean DEFAULT false,
    deleted_at timestamptz
);

-- Create minimal tables required by GoTrue
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id bigserial PRIMARY KEY,
    token varchar(255),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    revoked boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    parent varchar(255),
    session_id uuid
);

CREATE TABLE IF NOT EXISTS auth.schema_migrations (
    version varchar(255) PRIMARY KEY
);

-- Insert version to prevent migration attempts
INSERT INTO auth.schema_migrations (version) VALUES ('20230727211600') ON CONFLICT DO NOTHING;

-- Create minimal functions
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
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO supabase_auth_admin;

-- Create indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON auth.users (email);
CREATE INDEX IF NOT EXISTS refresh_tokens_token_idx ON auth.refresh_tokens (token);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON auth.refresh_tokens (user_id);

-- Create supabase_auth_admin role if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_auth_admin'
  ) THEN
    CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
  END IF;
END$$;

-- Grant necessary permissions
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO supabase_auth_admin;