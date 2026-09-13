# QDesigner Modern — database schema

The authoritative schema is the ordered migration history in
[apps/server/migrations](../apps/server/migrations), beginning with
[00001_initial_schema.sql](../apps/server/migrations/00001_initial_schema.sql).
This document replaces the obsolete standalone schema proposal; copying that proposal
into a new database did not produce the schema the Rust backend uses.

PostgreSQL 18 is accessed through Rust/Axum and sqlx. The application owns its local
users and authentication records. OIDC identities are linked by the backend to local
users; there is no separate provider-owned user schema.

## Domain storage

| Area | Storage and ownership |
|---|---|
| Identity | Local users, password/token records, verified domains and federated identity links |
| Organizations and projects | Memberships, invitations, custom roles, settings and ownership |
| Questionnaires | Project-owned definitions, revisions, semantic versions and pinned snapshots |
| Collection | Sessions, responses, events, variables, trials and assignment/quota state |
| Media | Asset metadata and storage keys in PostgreSQL; bytes in S3-compatible storage |
| Collaboration | Yjs document state and revision coordination, with WebSocket/Redis transport |
| Governance | Audit, retention, legal hold and durable object-deletion records |
| Study series | Enrollments and scheduling; these do not yet implement the separate person/group domain |

Read all subsequent migrations when inspecting a table: initial creation alone does
not describe the current columns, constraints or policies. API types are generated
from the Rust OpenAPI contract into [packages/contracts](../packages/contracts).
The portable QDef contract is distinct from the installation database schema.

## Authorization and connections

The migration role owns schema changes. The non-superuser, non-BYPASSRLS
`qdesigner_app` role serves application requests. Middleware pins a transaction and
sets the relevant transaction-local context: authenticated user, fillout session or
series enrollment. PostgreSQL helpers such as `public.current_app_user_id()` read that
context.

Application authorization enters through `authz::authorize`, with the remaining
[documented exceptions](../docs/decisions/0030-divergence-ledger.md). Its decisions
are independent of RLS; RLS remains a separate defense on data queries. Policies
are deliberately different for study data and tables with anonymous read paths.

Read [ADR 0012](../docs/decisions/0012-fillout-dual-path-rls.md),
[ADR 0014](../docs/decisions/0014-qdesigner-app-role.md),
[ADR 0015](../docs/decisions/0015-anon-read-rls-exempt.md),
[ADR 0032](../docs/decisions/0032-authz-tiered-scopes-rls-independent.md), and
[ADR 0033](../docs/decisions/0033-cross-org-project-membership-replaces-shares.md)
before changing ownership or access policies.

## Changes and verification

Add an ordered migration for schema changes. Startup applies migrations through
`DATABASE_URL_MIGRATIONS`; runtime queries use `DATABASE_URL`. SQLx macro changes also
require committed offline metadata, as described in
[ADR 0024](../docs/decisions/0024-sqlx-offline-macros.md).

Use the Rust integration harness and authorization/RLS tests to verify behavior as
the application role. Successful queries as the migration owner do not establish
that application requests can access the same rows.
