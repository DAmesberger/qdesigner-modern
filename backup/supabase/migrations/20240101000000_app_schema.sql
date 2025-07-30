-- =====================================================
-- QDesigner Modern - Complete Database Schema
-- =====================================================
-- This is the complete database initialization for QDesigner Modern
-- including multi-tenant architecture, flexible roles, and runtime data

-- NOTE: Supabase automatically creates:
-- - Roles: authenticator, anon, authenticated, service_role
-- - Schemas: auth, storage, realtime
-- - Auth functions: auth.uid(), auth.jwt()
-- - Storage tables: storage.buckets, storage.objects

-- Note: The auth.users table will be created by Supabase Auth service
-- We'll add fixes for it after the database is initialized

-- =====================================================
-- 1. EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 2. CORE MULTI-TENANT STRUCTURE
-- =====================================================

-- Organizations (Top-level Tenant)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL, -- URL-friendly identifier
  
  -- Subscription & Billing
  subscription_tier VARCHAR(50) DEFAULT 'free', -- 'free', 'professional', 'team', 'enterprise'
  subscription_status VARCHAR(50) DEFAULT 'active', -- 'active', 'suspended', 'cancelled'
  subscription_expires_at TIMESTAMPTZ,
  billing_email VARCHAR(255),
  
  -- Settings & Limits
  settings JSONB DEFAULT '{}',
  max_projects INTEGER DEFAULT 1,
  max_users INTEGER DEFAULT 5,
  max_responses_per_month INTEGER DEFAULT 100,
  storage_quota_gb INTEGER DEFAULT 1,
  
  -- Features
  features JSONB DEFAULT '{}', -- Feature flags
  
  -- Compliance
  data_retention_days INTEGER DEFAULT 365,
  require_2fa BOOLEAN DEFAULT false,
  sso_enabled BOOLEAN DEFAULT false,
  sso_config JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- Soft delete
);

-- Organization indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_active ON organizations(subscription_status) WHERE deleted_at IS NULL;

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Authentication (via Supabase Auth)
  auth_id UUID UNIQUE NOT NULL, -- References auth.users
  email VARCHAR(255) UNIQUE NOT NULL,
  
  -- Profile
  full_name VARCHAR(255),
  avatar_url TEXT,
  timezone VARCHAR(50) DEFAULT 'UTC',
  locale VARCHAR(10) DEFAULT 'en',
  
  -- Settings
  preferences JSONB DEFAULT '{}',
  notification_settings JSONB DEFAULT '{}',
  
  -- Security
  last_login_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- Soft delete
);

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_id ON users(auth_id);

-- Organization Membership & Roles
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Organization-level role
  role VARCHAR(50) NOT NULL, -- 'owner', 'admin', 'member', 'viewer'
  
  -- Permissions override (for custom roles)
  custom_permissions JSONB,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'invited', 'suspended'
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organization_id, user_id)
);

-- Membership indexes
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_status ON organization_members(status);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  code VARCHAR(50), -- Short identifier for participants
  
  -- Settings
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false, -- Can be accessed without login
  
  -- Research metadata
  irb_number VARCHAR(100),
  ethical_approval_date DATE,
  principal_investigator_id UUID REFERENCES users(id),
  
  -- Limits
  max_participants INTEGER,
  max_sessions_per_participant INTEGER DEFAULT 1,
  
  -- Scheduling
  start_date DATE,
  end_date DATE,
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Data management
  data_retention_override_days INTEGER, -- Override org default
  auto_delete_after_days INTEGER,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(organization_id, code)
);

-- Project indexes
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_code ON projects(code);
CREATE INDEX idx_projects_active ON projects(is_active) WHERE deleted_at IS NULL;

-- Project Members & Roles
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Project-level role
  role VARCHAR(50) NOT NULL, -- 'owner', 'editor', 'analyst', 'data_collector', 'viewer'
  
  -- Granular permissions
  permissions JSONB DEFAULT '{}', -- {"edit_questionnaire": true, "view_data": true, etc.}
  
  -- Assignment
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Metadata
  last_accessed_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(project_id, user_id)
);

