-- Complete auth schema tables needed by GoTrue

-- Create sessions table
CREATE TABLE IF NOT EXISTS auth.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Add foreign key for refresh_tokens
ALTER TABLE auth.refresh_tokens 
    ADD CONSTRAINT IF NOT EXISTS refresh_tokens_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;

-- Create identities table
CREATE TABLE IF NOT EXISTS auth.identities (
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

-- Create audit log entries table
CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid,
    payload json,
    created_at timestamptz DEFAULT now(),
    ip_address varchar(64) DEFAULT ''
);

-- Create flow state table
CREATE TABLE IF NOT EXISTS auth.flow_state (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method varchar(255) NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    authentication_method text NOT NULL,
    CONSTRAINT flow_state_auth_code_idx UNIQUE (auth_code)
);

-- Create mfa tables
CREATE TABLE IF NOT EXISTS auth.mfa_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    friendly_name text,
    factor_type varchar(255) NOT NULL,
    status varchar(255) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    secret text
);

CREATE TABLE IF NOT EXISTS auth.mfa_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    factor_id uuid REFERENCES auth.mfa_factors(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz,
    ip_address inet NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.mfa_amr_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    authentication_method text NOT NULL,
    CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method)
);

-- Create SSO tables
CREATE TABLE IF NOT EXISTS auth.sso_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_provider_type text,
    resource_id text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT sso_providers_resource_id_idx UNIQUE (LOWER(resource_id))
);

CREATE TABLE IF NOT EXISTS auth.sso_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_provider_id uuid REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
    domain text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT sso_domains_domain_idx UNIQUE (LOWER(domain))
);

CREATE TABLE IF NOT EXISTS auth.saml_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_provider_id uuid REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id)
);

CREATE TABLE IF NOT EXISTS auth.saml_relay_states (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_provider_id uuid REFERENCES auth.sso_providers(id) ON DELETE CASCADE,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    from_ip_address inet,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT saml_relay_states_for_email_redirect_to_idx UNIQUE (for_email, redirect_to)
);

-- Create instances table
CREATE TABLE IF NOT EXISTS auth.instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uuid uuid,
    raw_base_config text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create all required indexes
CREATE INDEX IF NOT EXISTS identities_user_id_idx ON auth.identities (user_id);
CREATE INDEX IF NOT EXISTS identities_email_idx ON auth.identities (email);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_not_after_idx ON auth.sessions (not_after);
CREATE INDEX IF NOT EXISTS mfa_factors_user_id_idx ON auth.mfa_factors (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_instance_id_idx ON auth.audit_log_entries (instance_id);

-- Grant all permissions to auth admin
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;