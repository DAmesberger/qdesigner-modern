-- 00036_invitation_columns.sql
--
-- Fix a schema/handler drift that made the ENTIRE organization-invitation
-- feature 500 at runtime (surfaced during M7-E live-QA as a `column i.token
-- does not exist` 500 on the signup email-blur invite check).
--
-- `organization_invitations` was created in 00001 with only:
--   id, organization_id, email, role, invited_by, created_at, expires_at, accepted_at
-- but every invitation handler in api/organizations.rs references four columns
-- that were never added:
--   * token          — the public accept key (`/invite/{token}`, looked up by
--                       accept/decline); the `PendingInvitation` struct types it
--                       as `Uuid`, so the column is UUID.
--   * status         — 'pending' | 'accepted' | 'declined' | 'revoked'
--                       ('expired' is computed dynamically, never stored).
--   * custom_message — optional inviter note (provided by create_invitation).
--   * declined_at    — set by the decline handler.
--
-- create_invitation relies on DB defaults for `token` and `status` (they are in
-- the INSERT's RETURNING but not its column list), so both need DEFAULTs.
-- Additive + idempotent; existing rows get a generated token and 'pending'.

ALTER TABLE organization_invitations
    ADD COLUMN IF NOT EXISTS token UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS custom_message TEXT,
    ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

-- The accept/decline path looks invitations up by token; it must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invitations_token
    ON organization_invitations (token);

-- Pending-invitation lookups filter on (email, status) and (organization_id).
CREATE INDEX IF NOT EXISTS idx_organization_invitations_email_status
    ON organization_invitations (email, status);