-- Project member indexes
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Role Definitions
CREATE TABLE role_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Role info
  name VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Scope
  scope VARCHAR(20) NOT NULL, -- 'organization' or 'project'
  
  -- Permissions
  permissions JSONB NOT NULL, -- Detailed permission matrix
  
  -- System role flag
  is_system BOOLEAN DEFAULT false, -- Cannot be modified
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(organization_id, scope, name)
);

-- =====================================================
-- 3. QUESTIONNAIRE MANAGEMENT
-- =====================================================

-- Questionnaire Definitions (versioned)
CREATE TABLE questionnaire_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Identification
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50), -- Short identifier
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Content
  definition JSONB NOT NULL, -- Complete questionnaire structure
  
  -- Scripting
  global_scripts JSONB, -- Shared scripts across questions
  variables JSONB, -- Variable definitions
  
  -- Version control
  parent_version_id UUID REFERENCES questionnaire_definitions(id),
  changelog JSONB, -- What changed in this version
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'testing', 'published', 'archived'
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id),
  
  -- Settings
  settings JSONB DEFAULT '{}',
  
  -- Metadata
  tags TEXT[],
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(project_id, code, version)
);

-- Questionnaire indexes
CREATE INDEX idx_questionnaires_project ON questionnaire_definitions(project_id);
CREATE INDEX idx_questionnaires_status ON questionnaire_definitions(status);
CREATE INDEX idx_questionnaires_version ON questionnaire_definitions(project_id, code, version);

-- =====================================================
-- 4. PARTICIPANTS & SESSIONS
-- =====================================================

-- Participants
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Identification (optional for anonymous)
  email VARCHAR(255),
  external_id VARCHAR(255), -- Organization's participant ID
  
  -- Authentication
  auth_id UUID, -- References auth.users if registered
  access_code VARCHAR(50), -- For anonymous access
  
  -- Profile (optional)
  demographics JSONB, -- Encrypted if contains PII
  
  -- Consent
  consent_given BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  consent_version VARCHAR(50),
  
  -- Privacy
  is_anonymous BOOLEAN DEFAULT true,
  data_retention_consent BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(organization_id, email),
  UNIQUE(organization_id, external_id)
);

-- Participant indexes
CREATE INDEX idx_participants_org ON participants(organization_id);
CREATE INDEX idx_participants_email ON participants(email);
CREATE INDEX idx_participants_external ON participants(external_id);

-- Participant Groups
CREATE TABLE participant_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Group info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Assignment rules
  assignment_method VARCHAR(50), -- 'manual', 'random', 'criteria'
  assignment_criteria JSONB, -- For automatic assignment
  
  -- Size limits
  max_size INTEGER,
  current_size INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group membership
CREATE TABLE participant_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES participant_groups(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  
  -- Assignment
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_method VARCHAR(50), -- 'manual', 'random', 'criteria'
  
  -- Constraints
  UNIQUE(group_id, participant_id)
);

