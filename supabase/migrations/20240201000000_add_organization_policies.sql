-- Add RLS policies for organizations

-- Users can create organizations
CREATE POLICY "Users can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    created_by = (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Users can view organizations they are members of
CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
  );

-- Owners and admins can update organizations
CREATE POLICY "Owners and admins can update organizations" ON public.organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Users can view organization members for their organizations
CREATE POLICY "Users can view organization members" ON public.organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
  );

-- Owners and admins can manage organization members
CREATE POLICY "Owners and admins can manage members" ON public.organization_members
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Users can insert themselves as owner when creating an organization
CREATE POLICY "Users can add themselves as owner" ON public.organization_members
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()) AND
    role = 'owner'
  );