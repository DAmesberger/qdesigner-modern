use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::error::ApiError;

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
