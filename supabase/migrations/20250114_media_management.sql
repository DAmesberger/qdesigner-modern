-- Media Management System Migration
-- This migration creates tables for managing media assets with proper access control

-- Create media_assets table
CREATE TABLE IF NOT EXISTS media_assets (
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

-- Create media_usage table for tracking where media is used
CREATE TABLE IF NOT EXISTS media_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  questionnaire_id UUID REFERENCES questionnaires(id) ON DELETE CASCADE,
  question_id TEXT,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('stimulus', 'instruction', 'feedback', 'background', 'option')),
  usage_context JSONB DEFAULT '{}', -- Additional context like position, size, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate entries
  UNIQUE(media_id, questionnaire_id, question_id, usage_type)
);

-- Create media_permissions table for fine-grained access control
CREATE TABLE IF NOT EXISTS media_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES organization_roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'delete')),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Ensure either user_id or role_id is set, but not both
  CONSTRAINT permission_target CHECK (
    (user_id IS NOT NULL AND role_id IS NULL) OR 
    (user_id IS NULL AND role_id IS NOT NULL)
  ),
  
  -- Prevent duplicate permissions
  UNIQUE(media_id, user_id, permission),
  UNIQUE(media_id, role_id, permission)
);

-- Create media_collections table for organizing media
CREATE TABLE IF NOT EXISTS media_collections (
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

-- Create media_collection_items table
CREATE TABLE IF NOT EXISTS media_collection_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES media_collections(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(collection_id, media_id)
);

-- Create indexes for performance
CREATE INDEX idx_media_assets_organization ON media_assets(organization_id);
CREATE INDEX idx_media_assets_uploaded_by ON media_assets(uploaded_by);
CREATE INDEX idx_media_assets_mime_type ON media_assets(mime_type);
CREATE INDEX idx_media_assets_created_at ON media_assets(created_at DESC);
CREATE INDEX idx_media_usage_questionnaire ON media_usage(questionnaire_id);
CREATE INDEX idx_media_usage_media ON media_usage(media_id);
CREATE INDEX idx_media_permissions_media ON media_permissions(media_id);
CREATE INDEX idx_media_permissions_user ON media_permissions(user_id);
CREATE INDEX idx_media_permissions_role ON media_permissions(role_id);
CREATE INDEX idx_media_collections_organization ON media_collections(organization_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_media_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_media_updated_at();

CREATE TRIGGER update_media_collections_updated_at
  BEFORE UPDATE ON media_collections
  FOR EACH ROW
  EXECUTE FUNCTION update_media_updated_at();

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_collection_items ENABLE ROW LEVEL SECURITY;

-- Media Assets Policies
CREATE POLICY "Users can view media in their organization"
  ON media_assets FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
    OR is_public = true
    OR EXISTS (
      SELECT 1 FROM media_permissions
      WHERE media_id = media_assets.id
      AND (
        (user_id = auth.uid() AND permission = 'view')
        OR (role_id IN (
          SELECT role_id FROM organization_users 
          WHERE user_id = auth.uid() 
          AND organization_id = media_assets.organization_id
        ) AND permission = 'view')
      )
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

CREATE POLICY "Users can upload media to their organization"
  ON media_assets FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Users can update their own media"
  ON media_assets FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM media_permissions
      WHERE media_id = media_assets.id
      AND (
        (user_id = auth.uid() AND permission = 'edit')
        OR (role_id IN (
          SELECT role_id FROM organization_users 
          WHERE user_id = auth.uid() 
          AND organization_id = media_assets.organization_id
        ) AND permission = 'edit')
      )
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

CREATE POLICY "Users can delete their own media"
  ON media_assets FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM media_permissions
      WHERE media_id = media_assets.id
      AND (
        (user_id = auth.uid() AND permission = 'delete')
        OR (role_id IN (
          SELECT role_id FROM organization_users 
          WHERE user_id = auth.uid() 
          AND organization_id = media_assets.organization_id
        ) AND permission = 'delete')
      )
      AND (expires_at IS NULL OR expires_at > NOW())
    )
  );

-- Media Usage Policies
CREATE POLICY "Users can view media usage in their organization"
  ON media_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM media_assets
      WHERE id = media_usage.media_id
      AND organization_id IN (
        SELECT organization_id FROM organization_users 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can track media usage"
  ON media_usage FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM media_assets
      WHERE id = media_usage.media_id
      AND organization_id IN (
        SELECT organization_id FROM organization_users 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Media Permissions Policies
CREATE POLICY "Users can view permissions for media they can access"
  ON media_permissions FOR SELECT
  USING (
    granted_by = auth.uid()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM media_assets
      WHERE id = media_permissions.media_id
      AND uploaded_by = auth.uid()
    )
  );

CREATE POLICY "Media owners can grant permissions"
  ON media_permissions FOR INSERT
  WITH CHECK (
    granted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM media_assets
      WHERE id = media_permissions.media_id
      AND (
        uploaded_by = auth.uid()
        OR organization_id IN (
          SELECT organization_id FROM organization_users 
          WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
        )
      )
    )
  );

-- Media Collections Policies
CREATE POLICY "Users can view collections in their organization"
  ON media_collections FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
    OR (is_shared = true AND EXISTS (
      SELECT 1 FROM organization_users ou1
      JOIN organization_users ou2 ON ou1.organization_id = ou2.organization_id
      WHERE ou1.user_id = created_by
      AND ou2.user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can create collections in their organization"
  ON media_collections FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users 
      WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- Function to clean up unused media (can be called periodically)
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
  SELECT permission INTO v_access_level
  FROM media_permissions mp
  JOIN organization_users ou ON mp.role_id = ou.role_id
  WHERE mp.media_id = p_media_id
  AND ou.user_id = p_user_id
  AND (mp.expires_at IS NULL OR mp.expires_at > NOW())
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
  
  -- Check organization membership
  IF EXISTS (
    SELECT 1 FROM media_assets ma
    JOIN organization_users ou ON ma.organization_id = ou.organization_id
    WHERE ma.id = p_media_id
    AND ou.user_id = p_user_id
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

-- Grant necessary permissions
GRANT ALL ON media_assets TO authenticated;
GRANT ALL ON media_usage TO authenticated;
GRANT ALL ON media_permissions TO authenticated;
GRANT ALL ON media_collections TO authenticated;
GRANT ALL ON media_collection_items TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_unused_media() TO authenticated;
GRANT EXECUTE ON FUNCTION get_media_access_level(UUID, UUID) TO authenticated;