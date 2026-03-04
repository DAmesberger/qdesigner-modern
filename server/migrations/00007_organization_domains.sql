-- Organization domains (for verified domain auto-join)

CREATE TABLE IF NOT EXISTS public.organization_domains (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    domain              varchar(255) NOT NULL,
    verification_token  text,
    verification_method varchar(50),
    verified_at         timestamptz,
    verified_by         uuid        REFERENCES public.users(id),
    auto_join_enabled   boolean     NOT NULL DEFAULT false,
    include_subdomains  boolean     NOT NULL DEFAULT false,
    default_role        varchar(50) NOT NULL DEFAULT 'member'
                                    CHECK (default_role IN ('admin', 'member', 'viewer')),
    email_whitelist     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    email_blacklist     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    welcome_message     text,
    last_verified_at    timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_domains_domain ON public.organization_domains (domain);
CREATE INDEX IF NOT EXISTS idx_org_domains_org_id ON public.organization_domains (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_domains_unique ON public.organization_domains (organization_id, domain);

-- Onboarding events (audit trail for sign-up / invitation flows)

CREATE TABLE IF NOT EXISTS public.onboarding_events (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    event_type      varchar(100) NOT NULL,
    organization_id uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
    invitation_id   uuid        REFERENCES public.organization_invitations(id) ON DELETE SET NULL,
    metadata        jsonb,
    ip_address      inet,
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_user_id ON public.onboarding_events (user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_org_id ON public.onboarding_events (organization_id);
