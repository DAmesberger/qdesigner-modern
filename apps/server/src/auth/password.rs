use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::error::ApiError;

/// A fixed, precomputed Argon2id PHC-format hash used as a decoy target on
/// login misses (unknown email / missing password_hash). Verifying against
/// this hash makes every failed-login path pay the same Argon2 cost as a real
/// verification, closing the user-enumeration timing oracle. The plaintext is
/// irrelevant — this is never a real credential; only the CPU cost matters.
pub const DUMMY_HASH: &str =
    "$argon2id$v=19$m=19456,t=2,p=1$gOXIRYda12LwDQWWhLSbbA$1RE02Sy8VnnY24CJCB5Cjgbl8RJPSsbFjWm+wYsM0ak";

/// Hash a plaintext password with Argon2id (default params).
pub fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| ApiError::Internal(format!("Password hashing failed: {e}")))?;
    Ok(hash.to_string())
}

/// Verify a plaintext password against a stored Argon2id hash.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, ApiError> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| ApiError::Internal(format!("Invalid password hash format: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dummy_hash_parses() {
        // If DUMMY_HASH ever stops being a valid PHC string, PasswordHash::new
        // inside verify_password errors and the timing-equalization is silently
        // defeated. Guard it.
        assert!(verify_password("anything", DUMMY_HASH).is_ok());
        // A random plaintext must not verify against the decoy.
        assert!(!verify_password("anything", DUMMY_HASH).unwrap());
    }
}
