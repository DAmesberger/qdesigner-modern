//! Response-hardening headers for the API surface.
//!
//! The server previously sent none at all. What it sends now is deliberately
//! short, because most of the well-known list is either inert on a JSON API or
//! actively dangerous here:
//!
//! * **`X-Content-Type-Options: nosniff`** — the API returns JSON, and the
//!   media proxy (`GET /api/media/{id}/content`) returns *participant-uploaded
//!   bytes* under a `Content-Type` this server chose. Without `nosniff` a
//!   browser may disregard that type and sniff the bytes as HTML, which turns an
//!   uploaded file into stored XSS on the API origin. This is the one header
//!   here that stops a live attack rather than hardening a hypothetical.
//!
//! * **`X-Frame-Options: DENY`** — no API response is a document meant to be
//!   framed. Whether the *fillout page* may be embedded in a study platform is a
//!   real product question, but that page is served by SvelteKit, not here, and
//!   its answer belongs in the frontend's CSP `frame-ancestors`. Denying on the
//!   API cannot foreclose that decision.
//!
//! * **`Referrer-Policy: no-referrer`** — load-bearing on exactly one route.
//!   `GET /api/sso/callback?code=…&state=…` is a *navigation*, and it 303s to
//!   the app; under the browser default the authorization code would ride along
//!   in the `Referer` of the next request. The API has no use for referrers
//!   anywhere else, so the strictest value is also the free one.
//!
//! * **`Strict-Transport-Security`** — only when the request demonstrably
//!   arrived over TLS (see [`security_headers`]). HSTS is a *sticky*, hard-to-
//!   reverse promise: a stray `max-age` served once from `http://localhost:4100`
//!   pins that origin to https in the developer's browser for a year, and this
//!   server terminates no TLS of its own.
//!
//! Two headers are pointedly **not** set:
//!
//! * **`Permissions-Policy`** is a document-scoped policy. On a JSON response it
//!   is inert bytes, and the document it *would* govern — the fillout runtime —
//!   legitimately needs `camera`, `microphone`, and WebHID (ADR 0024). Writing a
//!   restrictive one here would be cargo-cult now and a trap for whoever later
//!   copies it onto the document.
//!
//! * **`Cross-Origin-Resource-Policy`** is left alone on purpose. The fillout
//!   document runs cross-origin isolated (COOP + COEP `require-corp`, and per
//!   `hooks.server.ts` that isolation is what buys the platform's sub-ms timing
//!   guarantee). Under `require-corp` every subresource must satisfy CORP, and
//!   the API is a *different origin* from the app in the standard dev topology
//!   (5173 → 4100). Stamping `same-origin` on media responses is precisely how
//!   you would break stimulus loading, and the failure would be silent —
//!   degraded timing, not an error. Not worth it for a header whose benefit here
//!   is marginal.
//!
//! CSP for HTML documents is the SvelteKit layer's job; this middleware never
//! touches it.

use axum::extract::{Request, State};
use axum::http::header::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;

use crate::state::AppState;

const NOSNIFF: HeaderName = HeaderName::from_static("x-content-type-options");
const FRAME_OPTIONS: HeaderName = HeaderName::from_static("x-frame-options");
const REFERRER_POLICY: HeaderName = HeaderName::from_static("referrer-policy");
const HSTS: HeaderName = HeaderName::from_static("strict-transport-security");
const FORWARDED_PROTO: HeaderName = HeaderName::from_static("x-forwarded-proto");

/// One year, with subdomains. No `preload` — that submits the domain to a list
/// baked into browser binaries, which is an operator's decision to make (and
/// months to undo), not a default to inherit from a middleware.
const HSTS_VALUE: &str = "max-age=31536000; includeSubDomains";

/// Add the security headers to every response.
///
/// Headers are only *added*, never overwritten: a handler that has already
/// spoken for one of these (none do today) keeps its value.
///
/// HSTS is emitted only when the request arrived over TLS, which this server can
/// only know second-hand — it speaks plain HTTP and expects a terminating proxy.
/// So the signal is `X-Forwarded-Proto: https`, and it is trusted **only when
/// `TRUSTED_PROXY_HOPS >= 1`** — i.e. when an operator has declared that a proxy
/// is in front and is rewriting that header. Without that declaration the header
/// is client-supplied and a browser could be talked into pinning an origin the
/// operator never meant to pin. Local dev sets no hops, so it can never emit
/// HSTS, whatever a client claims.
pub async fn security_headers(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let over_tls = state.config.trusted_proxy_hops.unwrap_or(0) >= 1
        && request
            .headers()
            .get(&FORWARDED_PROTO)
            .and_then(|v| v.to_str().ok())
            // A chain of proxies may append; the rightmost entry is the one
            // written by the proxy closest to us — the only one we trust.
            .and_then(|v| v.rsplit(',').next())
            .map(|proto| proto.trim().eq_ignore_ascii_case("https"))
            .unwrap_or(false);

    let mut response = next.run(request).await;
    let headers = response.headers_mut();

    let mut set = |name: HeaderName, value: &'static str| {
        if !headers.contains_key(&name) {
            headers.insert(name, HeaderValue::from_static(value));
        }
    };

    set(NOSNIFF, "nosniff");
    set(FRAME_OPTIONS, "DENY");
    set(REFERRER_POLICY, "no-referrer");
    if over_tls {
        set(HSTS, HSTS_VALUE);
    }

    response
}
