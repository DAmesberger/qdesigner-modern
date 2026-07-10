use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
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
#[allow(dead_code)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub email: String,
    pub roles: Vec<String>,
    pub provider: String,
    pub mfa_verified: bool,
    pub session_hash: Option<String>,
    pub jti: Option<Uuid>,
}

// ── Request / Response DTOs ──────────────────────────────────────────

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(
        min = 8,
        max = 128,
        message = "Password must be between 8 and 128 characters"
    ))]
    pub password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub roles: Vec<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SessionView {
    pub authenticated: bool,
    pub provider: Option<String>,
    pub user: Option<UserInfo>,
    pub mfa_verified: bool,
    pub roles: Vec<String>,
    pub organizations: Vec<SessionOrganization>,
    pub expires_at: Option<DateTime<Utc>>,
    pub csrf_token: Option<String>,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct SessionOrganization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub role: String,
}

impl SessionView {
    pub fn anonymous() -> Self {
        Self {
            authenticated: false,
            provider: None,
            user: None,
            mfa_verified: false,
            roles: Vec::new(),
            organizations: Vec::new(),
            expires_at: None,
            csrf_token: None,
        }
    }
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(
        min = 8,
        max = 128,
        message = "Password must be between 8 and 128 characters"
    ))]
    pub password: String,
    pub full_name: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct PasswordResetRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SendVerificationCodeRequest {
    pub email: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct VerifyCodeRequest {
    pub email: String,
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct VerificationResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct PasswordResetConfirm {
    pub token: String,
    #[validate(length(
        min = 8,
        max = 128,
        message = "Password must be between 8 and 128 characters"
    ))]
    pub new_password: String,
}

/// Row returned when querying the users table + password_hash.
#[derive(Debug, sqlx::FromRow)]
#[allow(dead_code)]
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