-- =====================================================
-- 5. RUNTIME DATA
-- =====================================================

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id),
  participant_id UUID REFERENCES participants(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  
  -- Group assignment
  group_id UUID REFERENCES participant_groups(id),
  
  -- Access
  access_code VARCHAR(50) UNIQUE, -- For sharing session links
  password_hash TEXT, -- Optional password protection
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'not_started',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  
  -- Progress tracking
  current_question_id VARCHAR(255),
  current_page_id VARCHAR(255),
  progress_percentage INTEGER DEFAULT 0,
  navigation_history JSONB DEFAULT '[]',
  
  -- Device & environment info
  device_info JSONB,
  browser_info JSONB,
  ip_address INET,
  
  -- Offline support
  offline_start BOOLEAN DEFAULT false,
  sync_status VARCHAR(50) DEFAULT 'synced',
  last_sync_at TIMESTAMPTZ,
  
  -- Quality metrics
  completion_quality_score NUMERIC(3,2), -- 0-1 score
  attention_check_passed BOOLEAN,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session indexes
CREATE INDEX idx_sessions_questionnaire ON sessions(questionnaire_id);
CREATE INDEX idx_sessions_participant ON sessions(participant_id);
CREATE INDEX idx_sessions_project ON sessions(project_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_access_code ON sessions(access_code);

-- Response Data
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id VARCHAR(255) NOT NULL,
  
  -- Response value
  value JSONB NOT NULL,
  value_encrypted BYTEA, -- For sensitive data
  encryption_key_id UUID,
  
  -- Data quality
  confidence_score NUMERIC(3,2), -- For ML-based responses
  validation_status VARCHAR(50), -- 'valid', 'suspicious', 'invalid'
  
  -- Timing data (microsecond precision)
  stimulus_onset_us BIGINT,
  response_time_us BIGINT,
  reaction_time_us BIGINT,
  time_on_question_ms INTEGER,
  
  -- Version tracking
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  previous_version_id UUID REFERENCES responses(id),
  change_reason VARCHAR(255), -- Why was it changed
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  client_timestamp TIMESTAMPTZ
);

-- Response indexes
CREATE INDEX idx_responses_session ON responses(session_id);
CREATE INDEX idx_responses_current ON responses(session_id, is_current) WHERE is_current = true;
CREATE INDEX idx_responses_timing ON responses(session_id, stimulus_onset_us);

-- Interaction Events
CREATE TABLE interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id VARCHAR(255),
  
  -- Event details
  event_type VARCHAR(50) NOT NULL,
  event_category VARCHAR(50), -- 'input', 'navigation', 'timing', 'error'
  event_data JSONB NOT NULL,
  
  -- Target information
  target_element VARCHAR(255), -- CSS selector or element ID
  target_value TEXT, -- Current value if applicable
  
  -- Timing (microsecond precision)
  timestamp_us BIGINT NOT NULL,
  relative_time_us BIGINT,
  
  -- Performance data
  frame_number INTEGER,
  frame_time_ms NUMERIC(6,3),
  
  -- Context
  page_visible BOOLEAN DEFAULT true,
  window_focused BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interaction indexes
CREATE INDEX idx_interactions_session ON interaction_events(session_id);
CREATE INDEX idx_interactions_type ON interaction_events(event_type);
CREATE INDEX idx_interactions_time ON interaction_events(session_id, timestamp_us);

-- Session Variables
CREATE TABLE session_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Variable data
  name VARCHAR(255) NOT NULL,
  value JSONB NOT NULL,
  type VARCHAR(50) NOT NULL,
  scope VARCHAR(20) DEFAULT 'global', -- 'global', 'page', 'local'
  
  -- Computed variables
  formula TEXT,
  dependencies TEXT[], -- Other variable names
  
  -- Tracking
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_question VARCHAR(255),
  update_count INTEGER DEFAULT 0,
  
  -- Constraints
  UNIQUE(session_id, name)
);

-- Variable indexes
CREATE INDEX idx_variables_session ON session_variables(session_id);
CREATE INDEX idx_variables_updated ON session_variables(last_updated_at);

-- =====================================================
-- 6. ANALYTICS & REPORTING
-- =====================================================

