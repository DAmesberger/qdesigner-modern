-- 004_organizations.sql
-- Organizations, members, invitations, domain verification, and onboarding

-- =============================================================================
-- Organizations
-- =============================================================================

CREATE TABLE public.organizations (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name                varchar(255) NOT NULL,
    slug                varchar(255) UNIQUE NOT NULL,
    domain              varchar(255),
    logo_url            text,
    settings            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    subscription_tier   varchar(50) NOT NULL DEFAULT 'free',
    subscription_status varchar(50) NOT NULL DEFAULT 'active',
    created_by          uuid        REFERENCES public.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);

CREATE INDEX idx_organizations_slug ON public.organizations (slug);
CREATE INDEX idx_organizations_created_by ON public.organizations (created_by);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Organization members
-- =============================================================================

CREATE TABLE public.organization_members (
    organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role            varchar(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status          varchar(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    joined_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON public.organization_members (user_id);

-- =============================================================================
-- Organization invitations
-- =============================================================================

CREATE TABLE public.organization_invitations (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email               varchar(255) NOT NULL,
    role                varchar(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    token               uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    status              varchar(50) NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked')),
    invited_by          uuid        REFERENCES public.users(id),
    custom_message      text,
    project_assignments jsonb,
    expires_at          timestamptz NOT NULL DEFAULT now() + interval '7 days',
    created_at          timestamptz NOT NULL DEFAULT now(),
    accepted_at         timestamptz,
    viewed_at           timestamptz,
    declined_at         timestamptz
);

CREATE INDEX idx_org_invitations_email ON public.organization_invitations (email);
CREATE INDEX idx_org_invitations_token ON public.organization_invitations (token);
CREATE INDEX idx_org_invitations_org_id ON public.organization_invitations (organization_id);

-- =============================================================================
-- Organization domains (for verified domain auto-join)
-- =============================================================================

CREATE TABLE public.organization_domains (
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

CREATE INDEX idx_org_domains_domain ON public.organization_domains (domain);
CREATE INDEX idx_org_domains_org_id ON public.organization_domains (organization_id);
CREATE UNIQUE INDEX idx_org_domains_unique ON public.organization_domains (organization_id, domain);

-- =============================================================================
-- Onboarding events (audit trail for sign-up / invitation flows)
-- =============================================================================

CREATE TABLE public.onboarding_events (
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

CREATE INDEX idx_onboarding_events_user_id ON public.onboarding_events (user_id);
CREATE INDEX idx_onboarding_events_org_id ON public.onboarding_events (organization_id);
