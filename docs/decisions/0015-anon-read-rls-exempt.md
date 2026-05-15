# ADR 0015 — RLS-exempt tables for intentional anonymous reads

**Status:** Accepted (2026-05-15). Discovered mid-P6.2 during the
verification round following ADR 0014's role switch. Records the
P6.2-mid plan amendment recorded in
[PHASE_6_PLAN.md §P6.2](PHASE_6_PLAN.md). Extends the
`questionnaire_definitions` exemption from [ADR 0012](0012-fillout-dual-path-rls.md).

## Decision

Three tables are exempt from row-level security because their read
path is **intentionally public-anonymous product behaviour**:

| Table | Anonymous read path | DISABLE migration |
|---|---|---|
| `questionnaire_definitions` | `GET /api/q/by-code/{code}` — fill out a published questionnaire | `00021_fillout_dual_policies.sql` (P6.3, scheduled) |
| `users` | login / register / password-reset / verify-email (read by email) | `00020_admin_mutation_policies.sql` (P6.2, this commit) |
| `organizations` | `GET /api/domains/auto-join` (read by domain) | `00020_admin_mutation_policies.sql` (P6.2, this commit) |

The remaining admin tables (`organization_members`, `projects`,
`project_members`, `media_assets`) keep RLS — they have no legitimate
public-anonymous read path, and cross-tenant SELECT denial there is
the load-bearing defense-in-depth contribution.

The fillout-path tables (`sessions`, `responses`, `interaction_events`,
`session_variables`) keep RLS with the dual-path policies from
ADR 0012 — `session_id`-bound anonymous reads have isolation because
the GUC binds them to a single session.

## Why

The empirical discovery in P6.2: under `qdesigner_app` (post-P6.1 role
switch), an unauthenticated `SELECT … FROM users WHERE email = $1` at
login returns zero rows. The 00014 `users_select` policy requires
`id = current_app_user_id()`, and anonymous routes have no
`app.user_id` GUC. The policy filters everything out before the
password check even runs.

The same applies to:
- `users` reads at registration (uniqueness probe), login, password
  reset, email verification.
- `organizations` reads at domain auto-join.

These are intentional product behaviours. The user types an email,
the server has to find the matching row. The product *requires* the
anonymous read path.

RLS cannot protect a row that, by design, is readable to anonymous
traffic. The 00014 policies on `users` and `organizations` were
incoherent: they declared "you can only read your own row" but the
auth flows had to *first* read the row to know who "you" are. Pre-
Phase-6 the contradiction was invisible because `qdesigner` bypassed
RLS unconditionally. Phase 6's role switch is what surfaced it.

Three other options were considered and rejected:

- **NULL-GUC bootstrap admission** — modify each SELECT policy from
  `id = current_app_user_id()` to `(current_app_user_id() IS NULL OR
  id = current_app_user_id())`. Authenticated traffic that
  accidentally uses `&state.pool` (skipping the Phase 5 Tx invariant)
  would silently elevate to full-table access. The footgun is
  asymmetric: forgetting Tx makes a handler more permissive, not less,
  which is the wrong direction for defense-in-depth.

- **Bootstrap-mode middleware** on `/api/auth/*` that sets a sentinel
  GUC the policy admits. Adds middleware complexity, leaks the
  sentinel into every policy clause, and the sentinel itself becomes
  a confused-deputy target.

- **Separate `qdesigner_anon` role** for anonymous routes with
  selective RLS bypass. Multi-role — exactly the pattern ADR 0014
  rejected in favour of two roles total.

DISABLE is the principled answer: don't apply RLS to a table whose
read path is public by design. ADR 0012 already established the
precedent for `questionnaire_definitions`. ADR 0015 extends it to the
other two tables in the same category.

## Threat-model argument

The RLS-on-admin-table claim from ADR 0011 / ADR 0013 is "cross-tenant
SELECT denial if a SQL-injection or compromised handler issues a
`SELECT * FROM <admin>` without an `api/access::*` gate." The argument
holds for `organization_members`, `projects`, `project_members`,
`media_assets` — none of those have a public-read flow, so any
unauthenticated SELECT against them is suspicious and RLS bites.

