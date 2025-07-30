-- Create demo user directly in the database
-- Password: demo123456 (bcrypted)

-- First ensure we have all the auth tables
CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) UNIQUE,
    encrypted_password varchar(255),
    email_confirmed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
    aud varchar(255) DEFAULT 'authenticated',
    role varchar(255) DEFAULT 'authenticated',
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

-- Insert demo user with encrypted password
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
    'f47ac10b-58cc-4372-a567-0e02b2c3d479', -- Fixed UUID for demo user
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
    updated_at = now();

-- Create an identity record for the user
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
    'demo@example.com',
    'email',
    '{"sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "email": "demo@example.com", "email_verified": true}'::jsonb,
    now(),
    now(),
    now()
) ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    last_sign_in_at = now(),
    updated_at = now();

-- Also create the user in the public.users table
INSERT INTO public.users (
    id,
    auth_id,
    email,
    full_name,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'demo@example.com',
    'Demo User',
    now(),
    now()
) ON CONFLICT (auth_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();

-- Create a demo organization
DO $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
BEGIN
    -- Get the user ID
    SELECT id INTO v_user_id FROM public.users WHERE auth_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' LIMIT 1;
    
    -- Create organization
    INSERT INTO public.organizations (
        id,
        name,
        slug,
        created_by
    ) VALUES (
        gen_random_uuid(),
        'Demo Organization',
        'demo-org',
        v_user_id
    ) RETURNING id INTO v_org_id;
    
    -- Add user as owner
    INSERT INTO public.organization_members (
        organization_id,
        user_id,
        role,
        status
    ) VALUES (
        v_org_id,
        v_user_id,
        'owner',
        'active'
    );
END$$;

-- Output success message
SELECT 'Demo user created successfully!' AS message;
SELECT 'Email: demo@example.com' AS credentials;
SELECT 'Password: demo123456' AS password;