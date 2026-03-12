-- 01-test-users.sql
-- Deterministic users for local development and test seeding.
-- Password for every seeded user: TestPassword123!
--
-- The current auth model stores credentials in users.password_hash.

INSERT INTO public.users (id, email, password_hash, full_name, email_verified) VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'admin@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$O4UM7e/zJtfO/AdH8Ds/Bg$QblcDXxWwq+XWjQmWROGSXDvX7ql04oqFIs363y80DY',
        'Test Admin',
        true
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        'editor@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$O4UM7e/zJtfO/AdH8Ds/Bg$QblcDXxWwq+XWjQmWROGSXDvX7ql04oqFIs363y80DY',
        'Test Editor',
        true
    ),
    (
        '33333333-3333-3333-3333-333333333333',
        'viewer@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$O4UM7e/zJtfO/AdH8Ds/Bg$QblcDXxWwq+XWjQmWROGSXDvX7ql04oqFIs363y80DY',
        'Test Viewer',
        true
    ),
    (
        '44444444-4444-4444-4444-444444444444',
        'participant@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$O4UM7e/zJtfO/AdH8Ds/Bg$QblcDXxWwq+XWjQmWROGSXDvX7ql04oqFIs363y80DY',
        'Test Participant',
        true
    ),
    (
        '55555555-5555-5555-5555-555555555555',
        'demo@example.com',
        '$argon2id$v=19$m=19456,t=2,p=1$O4UM7e/zJtfO/AdH8Ds/Bg$QblcDXxWwq+XWjQmWROGSXDvX7ql04oqFIs363y80DY',
        'Demo User',
        true
    )
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    full_name = EXCLUDED.full_name,
    email_verified = EXCLUDED.email_verified,
    deleted_at = NULL;
