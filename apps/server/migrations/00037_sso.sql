-- 00037_sso.sql  (E-RBAC-6 — SSO federation, OIDC/SAML with JIT membership)
--
-- Per-organization identity-provider configuration plus the columns that
-- link a `users` row to the external subject that federated it. Extends the
-- existing verified-domain auto-join (P8-T8 / 00007_organization_domains) into
-- true federated login: an org owner registers an IdP, and a first-time SSO
-- sign-in provisions the user + an active `organization_members` row
-- just-in-time at the configured default role (or a group-claim-derived role).
--
-- NOTE ON NUMBERING: the E-RBAC-6 unit spec named this "00030", but the live
-- migration directory already reached 00036 (00030 is dataset_stats). Authored
-- as the next free number (00037) per the "correct a stale reference and note
-- it" rule.
--
-- RLS POSTURE: these three tables deliberately carry NO row-level security,
-- matching their closest sibling `organization_domains` (00007). The SSO
-- start/callback handlers are anonymous (no JWT, no `app.user_id` GUC) and run
-- on the application pool, so they must be able to resolve an org's IdP and
-- persist a login-state row without an RLS context. The `client_secret` is
-- never stored in plaintext (AES-256-GCM at rest, key derived from
-- SSO_ENCRYPTION_KEY / JWT_SECRET) and the admin CRUD handlers gate every read
-- and mutation behind an org-owner check + redact the secret in responses, so
-- the application layer is the authorization gate here (the same posture ADR
-- 0013 takes for admin-table mutations).

-- ── Identity providers ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_identity_providers (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    protocol             text        NOT NULL CHECK (protocol IN ('oidc', 'saml')),
    -- Human label shown on the login button ("Sign in with <display_name>").
    display_name         text,
    -- OIDC issuer / SAML entity id. For OIDC this MUST equal the `iss` claim.
    issuer               text,
    -- OIDC discovery URL (…/.well-known/openid-configuration) or SAML metadata
    -- URL. Reachability is validated at create/update time.
    metadata_url         text,
    client_id            text,
    -- AES-256-GCM ciphertext of the OIDC client_secret. Format:
    -- "v1:<hex nonce>:<hex ciphertext>". NULL when no secret is configured
    -- (e.g. a public client or a SAML provider). NEVER plaintext.
    client_secret_enc    text,
    -- Role assigned to a JIT-provisioned member when no group claim maps.
    default_role         text        NOT NULL DEFAULT 'member'
                                     CHECK (default_role IN ('admin', 'member', 'viewer')),
    -- The id_token / assertion claim carrying the caller's group memberships.
    group_claim          text        NOT NULL DEFAULT 'groups',
    -- Maps an IdP group name -> org role, e.g. {"lab-admins": "admin"}.
    group_role_map       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- When true, a member federated by THIS IdP has an IdP-managed role: the
    -- org-member role-change endpoint refuses to mutate it (roles flow only
    -- from the IdP group mapping on each login).
    enforce_role_mapping boolean     NOT NULL DEFAULT false,
    enabled              boolean     NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_idp_org ON public.org_identity_providers (organization_id);
-- Start handler resolves the single enabled IdP for an org.
CREATE INDEX IF NOT EXISTS idx_org_idp_enabled ON public.org_identity_providers (organization_id, enabled);

-- ── Federated-identity linkage on users ──────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS external_subject text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS idp_id uuid
    REFERENCES public.org_identity_providers(id) ON DELETE SET NULL;

-- A given (idp, external subject) maps to exactly one user. Partial so the
-- millions of password users (idp_id IS NULL) are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_idp_subject
    ON public.users (idp_id, external_subject)
    WHERE idp_id IS NOT NULL AND external_subject IS NOT NULL;

-- ── Login-state (CSRF `state` + OIDC `nonce`) ────────────────────────
-- One short-lived row per in-flight authorization-code exchange. The start
-- handler writes it; the callback consumes (and deletes) it, binding the
-- returned `state` to the `nonce` embedded in the id_token and pinning the
-- resolved token/jwks endpoints so a compromised discovery response mid-flow
-- cannot repoint them.
CREATE TABLE IF NOT EXISTS public.sso_login_states (
    state          text        PRIMARY KEY,
    idp_id         uuid        NOT NULL REFERENCES public.org_identity_providers(id) ON DELETE CASCADE,
    nonce          text        NOT NULL,
    redirect_uri   text        NOT NULL,
    token_endpoint text        NOT NULL,
    jwks_uri       text        NOT NULL,
    issuer         text        NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sso_login_states_expires
    ON public.sso_login_states (expires_at);
