use aes_gcm::aead::generic_array::GenericArray;
use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key};
use sha2::{Digest, Sha256};

use crate::error::ApiError;

fn cipher(secret: &str) -> Aes256Gcm {
    let digest = Sha256::digest(secret.as_bytes());
    let key = Key::<Aes256Gcm>::from_slice(&digest);
    Aes256Gcm::new(key)
}

pub fn encrypt(secret: &str, plaintext: &str) -> Result<String, ApiError> {
    let cipher = cipher(secret);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| ApiError::Internal("Failed to encrypt auth token material".into()))?;
    Ok(format!("v1:{}:{}", hex::encode(nonce), hex::encode(ct)))
}

pub fn decrypt(secret: &str, stored: &str) -> Result<String, ApiError> {
    let mut parts = stored.splitn(3, ':');
    match (parts.next(), parts.next(), parts.next()) {
        (Some("v1"), Some(nonce_hex), Some(ct_hex)) => {
            let nonce_bytes = hex::decode(nonce_hex)
                .map_err(|_| ApiError::Internal("Corrupt auth ciphertext nonce".into()))?;
            let ct = hex::decode(ct_hex)
                .map_err(|_| ApiError::Internal("Corrupt auth ciphertext".into()))?;
            let nonce = GenericArray::from_slice(&nonce_bytes);
            let pt = cipher(secret)
                .decrypt(nonce, ct.as_ref())
                .map_err(|_| ApiError::Internal("Failed to decrypt auth token material".into()))?;
            String::from_utf8(pt)
                .map_err(|_| ApiError::Internal("Decrypted auth material is not UTF-8".into()))
        }
        _ => Err(ApiError::Internal(
            "Unrecognized auth ciphertext format".into(),
        )),
    }
}
