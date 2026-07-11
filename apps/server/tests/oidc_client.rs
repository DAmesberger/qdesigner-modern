//! Rejection-matrix suite for the shared [`OidcClient`] (ADR 0031).
//!
//! Exercises the mechanism's interface directly against a `wiremock` fake IdP —
//! no database needed. The happy path proves a valid token yields verified
//! claims; the rest prove each way a token can be forged or misused is rejected:
//! bad signature, unknown `kid`, nonce mismatch, expired, wrong issuer, and the
//! algorithm-confusion attack (an HS256 token offered where RS256 is required).

use chrono::Utc;
use serde_json::json;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use qdesigner_server::auth::oidc_client::{CodeExchange, IdTokenInput, OidcClient};
use qdesigner_server::auth::session::hash_token;

// Key A: signs the "good" tokens; its modulus is what the mocked JWKS advertises.
const KEY_A_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDE7Y/cZ8mIu1z6
daCLh0fu/096jXTG3t5hvgqeDca8gqpsbHdKsS07Bz1LARS3DWRKezT2RPzWLUxh
7i3eByqj+rXPSohl3bkLUPo1tkv+oIe1yrI+rNqJ66oopv5tb+a1GUc/D0eiAd+N
HdEYMMgx98nG6bwaBF09X7c9LvVD+5kWlhEf9vfzwZChKfbpSVPOlTAa5glwt3dM
Zo5d72XXO+KhhwG9lJcy89OMc1/dChRCaQLq0L6TqkdWpD2nC5beBjnTKJH233nr
/Ub3Fj66U+HXbo1RPDu/zQk82UQx7qe2PIp5YM8jYE2TZA7Z8d63ANKdI9xAk4PZ
3dCBcD8LAgMBAAECggEALoviRZvoiF+U7gRQkrpCl+yT2ilGUV1LXfn/43TpJRST
eLY4ihiP0tR2udxDC7NoIay2i4Ep6+vgEoOsJr815nVzdNAupjk+rDyTL4/rrX8/
JIqJEARmUVQ5L4utNqvM8cBMVUzkxxe/Qckq65dYMmtZr6D+m32tljyiAJ2xTkRm
/fA9qZOvGYPX3kY7rKQo5hPi5uEEMH7DhT4XSKlBlXSX19L6TmEus7K8Ut/4xfcl
hoPaSPAmMzTN8We9+KgREXRoBp6qe1irOV5aPBOCcwgwjiKcJlP+MWEhhGjgTRRp
B6EMC1i+cajlFsT9VvGJhrFIokU3+DXak2SH2os1fQKBgQDv9RLNmRac/GMHdpmh
C8JZ/yZWnMxslLTE2TDcYnmzx9LViy4ZF1GTEm7XyyxVv/DtzBLTPsHKQbcBNU4y
xxWHJWTEfiJHig/v1ukCEwJme+5HYtK4P6uHl0p9xdXgr68NvA2+yE4HCFQe60Qa
n3B+1eWgs1EpcFzT+iYN07d+NQKBgQDSGAf1rtTGmThak6ku+Q3x8rhZtyZpQ6XA
zZCyV3gSP27H4ox383TEXuYbnaRaQkAnAURETOKBNXebAW/3SN6GOO7G2PNVW2Gb
BWk4exthWEqOgomh1pbEvpRcntwcTl54gLBRPfzt3IooZhnjF4eSh0wj7mc7hymH
AjbxRe1wPwKBgFaWqAda48cYaB/MU1nC5YoWQV5lzHquGqEiAri0LFiMle8K/0J8
oKoir67dGQ2EastUpcJm1gVHO2OLOcGnB4SyIK+rGHGaR2/zrDdcZrRWqkBGT+W+
zAXsuSuzlR80JkYdgxRCMa3l+n0BxpyYxj5uryMTMglzC3xOuyaoLIG1AoGBAJcE
ySv0SWScnOKXA+UNB9YkWBm9SnIeO1aVLW7U6y2KxVIPalOLACNr59JwBcUPnFet
VGoYLjUcvuYAKYDCs5od8J2lM3zm3Al34UPFUlAuDCHWeaKIwwWXzMOrOaNrPgM2
1gcAHQDKJ9GUWwVfU4ejk7q8Ux56MQKoN+BFGME3AoGBAIlxECYk9FyXFT8gS7Fh
74P6D56BkEt0x3Iv4NR9hx7sJJO2EujqGKdGqG5n0VQ+gmK5GfN84iiwpvMEJi2N
ElwZOxry5NjETirgIEqgukaBPPHzIa29qVICNSbGhQVtaDPNQz+CirRZbNkAMfRe
L/tRcWmPKQSMlPC375stPfBM
-----END PRIVATE KEY-----";

