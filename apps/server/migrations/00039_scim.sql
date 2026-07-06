-- 00039_scim.sql  (E-RBAC-7 — SCIM 2.0 provisioning)
--
-- Per-organization SCIM bearer tokens plus the `source` marker that flags an
-- `organization_members` row as IdP-provisioned. An enterprise IdP (Okta, Entra,
-- …) points its SCIM connector at `/scim/v2/*` with the org's bearer token; a
-- SCIM `User` create adds an active member (source='scim'), a `PATCH active:false`
-- (or DELETE) suspends it — automated de/provisioning driven by the directory.
--
-- NOTE ON NUMBERING: the E-RBAC-7 unit spec named this "00032", but the live
-- migration directory already reached 00038 (00032 is quota_cells). Authored as
-- the next free number (00039) per the "correct a stale reference and note it"
-- rule.
--
-- RLS POSTURE: no row-level security, matching `api_keys` (00038) and the SSO
-- config tables (00037). The SCIM auth path resolves a bearer token on the app
-- pool with no `app.user_id` GUC (the caller is an IdP connector, not a user),
-- so it must read `scim_tokens` and provision `organization_members` without an
-- RLS context. Authorization is the token itself (per-org, hashed at rest) plus
-- the always-org-scoped WHERE clauses in the handlers.

-- ── Per-org SCIM bearer tokens ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scim_tokens (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Human label for the admin UI ("Okta production", …).
    name            text        NOT NULL DEFAULT 'SCIM token',
    -- SHA-256 (hex) of the opaque bearer token. The token is high-entropy random
    -- (256 bits), so a salted KDF buys nothing over a fast deterministic hash and
    -- a deterministic hash lets the auth path resolve the org by a single indexed
    -- point lookup. The plaintext is shown exactly ONCE at creation.
    token_hash      text        NOT NULL UNIQUE,
    -- Public display handle (first chars of the token) so an admin can tell which
    -- token is which without the secret.
    prefix          text        NOT NULL DEFAULT '',
    enabled         boolean     NOT NULL DEFAULT true,
    created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    last_used_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scim_tokens_org ON public.scim_tokens (organization_id);

-- ── Provisioning source on membership rows ───────────────────────────
-- 'manual' (default, existing rows) vs 'scim'. The SCIM Users endpoints only
-- ever mutate rows they provisioned (source='scim'), so a directory connector
-- can never suspend an owner who was added by hand.
ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- ── Immutability where appropriate ───────────────────────────────────
-- SCIM tokens are disabled (`enabled=false`), never hard-deleted, so revocation
-- is auditable. Strip DELETE from the app role (UPDATE stays for enable-toggle +
-- last_used stamping; the org-cascade delete runs as the table owner).
REVOKE DELETE ON public.scim_tokens FROM qdesigner_app;
