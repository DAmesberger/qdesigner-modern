use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use lettre::message::header::ContentType;
use lettre::transport::smtp::client::Tls;
use lettre::{Message, SmtpTransport, Transport};
use uuid::Uuid;
use validator::Validate;

use crate::auth::models::*;
use crate::auth::password;
use crate::auth::session;
use crate::error::ApiError;
use crate::state::AppState;

/// POST /api/auth/register
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Check if email already exists
    let existing =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)")
            .bind(&body.email)
            .fetch_one(&state.pool)
            .await?;

    if existing {
        return Err(ApiError::Conflict("Email already registered".into()));
    }

    let hash = password::hash_password(&body.password)?;
    let full_name = body
        .full_name
        .unwrap_or_else(|| body.email.split('@').next().unwrap_or("User").to_string());

    let user_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO users (id, email, full_name, password_hash, email_verified)
        VALUES ($1, $2, $3, $4, false)
        "#,
    )
    .bind(user_id)
    .bind(&body.email)
    .bind(&full_name)
    .bind(&hash)
    .execute(&state.pool)
    .await?;

    // Issue tokens
    let roles = vec!["user".to_string()];
    let (access_token, _claims) =
        state
            .jwt_manager
            .create_access_token(user_id, &body.email, roles.clone())?;
    let (refresh_token, refresh_claims) = state.jwt_manager.create_refresh_token(user_id)?;

    session::store_refresh_token(
        &state.pool,
        user_id,
        refresh_claims.jti,
        DateTime::<Utc>::from_timestamp(refresh_claims.exp, 0).unwrap_or_else(Utc::now),
    )
    .await?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".into(),
        expires_in: state.jwt_manager.access_expiry_secs(),
        user: UserInfo {
            id: user_id,
            email: body.email,
            full_name: Some(full_name),
            avatar_url: None,
            roles,
        },
    }))
}

/// POST /api/auth/login
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let user = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, email, full_name, avatar_url, password_hash, email_verified,
               created_at, updated_at
        FROM users
        WHERE email = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("Invalid email or password".into()))?;

    let hash = user
        .password_hash
        .as_deref()
        .ok_or_else(|| ApiError::Unauthorized("Invalid email or password".into()))?;

    if !password::verify_password(&body.password, hash)? {
        return Err(ApiError::Unauthorized("Invalid email or password".into()));
    }

    // Collect roles from org memberships
    let roles: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT DISTINCT role FROM organization_members
        WHERE user_id = $1 AND status = 'active'
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let roles = if roles.is_empty() {
        vec!["user".to_string()]
    } else {
        roles
    };

    // Update last login
    sqlx::query("UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1")
        .bind(user.id)
        .execute(&state.pool)
        .await?;

    let (access_token, _claims) =
        state
            .jwt_manager
            .create_access_token(user.id, &user.email, roles.clone())?;
    let (refresh_token, refresh_claims) = state.jwt_manager.create_refresh_token(user.id)?;

    session::store_refresh_token(
        &state.pool,
        user.id,
        refresh_claims.jti,
        DateTime::<Utc>::from_timestamp(refresh_claims.exp, 0).unwrap_or_else(Utc::now),
    )
    .await?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".into(),
        expires_in: state.jwt_manager.access_expiry_secs(),
        user: UserInfo {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            roles,
        },
    }))
}

