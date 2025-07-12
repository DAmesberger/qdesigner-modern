-- Fix GoTrue auth schema issues with NULL string columns
-- GoTrue v2.132.3 has issues handling NULL values in certain string columns

-- Set default values for nullable string columns to empty strings
ALTER TABLE auth.users 
  ALTER COLUMN confirmation_token SET DEFAULT '',
  ALTER COLUMN recovery_token SET DEFAULT '',
  ALTER COLUMN email_change_token_new SET DEFAULT '',
  ALTER COLUMN email_change SET DEFAULT '',
  ALTER COLUMN phone_change_token SET DEFAULT '',
  ALTER COLUMN phone_change SET DEFAULT '',
  ALTER COLUMN email_change_token_current SET DEFAULT '',
  ALTER COLUMN reauthentication_token SET DEFAULT '';

-- Update any existing NULL values to empty strings
UPDATE auth.users SET 
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  phone_change = COALESCE(phone_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, '');

-- Create demo user for testing if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@example.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      phone_change_token,
      phone_change,
      email_change_token_current,
      reauthentication_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      'authenticated',
      'authenticated',
      'demo@example.com',
      crypt('demo123456', gen_salt('bf')),
      NOW(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Demo User"}',
      NOW(),
      NOW()
    );
    
    -- Also create in public.users table
    INSERT INTO public.users (auth_id, email, full_name, created_at, updated_at)
    VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'demo@example.com', 'Demo User', NOW(), NOW())
    ON CONFLICT (auth_id) DO NOTHING;
  END IF;
END $$;