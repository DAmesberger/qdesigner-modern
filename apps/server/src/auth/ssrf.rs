//! Outbound-request guard for the OIDC/SSO surface (SSRF).
//!
//! Every URL this server fetches on the SSO path is, ultimately, **attacker
//! controlled**: signup is open, so anyone can create an organization, become
//! its owner, and register an identity provider whose `metadata_url` points
//! wherever they like. The discovery document that comes back then supplies
//! `authorization_endpoint` / `token_endpoint` / `jwks_uri`, which the server
//! fetches in turn — so a single attacker-controlled response steers the
//! server's *subsequent* requests too. Unguarded, that is a full SSRF into the
//! deployment's own network: cloud instance metadata (`169.254.169.254` → IAM
//! credentials), Postgres, Redis, MinIO.
//!
//! The guard is two enforcement points over one [`OutboundPolicy`], because
//! neither alone is sufficient:
//!
//! 1. **[`OutboundPolicy::validate_url`]** — a synchronous check of the URL
//!    itself: scheme, credentials, and (when the host is an IP *literal*) the
//!    address. This one is load-bearing rather than merely a nice error
//!    message: hyper's connector parses an IP-literal host directly and
//!    **never calls the DNS resolver**, so `http://169.254.169.254/` would sail
//!    straight past a resolver-only guard.
//!
//! 2. **[`GuardedResolver`]** — the [`reqwest::dns::Resolve`] implementation
//!    installed on the client, which is where every *hostname* is turned into
//!    addresses. It resolves once, drops every non-public address from the
//!    answer, and fails the connection if nothing survives.
//!
//! **DNS rebinding / TOCTOU is closed by construction, not by re-checking.**
//! The naive shape — resolve the hostname, decide it is public, then hand the
//! *name* to reqwest and let it resolve again — leaves a window in which the
//! second answer differs from the first (a DNS record with a 0s TTL that
//! alternates between a public IP and `169.254.169.254`). Here there is no
//! second resolution to disagree with: the resolver *is* the connector's
//! resolver, the addresses it returns are the addresses hyper connects to, and
//! the filtering happens between those two steps. A rebinding record cannot
//! win a race that is never run.
//!
//! **Redirects are not followed** ([`guarded_client`] sets
//! `redirect::Policy::none()`), and callers require a 2xx. A 302 to
//! `169.254.169.254` is therefore inert — it is not followed, and it is not a
//! success status either.
//!
//! ## The dev/test exemption
//!
//! Loopback is exactly what a local Zitadel (`http://localhost:8080`) and the
//! wiremock IdP in the test-suite look like — and it is also exactly what an
//! attacker wants. So the exemption is an **explicit host allowlist**
//! (`SSO_ALLOWED_INSECURE_HOSTS`), empty by default. A host on that list may be
//! reached over plain `http` and its addresses are not filtered. Nothing is
//! exempt in production unless an operator writes it down.

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::Arc;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::Url;

use crate::config::Config;
use crate::error::ApiError;

/// Timeout applied to every outbound IdP request (discovery, token, JWKS,
/// introspection, revocation).
const HTTP_TIMEOUT_SECS: u64 = 10;

type BoxErr = Box<dyn std::error::Error + Send + Sync>;

/// Which outbound hosts the SSO path may reach.
///
/// The policy is "public internet over https, and nothing else" plus an
/// operator-written allowlist of hosts that may also be reached over plain
/// `http` at a non-public address (local dev IdPs, the test suite's wiremock).
#[derive(Debug, Clone, Default)]
pub struct OutboundPolicy {
    /// Lowercased hostnames (or IP literals) exempt from the scheme and
    /// address checks. Empty in production.
    exempt_hosts: HashSet<String>,
}

impl OutboundPolicy {
    /// The policy an operator configured, via `SSO_ALLOWED_INSECURE_HOSTS`.
    pub fn from_config(config: &Config) -> Self {
        Self::with_exempt_hosts(config.sso_allowed_insecure_hosts.iter().map(|s| s.as_str()))
    }

