-- Fix type mismatch in auth_user_organizations function
-- The role column in organization_members is varchar(50) but function returns TEXT

CREATE OR REPLACE FUNCTION public.auth_user_organizations()
RETURNS TABLE(organization_id UUID, role TEXT) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := public.auth_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT om.organization_id, om.role::TEXT  -- Cast varchar(50) to TEXT
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
  AND om.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;