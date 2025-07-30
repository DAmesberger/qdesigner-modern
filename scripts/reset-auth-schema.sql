-- Reset auth schema to allow proper recreation
DROP SCHEMA IF EXISTS auth CASCADE;
CREATE SCHEMA auth;

-- Grant permissions
GRANT ALL ON SCHEMA auth TO postgres;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Create required extensions in auth schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA auth;

-- Create basic auth types
CREATE TYPE auth.aal_level AS ENUM ('aal1', 'aal2', 'aal3');
CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn');
CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified');
CREATE TYPE auth.code_challenge_method AS ENUM ('s256', 'plain');