    /// A policy exempting the given hosts. The production posture is an empty
    /// iterator.
    pub fn with_exempt_hosts<'a>(hosts: impl IntoIterator<Item = &'a str>) -> Self {
        Self {
            exempt_hosts: hosts
                .into_iter()
                .map(|h| h.trim().trim_matches(['[', ']']).to_ascii_lowercase())
                .filter(|h| !h.is_empty())
                .collect(),
        }
    }

    /// Is this host on the operator's allowlist? Exact match — `evil.com` does
    /// not become exempt by being named `localhost.evil.com`. IPv6 literals are
    /// compared without their URL brackets.
    fn is_exempt(&self, host: &str) -> bool {
        if self.exempt_hosts.is_empty() {
            return false;
        }
        self.exempt_hosts
            .contains(&host.trim_matches(['[', ']']).to_ascii_lowercase())
    }

    /// Validate a URL the server is about to fetch (or hand to the browser as
    /// an IdP redirect).
    ///
    /// Rejects: anything that is not `http(s)`; `http` to a non-exempt host;
    /// embedded credentials; and an IP-literal host that is not globally
    /// routable. A *hostname* passes here and is enforced at resolution time by
    /// [`GuardedResolver`] — this function deliberately performs no DNS, so it
    /// cannot be the half of a check-then-connect race.
    pub fn validate_url(&self, raw: &str) -> Result<Url, ApiError> {
        let url = Url::parse(raw).map_err(|_| blocked("is not a valid URL"))?;

        let host = url
            .host_str()
            .filter(|h| !h.is_empty())
            .ok_or_else(|| blocked("has no host"))?;
        let exempt = self.is_exempt(host);

        match url.scheme() {
            "https" => {}
            "http" if exempt => {}
            "http" => return Err(blocked("must use https")),
            _ => return Err(blocked("must be an http(s) URL")),
        }

        // Credentials in the URL are never legitimate for an IdP endpoint, and
        // `user:pass@` is a classic way to make a blocked host read as a
        // permitted one to a human reviewer.
        if !url.username().is_empty() || url.password().is_some() {
            return Err(blocked("must not embed credentials"));
        }

        // An IP-literal host never reaches the resolver (hyper parses it
        // directly), so it is checked here or not at all.
        if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
            if !exempt && is_blocked_ip(ip) {
                return Err(blocked("resolves to a non-public address"));
            }
        }

        Ok(url)
    }

    /// An HTTP client bound to this policy: guarded resolver, no redirect
    /// following, bounded timeout.
    pub fn client(self) -> Result<reqwest::Client, ApiError> {
        guarded_client(self)
    }
}

/// The rejection message. Deliberately uniform: it describes the URL the caller
/// *submitted*, never what the network said about it, so it cannot be used to
/// distinguish "connection refused" from "404" on an internal host. (The server
/// never connects to a blocked host at all, so there is nothing to report.)
fn blocked(reason: &str) -> ApiError {
    ApiError::BadRequest(format!("Identity provider URL {reason}"))
}

/// Build a [`reqwest::Client`] that can only reach what `policy` permits.
///
/// Three properties matter, and all three are set here rather than at the call
/// sites, so a new caller cannot forget one:
///
/// * `dns_resolver` — every hostname is resolved *by us*, once, and filtered.
/// * `redirect::Policy::none()` — a 302 into the private network is not
///   followed. (Callers additionally require 2xx, so a redirect is an error,
///   not a silently-empty success.)
/// * `timeout` — a blocked-hole target cannot pin a request open.
pub fn guarded_client(policy: OutboundPolicy) -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .dns_resolver(Arc::new(GuardedResolver {
            policy: Arc::new(policy),
        }))
        .build()
        .map_err(|e| ApiError::Internal(format!("HTTP client build failed: {e}")))
}

/// The connector's resolver. This is the *only* place a hostname on the SSO
/// path becomes an address, which is what makes DNS rebinding a non-issue: the
/// addresses returned here are the addresses hyper dials.
pub struct GuardedResolver {
    policy: Arc<OutboundPolicy>,
}

impl GuardedResolver {
    /// Standalone constructor, so the resolver's filtering can be exercised
    /// directly rather than only through a live connection attempt.
    pub fn new(policy: OutboundPolicy) -> Self {
        Self {
            policy: Arc::new(policy),
        }
    }
}

impl Resolve for GuardedResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let policy = self.policy.clone();
        Box::pin(resolve_filtered(policy, name.as_str().to_owned()))
    }
}

