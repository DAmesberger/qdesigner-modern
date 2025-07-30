-- Fix RLS recursion issues

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners and admins can update organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can add themselves as owner" ON public.organization_members;

-- Create new non-recursive policies for organizations
CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 
      FROM public.organization_members om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = organizations.id 
        AND u.auth_id = auth.uid()
    )
  );

-- Owners and admins can update their organizations
CREATE POLICY "Owners and admins can update organizations" ON public.organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 
      FROM public.organization_members om
      JOIN public.users u ON u.id = om.user_id
      WHERE om.organization_id = organizations.id 
        AND u.auth_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Policies for organization_members
CREATE POLICY "Users can view members of their organizations" ON public.organization_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 
      FROM public.organization_members om2
      JOIN public.users u ON u.id = om2.user_id
      WHERE om2.organization_id = organization_members.organization_id 
        AND u.auth_id = auth.uid()
    )
  );

-- Owners and admins can manage organization members
CREATE POLICY "Owners and admins can insert members" ON public.organization_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM public.organization_members existing_om
      JOIN public.users u ON u.id = existing_om.user_id
      WHERE existing_om.organization_id = organization_members.organization_id 
        AND u.auth_id = auth.uid()
        AND existing_om.role IN ('owner', 'admin')
    )
    OR
    -- Allow users to add themselves as owner when creating an organization
    (
      user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()) 
      AND role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = organization_members.organization_id
      )
    )
  );

CREATE POLICY "Owners and admins can update members" ON public.organization_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 
      FROM public.organization_members existing_om
      JOIN public.users u ON u.id = existing_om.user_id
      WHERE existing_om.organization_id = organization_members.organization_id 
        AND u.auth_id = auth.uid()
        AND existing_om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can delete members" ON public.organization_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 
      FROM public.organization_members existing_om
      JOIN public.users u ON u.id = existing_om.user_id
      WHERE existing_om.organization_id = organization_members.organization_id 
        AND u.auth_id = auth.uid()
        AND existing_om.role IN ('owner', 'admin')
    )
  );