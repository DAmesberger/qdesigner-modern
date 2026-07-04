# ADR 0020 — Org member role-change endpoint

**Status:** Accepted (2026-07-04). Phase 8. Closes the gap deferred in
Phase 7, where the admin Users page shipped role display + member
removal but the role control was left disabled with the note
"backend endpoint pending".

## Context

The admin Users page (`apps/web/src/routes/(app)/admin/users/+page.svelte`)
lists org members and, as of the Phase 8 design-system pass, lets an
admin remove a member. It had no way to *change* a member's org role
because no backend endpoint existed. `POST /api/organizations/{id}/members`
(`add_member`) can upsert a role via `ON CONFLICT … DO UPDATE`, but it
is email-addressed (invite/add semantics), owner-gates only the *grant*
of owner, and has no last-owner guard — it is the wrong tool for an
in-place role edit driven by a per-row control.

## Decision

Add an authenticated endpoint:

```
PUT /api/organizations/{id}/members/{user_id}/role
body: { "role": "owner" | "admin" | "member" | "viewer" }
```

Handler: `api::organizations::change_member_role`. It follows the house
handler style — `Tx` extractor, `AuthenticatedUser`, `State<AppState>`,
`sqlx` against `&mut **tx`, `ApiError` variants — and reuses the same
`state.rbac.has_org_role(...)` authorization pattern as the sibling
`add_member` / `remove_member` handlers.

### Authorization rules

1. **Valid role.** `role` must be one of `owner | admin | member | viewer`,
   else `400`. (String-validated in the handler, mirroring `add_member`;
   the `OrgRole` enum in `rbac/models.rs` remains the canonical set.)
2. **Caller is at least Admin.** `has_org_role(caller, org, Admin)` must
   hold, else `403`. This is the baseline gate for member management,
   identical to `remove_member`.
3. **Target must be an active member.** Looked up by
   `(organization_id, user_id, status='active')`; missing → `404`.
4. **Owner is owner-gated in both directions.** Granting owner
   (`new_role == 'owner'`) *or* revoking owner (`current_role == 'owner'`)
   requires the caller to be an Owner, else `403`. An Admin may shuffle
   members among admin/member/viewer but may neither mint nor unseat an
   owner. This mirrors `add_member`'s "only owners can assign the owner
   role" rule and closes the symmetric revoke side that `add_member`
   never had to consider.
5. **Last-owner guard.** If the target is currently an owner and the new
   role is not owner, count active owners; if `<= 1`, reject with `400`
   ("Cannot demote the last remaining owner"). This is the exact analogue
   of the guard already in `remove_member`, and it protects the
   demote-self-as-sole-owner path as well as demoting another sole owner.
6. **No-op fast path.** If `new_role == current_role`, return success
   without an UPDATE.

The UPDATE is scoped `WHERE organization_id = $1 AND user_id = $2 AND
status = 'active'`.

### Frontend

- `api.organizations.members.changeRole(orgId, userId, role)` added in
  `apps/web/src/lib/services/api.ts` alongside `members.remove`. Because
  the generated contracts SDK has no `changeMemberRole` helper yet (it
  regenerates from the OpenAPI that this change now registers), the
  method calls the underlying hey-api `apiClient.put(...)` directly,
  matching the SDK's own `(client).put({ url, path, body })` shape and
  routing through the existing `callSdk` 401-refresh wrapper.
- The Users page renders a role `<select>` per member (replacing the
  static badge) when the current user may edit that member; otherwise it
  shows the read-only badge. Client-side gating mirrors the server:
  only owner/admin see the control, the `owner` option is disabled
  unless the current user is an owner, an existing owner row is only
  editable by an owner, and the current user's own row is not editable
  (self-lockout guard). Changes go through a `confirm()`, apply
  optimistically, toast on success, refetch the authoritative list, and
  roll back + toast on error.

## Consequences

- `openapi.rs` registers the new path and `ChangeMemberRoleRequest`
  schema, so a contracts regeneration will produce a first-class
  `changeMemberRole` SDK helper; the direct `apiClient.put` call can be
  swapped for it at that point with no behavioural change.
- Server-side authorization is the real gate; the frontend gating is UX
  only. The last-owner and owner-grant/revoke invariants are enforced in
  the handler and cannot be bypassed by a crafted request.
- `organization_members` is an admin-RLS-bound table (ADR 0013): its
  mutation policies are permissive `WITH CHECK (true)` and the handler's
  `has_org_role` checks are the authorization gate, consistent with
  every other admin mutation. The UPDATE runs inside the per-request
  RLS transaction (ADR 0011).
- The endpoint is idempotent (no-op when the role is unchanged), so the
  optimistic-then-refetch client flow is safe against double-submits.

## What this ADR does not do

- It does not change `add_member` / `remove_member`; the new handler is
  additive.
- It does not introduce a new role or touch the `OrgRole` enum.
- It does not add a DB-level trigger for the last-owner invariant; the
  guard lives in the handler (as it already does for `remove_member`).
  A schema-level constraint could be a future hardening step but is out
  of scope here.
