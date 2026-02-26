-- 02-permissions.sql
-- Baseline permissions (always applied)

INSERT INTO public.permissions (resource, action, description) VALUES
    -- Organization permissions
    ('organization', 'manage', 'Manage organization settings and billing'),
    ('organization', 'view',   'View organization details'),
    ('organization', 'invite', 'Invite members to the organization'),

    -- Project permissions
    ('project', 'create', 'Create new projects'),
    ('project', 'edit',   'Edit existing projects'),
    ('project', 'delete', 'Delete projects'),
    ('project', 'view',   'View projects'),

    -- Questionnaire permissions
    ('questionnaire', 'create',  'Create new questionnaires'),
    ('questionnaire', 'edit',    'Edit existing questionnaires'),
    ('questionnaire', 'publish', 'Publish questionnaires'),
    ('questionnaire', 'delete',  'Delete questionnaires'),
    ('questionnaire', 'view',    'View questionnaires'),

    -- Response permissions
    ('response', 'view',   'View collected responses'),
    ('response', 'export', 'Export response data'),

    -- Media permissions
    ('media', 'upload', 'Upload media assets'),
    ('media', 'delete', 'Delete media assets'),

    -- User management
    ('user', 'manage', 'Manage user accounts'),

    -- Role management
    ('role', 'manage', 'Manage roles and permissions')
ON CONFLICT (resource, action) DO NOTHING;
