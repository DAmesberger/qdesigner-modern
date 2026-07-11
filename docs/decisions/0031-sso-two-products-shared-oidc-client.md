# 0031 — SSO is two products; the OIDC mechanism is one `OidcClient`

Status: accepted (2026-07-11, grilling session). First decision record for
the SSO surface — until now its choices lived only in remediation docs
(AUTH_PRIVACY_COMPLIANCE.md, FOLLOWUPS.md F-27, gap-plan R5-2).

## Context: two deliberate products, one duplicated mechanism

`zitadel_auth.rs` and `sso.rs` are **not** accidental duplication:

- `zitadel_auth.rs` is the **platform's primary authentication** — Zitadel
  as the primary OIDC provider, server-side opaque `qd_session` cookies;
  browser JavaScript never receives access, refresh, or ID tokens.
- `sso.rs` is **per-organization enterprise IdP federation** — JIT user +
  membership provisioning, group→role mapping, AES-GCM-encrypted per-IdP
  client secrets.

What *is* duplicated is the OIDC mechanism itself: both files independently
implement discovery, PKCE/state/nonce, authorization-code exchange, JWKS
fetch, and id_token validation — and they have already drifted on
security-relevant behavior (Zitadel compares a nonce *hash*, sso compares
the *raw* nonce). A security fix to one token exchange must currently be
remembered twice.

## Decision

Extract the mechanism into one `OidcClient` module. Its interface: callers
hand it provider config and callback parameters; it returns **verified
claims** or an error. It owns discovery, PKCE/state/nonce generation and
verification, code exchange, JWKS fetch, and id_token signature+claims
validation — unverified tokens never cross the interface, so a caller
cannot skip validation. Both callers keep their divergent downstream
products (opaque-session minting vs JIT federation) and their own
login-state storage.

- **Protocol-scoped seam.** SAML is deferred, not cut (F-27; R5-2 rejects
  SAML IdP creation until the ACS ships). When the SAML assertion-consumer
  path is built, it lives beside the `OidcClient`, selected by the IdP's
  `protocol` — it does not route through the OIDC client.
- **Nonce convention: hashed at rest**, for both callers (resolves the
  drift in Zitadel's favor). Login-state rows store only a nonce hash; the
  client hashes the id_token's nonce claim and compares. A leaked
  login-state row never yields a replayable raw nonce. `sso.rs`'s
  login-state column switches to storing the hash; in-flight logins during
  the deploy fail and simply retry.
- **Error mapping:** `From<reqwest::Error> for ApiError` (and a crypto
  variant as needed) lands with the extraction, absorbing the ad-hoc
  `map_err` chains at the OIDC edges.

Gate: a dedicated rejection-matrix suite on the client's interface against
a wiremock fake IdP — happy path plus bad signature, unknown kid, nonce
mismatch, expired token, wrong issuer, algorithm confusion. Existing
sso/zitadel flow tests stay green untouched (except the nonce-hash change,
whose test updates ship in the same commit).

## Rejected

- **Transport-only client** (callers keep their own id_token validation):
  leaves the riskiest duplicated code — JWKS validation, where drift
  already happened — duplicated.
- **Client-owned login-state storage**: the two callers store login state
  differently; absorbing storage drags a schema unification into a pure
  code extraction.
- **Defer until SAML ACS exists**: safer seam placement in theory, but
  SAML has no schedule and OIDC's mechanism boundary is already defined by
  the spec; the duplication would persist indefinitely.
- **`NonceExpectation::Raw|Hashed` parameter** (client accepts both
  conventions): institutionalizes the drift instead of resolving it.
