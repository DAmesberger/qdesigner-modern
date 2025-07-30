-- Complete RLS Fix - Eliminate Infinite Recursion
-- This migration completely replaces the RLS policies to avoid circular dependencies

-- Step 1: Create helper functions with SECURITY DEFINER
-- These functions bypass RLS to avoid recursion

-- Function to get current user's ID from auth
CREATE OR REPLACE FUNCTION public.auth_current_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Function to check if a user is an organization member
CREATE OR REPLACE FUNCTION public.auth_is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get the user's ID from auth context
  v_user_id := public.auth_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Direct check without triggering RLS
  RETURN EXISTS (
    SELECT 1 
    FROM public.organization_members om
    WHERE om.organization_id = org_id 
    AND om.user_id = v_user_id
    AND om.status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to check if user has a specific role in an organization
CREATE OR REPLACE FUNCTION public.auth_has_org_role(org_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
BEGIN
  v_user_id := public.auth_current_user_id();
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  SELECT role INTO v_user_role
  FROM public.organization_members om
  WHERE om.organization_id = org_id 
  AND om.user_id = v_user_id
  AND om.status = 'active';
  
  RETURN v_user_role = ANY(allowed_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get user's organizations (for performance)
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
  SELECT om.organization_id, om.role
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
  AND om.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auth_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_org_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_organizations() TO authenticated;

-- Step 2: Drop ALL existing policies to start fresh
-- Organizations policies
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- Organization members policies
DROP POLICY IF EXISTS "Users can view members of their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can insert members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can delete members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can add themselves as owner" ON public.organization_members;

-- Step 3: Create new policies for users table (simple, no dependencies)
CREATE POLICY "Users can view own profile" 
ON public.users FOR SELECT 
USING (auth_id = auth.uid());

CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
USING (auth_id = auth.uid());

-- Step 4: Create new policies for organizations (using helper functions)
CREATE POLICY "Authenticated users can create organizations" 
ON public.organizations FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND created_by = public.auth_current_user_id()
);

CREATE POLICY "Members can view their organizations" 
ON public.organizations FOR SELECT 
USING (
  public.auth_is_org_member(id)
);

CREATE POLICY "Owners and admins can update their organizations" 
ON public.organizations FOR UPDATE 
USING (
  public.auth_has_org_role(id, ARRAY['owner', 'admin'])
);

CREATE POLICY "Only owners can delete organizations" 
ON public.organizations FOR DELETE 
USING (
  public.auth_has_org_role(id, ARRAY['owner'])
);

-- Step 5: Create new policies for organization_members (avoiding circular references)
CREATE POLICY "Members can view organization members" 
ON public.organization_members FOR SELECT 
USING (
  -- User can see members if they are also a member of that org
  EXISTS (
    SELECT 1 FROM public.auth_user_organizations() uo 
    WHERE uo.organization_id = organization_members.organization_id
  )
);

CREATE POLICY "Authorized users can add members" 
ON public.organization_members FOR INSERT 
WITH CHECK (
  -- Case 1: User is owner/admin adding someone else
  (
    EXISTS (
      SELECT 1 
      FROM public.auth_user_organizations() uo
      WHERE uo.organization_id = organization_members.organization_id
      AND uo.role IN ('owner', 'admin')
    )
  )
  OR
  -- Case 2: User is adding themselves as owner during org creation
  (
    user_id = public.auth_current_user_id()
    AND role = 'owner'
    -- Ensure this is the first member (org creation scenario)
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om2
      WHERE om2.organization_id = organization_members.organization_id
    )
  )
);

CREATE POLICY "Owners and admins can update members" 
ON public.organization_members FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.auth_user_organizations() uo
    WHERE uo.organization_id = organization_members.organization_id
    AND uo.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can remove members" 
ON public.organization_members FOR DELETE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.auth_user_organizations() uo
    WHERE uo.organization_id = organization_members.organization_id
    AND uo.role IN ('owner', 'admin')
  )
  -- Prevent removing the last owner
  AND NOT (
    role = 'owner' 
    AND (
      SELECT COUNT(*) 
      FROM public.organization_members om2 
      WHERE om2.organization_id = organization_members.organization_id 
      AND om2.role = 'owner'
      AND om2.user_id != organization_members.user_id
    ) = 0
  )
);

-- Step 6: Create policies for projects (using helper functions)
CREATE POLICY "Organization members can view projects" 
ON public.projects FOR SELECT 
USING (
  public.auth_is_org_member(organization_id)
);

CREATE POLICY "Owners and admins can create projects" 
ON public.projects FOR INSERT 
WITH CHECK (
  public.auth_has_org_role(organization_id, ARRAY['owner', 'admin'])
  AND created_by = public.auth_current_user_id()
);

CREATE POLICY "Project admins can update projects" 
ON public.projects FOR UPDATE 
USING (
  public.auth_has_org_role(organization_id, ARRAY['owner', 'admin'])
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = projects.id
    AND pm.user_id = public.auth_current_user_id()
    AND pm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Project owners can delete projects" 
ON public.projects FOR DELETE 
USING (
  public.auth_has_org_role(organization_id, ARRAY['owner'])
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = projects.id
    AND pm.user_id = public.auth_current_user_id()
    AND pm.role = 'owner'
  )
);

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_members_user_status 
ON public.organization_members(user_id, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_org_members_org_status 
ON public.organization_members(organization_id, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_org_members_role 
ON public.organization_members(organization_id, role) 
WHERE status = 'active';

-- Step 8: Update the create organization function to handle errors better
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
  -- Start transaction
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
    WHEN unique_violation THEN
      RETURN QUERY SELECT NULL::UUID, false, 'Organization slug already exists';
    WHEN OTHERS THEN
      RETURN QUERY SELECT NULL::UUID, false, SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the function has proper permissions
GRANT EXECUTE ON FUNCTION create_organization_with_owner TO authenticated;