/// POST /api/auth/refresh
pub async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let claims = state
        .jwt_manager
        .verify_refresh_token(&body.refresh_token)?;

    // Check if the refresh token is still valid
    if !session::is_refresh_token_valid(&state.pool, claims.jti).await? {
        return Err(ApiError::Unauthorized("Refresh token revoked".into()));
    }

    // Revoke the old refresh token (rotation)
    session::revoke_refresh_token(&state.pool, claims.jti).await?;

    // Look up the user
    let user = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, email, full_name, avatar_url, password_hash, email_verified,
               created_at, updated_at
        FROM users WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(claims.sub)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("User not found".into()))?;

    let roles: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT role FROM organization_members WHERE user_id = $1 AND status = 'active'",
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let roles = if roles.is_empty() {
        vec!["user".to_string()]
    } else {
        roles
    };

    let (access_token, _new_claims) =
        state
            .jwt_manager
            .create_access_token(user.id, &user.email, roles.clone())?;
    let (refresh_token, new_refresh_claims) = state.jwt_manager.create_refresh_token(user.id)?;

    session::store_refresh_token(
        &state.pool,
        user.id,
        new_refresh_claims.jti,
        DateTime::<Utc>::from_timestamp(new_refresh_claims.exp, 0).unwrap_or_else(Utc::now),
    )
    .await?;

    Ok(Json(AuthResponse {
        access_token,
        refresh_token,
        token_type: "Bearer".into(),
        expires_in: state.jwt_manager.access_expiry_secs(),
        user: UserInfo {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            roles,
        },
    }))
}

/// POST /api/auth/logout
pub async fn logout(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Revoke the access token JTI
    session::revoke_access_token(&state.pool, user.jti).await?;

    // Revoke all refresh tokens for this user
    session::revoke_all_user_tokens(&state.pool, user.user_id).await?;

    Ok(Json(serde_json::json!({ "message": "Logged out" })))
}

/// GET /api/auth/me
pub async fn me(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<UserInfo>, ApiError> {
    let row = sqlx::query_as::<_, UserRow>(
        r#"
        SELECT id, email, full_name, avatar_url, password_hash, email_verified,
               created_at, updated_at
        FROM users WHERE id = $1
        "#,
    )
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    Ok(Json(UserInfo {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        roles: user.roles,
    }))
}

/// POST /api/auth/verify-email
pub async fn verify_email(
    State(state): State<AppState>,
    Json(body): Json<VerifyEmailRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Look up the verification token
    let row = sqlx::query_as::<_, (Uuid,)>(
        r#"
        SELECT user_id FROM email_verifications
        WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL
        "#,
    )
    .bind(&body.token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Invalid or expired verification token".into()))?;

    // Mark email as verified
    sqlx::query("UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1")
        .bind(row.0)
        .execute(&state.pool)
        .await?;

    // Mark token as used
    sqlx::query("UPDATE email_verifications SET used_at = NOW() WHERE token = $1")
        .bind(&body.token)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Email verified" })))
}

/// POST /api/auth/verify-email/send  and  /verify-email/resend
pub async fn send_verification_code(
    State(state): State<AppState>,
    Json(body): Json<SendVerificationCodeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    use rand::Rng;

    let code: String = format!("{:06}", rand::thread_rng().gen_range(100_000..1_000_000u32));
    let expires_at = Utc::now() + chrono::Duration::minutes(10);

    // Store the code (upsert on email)
    sqlx::query(
        r#"
        INSERT INTO email_verification_codes (email, code, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE SET code = $2, expires_at = $3, used_at = NULL
        "#,
    )
    .bind(&body.email)
    .bind(&code)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    // In dev, log the code; in production, send via email
    tracing::info!("Verification code for {}: {code}", body.email);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Verification code sent"
    })))
}

/// POST /api/auth/verify-email/verify
pub async fn verify_code(
    State(state): State<AppState>,
    Json(body): Json<VerifyCodeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let valid = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM email_verification_codes
            WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used_at IS NULL
        )
        "#,
    )
    .bind(&body.email)
    .bind(&body.code)
    .fetch_one(&state.pool)
    .await?;

    if !valid {
        return Ok(Json(serde_json::json!({
            "success": false,
            "error": "Invalid or expired verification code"
        })));
    }

    // Mark code as used
    sqlx::query(
        "UPDATE email_verification_codes SET used_at = NOW() WHERE email = $1 AND code = $2",
    )
    .bind(&body.email)
    .bind(&body.code)
    .execute(&state.pool)
    .await?;

    // Mark user email as verified
    sqlx::query("UPDATE users SET email_verified = true, updated_at = NOW() WHERE email = $1")
        .bind(&body.email)
        .execute(&state.pool)
        .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Email verified successfully"
    })))
}

