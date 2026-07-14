//! One OIDC mechanism, shared by the two SSO products (ADR 0031).
//!
//! `api::zitadel_auth` (platform primary auth, opaque `qd_session`) and
//! `api::sso` (per-org enterprise federation, JIT provisioning) both need the
//! same OIDC machinery: discovery, authorization-code exchange, JWKS fetch, and
//! id_token signature + `iss`/`aud`/`exp` + nonce validation. They had each
//! grown their own copy, and the copies had already drifted on nonce handling.
//!
//! [`OidcClient`] owns that machinery and hands callers back only
//! [`VerifiedClaims`] — a value that can *only* be constructed by
//! [`OidcClient::verify_id_token`], so an unverified token can never cross the
//! interface. The two callers keep their divergent downstream flows and their
//! own login-state storage; only the mechanism is unified here.
//!
//! **Nonce is hashed at rest** for both callers (ADR 0031 resolves the drift in
//! Zitadel's favor). The caller stores `hash_token(nonce)` when it starts the
//! flow and hands the stored hash back at verification time;
//! [`OidcClient::verify_id_token`] hashes the id_token's `nonce` claim and
//! compares — a leaked login-state row never yields a replayable raw nonce.
//!
//! State/nonce/PKCE-verifier *generation* stays on the shared
//! [`session::random_token`](crate::auth::session::random_token) primitive both
//! products already used; PKCE `code_challenge` and discovery-URL construction
//! live here as free functions.
//!
//! The seam is protocol-scoped: a future SAML assertion-consumer path sits
//! beside this module (selected by the IdP's `protocol`), not inside it.
//!
//! **Every URL fetched here is attacker-controlled** — an org's `metadata_url`
//! is set by its (self-signed-up) owner, and the discovery document that comes
//! back names the token/JWKS/introspection endpoints fetched next. So the
//! client is built on [`auth::ssrf`](crate::auth::ssrf): it resolves and
//! filters its own DNS, follows no redirects, and validates each URL before the
//! request — *including* the endpoints that arrive inside a discovery document,
//! which is the hop a first-URL-only check would miss. There is no accessor for
//! the underlying `reqwest::Client`, so no caller can route an OIDC-adjacent
//! request around the guard.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::auth::session::hash_token;
use crate::auth::ssrf::OutboundPolicy;
use crate::config::Config;
use crate::error::ApiError;

/// The subset of an OIDC discovery document the flows consume. Unknown fields
/// are ignored; `introspection_endpoint`/`revocation_endpoint` are optional and
/// only the Zitadel flow reads them.
#[derive(Debug, Clone, Deserialize)]
pub struct DiscoveryDocument {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
    #[serde(default)]
    pub introspection_endpoint: Option<String>,
    #[serde(default)]
    pub revocation_endpoint: Option<String>,
}

/// An OIDC token endpoint response. `id_token` is always present; the rest are
/// optional and consumed only by callers that persist the token set (Zitadel).
#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub id_token: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub token_type: Option<String>,
    #[serde(default)]
    pub expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize)]
struct Jwk {
    kid: Option<String>,
    n: Option<String>,
    e: Option<String>,
}

/// Inputs to an authorization-code → token exchange. `code_verifier` is set by
/// PKCE flows (Zitadel); `client_secret` by confidential clients.
#[derive(Debug, Clone)]
pub struct CodeExchange<'a> {
    pub token_endpoint: &'a str,
    pub code: &'a str,
    pub redirect_uri: &'a str,
    pub client_id: &'a str,
    pub client_secret: Option<&'a str>,
    pub code_verifier: Option<&'a str>,
}

/// Inputs to id_token verification. `expected_nonce_hash` is the SHA-256 hex the
/// caller stored at authorization time (nonce hashed at rest, ADR 0031).
#[derive(Debug, Clone)]
pub struct IdTokenInput<'a> {
    pub id_token: &'a str,
    pub jwks_uri: &'a str,
    /// Expected `aud`.
    pub client_id: &'a str,
    /// Expected `iss`.
    pub issuer: &'a str,
    pub expected_nonce_hash: &'a str,
}

