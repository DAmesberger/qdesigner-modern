-- =====================================================
-- QDesigner Modern - Application Schema
-- =====================================================
-- This runs AFTER Supabase's built-in migrations
-- which create auth schema, roles, and auth.users table

-- =====================================================
-- 1. CORE MULTI-TENANT STRUCTURE
-- =====================================================

-- Organizations (Top-level Tenant)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  
  -- Organization settings
  settings JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Users (mirrors auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Authentication (via Supabase Auth)
  auth_id UUID UNIQUE NOT NULL, -- References auth.users
  email VARCHAR(255) UNIQUE NOT NULL,
  
  -- Profile
  full_name VARCHAR(255),
  avatar_url TEXT,
  
  -- Settings
  preferences JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Organization Members (junction table)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Organization-level role
  role VARCHAR(50) NOT NULL, -- 'owner', 'admin', 'member', 'viewer'
  
  -- Permissions override (for custom roles)
  custom_permissions JSONB,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',
  
  -- Metadata
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(organization_id, user_id),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

-- =====================================================
-- 2. PROJECT STRUCTURE
-- =====================================================

-- Projects (within Organizations)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Project details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Settings
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(organization_id, name)
);

-- Project Members (with project-specific roles)
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Project-level role (can differ from org role)
  role VARCHAR(50) NOT NULL,
  
  -- Permissions
  permissions JSONB DEFAULT '{}',
  
  -- Metadata
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(project_id, user_id)
);

-- =====================================================
-- 3. QUESTIONNAIRE STRUCTURE
-- =====================================================

-- Questionnaire Definitions
CREATE TABLE questionnaire_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Identification
  name VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  
  -- Structure
  definition JSONB NOT NULL, -- Complete questionnaire structure
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  
  -- Settings
  settings JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(project_id, name, version),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'testing', 'published', 'archived'))
);

-- =====================================================
-- 4. RUNTIME DATA STRUCTURE
-- =====================================================

-- Participants (can be anonymous)
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identification (optional for anonymous)
  external_id VARCHAR(255), -- External system ID
  email VARCHAR(255),
  
  -- Demographics (optional)
  demographics JSONB DEFAULT '{}',
  
  -- Authentication
  auth_id UUID, -- References auth.users if registered
  access_code VARCHAR(50), -- For anonymous access
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Privacy
  consent_given BOOLEAN DEFAULT false,
  consent_date TIMESTAMPTZ,
  data_retention_days INTEGER DEFAULT 365,
  
  -- Status
  is_anonymous BOOLEAN DEFAULT true,
  is_test_participant BOOLEAN DEFAULT false
);

-- Sessions (runtime instances)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id),
  participant_id UUID NOT NULL REFERENCES participants(id),
  
  -- Session info
  session_code VARCHAR(50) UNIQUE,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Progress
  current_page INTEGER DEFAULT 0,
  current_question_id VARCHAR(255),
  progress_percentage NUMERIC(5,2) DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',
  completion_status VARCHAR(50),
  
  -- Environment
  ip_address INET,
  user_agent TEXT,
  device_info JSONB DEFAULT '{}',
  
  -- Quality metrics
  quality_score NUMERIC(5,2),
  attention_checks_passed INTEGER DEFAULT 0,
  attention_checks_failed INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'completed', 'abandoned', 'expired'))
);

-- Responses
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id VARCHAR(255) NOT NULL,
  
  -- Response data
  value JSONB, -- Flexible response format
  
  -- Timing (microsecond precision)
  presented_at BIGINT, -- When question was shown
  responded_at BIGINT, -- When response was submitted
  reaction_time_us BIGINT, -- Calculated reaction time in microseconds
  
  -- Interaction tracking
  first_interaction_at BIGINT,
  interaction_count INTEGER DEFAULT 0,
  
  -- Response metadata
  is_valid BOOLEAN DEFAULT true,
  validation_errors JSONB,
  
  -- Versioning
  response_version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  client_timestamp BIGINT,
  
  -- Constraints
  CONSTRAINT unique_current_response UNIQUE(session_id, question_id, is_current) WHERE is_current = true
);