-- Session Analytics
CREATE TABLE session_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Timing metrics
  total_duration_ms INTEGER,
  active_duration_ms INTEGER, -- Excluding idle time
  average_question_time_ms INTEGER,
  
  -- Interaction metrics
  total_clicks INTEGER DEFAULT 0,
  total_keypresses INTEGER DEFAULT 0,
  total_corrections INTEGER DEFAULT 0, -- Changed answers
  
  -- Navigation metrics
  back_navigation_count INTEGER DEFAULT 0,
  skip_count INTEGER DEFAULT 0,
  
  -- Quality metrics
  straight_lining_score NUMERIC(3,2), -- Detecting pattern responses
  response_time_consistency NUMERIC(3,2),
  
  -- Device metrics
  device_changes INTEGER DEFAULT 0, -- Resumed on different device
  browser_changes INTEGER DEFAULT 0,
  
  -- Calculated at session completion
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Analytics
CREATE TABLE project_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Participation metrics
  sessions_started INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  unique_participants INTEGER DEFAULT 0,
  
  -- Timing metrics
  avg_completion_time_ms INTEGER,
  median_completion_time_ms INTEGER,
  
  -- Quality metrics
  completion_rate NUMERIC(5,2),
  dropout_rate NUMERIC(5,2),
  data_quality_score NUMERIC(3,2),
  
  -- Calculated daily
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(project_id, date)
);

-- =====================================================
-- 7. DATA MANAGEMENT
-- =====================================================

-- Export Jobs
CREATE TABLE export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  
  -- Export configuration
  export_type VARCHAR(50) NOT NULL, -- 'responses', 'sessions', 'analytics', 'full'
  format VARCHAR(20) NOT NULL, -- 'csv', 'xlsx', 'spss', 'json'
  filters JSONB DEFAULT '{}',
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  
  -- Results
  file_url TEXT,
  file_size_bytes BIGINT,
  row_count INTEGER,
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ -- When download link expires
);

-- Audit Log
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Context
  organization_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  
  -- Action
  action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'view', 'export'
  resource_type VARCHAR(50) NOT NULL, -- 'questionnaire', 'session', 'participant', etc.
  resource_id UUID,
  
  -- Details
  changes JSONB, -- Before/after for updates
  metadata JSONB, -- Additional context
  
  -- Request info
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit indexes
CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_project ON audit_logs(project_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at);

-- Data Retention Logs
CREATE TABLE data_retention_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was deleted
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  organization_id UUID NOT NULL,
  
  -- Why it was deleted
  deletion_reason VARCHAR(100) NOT NULL, -- 'user_request', 'retention_policy', 'compliance'
  requested_by UUID REFERENCES users(id),
  
  -- Verification
  data_hash VARCHAR(64), -- Hash of deleted data for verification
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
  
  -- Conflict detection
  client_timestamp TIMESTAMPTZ NOT NULL,
  base_version INTEGER, -- Version sync was based on
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  conflict_resolution VARCHAR(50), -- How conflict was resolved
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Sync indexes
CREATE INDEX idx_sync_status ON sync_queue(status, created_at);
CREATE INDEX idx_sync_session ON sync_queue(session_id);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Key info
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL, -- Hashed API key
  key_prefix VARCHAR(20) NOT NULL, -- First few chars for identification
  
  -- Permissions
  scopes TEXT[] NOT NULL, -- ['read:sessions', 'write:responses', etc.]
  project_ids UUID[], -- Limit to specific projects
  
  -- Usage limits
  rate_limit_per_hour INTEGER DEFAULT 1000,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(key_hash)
);

