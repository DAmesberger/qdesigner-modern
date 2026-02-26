-- 02-test-organization.sql
-- Test organization, project, and membership data

-- =============================================================================
-- Test organization
-- =============================================================================

INSERT INTO public.organizations (id, name, slug, domain, settings, subscription_tier, created_by)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Test Research Lab',
    'test-research-lab',
    'test.local',
    '{"features": {"media_uploads": true, "advanced_branching": true}}'::jsonb,
    'professional',
    '11111111-1111-1111-1111-111111111111'  -- admin@test.local
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    domain = EXCLUDED.domain,
    settings = EXCLUDED.settings;

-- =============================================================================
-- Organization membership
-- =============================================================================

INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner',  'active'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'viewer', 'active'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'admin',  'active')
ON CONFLICT (organization_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status;

-- =============================================================================
-- Test project
-- =============================================================================

INSERT INTO public.projects (id, organization_id, name, code, description, status, created_by)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Cognitive Load Study',
    'CLS-001',
    'A study measuring cognitive load during multi-tasking scenarios using reaction time measurements.',
    'active',
    '11111111-1111-1111-1111-111111111111'  -- admin@test.local
)
ON CONFLICT (organization_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- =============================================================================
-- Project membership
-- =============================================================================

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'owner'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'editor'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'viewer'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'admin')
ON CONFLICT (project_id, user_id) DO UPDATE SET
    role = EXCLUDED.role;
