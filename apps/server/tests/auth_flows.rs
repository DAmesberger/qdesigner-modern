//! P4.1 auth flow tests.
//!
//! Covers the pure-crypto building blocks of register/login/refresh/logout:
//! password hashing roundtrip + JWT create/verify roundtrip + tampering
//! rejection. These tests do not require a database — they exercise the
//! crypto primitives the handlers compose. Handler-level integration
//! tests (full HTTP round-trip) are deferred — see P4.1 phase-deferred
//! note in the commit body.

use std::time::Duration;

use qdesigner_server::auth::jwt::JwtManager;
use qdesigner_server::auth::password::{hash_password, verify_password};
use uuid::Uuid;

fn test_jwt() -> JwtManager {
    JwtManager::new(
        "test-secret-32-chars-minimum-padding-padding",
        "test-refresh-secret-32-chars-minimum-pad",
        Duration::from_secs(900),
        Duration::from_secs(604_800),
    )
}

// ── Password hashing ─────────────────────────────────────────────────

#[test]
fn password_hash_roundtrip_happy() {
    let hash = hash_password("correct horse battery staple").expect("hash");
    assert!(hash.starts_with("$argon2"), "expected argon2 hash, got {hash}");
    let verified = verify_password("correct horse battery staple", &hash).expect("verify");
    assert!(verified, "correct password must verify");
}

#[test]
fn password_hash_rejects_wrong_password() {
    let hash = hash_password("right-one").expect("hash");
    let verified = verify_password("wrong-one", &hash).expect("verify");
    assert!(!verified, "wrong password must NOT verify");
}

#[test]
fn password_hash_is_salted_per_call() {
    let a = hash_password("same-password").expect("hash a");
    let b = hash_password("same-password").expect("hash b");
    assert_ne!(a, b, "argon2 must generate a fresh salt per call");
}

// ── JWT access tokens ────────────────────────────────────────────────

#[test]
fn access_token_roundtrip_happy() {
    let jwt = test_jwt();
    let user_id = Uuid::new_v4();
    let (token, _) = jwt
        .create_access_token(user_id, "user@example.test", vec!["member".into()])
        .expect("create");

    let claims = jwt.verify_access_token(&token).expect("verify");
    assert_eq!(claims.sub, user_id);
    assert_eq!(claims.email, "user@example.test");
    assert_eq!(claims.roles, vec!["member".to_string()]);
}

#[test]
fn access_token_rejects_tampered_payload() {
    let jwt = test_jwt();
    let (token, _) = jwt
        .create_access_token(Uuid::new_v4(), "user@example.test", vec![])
        .expect("create");

    // Flip a character in the payload segment (middle of the 3 dot-segments)
    let mut parts: Vec<&str> = token.split('.').collect();
    assert_eq!(parts.len(), 3);
    let mut payload = parts[1].to_string();
    payload.push('X');
    parts[1] = &payload;
    let tampered = parts.join(".");

    let result = jwt.verify_access_token(&tampered);
    assert!(result.is_err(), "tampered token must fail to verify");
}

#[test]
fn access_token_rejects_wrong_secret() {
    let jwt_a = test_jwt();
    let (token, _) = jwt_a
        .create_access_token(Uuid::new_v4(), "u@x.test", vec![])
        .expect("create");

    let jwt_b = JwtManager::new(
        "different-secret-of-sufficient-length-here",
        "ignored-for-this-test",
        Duration::from_secs(900),
        Duration::from_secs(604_800),
    );

    let result = jwt_b.verify_access_token(&token);
    assert!(result.is_err(), "token signed by jwt_a must fail under jwt_b");
}

// ── JWT refresh tokens ───────────────────────────────────────────────

#[test]
fn refresh_token_roundtrip_happy() {
    let jwt = test_jwt();
    let user_id = Uuid::new_v4();
    let (token, claims) = jwt.create_refresh_token(user_id).expect("create");
    let verified = jwt.verify_refresh_token(&token).expect("verify");
    assert_eq!(verified.sub, user_id);
    assert_eq!(verified.jti, claims.jti, "jti must match between create and verify");
}

#[test]
fn refresh_token_rejects_access_token() {
    // The refresh secret differs from the access secret, so an access
    // token must NOT verify as a refresh token.
    let jwt = test_jwt();
    let (access, _) = jwt
        .create_access_token(Uuid::new_v4(), "u@x.test", vec![])
        .expect("create access");

    let result = jwt.verify_refresh_token(&access);
    assert!(result.is_err(), "access token must not pass refresh verification");
}