async fn resolve_filtered(policy: Arc<OutboundPolicy>, host: String) -> Result<Addrs, BoxErr> {
    // Port 0: hyper overrides it with the port from the URL (reqwest's `Resolve`
    // contract says so explicitly).
    let resolved: Vec<SocketAddr> = tokio::net::lookup_host((host.as_str(), 0))
        .await
        .map_err(|e| -> BoxErr { Box::new(e) })?
        .collect();

    if policy.is_exempt(&host) {
        return Ok(Box::new(resolved.into_iter()));
    }

    // A name that answers with both a public and a private address (the shape a
    // rebinding record takes) keeps only its public addresses — we connect to
    // what we validated, never to what merely came back.
    let permitted: Vec<SocketAddr> = resolved
        .into_iter()
        .filter(|addr| !is_blocked_ip(addr.ip()))
        .collect();

    if permitted.is_empty() {
        return Err(format!("{host} resolves only to non-public addresses").into());
    }
    Ok(Box::new(permitted.into_iter()))
}

/// Is this address off-limits? True for everything that is not globally
/// routable unicast — the guard is an allowlist of "the public internet",
/// expressed as a deny-list because `IpAddr::is_global` is still unstable.
pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_blocked_v4(v4),
        IpAddr::V6(v6) => is_blocked_v6(v6),
    }
}

fn is_blocked_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()                            // 127.0.0.0/8
        || ip.is_private()                      // 10/8, 172.16/12, 192.168/16
        || ip.is_link_local()                   // 169.254/16 — cloud metadata
        || ip.is_multicast()                    // 224/4
        || ip.is_broadcast()                    // 255.255.255.255
        || ip.is_documentation()                // 192.0.2/24, 198.51.100/24, 203.0.113/24
        || o[0] == 0                            // 0.0.0.0/8 "this network"
        || (o[0] == 100 && (o[1] & 0xc0) == 64) // 100.64/10 carrier-grade NAT
        || (o[0] == 192 && o[1] == 0 && o[2] == 0) // 192.0.0/24 IETF protocol assignments
        || (o[0] == 198 && (o[1] & 0xfe) == 18) // 198.18/15 benchmarking
        || o[0] >= 240 // 240/4 reserved
}

