-- 00056_project_invitations.sql
--
-- ADR 0033 (Unit 3): a dedicated project-scoped invitation flow. The
-- structural replacement for resource-share's invite-by-email — an
-- invitation that means "collaborate on ONE project" (accept → a
-- `project_members` row), kept distinct from `organization_invitations`
-- (which mean "join the org").
--
-- Deliberately MIRRORS `organization_invitations` (00001 + the 00036
-- column-drift fix) at project scope: same token/status/expiry/email-match
-- semantics, same handler-query shapes. Columns match the org table
-- post-00036 so the `create → list → accept/decline → revoke` handlers in
-- `api/project_invitations.rs` resolve every referenced column:
--   * token          — the public accept key (`/project-invitations/{token}`),
--                       UUID, DB-generated default (INSERT omits it).
--   * status         — 'pending' | 'accepted' | 'declined' | 'revoked'
--                       ('expired' is computed dynamically, never stored),
--                       DB default 'pending'.
--   * custom_message — optional inviter note.
--   * accepted_at / declined_at — set by the accept / decline handlers.
--
-- RLS posture: RLS-EXEMPT, matching `organization_invitations` (which enables
-- no policies). The `authorize(Scope::Project, ProjectManageMembers)` gate in
-- the create/list/revoke handlers is the admission control; accept/get/decline
-- are token-keyed and self-scoped by the caller's email match. `qdesigner_app`
-- reaches the table through the schema-wide grants from 00018 (repeated
-- explicitly below for self-documentation; harmless if already inherited via
-- ALTER DEFAULT PRIVILEGES).

CREATE TABLE IF NOT EXISTS project_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    token UUID NOT NULL DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    custom_message TEXT,
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ
);

-- The accept/decline/get path looks invitations up by token; it must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invitations_token
    ON project_invitations (token);

-- Pending-invitation lookups filter on (email, status) and (project_id).
CREATE INDEX IF NOT EXISTS idx_project_invitations_email_status
    ON project_invitations (email, status);

CREATE INDEX IF NOT EXISTS idx_project_invitations_project
    ON project_invitations (project_id);

-- Duplicate-pending guard (this ADR's addition — org invites carry none):
-- at most one OUTSTANDING invite per (project, email). Partial on
-- status = 'pending' so re-inviting after a decline / revoke / accept still
-- works. A duplicate create surfaces as SQLSTATE 23505 → the handler's
-- `From<sqlx::Error>` maps it to a 409 Conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invitations_pending_unique
    ON project_invitations (project_id, lower(email))
    WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON project_invitations TO qdesigner_app;
