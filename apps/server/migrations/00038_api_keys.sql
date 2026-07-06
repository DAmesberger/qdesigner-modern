-- 00038_api_keys.sql  (E-RBAC-7 — API keys / service accounts)
--
-- Machine identities for programmatic access to the read/export surface
-- (`/api/v1/*`) without a human JWT. A key belongs to exactly one org, carries
-- a granular `scopes text[]` (the same wire tokens as `rbac::models::Permission`,
-- e.g. `session:read`, `response:read`, `org:manage_members`), and is presented
-- as `sk_<prefix>_<secret>`. Only the plaintext prefix and an Argon2id hash of
-- the full token are stored — the secret is shown to the caller exactly ONCE at
-- creation time and is unrecoverable thereafter.
--
-- NOTE ON NUMBERING: the E-RBAC-7 unit spec named this "00031", but the live
-- migration directory already reached 00037 (00031 is arm_assignment). Authored
-- as the next free number (00038) per the "correct a stale reference and note
-- it" rule.
--
-- RLS POSTURE: like `org_identity_providers` (00037) and `organization_domains`
-- (00007), this table deliberately carries NO row-level security. The API-key
-- authentication middleware (`middleware::api_key`) resolves a presented token
-- on the application pool with no `app.user_id` GUC set (the caller is a machine
-- with no JWT), so it must be able to read the row and stamp `last_used_at`
-- without an RLS context. The admin CRUD handlers gate every read and mutation
-- behind an org owner/admin check + an explicit `organization_id = $org` WHERE
-- clause, so the application layer is the authorization gate here — the same
-- posture ADR 0013/0015 takes for the SSO config tables.

CREATE TABLE IF NOT EXISTS public.api_keys (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Human label shown in the admin UI ("CI export bot", …).
    name            text        NOT NULL,
    -- Argon2id PHC hash of the FULL plaintext token (`sk_<prefix>_<secret>`).
    -- Never the plaintext; the secret is unrecoverable after creation.
    key_hash        text        NOT NULL,
    -- The public, indexed lookup handle. The plaintext token embeds it verbatim
    -- (`sk_<prefix>_…`), so the auth middleware resolves the candidate row by
    -- prefix, then Argon2-verifies the full token against `key_hash`.
    prefix          text        NOT NULL UNIQUE,
    -- Granular permission tokens (Permission::as_str wire strings). A request is
    -- admitted to a machine route only when the route's required scope is present
    -- here — this is what lets an export-scoped key read but never mutate.
    scopes          text[]      NOT NULL DEFAULT '{}',
    -- The human owner/admin who minted the key. Used as the RLS principal
    -- (`app.user_id`) for machine requests so existing membership-scoped policies
    -- and `access::verify_*` gates admit the key exactly to its creator's reach,
    -- narrowed further by `scopes`. A key can never exceed its creator's access.
    created_by      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
    last_used_at    timestamptz,
    expires_at      timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- The auth hot path is a point lookup by prefix.
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys (prefix);
-- Admin listing is scoped to one org, newest first.
CREATE INDEX IF NOT EXISTS idx_api_keys_org_created
    ON public.api_keys (organization_id, created_at DESC);

-- ── Immutability where appropriate ───────────────────────────────────
-- Keys are SOFT-revoked (set `revoked_at`), never hard-deleted, so the audit
-- trail + `last_used_at` forensics survive. Strip DELETE from the app role so a
-- compromised handler cannot erase key history; INSERT/SELECT/UPDATE remain
-- (UPDATE is required for `last_used_at` stamping and revocation). An ON DELETE
-- CASCADE from `organizations` still removes keys when the whole tenant is
-- deleted (FK cascades run as the table owner, not the app role).
REVOKE DELETE ON public.api_keys FROM qdesigner_app;