/// POST /api/auth/password-reset
pub async fn password_reset(
    State(state): State<AppState>,
    Json(body): Json<PasswordResetRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Always return success to prevent email enumeration.
    let user = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
    )
    .bind(&body.email)
    .fetch_optional(&state.pool)
    .await?;

    if let Some(user_id) = user {
        let token = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + chrono::Duration::hours(1);

        sqlx::query(
            r#"
            INSERT INTO password_resets (user_id, token, expires_at)
            VALUES ($1, $2, $3)
            "#,
        )
        .bind(user_id)
        .bind(&token)
        .bind(expires_at)
        .execute(&state.pool)
        .await?;

        // Determine the frontend URL from CORS origins (first origin)
        let app_url = state
            .config
            .cors_origins
            .first()
            .cloned()
            .unwrap_or_else(|| "http://localhost:5173".to_string());

        let reset_link = format!("{}/reset-password?token={}", app_url, token);

        let email_body = format!(
            "Hello,\n\n\
             You requested a password reset for your QDesigner account.\n\n\
             Click the link below to reset your password:\n\
             {}\n\n\
             This link expires in 1 hour.\n\n\
             If you didn't request this, you can safely ignore this email.\n\n\
             - QDesigner Team",
            reset_link
        );

        let email_msg = Message::builder()
            .from(
                state
                    .config
                    .smtp_from
                    .parse()
                    .unwrap_or_else(|_| "noreply@qdesigner.local".parse().unwrap()),
            )
            .to(body
                .email
                .parse()
                .map_err(|_| ApiError::BadRequest("Invalid email address".into()))?)
            .subject("Reset your QDesigner password")
            .header(ContentType::TEXT_PLAIN)
            .body(email_body)
            .map_err(|e| ApiError::Internal(format!("Failed to build email: {e}")))?;

        let smtp_host = state.config.smtp_host.clone();
        let smtp_port = state.config.smtp_port;
        let recipient_email = body.email.clone();

        tokio::task::spawn_blocking(move || {
            let mailer = SmtpTransport::builder_dangerous(&smtp_host)
                .port(smtp_port)
                .tls(Tls::None)
                .build();

            match mailer.send(&email_msg) {
                Ok(_) => tracing::info!("Password reset email sent to {}", recipient_email),
                Err(e) => tracing::error!("Failed to send password reset email: {e}"),
            }
        })
        .await
        .ok();
    }

    Ok(Json(
        serde_json::json!({ "message": "If the email exists, a reset link has been sent" }),
    ))
}

/// POST /api/auth/password-reset/confirm
pub async fn confirm_password_reset(
    State(state): State<AppState>,
    Json(body): Json<PasswordResetConfirm>,
) -> Result<Json<serde_json::Value>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Look up the token
    let row = sqlx::query_as::<_, (Uuid,)>(
        r#"
        SELECT user_id FROM password_resets
        WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL
        "#,
    )
    .bind(&body.token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Invalid or expired reset token".into()))?;

    let user_id = row.0;

    // Hash the new password with Argon2id
    let hash = password::hash_password(&body.new_password)?;

    // Update the user's password
    sqlx::query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2")
        .bind(&hash)
        .bind(user_id)
        .execute(&state.pool)
        .await?;

    // Mark the token as used
    sqlx::query("UPDATE password_resets SET used_at = NOW() WHERE token = $1")
        .bind(&body.token)
        .execute(&state.pool)
        .await?;

    // Revoke all existing sessions for security
    session::revoke_all_user_tokens(&state.pool, user_id).await?;

    Ok(Json(
        serde_json::json!({ "message": "Password has been reset successfully" }),
    ))
}
