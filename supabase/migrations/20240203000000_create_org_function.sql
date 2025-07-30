-- Create a function to create organization with proper permissions
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  org_name TEXT,
  org_slug TEXT,
  owner_id UUID
) RETURNS TABLE (
  organization_id UUID,
  success BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create the organization
  INSERT INTO public.organizations (name, slug, created_by)
  VALUES (org_name, org_slug, owner_id)
  RETURNING id INTO new_org_id;
  
  -- Add the user as owner
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (new_org_id, owner_id, 'owner', 'active');
  
  -- Return success
  RETURN QUERY SELECT new_org_id, true, NULL::TEXT;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error
    RETURN QUERY SELECT NULL::UUID, false, SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_organization_with_owner TO authenticated;