-- Interaction Events
CREATE TABLE interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Event info
  event_type VARCHAR(100) NOT NULL,
  event_target VARCHAR(255),
  event_data JSONB DEFAULT '{}',
  
  -- Timing (microsecond precision)
  timestamp_us BIGINT NOT NULL,
  client_timestamp_us BIGINT,
  
  -- Page/Question context
  page_id VARCHAR(255),
  question_id VARCHAR(255),
  
  -- Additional context
  x_coordinate INTEGER,
  y_coordinate INTEGER,
  
  -- Indexing helper
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session Variables (runtime variable state)
CREATE TABLE session_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Variable identification
  variable_name VARCHAR(255) NOT NULL,
  
  -- Value
  value JSONB NOT NULL,
  value_type VARCHAR(50) NOT NULL,
  
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  update_count INTEGER DEFAULT 1,
  
  -- Constraints
  UNIQUE(session_id, variable_name)
);

-- =====================================================
-- 5. ANALYTICS TABLES
-- =====================================================

-- Session Analytics (aggregated)
CREATE TABLE session_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Timing metrics
  total_duration_seconds INTEGER,
  active_duration_seconds INTEGER,
  
  -- Completion metrics
  questions_answered INTEGER DEFAULT 0,
  questions_skipped INTEGER DEFAULT 0,
  total_questions INTEGER,
  
  -- Quality metrics
  average_response_time_ms NUMERIC,
  median_response_time_ms NUMERIC,
  consistency_score NUMERIC(5,2),
  
  -- Engagement metrics
  total_interactions INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  
  -- Calculated at
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Analytics (aggregated)
CREATE TABLE project_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Date for aggregation
  date DATE NOT NULL,
  
  -- Participation metrics
  total_sessions INTEGER DEFAULT 0,
  completed_sessions INTEGER DEFAULT 0,
  unique_participants INTEGER DEFAULT 0,
  
  -- Quality metrics
  average_completion_rate NUMERIC(5,2),
  average_quality_score NUMERIC(5,2),
  
  -- Timing metrics
  average_duration_minutes NUMERIC,
  
  -- Calculated at
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(project_id, date)
);

-- =====================================================
-- 6. SUPPORT TABLES
-- =====================================================

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- Action
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  
  -- Changes
  old_values JSONB,
  new_values JSONB,
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Participant Groups
CREATE TABLE participant_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Group info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Criteria
  criteria JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(project_id, name)
);

-- Participant Group Members
CREATE TABLE participant_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES participant_groups(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  
  -- Metadata
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(group_id, participant_id)
);

-- =====================================================
-- 7. DATA MANAGEMENT TABLES
-- =====================================================

-- Export Jobs
CREATE TABLE export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  questionnaire_id UUID REFERENCES questionnaire_definitions(id),
  
  -- Request details
  requested_by UUID NOT NULL REFERENCES users(id),
  export_type VARCHAR(50) NOT NULL,
  format VARCHAR(50) NOT NULL,
  filters JSONB DEFAULT '{}',
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  progress NUMERIC(5,2) DEFAULT 0,
  
  -- Results
  file_url TEXT,
  file_size_bytes BIGINT,
  row_count INTEGER,
  error_message TEXT,
  
  -- Timing
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_export_type CHECK (export_type IN ('responses', 'sessions', 'participants', 'analytics')),
  CONSTRAINT valid_format CHECK (format IN ('csv', 'json', 'xlsx', 'spss'))
);

-- Data Retention Logs
CREATE TABLE data_retention_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Deletion info
  resource_type VARCHAR(100) NOT NULL,
  resource_count INTEGER NOT NULL,
  
  -- Reason
  reason VARCHAR(255) NOT NULL,
  deletion_confirmed BOOLEAN DEFAULT false,
  
  -- Timing
  scheduled_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7b. MEDIA MANAGEMENT TABLES
-- =====================================================

-- Media Assets
CREATE TABLE media_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  
  -- File information
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  
  -- Media metadata
  width INTEGER,
  height INTEGER,
  duration_seconds NUMERIC,
  thumbnail_path TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Access control
  is_public BOOLEAN DEFAULT false,
  access_level TEXT DEFAULT 'organization' CHECK (access_level IN ('private', 'organization', 'public')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_mime_type CHECK (mime_type ~ '^(image|video|audio)/'),
  CONSTRAINT valid_size CHECK (size_bytes > 0 AND size_bytes <= 52428800) -- 50MB max
);

