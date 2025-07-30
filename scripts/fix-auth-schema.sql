-- Fix auth schema issues by adding missing columns

-- Add missing columns to auth.users
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id uuid NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone varchar(255) NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamptz NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change varchar(255) NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change_token varchar(255) NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS phone_change_sent_at timestamptz NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_token_new varchar(255) NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_change_confirm_status smallint DEFAULT 0;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS banned_until timestamptz NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS reauthentication_token varchar(255) NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS reauthentication_sent_at timestamptz NULL;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS is_sso_user boolean DEFAULT false;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS users_instance_id_idx ON auth.users USING btree (instance_id);
CREATE INDEX IF NOT EXISTS users_instance_id_email_idx ON auth.users USING btree (instance_id, LOWER(email));
CREATE INDEX IF NOT EXISTS users_email_partial_key ON auth.users USING btree (email) WHERE is_sso_user = false;

-- Create missing tables
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  instance_id uuid NULL,
  id bigserial NOT NULL,
  token varchar(255) NULL,
  user_id varchar(255) NULL,
  revoked bool NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  parent varchar(255) NULL,
  session_id uuid NULL,
  CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.instances (
  id uuid NOT NULL,
  uuid uuid NULL,
  raw_base_config text NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  CONSTRAINT instances_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
  instance_id uuid NULL,
  id uuid NOT NULL,
  payload json NULL,
  created_at timestamptz NULL,
  ip_address varchar(64) DEFAULT '' NOT NULL,
  CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auth.sso_providers (
  id uuid NOT NULL,
  sso_provider_type text NULL,
  resource_id text NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  CONSTRAINT sso_providers_pkey PRIMARY KEY (id),
  CONSTRAINT "sso_providers_resource_id_idx" UNIQUE (LOWER(resource_id))
);

CREATE TABLE IF NOT EXISTS auth.sso_domains (
  id uuid NOT NULL,
  sso_provider_id uuid NOT NULL,
  domain text NOT NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  CONSTRAINT sso_domains_pkey PRIMARY KEY (id),
  CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
  CONSTRAINT "sso_domains_domain_idx" UNIQUE (LOWER(domain))
);

CREATE TABLE IF NOT EXISTS auth.saml_providers (
  id uuid NOT NULL,
  sso_provider_id uuid NOT NULL,
  entity_id text NOT NULL,
  metadata_xml text NOT NULL,
  metadata_url text NULL,
  attribute_mapping jsonb NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  CONSTRAINT saml_providers_pkey PRIMARY KEY (id),
  CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
  CONSTRAINT "saml_providers_entity_id_key" UNIQUE (entity_id)
);

CREATE TABLE IF NOT EXISTS auth.saml_relay_states (
  id uuid NOT NULL,
  sso_provider_id uuid NOT NULL,
  request_id text NOT NULL,
  for_email text NULL,
  redirect_to text NULL,
  from_ip_address inet NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id),
  CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
  CONSTRAINT "saml_relay_states_for_email_redirect_to_idx" UNIQUE (for_email, redirect_to)
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  factor_id uuid NULL,
  aal auth.aal_level NULL,
  not_after timestamptz NULL,
  refreshed_at timestamptz NULL,
  user_agent text NULL,
  ip inet NULL,
  tag text NULL,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  friendly_name text NULL,
  factor_type auth.factor_type NOT NULL,
  status auth.factor_status NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  secret text NULL,
  CONSTRAINT mfa_factors_pkey PRIMARY KEY (id),
  CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.mfa_challenges (
  id uuid NOT NULL,
  factor_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  verified_at timestamptz NULL,
  ip_address inet NOT NULL,
  CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id),
  CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.mfa_amr_claims (
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  authentication_method text NOT NULL,
  id uuid NOT NULL,
  CONSTRAINT amr_id_pk PRIMARY KEY (id),
  CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE,
  CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method)
);

CREATE TABLE IF NOT EXISTS auth.flow_state (
  id uuid NOT NULL,
  user_id uuid NULL,
  auth_code text NOT NULL,
  code_challenge_method auth.code_challenge_method NOT NULL,
  code_challenge text NOT NULL,
  provider_type text NOT NULL,
  provider_access_token text NULL,
  provider_refresh_token text NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  authentication_method text NOT NULL,
  CONSTRAINT flow_state_pkey PRIMARY KEY (id),
  CONSTRAINT flow_state_auth_code_idx UNIQUE (auth_code)
);

CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id text NOT NULL,
  user_id uuid NOT NULL,
  identity_data jsonb NOT NULL,
  provider text NOT NULL,
  last_sign_in_at timestamptz NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  email text GENERATED ALWAYS AS (LOWER((identity_data->>'email'::text))) STORED,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT identities_pkey PRIMARY KEY (id),
  CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider)
);

-- Create missing indexes
CREATE INDEX IF NOT EXISTS refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_token_idx ON auth.refresh_tokens USING btree (token);
CREATE INDEX IF NOT EXISTS audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS sessions_not_after_idx ON auth.sessions USING btree (not_after);
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON auth.identities USING btree (user_id);

-- Create auth types if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aal_level' AND typnamespace = 'auth'::regnamespace) THEN
    CREATE TYPE auth.aal_level AS ENUM ('aal1', 'aal2', 'aal3');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'factor_type' AND typnamespace = 'auth'::regnamespace) THEN
    CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'factor_status' AND typnamespace = 'auth'::regnamespace) THEN
    CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_challenge_method' AND typnamespace = 'auth'::regnamespace) THEN
    CREATE TYPE auth.code_challenge_method AS ENUM ('s256', 'plain');
  END IF;
END$$;

-- Grant permissions
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO supabase_auth_admin;