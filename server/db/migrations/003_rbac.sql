-- 003_rbac.sql
-- Role-based access control tables

-- =============================================================================
-- Roles
-- =============================================================================

CREATE TABLE public.roles (
    id          serial      PRIMARY KEY,
    name        varchar(50) UNIQUE NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Permissions
-- =============================================================================

CREATE TABLE public.permissions (
    id          serial      PRIMARY KEY,
    resource    varchar(50) NOT NULL,
    action      varchar(50) NOT NULL,
    description text,
    UNIQUE (resource, action)
);

-- =============================================================================
-- Role <-> Permission mapping
-- =============================================================================

CREATE TABLE public.role_permissions (
    role_id       integer NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id integer NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- =============================================================================
-- User <-> Role assignment (with optional scope)
-- scope_type / scope_id allow scoping a role to an organization or project.
-- A NULL scope means the role is global.
-- =============================================================================

CREATE TABLE public.user_roles (
    user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id     integer     NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    scope_type  varchar(50),
    scope_id    uuid,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    assigned_by uuid        REFERENCES public.users(id),
    PRIMARY KEY (
        user_id,
        role_id,
        COALESCE(scope_type, ''),
        COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')
    )
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX idx_user_roles_scope ON public.user_roles (scope_type, scope_id);
