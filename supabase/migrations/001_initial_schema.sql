-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types
CREATE TYPE user_role AS ENUM ('admin', 'designer', 'analyst', 'participant');
CREATE TYPE questionnaire_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE question_type AS ENUM ('text', 'choice', 'scale', 'matrix', 'ranking', 'drawing', 'media');
CREATE TYPE answer_type AS ENUM ('text', 'single_choice', 'multiple_choice', 'scale', 'matrix', 'ranking', 'keypress', 'mouse', 'drawing');

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role DEFAULT 'participant',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questionnaires table
CREATE TABLE questionnaires (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    status questionnaire_status DEFAULT 'draft',
    version INTEGER DEFAULT 1,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

-- Questionnaire versions for history
CREATE TABLE questionnaire_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data JSONB NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(questionnaire_id, version)
);

-- Pages table
CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    name TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Questions table
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    type question_type NOT NULL,
    text TEXT NOT NULL,
    settings JSONB DEFAULT '{}',
    validation JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Answer options table (for choice questions)
CREATE TABLE answer_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Variables table
CREATE TABLE variables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    formula TEXT,
    default_value JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(questionnaire_id, name)
);

-- Response sessions table
CREATE TABLE response_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    questionnaire_version INTEGER NOT NULL,
    participant_id UUID REFERENCES users(id) ON DELETE SET NULL,
    anonymous_id TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    user_agent TEXT,
    ip_address INET
);

-- Responses table with high-precision timing
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES response_sessions(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    answer_type answer_type NOT NULL,
    value JSONB NOT NULL,
    -- High-precision timing fields
    started_at TIMESTAMPTZ NOT NULL,
    started_at_precise BIGINT NOT NULL, -- microseconds since epoch
    completed_at TIMESTAMPTZ NOT NULL,
    completed_at_precise BIGINT NOT NULL, -- microseconds since epoch
    response_time_ms NUMERIC(10, 3) GENERATED ALWAYS AS (
        (completed_at_precise - started_at_precise) / 1000.0
    ) STORED,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis configurations table
CREATE TABLE analysis_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config JSONB NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media files table (for questions and responses)
CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    response_id UUID REFERENCES responses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (questionnaire_id IS NOT NULL AND question_id IS NULL AND response_id IS NULL) OR
        (questionnaire_id IS NULL AND question_id IS NOT NULL AND response_id IS NULL) OR
        (questionnaire_id IS NULL AND question_id IS NULL AND response_id IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_questionnaires_organization ON questionnaires(organization_id);
CREATE INDEX idx_questionnaires_status ON questionnaires(status);
CREATE INDEX idx_pages_questionnaire ON pages(questionnaire_id);
CREATE INDEX idx_questions_page ON questions(page_id);
CREATE INDEX idx_questions_questionnaire ON questions(questionnaire_id);
CREATE INDEX idx_answer_options_question ON answer_options(question_id);
CREATE INDEX idx_variables_questionnaire ON variables(questionnaire_id);
CREATE INDEX idx_response_sessions_questionnaire ON response_sessions(questionnaire_id);
CREATE INDEX idx_responses_session ON responses(session_id);
CREATE INDEX idx_responses_question ON responses(question_id);
CREATE INDEX idx_responses_timing ON responses(started_at_precise, completed_at_precise);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_questionnaires_updated_at BEFORE UPDATE ON questionnaires
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_pages_updated_at BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_variables_updated_at BEFORE UPDATE ON variables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_analysis_configs_updated_at BEFORE UPDATE ON analysis_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS) policies will be added in the next migration