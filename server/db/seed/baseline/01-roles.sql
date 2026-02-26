-- 01-roles.sql
-- Baseline roles (always applied)

INSERT INTO public.roles (id, name, description) VALUES
    (1, 'super_admin', 'Full system access across all organizations'),
    (2, 'admin',       'Organization-level administrative access'),
    (3, 'editor',      'Can create and edit projects and questionnaires'),
    (4, 'viewer',      'Read-only access to projects and questionnaires'),
    (5, 'participant', 'Participant in questionnaire sessions')
ON CONFLICT (name) DO NOTHING;

-- Ensure the serial sequence stays ahead of our manual IDs
SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM public.roles), 5));
