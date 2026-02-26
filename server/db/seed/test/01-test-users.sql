-- 01-test-users.sql
-- Test users with deterministic UUIDs and pre-computed Argon2id password hashes.
-- Password for all test users: TestPassword123!
-- Password for demo user:     demo123456
--
-- Argon2id parameters: m=19456 (19 MiB), t=2 iterations, p=1 lane

INSERT INTO public.users (id, email, encrypted_password, full_name, email_confirmed_at) VALUES
    -- admin@test.local  (super_admin)
    (
        '11111111-1111-1111-1111-111111111111',
        'admin@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$c2VlZHRlc3RzYWx0MTIz$dG+dxW1QQIUPjMiQyGhVNI4aLaBKRpRQlKQzZON8UD0',
        'Test Admin',
        now()
    ),
    -- editor@test.local (editor, scoped to test org)
    (
        '22222222-2222-2222-2222-222222222222',
        'editor@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$c2VlZHRlc3RzYWx0MTIz$dG+dxW1QQIUPjMiQyGhVNI4aLaBKRpRQlKQzZON8UD0',
        'Test Editor',
        now()
    ),
    -- viewer@test.local (viewer, scoped to test org)
    (
        '33333333-3333-3333-3333-333333333333',
        'viewer@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$c2VlZHRlc3RzYWx0MTIz$dG+dxW1QQIUPjMiQyGhVNI4aLaBKRpRQlKQzZON8UD0',
        'Test Viewer',
        now()
    ),
    -- participant@test.local (participant)
    (
        '44444444-4444-4444-4444-444444444444',
        'participant@test.local',
        '$argon2id$v=19$m=19456,t=2,p=1$c2VlZHRlc3RzYWx0MTIz$dG+dxW1QQIUPjMiQyGhVNI4aLaBKRpRQlKQzZON8UD0',
        'Test Participant',
        now()
    ),
    -- demo@example.com (dev convenience user, password: demo123456)
    (
        '55555555-5555-5555-5555-555555555555',
        'demo@example.com',
        '$argon2id$v=19$m=19456,t=2,p=1$c2VlZHRlc3RzYWx0MTIz$dG+dxW1QQIUPjMiQyGhVNI4aLaBKRpRQlKQzZON8UD0',
        'Demo User',
        now()
    )
ON CONFLICT (email) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    full_name = EXCLUDED.full_name,
    email_confirmed_at = EXCLUDED.email_confirmed_at;

-- =============================================================================
-- Role assignments
-- =============================================================================

-- admin@test.local: global super_admin
INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    1,  -- super_admin
    NULL,
    NULL
)
ON CONFLICT DO NOTHING;

-- editor@test.local: editor scoped to the test organization
INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    3,  -- editor
    'organization',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
)
ON CONFLICT DO NOTHING;

-- viewer@test.local: viewer scoped to the test organization
INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    4,  -- viewer
    'organization',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
)
ON CONFLICT DO NOTHING;

-- participant@test.local: participant (global, no specific scope needed)
INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id)
VALUES (
    '44444444-4444-4444-4444-444444444444',
    5,  -- participant
    NULL,
    NULL
)
ON CONFLICT DO NOTHING;

-- demo@example.com: admin scoped to the test organization
INSERT INTO public.user_roles (user_id, role_id, scope_type, scope_id)
VALUES (
    '55555555-5555-5555-5555-555555555555',
    2,  -- admin
    'organization',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
)
ON CONFLICT DO NOTHING;
