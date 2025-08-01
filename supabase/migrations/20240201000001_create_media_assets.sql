-- Create media_assets table
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- File information
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    
    -- Metadata
    width INTEGER,
    height INTEGER,
    duration_seconds NUMERIC(10,2),
    thumbnail_path TEXT,
    alt_text TEXT,
    title VARCHAR(255),
    description TEXT,
    
    -- Access control
    access_level VARCHAR(50) DEFAULT 'organization',
    tags TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_media_assets_organization ON public.media_assets(organization_id);
CREATE INDEX idx_media_assets_uploaded_by ON public.media_assets(uploaded_by);
CREATE INDEX idx_media_assets_mime_type ON public.media_assets(mime_type);
CREATE INDEX idx_media_assets_tags ON public.media_assets USING GIN(tags);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "media_assets_select_policy" ON public.media_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
        )
    );

CREATE POLICY "media_assets_insert_policy" ON public.media_assets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
        AND uploaded_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

CREATE POLICY "media_assets_update_policy" ON public.media_assets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'editor')
        )
    );

CREATE POLICY "media_assets_delete_policy" ON public.media_assets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            JOIN users u ON u.id = om.user_id
            WHERE om.organization_id = media_assets.organization_id
            AND u.auth_id = auth.uid()
            AND om.role IN ('owner', 'admin')
        )
        OR uploaded_by = (SELECT id FROM users WHERE auth_id = auth.uid())
    );

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_media_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_media_assets_updated_at
    BEFORE UPDATE ON public.media_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_media_assets_updated_at();

-- Add get_media_access_level function
CREATE OR REPLACE FUNCTION public.get_media_access_level(
    p_media_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID;
    v_access_level TEXT;
    v_organization_id UUID;
    v_user_role TEXT;
    v_uploaded_by UUID;
BEGIN
    -- Use provided user_id or current auth user
    v_user_id := COALESCE(p_user_id, auth.uid());
    
    -- If no user, return null (no access)
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get media details
    SELECT organization_id, uploaded_by
    INTO v_organization_id, v_uploaded_by
    FROM public.media_assets
    WHERE id = p_media_id;
    
    -- If media not found, return null
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    
    -- Check if user is the uploader (owner)
    IF v_uploaded_by = v_user_id THEN
        RETURN 'owner';
    END IF;
    
    -- Get user's role in the organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_organization_id
    AND user_id = v_user_id;
    
    -- Map organization role to access level
    CASE v_user_role
        WHEN 'owner' THEN
            v_access_level := 'delete';
        WHEN 'admin' THEN
            v_access_level := 'delete';
        WHEN 'editor' THEN
            v_access_level := 'edit';
        WHEN 'viewer' THEN
            v_access_level := 'view';
        ELSE
            v_access_level := NULL;
    END CASE;
    
    RETURN v_access_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_media_access_level(UUID, UUID) TO authenticated;

-- Add comment to explain the function
COMMENT ON FUNCTION public.get_media_access_level(UUID, UUID) IS 
'Determines the access level a user has for a specific media asset based on their organization role and ownership';