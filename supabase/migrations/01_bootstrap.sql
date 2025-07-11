-- Bootstrap script to set up basic Supabase requirements
-- This runs before our main init.sql

-- Create extensions in the default way
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;