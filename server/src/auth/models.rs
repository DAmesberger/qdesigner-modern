use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

/// JWT claims — identical layout to online-clinic for cross-project compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// User ID (= public.users.id)
    pub sub: Uuid,
    pub email: String,
    /// Role names from user_roles / organization_members
    pub roles: Vec<String>,
    /// Expiration (unix timestamp)
    pub exp: i64,
    /// Issued-at (unix timestamp)
    pub iat: i64,
    /// Not-before (unix timestamp)
    pub nbf: i64,
    /// Unique token ID for revocation
    pub jti: Uuid,
}

/// Refresh-token claims (stored in a separate cookie / header).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshClaims {
    pub sub: Uuid,
    pub jti: Uuid,
    pub exp: i64,
    pub iat: i64,
}

/// Authenticated user extracted from middleware into request extensions.
#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub email: String,
    pub roles: Vec<String>,
    pub jti: Uuid,
}

// ── Request / Response DTOs ──────────────────────────────────────────

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub roles: Vec<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
    pub full_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct PasswordResetRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct PasswordResetConfirm {
    pub token: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub new_password: String,
}

/// Row returned when querying the users table + password_hash.
#[derive(Debug, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub password_hash: Option<String>,
    pub email_verified: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}