-- Media Usage tracking
CREATE TABLE media_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  questionnaire_id UUID REFERENCES questionnaire_definitions(id) ON DELETE CASCADE,
  question_id TEXT,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('stimulus', 'instruction', 'feedback', 'background', 'option')),
  usage_context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(media_id, questionnaire_id, question_id, usage_type)
);

-- Media Permissions
CREATE TABLE media_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_role VARCHAR(50), -- 'owner', 'admin', 'member', 'viewer'
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'delete')),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  CONSTRAINT permission_target CHECK (
    (user_id IS NOT NULL AND organization_role IS NULL) OR 
    (user_id IS NULL AND organization_role IS NOT NULL)
  ),
  
  UNIQUE(media_id, user_id, permission),
  UNIQUE(media_id, organization_role, permission)
);

-- Media Collections
CREATE TABLE media_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, name)
);

-- Media Collection Items
CREATE TABLE media_collection_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES media_collections(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(collection_id, media_id)
);

-- =====================================================
-- 8. SYSTEM TABLES
-- =====================================================

-- Sync Queue
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  
  -- Sync data
  operation VARCHAR(50) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  data JSONB NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Key info
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(10) NOT NULL, -- For identification
  
  -- Permissions
  scopes TEXT[] DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =====================================================
-- 9. FLEXIBLE ROLE SYSTEM
-- =====================================================

-- Role Definitions
CREATE TABLE role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Role identification
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Scope
  scope VARCHAR(50) NOT NULL, -- 'system', 'organization', 'project'
  
  -- Permissions
  permissions JSONB NOT NULL DEFAULT '{}',
  
  -- Hierarchy
  inherits_from UUID REFERENCES role_definitions(id),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- Cannot be modified
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(scope, name),
  CONSTRAINT valid_scope CHECK (scope IN ('system', 'organization', 'project'))
);

-- Organization Roles (custom roles per org)
CREATE TABLE organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_definition_id UUID NOT NULL REFERENCES role_definitions(id),
  
  -- Customization
  custom_permissions JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organization_id, role_definition_id)
);

-- Project Roles (custom roles per project)
CREATE TABLE project_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_definition_id UUID NOT NULL REFERENCES role_definitions(id),
  
  -- Customization
  custom_permissions JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(project_id, role_definition_id)
);

-- =====================================================
-- 10. ROW LEVEL SECURITY
-- =====================================================
-- NOTE: RLS is disabled during development for easier iteration
-- Uncomment these lines when ready for production

-- Enable RLS on all tables
-- ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE questionnaire_definitions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE session_variables ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE participant_groups ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE participant_group_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE session_analytics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_analytics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE data_retention_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media_usage ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media_permissions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media_collections ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media_collection_items ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES (Commented out during development)
/*
-- Organization access policy
CREATE POLICY "Users can view organizations they belong to"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Add more policies as needed...
*/

-- =====================================================
-- 11. PERFORMANCE INDEXES
-- =====================================================

-- Multi-column indexes for common queries
CREATE INDEX idx_sessions_participant_status ON sessions(participant_id, status);
CREATE INDEX idx_responses_session_question ON responses(session_id, question_id) WHERE is_current = true;
CREATE INDEX idx_org_members_user_active ON organization_members(user_id, status) WHERE status = 'active';
CREATE INDEX idx_project_members_user_role ON project_members(user_id, role);

-- Partial indexes for active records
CREATE INDEX idx_projects_active_org ON projects(organization_id) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_questionnaires_published ON questionnaire_definitions(project_id, status) WHERE status = 'published';

-- JSONB indexes
CREATE INDEX idx_session_device_info ON sessions USING GIN (device_info);
CREATE INDEX idx_responses_value ON responses USING GIN (value);
CREATE INDEX idx_interaction_event_data ON interaction_events USING GIN (event_data);

-- Text search indexes
CREATE INDEX idx_projects_search ON projects USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_questionnaires_search ON questionnaire_definitions USING GIN (to_tsvector('english', name));