/// Claims that have passed signature, `iss`/`aud`/`exp`, and nonce verification.
///
/// The only constructor is [`OidcClient::verify_id_token`], so holding a
/// `VerifiedClaims` is proof the token was validated — a caller cannot fabricate
/// one from an unverified token.
#[derive(Debug, Clone)]
pub struct VerifiedClaims(serde_json::Value);

impl VerifiedClaims {
    /// A single claim by name, if present.
    pub fn get(&self, key: &str) -> Option<&serde_json::Value> {
        self.0.get(key)
    }

    /// The full verified claim object, for helpers that take `&Value`.
    pub fn as_json(&self) -> &serde_json::Value {
        &self.0
    }
}

/// The OIDC mechanism shared by both SSO products. Cheap to construct; wraps an
/// SSRF-guarded [`reqwest::Client`] (see [`auth::ssrf`](crate::auth::ssrf)) plus
/// the policy it was built from, so each URL can be re-validated at the moment
/// it is used.
pub struct OidcClient {
    http: reqwest::Client,
    policy: OutboundPolicy,
}

impl OidcClient {
    /// Build a client whose reachable network is whatever `config` permits —
    /// in production, https to the public internet and nothing else.
    pub fn new(config: &Config) -> Result<Self, ApiError> {
        Self::with_policy(OutboundPolicy::from_config(config))
    }

    /// Build a client against an explicit [`OutboundPolicy`], for tests that
    /// stand up an in-process IdP on loopback. Note what this is *not*: a
    /// bypass. There is no way to construct an `OidcClient` that skips the
    /// guard — only one that has been handed a different, equally-enforced
    /// policy.
    pub fn with_policy(policy: OutboundPolicy) -> Result<Self, ApiError> {
        Ok(Self {
            http: policy.clone().client()?,
            policy,
        })
    }

    /// Fetch and parse an OIDC discovery document from a fully-qualified URL
    /// (`.well-known/openid-configuration` or the IdP's configured metadata URL).
    ///
    /// The **endpoints inside the returned document are validated too**. They
    /// are the second half of the SSRF: an attacker who owns the discovery
    /// response owns `token_endpoint` and `jwks_uri`, which this server fetches
    /// next, and `authorization_endpoint`, which it hands the browser. Guarding
    /// only the URL we were *asked* for would leave that wide open — so a
    /// document naming a blocked endpoint is rejected whole, rather than
    /// partially accepted.
    pub async fn discover(&self, discovery_url: &str) -> Result<DiscoveryDocument, ApiError> {
        let url = self.policy.validate_url(discovery_url)?;
        let doc: DiscoveryDocument = self
            .get_json(url, "Identity provider discovery failed")
            .await?;

        for endpoint in [
            &doc.authorization_endpoint,
            &doc.token_endpoint,
            &doc.jwks_uri,
        ] {
            self.policy.validate_url(endpoint)?;
        }
        for endpoint in [&doc.introspection_endpoint, &doc.revocation_endpoint]
            .into_iter()
            .flatten()
        {
            self.policy.validate_url(endpoint)?;
        }

        Ok(doc)
    }

    /// Exchange an authorization code for tokens at the token endpoint.
    ///
    /// The endpoint is re-validated here even though [`discover`](Self::discover)
    /// already vetted it: between the two calls it made a round trip through the
    /// `sso_login_states` / `auth_login_states` table, and rows written before
    /// this guard existed are still in there.
    pub async fn exchange_code(&self, params: CodeExchange<'_>) -> Result<TokenResponse, ApiError> {
        let url = self.policy.validate_url(params.token_endpoint)?;

        let mut form: Vec<(&str, String)> = vec![
            ("grant_type", "authorization_code".to_string()),
            ("code", params.code.to_string()),
            ("redirect_uri", params.redirect_uri.to_string()),
            ("client_id", params.client_id.to_string()),
        ];
        if let Some(verifier) = params.code_verifier {
            form.push(("code_verifier", verifier.to_string()));
        }
        if let Some(secret) = params.client_secret {
            form.push(("client_secret", secret.to_string()));
        }

        self.post_form(
            url,
            &form,
            "Token exchange with the identity provider failed",
        )
        .await
    }

