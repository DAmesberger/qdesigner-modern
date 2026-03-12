-- 006_questionnaires.sql
-- Questionnaire definitions

CREATE TABLE public.questionnaire_definitions (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name         varchar(255) NOT NULL,
    description  text,
    version      integer     NOT NULL DEFAULT 1,
    content      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status       varchar(50) NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'published', 'archived')),
    settings     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_by   uuid        REFERENCES public.users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    deleted_at   timestamptz,
    UNIQUE (project_id, name, version)
);

CREATE INDEX idx_questionnaire_defs_project_id ON public.questionnaire_definitions (project_id);
CREATE INDEX idx_questionnaire_defs_status ON public.questionnaire_definitions (status);
CREATE INDEX idx_questionnaire_defs_created_by ON public.questionnaire_definitions (created_by);

CREATE TRIGGER trg_questionnaire_defs_updated_at
    BEFORE UPDATE ON public.questionnaire_definitions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