-- Media management indexes
CREATE INDEX idx_media_assets_organization ON media_assets(organization_id);
CREATE INDEX idx_media_assets_uploaded_by ON media_assets(uploaded_by);
CREATE INDEX idx_media_assets_mime_type ON media_assets(mime_type);
CREATE INDEX idx_media_assets_created_at ON media_assets(created_at DESC);
CREATE INDEX idx_media_usage_questionnaire ON media_usage(questionnaire_id);
CREATE INDEX idx_media_usage_media ON media_usage(media_id);
CREATE INDEX idx_media_permissions_media ON media_permissions(media_id);
CREATE INDEX idx_media_permissions_user ON media_permissions(user_id);
CREATE INDEX idx_media_permissions_role ON media_permissions(organization_role);
CREATE INDEX idx_media_collections_organization ON media_collections(organization_id);

-- =====================================================
-- 12. DEFAULT SYSTEM ROLES
-- =====================================================

-- Insert default system roles
INSERT INTO role_definitions (name, display_name, scope, permissions, is_system) VALUES
-- Organization roles
('owner', 'Owner', 'organization', '{"*": true}', true),
('admin', 'Administrator', 'organization', '{"users": ["create", "read", "update", "delete"], "projects": ["create", "read", "update", "delete"], "settings": ["read", "update"]}', true),
('member', 'Member', 'organization', '{"projects": ["read"], "questionnaires": ["create", "read", "update"], "responses": ["read"]}', true),
('viewer', 'Viewer', 'organization', '{"projects": ["read"], "questionnaires": ["read"], "responses": ["read"]}', true),

-- Project roles
('project_owner', 'Project Owner', 'project', '{"*": true}', true),
('project_admin', 'Project Admin', 'project', '{"questionnaires": ["create", "read", "update", "delete"], "participants": ["create", "read", "update", "delete"], "responses": ["read", "export"]}', true),
('project_member', 'Project Member', 'project', '{"questionnaires": ["read", "update"], "participants": ["read"], "responses": ["read"]}', true),
('project_viewer', 'Project Viewer', 'project', '{"questionnaires": ["read"], "responses": ["read"]}', true)
ON CONFLICT (scope, name) DO NOTHING;

-- =====================================================
-- 13. ONBOARDING SYSTEM TABLES
-- =====================================================

-- Organization Invitations
CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Invitation details
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  
  -- Token
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  
  -- Metadata
  invited_by UUID NOT NULL REFERENCES users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Organization Domains
CREATE TABLE organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Domain info
  domain VARCHAR(255) NOT NULL UNIQUE,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255),
  verified_at TIMESTAMPTZ,
  
  -- Auto-join settings
  auto_join_enabled BOOLEAN DEFAULT false,
  auto_join_role VARCHAR(50) DEFAULT 'member',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Email Verifications
CREATE TABLE email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User/Email
  user_id UUID REFERENCES users(id),
  email VARCHAR(255) NOT NULL,
  
  -- Token
  token VARCHAR(6) NOT NULL, -- 6-digit code
  token_hash VARCHAR(255) NOT NULL,
  
  -- Status
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes'),
  ip_address INET,
  
  -- Rate limiting
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ
);

-- Onboarding Events
CREATE TABLE onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  
  -- Event
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Indexes for onboarding
CREATE INDEX idx_invitations_org_status ON organization_invitations(organization_id, status);
CREATE INDEX idx_invitations_email ON organization_invitations(email);
CREATE INDEX idx_invitations_token ON organization_invitations(token);
CREATE INDEX idx_domains_org ON organization_domains(organization_id);
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX idx_email_verifications_email ON email_verifications(email);
CREATE INDEX idx_onboarding_events_user ON onboarding_events(user_id);
CREATE INDEX idx_onboarding_events_org ON onboarding_events(organization_id);

-- =====================================================
-- RLS Policies for Onboarding Tables
-- =====================================================

-- Email Verifications RLS
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Allow anon users to insert verifications (needed for signup flow)
CREATE POLICY "Allow anon to insert verifications" ON email_verifications
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow authenticated users to manage their own verifications
CREATE POLICY "Allow authenticated to manage own verifications" ON email_verifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- =====================================================
-- ONBOARDING FUNCTIONS
-- =====================================================

-- Generate verification code
CREATE OR REPLACE FUNCTION generate_verification_code()
RETURNS TEXT AS $$
DECLARE
  code TEXT;
BEGIN
  -- Generate 6-digit code
  code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Check if domain auto-join is enabled