    /// POST a form to an OIDC-adjacent endpoint an IdP advertised — token
    /// introspection, token revocation — and parse the JSON response.
    ///
    /// Exists so those callers do not need a raw `reqwest::Client`: the URL goes
    /// through the same validation and the request through the same guarded
    /// client as the core flow.
    pub async fn post_form_json<T: DeserializeOwned>(
        &self,
        endpoint: &str,
        form: &[(&str, String)],
        failure: &'static str,
    ) -> Result<T, ApiError> {
        let url = self.policy.validate_url(endpoint)?;
        self.post_form(url, form, failure).await
    }

    /// POST a form and discard the response body — token revocation, whose
    /// outcome the caller only logs.
    pub async fn post_form_ignoring_response(
        &self,
        endpoint: &str,
        form: &[(&str, String)],
    ) -> Result<(), ApiError> {
        let url = self.policy.validate_url(endpoint)?;
        let response = self
            .http
            .post(url)
            .form(form)
            .send()
            .await
            .map_err(|e| upstream_failure("Identity provider request failed", e))?;
        if !response.status().is_success() {
            return Err(ApiError::BadRequest(
                "Identity provider request failed".into(),
            ));
        }
        Ok(())
    }

    async fn get_json<T: DeserializeOwned>(
        &self,
        url: reqwest::Url,
        failure: &'static str,
    ) -> Result<T, ApiError> {
        let response = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| upstream_failure(failure, e))?;
        Self::parse_success_json(response, failure).await
    }

    async fn post_form<T: DeserializeOwned>(
        &self,
        url: reqwest::Url,
        form: &[(&str, String)],
        failure: &'static str,
    ) -> Result<T, ApiError> {
        let response = self
            .http
            .post(url)
            .form(form)
            .send()
            .await
            .map_err(|e| upstream_failure(failure, e))?;
        Self::parse_success_json(response, failure).await
    }

    /// Require a 2xx and a parseable body, reporting only `failure` to the
    /// caller.
    ///
    /// The status check is not merely tidiness: redirects are not followed
    /// (`ssrf::guarded_client`), so a `302` to a blocked host arrives here as a
    /// response, and demanding 2xx is what stops it being treated as a
    /// (nonsense-but-successful) document.
    async fn parse_success_json<T: DeserializeOwned>(
        response: reqwest::Response,
        failure: &'static str,
    ) -> Result<T, ApiError> {
        let status = response.status();
        if !status.is_success() {
            tracing::warn!(status = %status, "{failure}");
            return Err(ApiError::BadRequest(failure.into()));
        }
        response
            .json()
            .await
            .map_err(|e| upstream_failure(failure, e))
    }

    /// Validate an id_token end to end: fetch the JWKS, select the signing key
    /// by `kid`, verify the RS256 signature, check `iss`/`aud`/`exp`, and
    /// confirm the nonce (by comparing the hash of the token's `nonce` claim to
    /// `expected_nonce_hash`). Returns [`VerifiedClaims`] only when all checks
    /// pass.
    pub async fn verify_id_token(
        &self,
        input: IdTokenInput<'_>,
    ) -> Result<VerifiedClaims, ApiError> {
        use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

        let header = decode_header(input.id_token)
            .map_err(|e| ApiError::BadRequest(format!("Bad id_token: {e}")))?;

        // Re-validated for the same reason as `token_endpoint` in
        // `exchange_code`: this URL was persisted in a login-state row.
        let jwks_url = self.policy.validate_url(input.jwks_uri)?;
        let jwks: Jwks = self
            .get_json(jwks_url, "Identity provider key set is unavailable")
            .await?;

        let jwk = select_signing_key(&jwks, header.kid.as_deref())?;
        let n = jwk
            .n
            .as_deref()
            .ok_or_else(|| ApiError::BadRequest("JWKS key missing modulus".into()))?;
        let e = jwk
            .e
            .as_deref()
            .ok_or_else(|| ApiError::BadRequest("JWKS key missing exponent".into()))?;

        let key = DecodingKey::from_rsa_components(n, e)
            .map_err(|e| ApiError::BadRequest(format!("Invalid JWKS RSA key: {e}")))?;

        // RS256-only. An HS256 token (algorithm-confusion attack) fails here
        // because its header `alg` is not in the allowed set.
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_audience(&[input.client_id]);
        validation.set_issuer(&[input.issuer]);

        let data = decode::<serde_json::Value>(input.id_token, &key, &validation)
            .map_err(|e| ApiError::BadRequest(format!("id_token validation failed: {e}")))?;
        let claims = data.claims;

        // Nonce hashed at rest: hash the token's nonce claim and compare to the
        // stored hash. A missing/other nonce yields no match.
        let nonce_matches = claims.get("nonce").and_then(|v| v.as_str()).map(hash_token)
            == Some(input.expected_nonce_hash.to_string());
        if !nonce_matches {
            return Err(ApiError::BadRequest("id_token nonce mismatch".into()));
        }

        Ok(VerifiedClaims(claims))
    }
}

