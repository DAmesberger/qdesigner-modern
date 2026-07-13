# 0035 — SSO identities bind to verified domains; out-of-domain logins fail closed

Status: accepted (2026-07-13). Security fix for the one **critical** finding of
the 2026-07-12 full-vertical audit. Hardens the org-federation SSO product
introduced by ADR 0031 (which settled the *mechanism* — one `OidcClient`
returning verified claims — but not the *trust model* for who an IdP may
speak for).

## Context

`sso_callback` resolved a federated identity to a local account like this:

```sql
UPDATE users
SET idp_id = $1, external_subject = $2, email_verified = true, updated_at = now()
WHERE email = $3 AND deleted_at IS NULL
RETURNING id
```

It linked the federated subject to **any** pre-existing local account whose
email matched the id_token's `email` claim — with **no** check of the token's
`email_verified` claim and **no** binding of the email's domain to anything the
asserting organization owns. Provisioning a new account had the same hole.

The consequence is account takeover. An organization that controls an IdP (or
whose IdP is compromised or misconfigured) can mint an id_token asserting
`email: victim@othercompany.com` and the callback will bind that federated
subject to the victim's existing local account — and force
`email_verified = true` on the way through. The same hole allows email
squatting: provisioning an account bearing an address the asserter does not
control.

The platform already had everything needed to prevent this and simply did not
use it: `organization_domains` carries a `verified_at` column, and `resolve_sso`
already selects an org's IdP *through* its verified domains. The verification
data existed; the callback just never enforced it. The sibling `zitadel_callback`
already gated on `email_verified`, so even that precedent was in the tree.

## Decision

**An organization's IdP may only authenticate identities in domains that
organization has proven it owns.** Before **either** linking an existing account
**or** provisioning a new one, `sso_callback` requires **both**:

1. **`email_verified == true`** in the id_token. An IdP that will not vouch for
   the address cannot be used to claim it. (Mirrors `zitadel_auth.rs`.)
2. **The email's domain is a verified domain of the IdP's own organization** — a
   row in `organization_domains` with that `organization_id`, a matching
   (case-insensitive) `domain`, and `verified_at IS NOT NULL`.

Anything else **fails closed**: the login is rejected, no account is linked, none
is provisioned, no session is issued, and the response does not disclose whether
a local account exists for that address.

This is the standard model — Google Workspace, Okta, and Entra/Azure AD all bind
SSO to domains the tenant has verified. Domain verification is the *only* thing
that makes an IdP's email claim mean anything; without it, "SSO" is a stranger
asserting who you are.

## Consequences

The cost is real and deliberate: **an identity outside the org's verified
domains cannot sign in via that org's SSO** — a contractor carrying a personal
address in the company IdP, for example, is rejected until that domain is
verified. That is the intended trade. The alternative is that any IdP can speak
for any domain, which is precisely the vulnerability.

Orgs needing such a user have two supported paths: verify the domain in
question, or admit the person the ordinary way (an invitation — since ADR 0033,
including cross-org **project** membership, which needs no org membership at
all).

**Scope of the gates.** They guard the *binding* step — the branch that resolves
an id_token to a local account by **email**. A login whose `(idp_id,
external_subject)` already matches an existing row skips them deliberately: that
subject was bound by an earlier login that *did* pass the gates, the IdP is
re-authenticating an identity it demonstrably owns, and the account's email is
read back from the database rather than taken from the token. There is no
takeover surface there.

**Known residual (deliberate, not a hole).** If an organization's domain is
later *un*verified or revoked, subjects already bound under it keep signing in —
the gates run at binding time, not on every login. Re-checking on each login
would close it, at the cost of locking out every user the moment a DNS record
lapses. That is a separate trade and deserves its own decision; it is recorded
here so it is not mistaken for an oversight.

## Rejected

- **Check `email_verified` only, no domain binding.** Closes nothing. A
  compromised or malicious IdP simply asserts `email_verified: true` alongside
  whatever address it likes. This *is* the vulnerability.
- **Bind on link, provision freely.** Blocks takeover of an existing account but
  still lets an IdP squat an account bearing someone else's address, which
  poisons that address for its real owner and invites a later collision. Half a
  fix.
- **Trust the IdP because an org admin configured it.** The threat model
  includes the asserting org itself: org A configuring an IdP must not thereby
  gain the power to speak for org B's users. Tenant isolation is not a function
  of good intentions.