-- =====================================================
-- 9. FUNCTIONS & TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_questionnaire_definitions_updated_at BEFORE UPDATE ON questionnaire_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_role_definitions_updated_at BEFORE UPDATE ON role_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Audit log function
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    organization_id,
    project_id,
    user_id,
    action,
    resource_type,
    resource_id,
    changes,
    metadata
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.project_id, OLD.project_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)),
    jsonb_build_object('timestamp', NOW())
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Session analytics calculation
CREATE OR REPLACE FUNCTION calculate_session_analytics(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  session_data RECORD;
BEGIN
  -- Get session data
  SELECT * INTO session_data FROM sessions WHERE id = p_session_id;
  
  -- Calculate and insert analytics
  INSERT INTO session_analytics (
    session_id,
    total_duration_ms,
    active_duration_ms,
    total_clicks,
    total_keypresses
  )
  SELECT 
    p_session_id,
    EXTRACT(EPOCH FROM (session_data.completed_at - session_data.started_at)) * 1000,
    -- Active duration calculation would be more complex
    EXTRACT(EPOCH FROM (session_data.completed_at - session_data.started_at)) * 1000 * 0.8,
    COUNT(*) FILTER (WHERE event_type = 'click'),
    COUNT(*) FILTER (WHERE event_type = 'keypress')
  FROM interaction_events
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Participant group size update
CREATE OR REPLACE FUNCTION update_group_size()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE participant_groups 
    SET current_size = current_size + 1 
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE participant_groups 
    SET current_size = current_size - 1 
    WHERE id = OLD.group_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_group_size_trigger
AFTER INSERT OR DELETE ON participant_group_members
FOR EACH ROW EXECUTE FUNCTION update_group_size();

-- =====================================================
-- 10. ROW LEVEL SECURITY
-- =====================================================
-- NOTE: RLS is disabled during development for easier iteration
-- Uncomment these sections when ready for production

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
CREATE POLICY org_access ON organizations
  FOR ALL
  USING (
    id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND status = 'active'
    )
  );

-- Project access policy
CREATE POLICY project_access ON projects
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid() 
      AND status = 'active'
    )
    AND (
      is_public = true 
      OR id IN (
        SELECT project_id 
        FROM project_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Session access policy
CREATE POLICY session_access ON sessions
  FOR ALL
  USING (
    participant_id = auth.uid() 
    OR project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
    )
  );

-- Response access policy
CREATE POLICY response_access ON responses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = responses.session_id
      AND (
        s.participant_id = auth.uid()
        OR s.project_id IN (
          SELECT project_id 
          FROM project_members 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- User policies
CREATE POLICY "Users can view users in their organization"
  ON users FOR SELECT
  USING (
    id = auth.uid()
    OR id IN (
      SELECT user_id 
      FROM organization_members om1
      WHERE om1.organization_id IN (
        SELECT organization_id 
        FROM organization_members om2
        WHERE om2.user_id = auth.uid()
        AND om2.status = 'active'
      )
    )
  );

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- Organization member policies
CREATE POLICY "Members can view their organization memberships"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());

-- Project member policies
CREATE POLICY "Members can view project memberships"
  ON project_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
    )
  );

-- Questionnaire policies
CREATE POLICY "Users can view questionnaires in their projects"
  ON questionnaire_definitions FOR SELECT
  USING (
    project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
    )
    OR project_id IN (
      SELECT id 
      FROM projects 
      WHERE is_public = true
    )
  );

CREATE POLICY "Users can create questionnaires in their projects"
  ON questionnaire_definitions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Users can update questionnaires they can edit"
  ON questionnaire_definitions FOR UPDATE
  USING (
    project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'editor')
    )
  );

-- Participant policies
CREATE POLICY "Participants can view their own data"
  ON participants FOR SELECT
  USING (
    auth_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

-- Session analytics policy
CREATE POLICY "Users can view analytics for their projects"
  ON session_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN project_members pm ON pm.project_id = s.project_id
      WHERE s.id = session_analytics.session_id
      AND pm.user_id = auth.uid()
    )
  );

-- Export job policies
CREATE POLICY "Users can view their export jobs"
  ON export_jobs FOR SELECT
  USING (
    requested_by = auth.uid()
    OR project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'analyst')
    )
  );

CREATE POLICY "Users can create export jobs for their projects"
  ON export_jobs FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT project_id 
      FROM project_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'editor', 'analyst')
    )
  );

-- API key policies
CREATE POLICY "Organization admins can manage API keys"
  ON api_keys FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM organization_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  );
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
('owner', 'Owner', 'organization', '{"all": true}', true),
('admin', 'Administrator', 'organization', '{"manage_users": true, "manage_projects": true, "view_billing": true}', true),
('member', 'Member', 'organization', '{"create_projects": true, "view_projects": true}', true),
('viewer', 'Viewer', 'organization', '{"view_projects": true}', true),

