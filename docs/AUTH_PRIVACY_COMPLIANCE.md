# Auth Privacy And Compliance Notes

QDesigner auth uses Zitadel as the primary OIDC provider in shared/production deployments and keeps local email/password auth only for local development.

## Data Categories

- Local user record: user id, email, email verification status, optional display name/avatar, locale/timezone, timestamps.
- External identity link: provider, issuer, subject, linked user id, email at link time, email verification at link time, created/last-seen timestamps.
- Browser session: hash of the opaque `qd_session` cookie, user id, provider, issuer/subject, MFA status, idle/absolute expiry, revoked timestamp, pseudonymized IP prefix/hash, user-agent hash.
- Upstream OIDC tokens: access/refresh/id tokens stored server-side only, encrypted at rest with `AUTH_TOKEN_ENC_KEY`.
- Login state: hash of OIDC `state`, hash of `nonce`, encrypted PKCE verifier, return target, exact redirect URI, issuer/endpoints, expiry.
- Security events: event type, outcome, optional user id, provider/issuer/subject, pseudonymized IP/user-agent correlation fields, minimal metadata, timestamp.

## Purpose And Basis

Purposes are authentication, MFA enforcement, session security, abuse investigation, account recovery support, and DSAR/security audit support. The lawful-basis determination is deployment-specific and must be completed by the controller before production release.

## Retention

- Login states: short-lived, purged after expiry.
- Active sessions: idle expiry defaults to 8 hours; absolute expiry defaults to 7 days.
- Revoked/expired sessions: retained for 30 days by default, then purged.
- Security events: retained for the configured security-event period, default 365 days.
- Upstream token material: deleted on logout/account erasure and removed when sessions are purged.

## Minimisation And Security

Default Zitadel scopes are `openid email offline_access`; `profile` is opt-in. Browser JavaScript never receives access, refresh, or ID tokens. Cookies are opaque, `HttpOnly`, `Secure` by default, and `SameSite=Lax`. CSRF protection is session-bound through `X-CSRF-Token`.

Raw auth tokens, cookie values, full IP addresses, and full user-agent strings must not be logged. IPs are stored as a coarse prefix plus keyed hash for correlation.

## DSAR And Erasure

Org exports include minimized auth identity/session/security-event rows for organization members. Account deletion revokes sessions, deletes external identity links, removes encrypted token material, and anonymizes local profile fields. Security events remain append-only with minimized or pseudonymized personal data.

## Subprocessors

If using Zitadel Cloud, production release requires an accepted DPA, subprocessor review, and transfer-safeguard review. If that gate fails, deploy self-hosted Zitadel with the same OIDC contract.