CREATE OR REPLACE FUNCTION check_domain_auto_join(email_address TEXT)
RETURNS TABLE(
  organization_id UUID,
  auto_join_role VARCHAR(50)
) AS $$
BEGIN
  RETURN QUERY
  SELECT od.organization_id, od.auto_join_role
  FROM organization_domains od
  WHERE od.domain = SPLIT_PART(email_address, '@', 2)
    AND od.is_verified = true
    AND od.auto_join_enabled = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Accept invitation
CREATE OR REPLACE FUNCTION accept_invitation(invitation_token UUID, accepting_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Get invitation
  SELECT * INTO inv FROM organization_invitations
  WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > NOW();
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Create organization member
  INSERT INTO organization_members (organization_id, user_id, role, invited_by)
  VALUES (inv.organization_id, accepting_user_id, inv.role, inv.invited_by)
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  
  -- Update invitation status
  UPDATE organization_invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = inv.id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- UPDATED FUNCTIONS SECTION
-- =====================================================

-- Update function to calculate session analytics
CREATE OR REPLACE FUNCTION calculate_session_analytics(p_session_id UUID)
RETURNS void AS $$
DECLARE
  v_session RECORD;
  v_analytics RECORD;
BEGIN
  -- Get session info
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Calculate analytics
  WITH response_times AS (
    SELECT 
      (responded_at - presented_at) / 1000 AS response_time_ms
    FROM responses
    WHERE session_id = p_session_id
      AND is_current = true
      AND responded_at IS NOT NULL
      AND presented_at IS NOT NULL
  ),
  metrics AS (
    SELECT
      COUNT(*) FILTER (WHERE r.value IS NOT NULL) AS questions_answered,
      COUNT(*) FILTER (WHERE r.value IS NULL) AS questions_skipped,
      AVG(rt.response_time_ms) AS avg_response_time,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rt.response_time_ms) AS median_response_time,
      COUNT(DISTINCT ie.id) AS total_interactions,
      COUNT(DISTINCT ie.page_id) AS page_views
    FROM responses r
    LEFT JOIN response_times rt ON true
    LEFT JOIN interaction_events ie ON ie.session_id = p_session_id
    WHERE r.session_id = p_session_id AND r.is_current = true
  )
  SELECT * INTO v_analytics FROM metrics;
  
  -- Insert or update analytics
  INSERT INTO session_analytics (
    session_id,
    total_duration_seconds,
    questions_answered,
    questions_skipped,
    average_response_time_ms,
    median_response_time_ms,
    total_interactions,
    page_views
  ) VALUES (
    p_session_id,
    EXTRACT(EPOCH FROM (v_session.completed_at - v_session.started_at)),
    v_analytics.questions_answered,
    v_analytics.questions_skipped,
    v_analytics.avg_response_time,
    v_analytics.median_response_time,
    v_analytics.total_interactions,
    v_analytics.page_views
  )
  ON CONFLICT (session_id) DO UPDATE SET
    total_duration_seconds = EXCLUDED.total_duration_seconds,
    questions_answered = EXCLUDED.questions_answered,
    questions_skipped = EXCLUDED.questions_skipped,
    average_response_time_ms = EXCLUDED.average_response_time_ms,
    median_response_time_ms = EXCLUDED.median_response_time_ms,
    total_interactions = EXCLUDED.total_interactions,
    page_views = EXCLUDED.page_views,
    calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_questionnaire_definitions_updated_at BEFORE UPDATE ON questionnaire_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_role_definitions_updated_at BEFORE UPDATE ON role_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create triggers for onboarding tables
CREATE TRIGGER update_organization_invitations_updated_at
  BEFORE UPDATE ON organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_domains_updated_at
  BEFORE UPDATE ON organization_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_collections_updated_at
  BEFORE UPDATE ON media_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void AS $$
BEGIN
  UPDATE organization_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user creation
-- This will be used by Supabase Auth hooks
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (auth_id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 13b. MEDIA MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to clean up unused media
CREATE OR REPLACE FUNCTION cleanup_unused_media()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  count INTEGER;
BEGIN
  DELETE FROM media_assets
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM media_usage
    WHERE media_id = media_assets.id
  );
  
  GET DIAGNOSTICS count = ROW_COUNT;
  RETURN QUERY SELECT count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get media access level for a user
