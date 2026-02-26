-- 009_functions.sql
-- Email verification table and helper functions

-- =============================================================================
-- Email verifications
-- =============================================================================

CREATE TABLE public.email_verifications (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email        varchar(255) NOT NULL,
    user_id      uuid        REFERENCES public.users(id) ON DELETE CASCADE,
    token        varchar(10) NOT NULL,
    is_test_mode boolean     NOT NULL DEFAULT false,
    verified_at  timestamptz,
    verified_ip  inet,
    attempts     integer     NOT NULL DEFAULT 0,
    request_ip   inet,
    expires_at   timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verifications_email ON public.email_verifications (email);
CREATE INDEX idx_email_verifications_token ON public.email_verifications (token);
CREATE INDEX idx_email_verifications_user_id ON public.email_verifications (user_id);

-- =============================================================================
-- user_has_permission: check if a user holds a specific resource:action permission,
-- either globally or scoped to a given scope_type/scope_id.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_has_permission(
    p_user_id  uuid,
    p_resource text,
    p_action   text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = p_user_id
          AND p.resource = p_resource
          AND p.action = p_action
    );
END;
$$;

-- =============================================================================
-- user_has_role_in_scope: check if a user has a named role within a scope.
-- A global assignment (scope_type IS NULL) satisfies any scope check.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.user_has_role_in_scope(
    p_user_id    uuid,
    p_role_name  text,
    p_scope_type text,
    p_scope_id   uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_user_id
          AND r.name = p_role_name
          AND (
              ur.scope_type IS NULL                       -- global role
              OR (ur.scope_type = p_scope_type AND ur.scope_id = p_scope_id)
          )
    );
END;
$$;

-- =============================================================================
-- create_organization_with_owner: atomically creates an org and assigns the
-- creator as owner in organization_members.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
    org_name  text,
    org_slug  text,
    owner_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (org_name, org_slug, owner_id)
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (v_org_id, owner_id, 'owner', 'active');

    RETURN v_org_id;
END;
$$;

-- =============================================================================
-- accept_invitation: accepts a pending invitation and adds the user to the org.
-- Returns the organization_id on success, raises on invalid/expired token.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
    invitation_token uuid,
    p_user_id        uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_invitation public.organization_invitations%ROWTYPE;
BEGIN
    SELECT * INTO v_invitation
    FROM public.organization_invitations
    WHERE token = invitation_token
      AND status = 'pending'
    FOR UPDATE;

    IF v_invitation.id IS NULL THEN
        RAISE EXCEPTION 'Invalid or already used invitation token';
    END IF;

    IF v_invitation.expires_at < now() THEN
        UPDATE public.organization_invitations
        SET status = 'expired'
        WHERE id = v_invitation.id;
        RAISE EXCEPTION 'Invitation has expired';
    END IF;

    -- Add user to organization
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (v_invitation.organization_id, p_user_id, v_invitation.role, 'active')
    ON CONFLICT (organization_id, user_id) DO UPDATE
        SET role = EXCLUDED.role,
            status = 'active';

    -- Mark invitation as accepted
    UPDATE public.organization_invitations
    SET status = 'accepted',
        accepted_at = now()
    WHERE id = v_invitation.id;

    -- Handle project assignments if any
    IF v_invitation.project_assignments IS NOT NULL THEN
        INSERT INTO public.project_members (project_id, user_id, role)
        SELECT
            (pa->>'project_id')::uuid,
            p_user_id,
            COALESCE(pa->>'role', 'viewer')
        FROM jsonb_array_elements(v_invitation.project_assignments) AS pa
        ON CONFLICT (project_id, user_id) DO UPDATE
            SET role = EXCLUDED.role;
    END IF;

    RETURN v_invitation.organization_id;
END;
$$;

-- =============================================================================
-- check_domain_auto_join: given an email address, find any organization that
-- has a verified domain matching the email domain with auto_join_enabled = true.
-- Returns a table of matching orgs and their default roles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_domain_auto_join(
    email_address text
)
RETURNS TABLE (
    organization_id uuid,
    organization_name varchar(255),
    default_role varchar(50),
    welcome_message text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_domain text;
BEGIN
    v_domain := split_part(email_address, '@', 2);

    RETURN QUERY
    SELECT
        o.id AS organization_id,
        o.name AS organization_name,
        od.default_role,
        od.welcome_message
    FROM public.organization_domains od
    JOIN public.organizations o ON o.id = od.organization_id
    WHERE od.auto_join_enabled = true
      AND od.verified_at IS NOT NULL
      AND o.deleted_at IS NULL
      AND (
          od.domain = v_domain
          OR (od.include_subdomains AND v_domain LIKE '%.' || od.domain)
      )
      -- Check whitelist (empty means allow all)
      AND (
          od.email_whitelist = '[]'::jsonb
          OR od.email_whitelist @> to_jsonb(email_address)
      )
      -- Check blacklist
      AND NOT (od.email_blacklist @> to_jsonb(email_address));
END;
$$;

-- =============================================================================
-- get_media_access_level: determine a user's effective access level for a media
-- asset. Returns 'owner', 'organization', 'project', or NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_media_access_level(
    p_media_id uuid,
    p_user_id  uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_asset public.media_assets%ROWTYPE;
BEGIN
    SELECT * INTO v_asset
    FROM public.media_assets
    WHERE id = p_media_id;

    IF v_asset.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Asset owner (uploader) gets full access
    IF v_asset.uploaded_by = p_user_id THEN
        RETURN 'owner';
    END IF;

    -- Public assets are accessible to everyone
    IF v_asset.access_level = 'public' THEN
        RETURN 'public';
    END IF;

    -- Organization-level access: user must be a member of the org
    IF v_asset.access_level IN ('organization', 'project') THEN
        IF EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = v_asset.organization_id
              AND om.user_id = p_user_id
              AND om.status = 'active'
        ) THEN
            RETURN 'organization';
        END IF;
    END IF;

    -- Check explicit media permissions
    IF EXISTS (
        SELECT 1
        FROM public.media_permissions mp
        WHERE mp.media_id = p_media_id
          AND mp.user_id = p_user_id
          AND (mp.expires_at IS NULL OR mp.expires_at > now())
    ) THEN
        RETURN 'explicit';
    END IF;

    RETURN NULL;
END;
$$;
