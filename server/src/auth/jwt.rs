use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use std::time::Duration;
use uuid::Uuid;

use crate::auth::models::{Claims, RefreshClaims};
use crate::error::ApiError;

#[derive(Clone)]
pub struct JwtManager {
    access_encoding: EncodingKey,
    access_decoding: DecodingKey,
    refresh_encoding: EncodingKey,
    refresh_decoding: DecodingKey,
    access_expiry: Duration,
    refresh_expiry: Duration,
}

impl JwtManager {
    pub fn new(
        secret: &str,
        refresh_secret: &str,
        access_expiry: Duration,
        refresh_expiry: Duration,
    ) -> Self {
        Self {
            access_encoding: EncodingKey::from_secret(secret.as_bytes()),
            access_decoding: DecodingKey::from_secret(secret.as_bytes()),
            refresh_encoding: EncodingKey::from_secret(refresh_secret.as_bytes()),
            refresh_decoding: DecodingKey::from_secret(refresh_secret.as_bytes()),
            access_expiry,
            refresh_expiry,
        }
    }

    /// Issue a new access token.
    pub fn create_access_token(
        &self,
        user_id: Uuid,
        email: &str,
        roles: Vec<String>,
    ) -> Result<(String, Claims), ApiError> {
        let now = Utc::now().timestamp();
        let claims = Claims {
            sub: user_id,
            email: email.to_string(),
            roles,
            exp: now + self.access_expiry.as_secs() as i64,
            iat: now,
            nbf: now,
            jti: Uuid::new_v4(),
        };
        let token = encode(&Header::default(), &claims, &self.access_encoding)?;
        Ok((token, claims))
    }

    /// Verify and decode an access token.
    pub fn verify_access_token(&self, token: &str) -> Result<Claims, ApiError> {
        let data = decode::<Claims>(token, &self.access_decoding, &Validation::default())?;
        Ok(data.claims)
    }

    /// Issue a new refresh token.
    pub fn create_refresh_token(&self, user_id: Uuid) -> Result<(String, RefreshClaims), ApiError> {
        let now = Utc::now().timestamp();
        let claims = RefreshClaims {
            sub: user_id,
            jti: Uuid::new_v4(),
            exp: now + self.refresh_expiry.as_secs() as i64,
            iat: now,
        };
        let token = encode(&Header::default(), &claims, &self.refresh_encoding)?;
        Ok((token, claims))
    }

    /// Verify and decode a refresh token.
    pub fn verify_refresh_token(&self, token: &str) -> Result<RefreshClaims, ApiError> {
        let data =
            decode::<RefreshClaims>(token, &self.refresh_decoding, &Validation::default())?;
        Ok(data.claims)
    }

    /// Return the access token lifetime in seconds (used in responses).
    pub fn access_expiry_secs(&self) -> i64 {
        self.access_expiry.as_secs() as i64
    }
}
