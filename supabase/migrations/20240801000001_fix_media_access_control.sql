-- Fix get_media_access_level to handle auth/public user ID mapping
CREATE OR REPLACE FUNCTION public.get_media_access_level(
    p_media_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_auth_user_id UUID;
    v_public_user_id UUID;
    v_access_level TEXT;
    v_organization_id UUID;
    v_user_role TEXT;
    v_uploaded_by UUID;
BEGIN
    -- Get auth user ID
    v_auth_user_id := COALESCE(p_user_id, auth.uid());
    
    -- If no user, return null (no access)
    IF v_auth_user_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Try to map auth user ID to public user ID
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_id = v_auth_user_id;
    
    -- If no mapping found, assume the provided ID is already a public user ID
    IF v_public_user_id IS NULL THEN
        -- Check if the provided ID exists in users table
        SELECT id INTO v_public_user_id
        FROM public.users
        WHERE id = v_auth_user_id;
        
        -- If still not found, no access
        IF v_public_user_id IS NULL THEN
            RETURN NULL;
        END IF;
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
    IF v_uploaded_by = v_public_user_id THEN
        RETURN 'owner';
    END IF;
    
    -- Get user's role in the organization
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_organization_id
    AND user_id = v_public_user_id;
    
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
'Determines the access level a user has for a specific media asset based on their organization role and ownership. Handles mapping between auth user IDs and public user IDs.';