-- Create roles for PostgREST
CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER PASSWORD 'postgres';
CREATE ROLE anon NOINHERIT;
CREATE ROLE service_role NOINHERIT;

-- Grant permissions
GRANT anon TO authenticator;
GRANT service_role TO authenticator;

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, service_role;

-- Create storage schema if not exists
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO service_role;