const KEY_A_N: &str = "xO2P3GfJiLtc-nWgi4dH7v9Peo10xt7eYb4Kng3GvIKqbGx3SrEtOwc9SwEUtw1kSns09kT81i1MYe4t3gcqo_q1z0qIZd25C1D6NbZL_qCHtcqyPqzaieuqKKb-bW_mtRlHPw9HogHfjR3RGDDIMffJxum8GgRdPV-3PS71Q_uZFpYRH_b388GQoSn26UlTzpUwGuYJcLd3TGaOXe9l1zvioYcBvZSXMvPTjHNf3QoUQmkC6tC-k6pHVqQ9pwuW3gY50yiR9t956_1G9xY-ulPh126NUTw7v80JPNlEMe6ntjyKeWDPI2BNk2QO2fHetwDSnSPcQJOD2d3QgXA_Cw";

// Key B: a DIFFERENT RSA key, never advertised in the JWKS. Signing with it
// while the JWKS still carries key A's modulus is a bad-signature forgery.
const KEY_B_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDLe4ghpW+Gqytr
UPzWB9W1PIN1MeUd7m0FGEH7AcFeBnk5kbZbumnGRs0z0U9hzcoRJ6u7g4JT0Zwz
0Ec9S9631uyOoa5+xlXUmWPMoK3FqndFcPmF6l7/kz8aioa/tz1OfDFsw0YzzvHI
hxnVWXWWQBJ0etVepbQ2oz8gQ7I0yUzAP5y2yrPpg3Dc4NKT5V1MyMfMAcZg1ede
0M/rJwvqsmqyusN++N0r4+HESRgPEN3txiY+4uvTBOcwbX1SW0mdxHfd0AXSjLAS
21iWoH2qmJ0YDngoeFjHokVK1KM5UG3vsU15Z3a2/8aK0VdZ0ZbqysUUxPBrF2eR
m+W4oIKhAgMBAAECggEAE/oCuVrmghAX6SdASzrlri9MsJq/ZZrctR1WjO/1Lefw
ysgVYRgB/mdBCg9Ifc+YQOrmHzif+N6hOSz/cXMbYG0HOFGDMgsCriaI97Pmm3tK
zlRzCsShovGvxklHRVcV+7iRmZ3qLHfqoMcysBFiS+fqZ+kPPYWDFcIdFmvO+QOF
VTGJtaNNTg97yCgsRgLzfxyrHgnsiSbk5+6Ii79V4MZfWR52pFGdp24U/wFNRnly
uxluscrl8/64/vUnmBhk9upKqKg0jRX5MYfagSB3Q4BV6/f1uulle9wGg2fs4yff
K5KRLH3GJ6dWJBTpRqostLPlDf8RC/KOj6A1uUfkYQKBgQDxUz6zz566erxxla4P
EghJ1176Io/gae2mV1n/9BaTAz/7FW/QL6B5ounmY8rNI6EwxsC/8a6oeoi5F4La
Q/dE3oWIAwuU4p2jst5G+P58LszdQGWsJsmCVNGjsjb3379EsYPNFchGXYLhdcAS
7Zbb3GC+/yC26Yl9YdUooTTUlQKBgQDX2y7y9mkNWjcMV9TszO+OuKZF3/5US5mh
ICfF7VxTBVusCKZk6kWcEqfXXWDCIqJRskZXxRBN5NUbpevjYmy62OY5qhx8L5Mg
IT1yBj0BuT7XTjvyfL5/qMmxdGQLMotCaVGt8d5Elb+CWZ8FGJ2XNi3LH0P5Z/I9
0KadhQOG3QKBgEn1XjETPy0dcmVJHygFOb8Pn07/iqKXNDsXaEC2GLkDdPdJUZQ3
FHJSyGZQTRXjhoIBV487zXBa5U38c6Da1Ywoujm93S3K6c8CgXa01qFOYoCoPMCu
vnEP95O4iXob+21dDeyrcU6HWBYq1Su33tUQzCGc5PTJy9Y+RmqGRT+lAoGBAK2x
shXQMriL38AO7UefoSU3cJTJqd4q93Swa1DZr3Ee3qWQUFTkLx9n46dpfHK7a+JR
kkkOShBkExgsa6SNjvDLmHbObB2CKuGv3cHjQzQf3HFkgtidiK0xJRumjNp10Zmf
JhrShgiqd3BsrYlsRWNoNXE9t3T6L/ON8oTOhAgBAoGBANYE9hZT6P0LaGU4EfdP
H71sZkxfhj6gH399PgW5qUcLyPt3VZ2SMWcEqrdN25OmFopQ/q8ly8qEH/pJ7h0G
D/HWHNbcQZi7I0sfMvPL0tdnkuAUbGSGRuDl5q42E1jpBYtXmC8vw8zjr0i60RAD
6sEHy0Pi6EJAmSTMKTghTrCc
-----END PRIVATE KEY-----";