The argument **does not hold** for `users` and `organizations`:

- An attacker reading `SELECT * FROM users` learns email addresses
  (and password hashes if they have field-level read). RLS on `users`
  would deny that read for the anonymous attacker. But the same
  attacker can iterate `POST /api/auth/login` with candidate emails
  and learn email-existence from the timing of "Invalid credentials"
  responses (or worse, distinct "user not found" vs "wrong password"
  messages). The leak is fundamental to having a login endpoint at
  all; RLS on `users` doesn't change it.
- `organizations` by domain at auto-join: the threat (an attacker
  enumerating orgs via domain probes) exists whether or not RLS
  protects the SELECT; the endpoint *is* the probe surface.

In other words: RLS on these two tables would be theatre on the
exact attack surface that motivates having RLS at all. The real
authorization gate for "user A can't read user B's profile *in an
authenticated context*" is `api/access::*` walking the
`organization_members` join, and that gate runs against a table that
still has RLS, so it's defense-in-depth where defense-in-depth
matters.

## Authenticated-side protection chain (post-P6.2)

For reference; this is what the system enforces after P6.2 lands:

| Operation | Layer that gates |
|---|---|
| `GET /api/users/{id}` (read another user's profile) | `api/access::*` + RLS on `organization_members` (the join) |
| `GET /api/organizations/{id}` (read another org) | `api/access::*` + RLS on `organization_members` (the join) |
| `GET /api/projects/{id}` (read another project) | `api/access::*` + RLS on `projects` (still bound) |
| `POST /api/auth/login` (public read by email) | password hash check; RLS exempt by ADR 0015 |
| `GET /api/domains/auto-join` (public read by domain) | rate limit + domain match; RLS exempt by ADR 0015 |
| `GET /api/q/by-code/{code}` (public read of published questionnaire) | `status='published'` check; RLS exempt by ADR 0012 |

## Consequences

- Two `ALTER TABLE … DISABLE ROW LEVEL SECURITY` statements land in
  `00020_admin_mutation_policies.sql` alongside the permissive
  mutation policies.
- The `users_select` / `organizations_select` policies from 00014
  remain declared but no longer enforce (RLS is off on those tables).
  Leaving them in place is harmless; deleting them would require a
  `DROP POLICY` clause in 00020 that adds noise for no operational
  benefit. A future cleanup ADR could drop them; out of scope here.
- `tests/rls_enforcement.rs` (P6.6) covers cross-tenant denial on
  `projects` and `organization_members` (still RLS-bound), not on
  `users` or `organizations` (intentionally exempt).
- Operational checklist update: when adding a new public-anonymous
  read endpoint, audit whether RLS on the table it reads becomes
  incoherent. If yes, propose a new ADR-0015-style exemption. If no,
  the read is anonymous-but-RLS-bound (acceptable when the policy
  body admits NULL-or-matching, as for fillout-path).
- Spot-check confirmed during P6.2 mid-step: no handler runs
  `SELECT * FROM users` or `SELECT * FROM organizations` without a
  WHERE clause that narrows by id / email / slug / domain. The
  reduction in defense-in-depth surface is bounded to "anonymous read
  by email/domain" — the same surface the product endpoints already
  expose.

## What this ADR does *not* do

- It does not weaken the authenticated-side cross-tenant SELECT
  denial. Authenticated handlers reading `users` or `organizations`
  by id still go through `api/access::*`, and the joins they perform
  against `organization_members` / `projects` are still RLS-bound.
- It does not affect the dual-path policies from ADR 0012; the
  fillout-path tables remain RLS-bound with the dual GUC.
- It does not foreclose re-enabling RLS on `users` or `organizations`
  in a future phase if the threat model shifts. The mutation policies
  declared in 00020 mean a future `ENABLE ROW LEVEL SECURITY;` on
  either table doesn't default-deny writes.