/// Map an outbound failure to a **stable, outcome-independent** message.
///
/// The detail (`connection refused` vs `404` vs a TLS error vs a parse error)
/// goes to the log, not to the caller. Anyone can register an org and point its
/// IdP at a URL, so the response to `/api/sso/{slug}/start` is an oracle if it
/// says anything the caller did not already know; a single message per hop says
/// nothing. The SSRF guard means the server no longer *reaches* internal hosts
/// at all — this is the second lock on the same door.
fn upstream_failure(failure: &'static str, err: reqwest::Error) -> ApiError {
    tracing::warn!(error = %err, "{failure}");
    ApiError::BadRequest(failure.into())
}

/// Select the JWKS signing key. When the token header carries a `kid`, an exact
/// match is required — an unknown `kid` is rejected rather than silently falling
/// back, so a token cannot be verified against an unintended key. When the
/// header has no `kid`, the first RSA key is used.
fn select_signing_key<'a>(jwks: &'a Jwks, header_kid: Option<&str>) -> Result<&'a Jwk, ApiError> {
    match header_kid {
        Some(kid) => jwks
            .keys
            .iter()
            .find(|k| k.kid.as_deref() == Some(kid))
            .ok_or_else(|| ApiError::BadRequest("No matching JWKS key for id_token kid".into())),
        None => jwks
            .keys
            .iter()
            .find(|k| k.n.is_some() && k.e.is_some())
            .ok_or_else(|| ApiError::BadRequest("No usable JWKS key for id_token".into())),
    }
}

/// Build the discovery URL for an issuer that publishes its metadata at the
/// standard well-known path (Zitadel is configured by issuer, not metadata URL).
pub fn discovery_url(issuer: &str) -> String {
    format!(
        "{}/.well-known/openid-configuration",
        issuer.trim_end_matches('/')
    )
}

/// PKCE S256 code challenge: base64url(SHA-256(verifier)), no padding.
pub fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_challenge_is_stable_base64url() {
        // Known S256 vector from RFC 7636 appendix B.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            code_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn discovery_url_trims_trailing_slash() {
        assert_eq!(
            discovery_url("https://idp.example.com/"),
            "https://idp.example.com/.well-known/openid-configuration"
        );
        assert_eq!(
            discovery_url("https://idp.example.com"),
            "https://idp.example.com/.well-known/openid-configuration"
        );
    }

    #[test]
    fn unknown_kid_is_rejected() {
        let jwks = Jwks {
            keys: vec![Jwk {
                kid: Some("key-a".into()),
                n: Some("n".into()),
                e: Some("AQAB".into()),
            }],
        };
        assert!(select_signing_key(&jwks, Some("key-b")).is_err());
        assert!(select_signing_key(&jwks, Some("key-a")).is_ok());
    }

    #[test]
    fn no_kid_falls_back_to_first_rsa_key() {
        let jwks = Jwks {
            keys: vec![Jwk {
                kid: None,
                n: Some("n".into()),
                e: Some("AQAB".into()),
            }],
        };
        assert!(select_signing_key(&jwks, None).is_ok());
    }
}