const CLIENT_ID: &str = "oidc-client-test";
const ISSUER: &str = "https://idp.oidc-client-test";
const KID: &str = "test-key";

fn token_claims(issuer: &str, nonce: &str, exp_from_now: i64) -> serde_json::Value {
    let now = Utc::now().timestamp();
    json!({
        "iss": issuer,
        "aud": CLIENT_ID,
        "sub": "subject-1",
        "email": "federated@example.test",
        "nonce": nonce,
        "iat": now,
        "exp": now + exp_from_now,
    })
}

fn sign_rs256(pem: &str, kid: &str, claims: &serde_json::Value) -> String {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(kid.into());
    encode(
        &header,
        claims,
        &EncodingKey::from_rsa_pem(pem.as_bytes()).expect("valid RSA pem"),
    )
    .expect("sign RS256")
}

/// Algorithm-confusion forgery: an HS256 token whose HMAC secret is the RSA
/// public modulus a naive verifier might feed straight back in.
fn sign_hs256(secret: &[u8], kid: &str, claims: &serde_json::Value) -> String {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some(kid.into());
    encode(&header, claims, &EncodingKey::from_secret(secret)).expect("sign HS256")
}

/// A fake IdP whose only advertised signing key is key A under [`KID`].
async fn jwks_server() -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/jwks"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "keys": [{
                "kty": "RSA", "use": "sig", "alg": "RS256",
                "kid": KID, "n": KEY_A_N, "e": "AQAB",
            }]
        })))
        .mount(&server)
        .await;
    server
}

async fn verify(
    server: &MockServer,
    id_token: &str,
    issuer: &str,
    expected_nonce_hash: &str,
) -> Result<(), qdesigner_server::error::ApiError> {
    let client = OidcClient::new().expect("build client");
    client
        .verify_id_token(IdTokenInput {
            id_token,
            jwks_uri: &format!("{}/jwks", server.uri()),
            client_id: CLIENT_ID,
            issuer,
            expected_nonce_hash,
        })
        .await
        .map(|_| ())
}

#[tokio::test]
async fn happy_path_returns_verified_claims() {
    let server = jwks_server().await;
    let token = sign_rs256(KEY_A_PEM, KID, &token_claims(ISSUER, "the-nonce", 3600));

    let client = OidcClient::new().unwrap();
    let claims = client
        .verify_id_token(IdTokenInput {
            id_token: &token,
            jwks_uri: &format!("{}/jwks", server.uri()),
            client_id: CLIENT_ID,
            issuer: ISSUER,
            expected_nonce_hash: &hash_token("the-nonce"),
        })
        .await
        .expect("valid token should verify");

    assert_eq!(
        claims.get("sub").and_then(|v| v.as_str()),
        Some("subject-1")
    );
    assert_eq!(
        claims.get("email").and_then(|v| v.as_str()),
        Some("federated@example.test")
    );
}