CREATE OR REPLACE FUNCTION get_media_access_level(
  p_media_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TEXT AS $$
DECLARE
  v_access_level TEXT;
BEGIN
  -- Check if user owns the media
  IF EXISTS (
    SELECT 1 FROM media_assets
    WHERE id = p_media_id AND uploaded_by = p_user_id
  ) THEN
    RETURN 'owner';
  END IF;
  
  -- Check explicit permissions
  SELECT permission INTO v_access_level
  FROM media_permissions
  WHERE media_id = p_media_id
  AND user_id = p_user_id
  AND (expires_at IS NULL OR expires_at > NOW())
  ORDER BY 
    CASE permission 
      WHEN 'delete' THEN 1
      WHEN 'edit' THEN 2
      WHEN 'view' THEN 3
    END
  LIMIT 1;
  
  IF v_access_level IS NOT NULL THEN
    RETURN v_access_level;
  END IF;
  
  -- Check role-based permissions
  SELECT mp.permission INTO v_access_level
  FROM media_permissions mp
  JOIN organization_members om ON mp.organization_role = om.role
  JOIN media_assets ma ON mp.media_id = ma.id
  WHERE mp.media_id = p_media_id
  AND om.user_id = p_user_id
  AND om.organization_id = ma.organization_id
  AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
  ORDER BY 
    CASE mp.permission 
      WHEN 'delete' THEN 1
      WHEN 'edit' THEN 2
      WHEN 'view' THEN 3
    END
  LIMIT 1;
  
  IF v_access_level IS NOT NULL THEN
    RETURN v_access_level;
  END IF;
  
  -- Check organization membership
  IF EXISTS (
    SELECT 1 FROM media_assets ma
    JOIN organization_members om ON ma.organization_id = om.organization_id
    WHERE ma.id = p_media_id
    AND om.user_id = p_user_id
    AND ma.access_level IN ('organization', 'public')
  ) THEN
    RETURN 'view';
  END IF;
  
  -- Check if media is public
  IF EXISTS (
    SELECT 1 FROM media_assets
    WHERE id = p_media_id AND is_public = true
  ) THEN
    RETURN 'view';
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 14. GRANT PERMISSIONS
-- =====================================================

-- Grant usage on all sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant permissions on functions
GRANT EXECUTE ON FUNCTION calculate_session_analytics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_domain_auto_join(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_verification_code() TO authenticated;
GRANT EXECUTE ON FUNCTION accept_invitation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_unused_media() TO authenticated;
GRANT EXECUTE ON FUNCTION get_media_access_level(UUID, UUID) TO authenticated;

-- Grant permissions on onboarding tables
GRANT ALL ON organization_invitations TO anon, authenticated;
GRANT ALL ON organization_domains TO anon, authenticated;
GRANT ALL ON email_verifications TO anon, authenticated;
GRANT ALL ON onboarding_events TO anon, authenticated;

-- Grant permissions on media tables
GRANT ALL ON media_assets TO authenticated;
GRANT ALL ON media_usage TO authenticated;
GRANT ALL ON media_permissions TO authenticated;
GRANT ALL ON media_collections TO authenticated;
GRANT ALL ON media_collection_items TO authenticated;

-- =====================================================
-- 15. TEST HELPERS (Development Only)
-- =====================================================
-- Create helper functions for testing
-- These functions allow test suites to create isolated schemas

-- Function to create a test schema
CREATE OR REPLACE FUNCTION create_schema(schema_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to drop a test schema
CREATE OR REPLACE FUNCTION drop_schema(schema_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to execute arbitrary SQL (for testing only)
-- This should be restricted to test environments
CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
RETURNS void AS $$
BEGIN
  -- Only allow in test/development environments
  IF current_setting('app.environment', true) NOT IN ('test', 'development', '') THEN
    RAISE EXCEPTION 'exec_sql is not allowed in production';
  END IF;
  
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users (for testing)
GRANT EXECUTE ON FUNCTION create_schema(text) TO authenticated;
GRANT EXECUTE ON FUNCTION drop_schema(text) TO authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;

-- Create a test helper table for tracking test runs
CREATE TABLE IF NOT EXISTS test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cleaned'))
);

-- Index for cleanup queries
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_test_runs_started_at ON test_runs(started_at);

-- Function to register a test run
CREATE OR REPLACE FUNCTION register_test_run(
  p_test_name TEXT,
  p_schema_name TEXT
) RETURNS UUID AS $$
DECLARE
  v_test_id UUID;
BEGIN
  INSERT INTO test_runs (test_name, schema_name, status)
  VALUES (p_test_name, p_schema_name, 'running')
  RETURNING id INTO v_test_id;
  
  RETURN v_test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark test as completed
CREATE OR REPLACE FUNCTION complete_test_run(
  p_test_id UUID,
  p_status TEXT DEFAULT 'completed'
) RETURNS void AS $$
BEGIN
  UPDATE test_runs
  SET 
    completed_at = NOW(),
    status = p_status
  WHERE id = p_test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old test schemas
CREATE OR REPLACE FUNCTION cleanup_old_test_schemas(
  p_older_than INTERVAL DEFAULT '1 hour'
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_schema TEXT;
BEGIN
  -- Find and clean up old test schemas
  FOR v_schema IN
    SELECT schema_name
    FROM test_runs
    WHERE 
      status IN ('completed', 'failed')
      AND completed_at < NOW() - p_older_than
  LOOP
    PERFORM drop_schema(v_schema);
    
    UPDATE test_runs
    SET status = 'cleaned'
    WHERE schema_name = v_schema;
    
    v_count := v_count + 1;
  END LOOP;
  
  -- Also clean up any orphaned test schemas
  FOR v_schema IN
    SELECT schema_name
    FROM information_schema.schemata
    WHERE 
      schema_name LIKE 'test_%'
      AND schema_name NOT IN (
        SELECT DISTINCT schema_name 
        FROM test_runs 
        WHERE status IN ('running', 'completed')
      )
  LOOP
    PERFORM drop_schema(v_schema);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON test_runs TO authenticated;
GRANT EXECUTE ON FUNCTION register_test_run(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_test_run(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_test_schemas(INTERVAL) TO authenticated;

-- =====================================================
-- 15. GRANT PERMISSIONS FOR MAIN TABLES
-- =====================================================
-- Grant access to tables for authenticated users
GRANT ALL ON users TO authenticated;
GRANT ALL ON organizations TO authenticated;
GRANT ALL ON organization_members TO authenticated;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON project_members TO authenticated;
GRANT ALL ON questionnaire_definitions TO authenticated;
GRANT ALL ON questions TO authenticated;
GRANT ALL ON sessions TO authenticated;
GRANT ALL ON participants TO authenticated;
GRANT ALL ON participant_groups TO authenticated;
GRANT ALL ON participant_group_members TO authenticated;
GRANT ALL ON responses TO authenticated;
GRANT ALL ON response_latencies TO authenticated;
GRANT ALL ON response_metadata TO authenticated;
GRANT ALL ON skip_patterns TO authenticated;
GRANT ALL ON display_conditions TO authenticated;
GRANT ALL ON variables TO authenticated;
GRANT ALL ON flow_controls TO authenticated;
GRANT ALL ON custom_scripts TO authenticated;
GRANT ALL ON role_definitions TO authenticated;
GRANT ALL ON role_permissions TO authenticated;
GRANT ALL ON api_keys TO authenticated;
GRANT ALL ON export_jobs TO authenticated;
GRANT ALL ON file_uploads TO authenticated;
GRANT ALL ON analytics_aggregates TO authenticated;
GRANT ALL ON audit_logs TO authenticated;
GRANT ALL ON error_logs TO authenticated;
GRANT ALL ON data_retention_logs TO authenticated;

-- =====================================================
-- 16. DEMO DATA (Optional)
-- =====================================================
-- Insert a demo user in public.users table
-- The actual auth user will be created through Supabase Auth
INSERT INTO public.users (auth_id, email, full_name, created_at, updated_at)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'demo@example.com', 'Demo User', NOW(), NOW())
ON CONFLICT (auth_id) DO NOTHING;

-- =====================================================
-- END OF APPLICATION SCHEMA
-- =====================================================
-- Note: To sync auth.users to public.users, create a trigger 
-- in Supabase Dashboard under Authentication > Hooks:
-- Trigger: on_auth_user_created
-- Function: public.handle_new_user()