-- Project roles  
('owner', 'Project Owner', 'project', '{"all": true}', true),
('editor', 'Editor', 'project', '{"edit_questionnaire": true, "manage_sessions": true, "view_data": true}', true),
('analyst', 'Data Analyst', 'project', '{"view_data": true, "export_data": true, "create_reports": true}', true),
('data_collector', 'Data Collector', 'project', '{"manage_participants": true, "start_sessions": true, "view_progress": true}', true),
('viewer', 'Viewer', 'project', '{"view_questionnaire": true, "view_progress": true}', true);

-- =====================================================
-- 13. ONBOARDING SYSTEM TABLES
-- =====================================================

-- Organization Invitations
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES users(id),
  
  -- Token and security
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'accepted', 'declined', 'expired', 'revoked')),
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  
  -- Custom fields
  custom_message TEXT,
  project_assignments UUID[],
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate active invitations
  CONSTRAINT unique_active_invitation UNIQUE(organization_id, email) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Add conditional unique constraint for pending invitations only
CREATE UNIQUE INDEX idx_unique_pending_invitation 
  ON organization_invitations(organization_id, email) 
  WHERE status = 'pending';

-- Domain verification for auto-join
CREATE TABLE IF NOT EXISTS organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  
  -- Verification
  verification_token UUID DEFAULT gen_random_uuid(),
  verification_method VARCHAR(50) CHECK (verification_method IN ('dns', 'email', 'file', NULL)),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  last_verified_at TIMESTAMPTZ,
  
  -- Configuration
  auto_join_enabled BOOLEAN DEFAULT true,
  include_subdomains BOOLEAN DEFAULT false,
  default_role VARCHAR(50) DEFAULT 'member',
  
  -- Rules (stored as JSONB for flexibility)
  email_whitelist JSONB DEFAULT '[]'::jsonb,
  email_blacklist JSONB DEFAULT '[]'::jsonb,
  
  -- Welcome configuration
  welcome_message TEXT,
  auto_assign_projects UUID[],
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(domain)
);

-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(6) NOT NULL,
  
  -- Security
  attempts INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  verified_at TIMESTAMPTZ,
  
  -- Test mode flag
  is_test_mode BOOLEAN DEFAULT false,
  
  -- IP tracking for security
  request_ip INET,
  verified_ip INET,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit trail for onboarding events
CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'signup_started', 'signup_completed', 'email_verified', 
    'org_created', 'org_joined', 'invitation_sent', 'invitation_viewed',
    'invitation_accepted', 'invitation_declined', 'domain_verified',
    'onboarding_completed'
  )),
  
  -- Context
  organization_id UUID REFERENCES organizations(id),
  invitation_id UUID REFERENCES organization_invitations(id),
  
  -- Event details
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_invitations_org ON organization_invitations(organization_id);
CREATE INDEX idx_invitations_email ON organization_invitations(email);
CREATE INDEX idx_invitations_token ON organization_invitations(token);
CREATE INDEX idx_invitations_status ON organization_invitations(status);
CREATE INDEX idx_invitations_expires ON organization_invitations(expires_at);

CREATE INDEX idx_domains_org ON organization_domains(organization_id);
CREATE INDEX idx_domains_domain ON organization_domains(domain);
CREATE INDEX idx_domains_verified ON organization_domains(verified_at) WHERE verified_at IS NOT NULL;

CREATE INDEX idx_email_verifications_email ON email_verifications(email);
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX idx_email_verifications_expires ON email_verifications(expires_at);

CREATE INDEX idx_onboarding_events_user ON onboarding_events(user_id);
CREATE INDEX idx_onboarding_events_org ON onboarding_events(organization_id);
CREATE INDEX idx_onboarding_events_type ON onboarding_events(event_type);
CREATE INDEX idx_onboarding_events_created ON onboarding_events(created_at);

