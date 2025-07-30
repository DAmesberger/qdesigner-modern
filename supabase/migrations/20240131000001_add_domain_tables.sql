-- Create organization domains table
CREATE TABLE IF NOT EXISTS public.organization_domains (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    domain varchar(255) NOT NULL,
    verification_token varchar(255) NOT NULL,
    verification_method varchar(50) CHECK (verification_method IN ('dns', 'email', 'file')),
    verified_at timestamptz,
    verified_by uuid REFERENCES public.users(id),
    last_verified_at timestamptz,
    auto_join_enabled boolean DEFAULT false,
    include_subdomains boolean DEFAULT false,
    default_role varchar(50) DEFAULT 'member' CHECK (default_role IN ('member', 'viewer')),
    email_whitelist text[] DEFAULT ARRAY[]::text[],
    email_blacklist text[] DEFAULT ARRAY[]::text[],
    welcome_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(domain)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_organization_domains_org_id ON public.organization_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_domains_domain ON public.organization_domains(domain);

-- Enable RLS
ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization domains
CREATE POLICY "Organization members can view domains" ON public.organization_domains
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        AND om.status = 'active'
    )
  );

CREATE POLICY "Organization owners can manage domains" ON public.organization_domains
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_domains.organization_id
        AND om.user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid())
        AND om.role = 'owner'
        AND om.status = 'active'
    )
  );

-- Create function to check domain auto-join
CREATE OR REPLACE FUNCTION public.check_domain_auto_join(email_address text)
RETURNS TABLE (
    organization_id uuid,
    organization_name text,
    default_role text,
    welcome_message text
) AS $$
DECLARE
    email_domain text;
BEGIN
    -- Extract domain from email
    email_domain := split_part(email_address, '@', 2);
    
    -- Return matching organizations
    RETURN QUERY
    SELECT 
        od.organization_id,
        o.name as organization_name,
        od.default_role::text,
        od.welcome_message
    FROM public.organization_domains od
    JOIN public.organizations o ON o.id = od.organization_id
    WHERE od.verified_at IS NOT NULL
        AND od.auto_join_enabled = true
        AND (
            od.domain = email_domain 
            OR (od.include_subdomains = true AND email_domain LIKE '%.' || od.domain)
        )
        AND NOT EXISTS (
            SELECT 1 FROM unnest(od.email_blacklist) AS blacklisted
            WHERE email_address LIKE blacklisted
        )
        AND (
            array_length(od.email_whitelist, 1) IS NULL 
            OR EXISTS (
                SELECT 1 FROM unnest(od.email_whitelist) AS whitelisted
                WHERE email_address LIKE whitelisted
            )
        )
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.check_domain_auto_join(text) TO authenticated;