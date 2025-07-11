-- Create a test user in auth.users
INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'test@example.com',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- Create user profile in public.users (if the table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    INSERT INTO public.users (id, email, full_name)
    VALUES (
      '00000000-0000-0000-0000-000000000001'::uuid,
      'test@example.com',
      'Test User'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;