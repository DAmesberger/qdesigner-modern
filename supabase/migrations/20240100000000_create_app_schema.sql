-- Create application tables for QDesigner Modern

-- Users table (synced with auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id uuid UNIQUE NOT NULL,
    email varchar(255) UNIQUE NOT NULL,
    full_name varchar(255),
    avatar_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    slug varchar(255) UNIQUE NOT NULL,
    domain varchar(255),
    logo_url text,
    settings jsonb DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);

-- Organization members
CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    role varchar(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status varchar(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    joined_at timestamptz DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    code varchar(50) NOT NULL,
    description text,
    is_public boolean DEFAULT false,
    status varchar(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    max_participants integer,
    irb_number varchar(100),
    start_date date,
    end_date date,
    settings jsonb DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE(organization_id, code)
);

-- Project members
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    role varchar(50) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    joined_at timestamptz DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- Questionnaire definitions
CREATE TABLE IF NOT EXISTS public.questionnaire_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    version integer NOT NULL DEFAULT 1,
    content jsonb NOT NULL DEFAULT '{}'::jsonb,
    status varchar(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    settings jsonb DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    published_at timestamptz,
    deleted_at timestamptz,
    UNIQUE(project_id, name, version)
);

-- Questionnaire responses
CREATE TABLE IF NOT EXISTS public.questionnaire_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id uuid REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    session_id uuid,
    participant_id varchar(255),
    status varchar(50) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    last_activity_at timestamptz DEFAULT now(),
    responses jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    completion_percentage numeric(5,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_id uuid REFERENCES public.questionnaire_definitions(id) ON DELETE CASCADE,
    participant_id varchar(255),
    status varchar(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'expired')),
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    last_activity_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    browser_info jsonb,
    ip_address inet,
    created_at timestamptz DEFAULT now()
);

-- Responses table
CREATE TABLE IF NOT EXISTS public.responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
    question_id varchar(255) NOT NULL,
    value jsonb NOT NULL,
    reaction_time_us bigint,
    presented_at timestamptz,
    answered_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_users_auth_id ON public.users(auth_id);
CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_projects_organization_id ON public.projects(organization_id);
CREATE INDEX idx_projects_code ON public.projects(code);
CREATE INDEX idx_questionnaire_definitions_project_id ON public.questionnaire_definitions(project_id);
CREATE INDEX idx_questionnaire_responses_questionnaire_id ON public.questionnaire_responses(questionnaire_id);
CREATE INDEX idx_sessions_questionnaire_id ON public.sessions(questionnaire_id);
CREATE INDEX idx_responses_session_id ON public.responses(session_id);

-- Create trigger to sync auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_full_name TEXT;
BEGIN
    -- Extract full name from metadata or use email
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );
    
    -- Insert or update user in public.users
    INSERT INTO public.users (auth_id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        v_full_name
    )
    ON CONFLICT (auth_id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
        updated_at = now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW 
    WHEN (OLD.email IS DISTINCT FROM NEW.email OR OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data)
    EXECUTE FUNCTION public.handle_new_user();

-- Sync any existing auth users to public.users
INSERT INTO public.users (auth_id, email, full_name)
SELECT 
    id,
    email,
    COALESCE(
        raw_user_meta_data->>'full_name',
        raw_user_meta_data->>'name',
        split_part(email, '@', 1)
    )
FROM auth.users
ON CONFLICT (auth_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    updated_at = now();

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questionnaire_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth_id = auth.uid());

-- Questionnaire definitions policies
CREATE POLICY "Users can view their organization questionnaires" ON public.questionnaire_definitions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = questionnaire_definitions.project_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "Users can create questionnaires" ON public.questionnaire_definitions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = project_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "Users can update their questionnaires" ON public.questionnaire_definitions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = questionnaire_definitions.project_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "Users can delete their questionnaires" ON public.questionnaire_definitions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            JOIN users u ON u.id = om.user_id
            WHERE p.id = questionnaire_definitions.project_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth_id = auth.uid());