#[tokio::test]
async fn rejects_bad_signature() {
    let server = jwks_server().await;
    // Signed with key B; JWKS still advertises key A under the same kid.
    let token = sign_rs256(KEY_B_PEM, KID, &token_claims(ISSUER, "the-nonce", 3600));
    assert!(verify(&server, &token, ISSUER, &hash_token("the-nonce"))
        .await
        .is_err());
}

#[tokio::test]
async fn rejects_unknown_kid() {
    let server = jwks_server().await;
    // Valid signature, but the header points at a kid the JWKS never published.
    let token = sign_rs256(KEY_A_PEM, "some-other-kid", &token_claims(ISSUER, "the-nonce", 3600));
    assert!(verify(&server, &token, ISSUER, &hash_token("the-nonce"))
        .await
        .is_err());
}

#[tokio::test]
async fn rejects_nonce_mismatch() {
    let server = jwks_server().await;
    let token = sign_rs256(KEY_A_PEM, KID, &token_claims(ISSUER, "attacker-nonce", 3600));
    // Expected hash is for a different nonce than the token carries.
    assert!(verify(&server, &token, ISSUER, &hash_token("the-real-nonce"))
        .await
        .is_err());
}

#[tokio::test]
async fn rejects_expired_token() {
    let server = jwks_server().await;
    // exp one hour in the past.
    let token = sign_rs256(KEY_A_PEM, KID, &token_claims(ISSUER, "the-nonce", -3600));
    assert!(verify(&server, &token, ISSUER, &hash_token("the-nonce"))
        .await
        .is_err());
}

#[tokio::test]
async fn rejects_wrong_issuer() {
    let server = jwks_server().await;
    // Token's iss claim is a different issuer than the one we expect.
    let token = sign_rs256(KEY_A_PEM, KID, &token_claims("https://evil.example", "the-nonce", 3600));
    assert!(verify(&server, &token, ISSUER, &hash_token("the-nonce"))
        .await
        .is_err());
}

#[tokio::test]
async fn rejects_algorithm_confusion_hs256() {
    let server = jwks_server().await;
    // HS256 token whose HMAC secret is the RSA public modulus. An RS256-only
    // verifier must reject it on the algorithm allowlist before ever comparing.
    let token = sign_hs256(KEY_A_N.as_bytes(), KID, &token_claims(ISSUER, "the-nonce", 3600));
    assert!(verify(&server, &token, ISSUER, &hash_token("the-nonce"))
        .await
        .is_err());
}

#[tokio::test]
async fn discover_and_exchange_round_trip() {
    // Exercises the discovery + token-exchange halves of the interface end to
    // end against the fake IdP.
    let server = MockServer::start().await;
    let issuer = server.uri();

    Mock::given(method("GET"))
        .and(path("/.well-known/openid-configuration"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "issuer": issuer,
            "authorization_endpoint": format!("{issuer}/authorize"),
            "token_endpoint": format!("{issuer}/token"),
            "jwks_uri": format!("{issuer}/jwks"),
        })))
        .mount(&server)
        .await;

    let id_token = sign_rs256(KEY_A_PEM, KID, &token_claims(&issuer, "n", 3600));
    Mock::given(method("POST"))
        .and(path("/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "opaque",
            "token_type": "Bearer",
            "expires_in": 3600,
            "id_token": id_token,
        })))
        .mount(&server)
        .await;

    let client = OidcClient::new().unwrap();
    let disc = client
        .discover(&format!("{issuer}/.well-known/openid-configuration"))
        .await
        .expect("discovery");
    assert_eq!(disc.token_endpoint, format!("{issuer}/token"));

    let token = client
        .exchange_code(CodeExchange {
            token_endpoint: &disc.token_endpoint,
            code: "auth-code",
            redirect_uri: "https://app.test/callback",
            client_id: CLIENT_ID,
            client_secret: Some("secret"),
            code_verifier: None,
        })
        .await
        .expect("token exchange");
    assert!(!token.id_token.is_empty());
    assert_eq!(token.access_token.as_deref(), Some("opaque"));
}
