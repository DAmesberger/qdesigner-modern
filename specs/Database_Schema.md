# QDesigner Modern - Complete Database Schema

## Overview

This document defines the complete database schema for QDesigner Modern, including multi-tenant architecture, flexible role-based access control, and all runtime data structures.

## Core Multi-Tenant Structure

### Organizations (Top-level Tenant)

```sql
-- Organizations represent the highest level of data isolation
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
```

### Users

```sql
-- Users can belong to multiple organizations
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
```

### Organization Membership & Roles

```sql
-- Users' membership in organizations with roles
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
```

### Projects

```sql
-- Projects belong to organizations
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
```

### Project Members & Roles

```sql
-- Project-level roles and permissions
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
```

### Role Definitions

```sql
-- Flexible role definitions per organization
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

-- Default system roles
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
```

## Questionnaire Management

### Questionnaire Definitions (Enhanced from Runtime PRD)

```sql
-- Versioned questionnaire definitions
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
```

## Participants & Sessions

### Participants

```sql
-- Participants can be anonymous or registered
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
```

### Participant Groups

```sql
-- Group participants for studies
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
```

## Runtime Data (From Runtime PRD)

### Sessions

```sql
-- Session instances (enhanced from Runtime PRD)
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
```

### Response Data

```sql
-- Response storage (from Runtime PRD with enhancements)
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
```

### Interaction Events

```sql
-- Detailed interaction tracking (from Runtime PRD)
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
```

### Session Variables

```sql
-- Runtime variable state (from Runtime PRD)
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
```

## Analytics & Reporting

### Session Analytics

```sql
-- Aggregated session metrics
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
```

### Project Analytics

```sql
-- Aggregated project metrics
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
```

## Data Management

### Export Jobs

```sql
-- Track data export requests
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
```

### Audit Log

```sql
-- Comprehensive audit trail
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
```

### Data Retention

```sql
-- Track data deletion for compliance
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
```

## System Tables

### Sync Queue (from Runtime PRD)

```sql
-- Offline sync queue
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
```

### API Keys

```sql
-- API access for integrations
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
```

## Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

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
```

## Functions & Triggers

```sql
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
-- ... (apply to all relevant tables)

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
CREATE OR REPLACE FUNCTION calculate_session_analytics(session_id UUID)
RETURNS VOID AS $$
DECLARE
  session_data RECORD;
BEGIN
  -- Get session data
  SELECT * INTO session_data FROM sessions WHERE id = session_id;
  
  -- Calculate and insert analytics
  INSERT INTO session_analytics (
    session_id,
    total_duration_ms,
    active_duration_ms,
    total_clicks,
    total_keypresses
  )
  SELECT 
    session_id,
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000,
    -- Active duration calculation would be more complex
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 * 0.8,
    COUNT(*) FILTER (WHERE event_type = 'click'),
    COUNT(*) FILTER (WHERE event_type = 'keypress')
  FROM interaction_events
  WHERE session_id = session_id
  GROUP BY session_id;
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
```

## Indexes for Performance

```sql
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
```

---

*Document Version: 1.0*  
*Created: January 2025*  
*System: QDesigner Modern - Complete Database Schema*  
*Database: PostgreSQL with Supabase*