-- RLS Policies (Commented out during development)
/*
-- Organization Invitations
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Users can view invitations sent to their email
CREATE POLICY "Users can view their invitations" ON organization_invitations
  FOR SELECT USING (
    email = auth.jwt() ->> 'email'
  );

-- Organization admins/owners can manage invitations
CREATE POLICY "Org admins can manage invitations" ON organization_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_invitations.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- Organization Domains
ALTER TABLE organization_domains ENABLE ROW LEVEL SECURITY;

-- Only org owners can manage domains
CREATE POLICY "Org owners can manage domains" ON organization_domains
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
  );

-- Email Verifications
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Allow anon users to insert verifications (needed for signup flow)
CREATE POLICY "Allow anon to insert verifications" ON email_verifications
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow authenticated users to manage their own verifications
CREATE POLICY "Allow authenticated to manage own verifications" ON email_verifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Onboarding Events
ALTER TABLE onboarding_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own events
CREATE POLICY "Users can view own events" ON onboarding_events
  FOR SELECT USING (user_id = auth.uid());

-- Org admins can view org events
CREATE POLICY "Org admins can view org events" ON onboarding_events
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id 
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );
*/

-- Functions

-- Function to check if email domain has auto-join
CREATE OR REPLACE FUNCTION check_domain_auto_join(email_address TEXT)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  default_role VARCHAR(50),
  welcome_message TEXT
) AS $$
DECLARE
  email_domain TEXT;
BEGIN
  -- Extract domain from email
  email_domain := SPLIT_PART(email_address, '@', 2);
  
  -- Check for exact domain match or subdomain match
  RETURN QUERY
  SELECT 
    od.organization_id,
    o.name as organization_name,
    od.default_role,
    od.welcome_message
  FROM organization_domains od
  JOIN organizations o ON od.organization_id = o.id
  WHERE od.verified_at IS NOT NULL
    AND od.auto_join_enabled = true
    AND (
      od.domain = email_domain
      OR (od.include_subdomains = true AND email_domain LIKE '%.' || od.domain)
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(od.email_blacklist) AS blacklist
      WHERE email_address LIKE blacklist
    )
    AND (
      jsonb_array_length(od.email_whitelist) = 0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(od.email_whitelist) AS whitelist
        WHERE email_address LIKE whitelist
      )
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate 6-digit verification code
CREATE OR REPLACE FUNCTION generate_verification_code()
RETURNS TEXT AS $$
BEGIN
  RETURN LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to handle invitation acceptance
CREATE OR REPLACE FUNCTION accept_invitation(invitation_token UUID, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Get invitation details
  SELECT * INTO inv FROM organization_invitations
  WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > NOW()
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Add user to organization
  INSERT INTO organization_members (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  ) VALUES (
    inv.organization_id,
    user_id,
    inv.role,
    'active',
    NOW()
  )
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET
    role = EXCLUDED.role,
    status = 'active',
    joined_at = NOW();
  
  -- Update invitation status
  UPDATE organization_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = inv.id;
  
  -- Log event
  INSERT INTO onboarding_events (
    user_id,
    event_type,
    organization_id,
    invitation_id,
    metadata
  ) VALUES (
    user_id,
    'invitation_accepted',
    inv.organization_id,
    inv.id,
    jsonb_build_object('role', inv.role)
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
-- 16. STORAGE CONFIGURATION
-- =====================================================
-- Storage bucket creation and policies are handled in separate migration files:
-- - 20240127000001_create_storage_bucket.sql
-- - 20240127000002_create_public_buckets.sql
-- - 20240127000003_fix_storage_policies.sql

-- =====================================================
-- 17. DEMO DATA
-- =====================================================
-- Demo data is handled in seed.sql to keep migrations focused on schema only

-- =====================================================
-- END OF INIT.SQL
-- =====================================================
-- Note: The trigger to sync auth.users to public.users should be
-- configured in Supabase Dashboard under Authentication > Hooks