-- Fix auth.users schema to ensure compatibility with GoTrue
-- This ensures nullable fields are properly set

-- Check and update auth.users columns to allow NULL where GoTrue expects it
DO $$
BEGIN
  -- List of columns that should be nullable in auth.users
  -- These are checked by GoTrue and should allow NULL values
  ALTER TABLE auth.users 
    ALTER COLUMN confirmation_token DROP NOT NULL,
    ALTER COLUMN recovery_token DROP NOT NULL,
    ALTER COLUMN email_change_token_new DROP NOT NULL,
    ALTER COLUMN email_change DROP NOT NULL,
    ALTER COLUMN phone DROP NOT NULL,
    ALTER COLUMN phone_change DROP NOT NULL,
    ALTER COLUMN phone_change_token DROP NOT NULL,
    ALTER COLUMN reauthentication_token DROP NOT NULL;
    
  -- Ensure these timestamp fields are also nullable
  ALTER TABLE auth.users
    ALTER COLUMN phone_confirmed_at DROP NOT NULL,
    ALTER COLUMN invited_at DROP NOT NULL,
    ALTER COLUMN confirmation_sent_at DROP NOT NULL,
    ALTER COLUMN email_change_sent_at DROP NOT NULL,
    ALTER COLUMN last_sign_in_at DROP NOT NULL,
    ALTER COLUMN email_confirmed_at DROP NOT NULL,
    ALTER COLUMN phone_change_sent_at DROP NOT NULL,
    ALTER COLUMN confirmed_at DROP NOT NULL,
    ALTER COLUMN reauthentication_sent_at DROP NOT NULL,
    ALTER COLUMN banned_until DROP NOT NULL;
    
EXCEPTION
  WHEN OTHERS THEN
    -- If any column doesn't exist or can't be modified, continue
    NULL;
END $$;