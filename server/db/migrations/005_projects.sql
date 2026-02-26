-- 005_projects.sql
-- Projects and project membership

-- =============================================================================
-- Projects
-- =============================================================================

CREATE TABLE public.projects (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name             varchar(255) NOT NULL,
    code             varchar(50)  NOT NULL,
    description      text,
    is_public        boolean     NOT NULL DEFAULT false,
    status           varchar(50) NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'archived', 'deleted')),
    max_participants integer,
    irb_number       varchar(100),
    start_date       date,
    end_date         date,
    settings         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_by       uuid        REFERENCES public.users(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz,
    UNIQUE (organization_id, code)
);

CREATE INDEX idx_projects_organization_id ON public.projects (organization_id);
CREATE INDEX idx_projects_code ON public.projects (code);
CREATE INDEX idx_projects_created_by ON public.projects (created_by);

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Project members
-- =============================================================================

CREATE TABLE public.project_members (
    project_id uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role       varchar(50) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user_id ON public.project_members (user_id);
