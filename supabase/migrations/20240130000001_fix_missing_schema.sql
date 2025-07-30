-- Add missing columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at timestamptz DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_count integer DEFAULT 0;

-- Create organization invitations table
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    email varchar(255) NOT NULL,
    role varchar(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    token varchar(255) UNIQUE NOT NULL,
    status varchar(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    invited_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '7 days'),
    accepted_at timestamptz,
    accepted_by uuid REFERENCES public.users(id)
);

-- Create onboarding events table
CREATE TABLE IF NOT EXISTS public.onboarding_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    event_type varchar(100) NOT NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Add subscription columns to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_tier varchar(50) DEFAULT 'free';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_status varchar(50) DEFAULT 'active';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_organization_invitations_email ON public.organization_invitations(email);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_token ON public.organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_user_id ON public.onboarding_events(user_id);

-- Enable RLS
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies for organization invitations
CREATE POLICY "Users can view invitations sent to their email" ON public.organization_invitations
  FOR SELECT USING (email = (SELECT email FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Organization admins can create invitations" ON public.organization_invitations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_id
        AND om.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        AND om.role IN ('owner', 'admin')
    )
  );

-- Basic RLS policies for onboarding events
CREATE POLICY "Users can view their own events" ON public.onboarding_events
  FOR SELECT USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Create the accept_invitation function
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token varchar, user_id uuid)
RETURNS void AS $$
DECLARE
  v_invitation record;
BEGIN
  -- Get the invitation
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > now();
  
  IF v_invitation IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;
  
  -- Add user to organization
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_invitation.organization_id, accept_invitation.user_id, v_invitation.role, 'active')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  
  -- Update invitation status
  UPDATE public.organization_invitations
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = accept_invitation.user_id
  WHERE id = v_invitation.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;