fn is_blocked_v6(ip: Ipv6Addr) -> bool {
    // `::ffff:127.0.0.1` is loopback wearing a v6 hat. Judge the address it
    // actually names.
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_blocked_v4(v4);
    }

    let s = ip.segments();

    // ::/96 — the unspecified address, `::1`, and the deprecated
    // IPv4-compatible form. None of it is a legitimate IdP.
    if s[0..6] == [0, 0, 0, 0, 0, 0] {
        return true;
    }

    // 64:ff9b::/96 (NAT64) and 2002::/16 (6to4) each carry an IPv4 address
    // inside them, and a v6-only host may genuinely reach a v4 IdP through the
    // former. Judge the address they embed rather than the wrapper.
    if s[0] == 0x0064 && s[1] == 0xff9b {
        if s[2..6] != [0, 0, 0, 0] {
            return true; // 64:ff9b:1::/48, a local-use translation prefix
        }
        let o = ip.octets();
        return is_blocked_v4(Ipv4Addr::new(o[12], o[13], o[14], o[15]));
    }
    if s[0] == 0x2002 {
        let [a, b] = s[1].to_be_bytes();
        let [c, d] = s[2].to_be_bytes();
        return is_blocked_v4(Ipv4Addr::new(a, b, c, d));
    }

    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()                    // ff00::/8
        || (s[0] & 0xfe00) == 0xfc00            // fc00::/7 unique-local
        || (s[0] & 0xffc0) == 0xfe80            // fe80::/10 link-local
        || (s[0] & 0xffc0) == 0xfec0            // fec0::/10 site-local (deprecated)
        || (s[0] == 0x0100 && s[1..4] == [0, 0, 0]) // 100::/64 discard-only
        || (s[0] == 0x2001 && s[1] == 0x0db8) // 2001:db8::/32 documentation
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().expect("test address parses")
    }

    fn open() -> OutboundPolicy {
        OutboundPolicy::default()
    }

    #[test]
    fn blocks_the_private_and_local_ipv4_ranges() {
        for addr in [
            "127.0.0.1",       // loopback
            "127.1.2.3",       // the rest of 127/8
            "10.0.0.1",        // private
            "172.16.5.4",      // private
            "192.168.1.1",     // private
            "169.254.169.254", // cloud instance metadata — the crown jewel
            "0.0.0.0",         // "this host"
            "100.64.0.1",      // CGNAT
            "192.0.0.1",       // IETF protocol assignments
            "198.18.0.1",      // benchmarking
            "224.0.0.1",       // multicast
            "255.255.255.255", // broadcast
            "240.0.0.1",       // reserved
        ] {
            assert!(is_blocked_ip(ip(addr)), "{addr} must be blocked");
        }
    }

    #[test]
    fn blocks_the_private_and_local_ipv6_ranges() {
        for addr in [
            "::1",                    // loopback
            "::",                     // unspecified
            "::ffff:127.0.0.1",       // IPv4-mapped loopback
            "::ffff:169.254.169.254", // IPv4-mapped metadata service
            "::127.0.0.1",            // deprecated IPv4-compatible
            "fc00::1",                // unique-local
            "fd12:3456::1",           // unique-local
            "fe80::1",                // link-local
            "fec0::1",                // site-local
            "ff02::1",                // multicast
            "64:ff9b::a9fe:a9fe",     // NAT64-wrapped 169.254.169.254
            "2002:a9fe:a9fe::1",      // 6to4-wrapped 169.254.169.254
            "2001:db8::1",            // documentation
        ] {
            assert!(is_blocked_ip(ip(addr)), "{addr} must be blocked");
        }
    }

    #[test]
    fn permits_public_addresses() {
        for addr in [
            "8.8.8.8",
            "1.1.1.1",
            "93.184.216.34",
            "2606:4700:4700::1111",
            "64:ff9b::8080:808", // NAT64-wrapped 128.128.8.8 — a public v4
        ] {
            assert!(!is_blocked_ip(ip(addr)), "{addr} must be permitted");
        }
    }

    #[test]
    fn rejects_ip_literal_urls_that_name_a_blocked_address() {
        // The case a resolver-only guard misses entirely: hyper parses an
        // IP-literal host itself and never asks the resolver.
        for url in [
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            "https://169.254.169.254/latest/meta-data/",
            "https://10.0.0.5/.well-known/openid-configuration",
            "https://[::1]:15434/",
            "https://[::ffff:127.0.0.1]/",
        ] {
            assert!(open().validate_url(url).is_err(), "{url} must be rejected");
        }
    }

    #[test]
    fn requires_https_for_non_exempt_hosts() {
        assert!(open().validate_url("http://idp.example.com/x").is_err());
        assert!(open().validate_url("https://idp.example.com/x").is_ok());
    }

    #[test]
    fn rejects_non_http_schemes() {
        for url in [
            "file:///etc/passwd",
            "gopher://idp.example.com/",
            "ftp://idp.example.com/",
            "redis://localhost:16381/",
        ] {
            assert!(open().validate_url(url).is_err(), "{url} must be rejected");
        }
    }

    #[test]
    fn rejects_embedded_credentials() {
        assert!(open()
            .validate_url("https://user:pass@idp.example.com/")
            .is_err());
    }

    #[test]
    fn exempt_hosts_may_use_http_and_loopback() {
        let policy = OutboundPolicy::with_exempt_hosts(["localhost", "127.0.0.1"]);
        assert!(policy.validate_url("http://localhost:8080/x").is_ok());
        assert!(policy.validate_url("http://127.0.0.1:41234/x").is_ok());
        // …and only those. The allowlist is an exact host match, so a
        // lookalike domain the attacker owns gains nothing from it.
        assert!(policy.validate_url("http://localhost.evil.com/x").is_err());
        assert!(policy.validate_url("http://169.254.169.254/x").is_err());
        assert!(policy.validate_url("http://10.0.0.1/x").is_err());
    }

    #[tokio::test]
    async fn resolver_drops_a_hostname_that_answers_with_a_blocked_address() {
        // This is the enforcement point for DNS-supplied addresses: `localhost`
        // resolves fine, and the resolver still refuses to hand hyper the
        // loopback address it got back.
        let resolver = GuardedResolver::new(OutboundPolicy::default());
        let err = resolve_filtered(resolver.policy.clone(), "localhost".into())
            .await
            .err()
            .expect("localhost must not resolve to a connectable address");
        assert!(err.to_string().contains("non-public"));
    }

    #[tokio::test]
    async fn resolver_passes_an_exempt_hostname_through() {
        let resolver = GuardedResolver::new(OutboundPolicy::with_exempt_hosts(["localhost"]));
        let addrs = resolve_filtered(resolver.policy.clone(), "localhost".into())
            .await
            .expect("an exempt host resolves");
        assert!(addrs.count() > 0);
    }
}
