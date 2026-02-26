-- 03-role-permissions.sql
-- Map permissions to roles (always applied)

-- Clear existing mappings to ensure idempotency
DELETE FROM public.role_permissions;

-- super_admin (role 1): ALL permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 1, id FROM public.permissions;

-- admin (role 2): org management, all project/questionnaire/response/media ops
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 2, p.id FROM public.permissions p
WHERE (p.resource, p.action) IN (
    ('organization', 'manage'),
    ('organization', 'view'),
    ('organization', 'invite'),
    ('project',      'create'),
    ('project',      'edit'),
    ('project',      'delete'),
    ('project',      'view'),
    ('questionnaire','create'),
    ('questionnaire','edit'),
    ('questionnaire','publish'),
    ('questionnaire','delete'),
    ('questionnaire','view'),
    ('response',     'view'),
    ('response',     'export'),
    ('media',        'upload'),
    ('media',        'delete')
);

-- editor (role 3): project create/edit/view, questionnaire create/edit/view, media upload, response view
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 3, p.id FROM public.permissions p
WHERE (p.resource, p.action) IN (
    ('project',      'create'),
    ('project',      'edit'),
    ('project',      'view'),
    ('questionnaire','create'),
    ('questionnaire','edit'),
    ('questionnaire','view'),
    ('media',        'upload'),
    ('response',     'view')
);

-- viewer (role 4): read-only across org, projects, questionnaires, responses
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 4, p.id FROM public.permissions p
WHERE (p.resource, p.action) IN (
    ('organization', 'view'),
    ('project',      'view'),
    ('questionnaire','view'),
    ('response',     'view')
);

-- participant (role 5): no explicit permissions (session access is handled
-- through the participant session flow, not the RBAC system)
