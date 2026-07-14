use axum::{extract::State, http::HeaderMap, Json};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::Utc;
use lettre::message::header::ContentType;
use lettre::transport::smtp::client::Tls;
use lettre::{Message, SmtpTransport, Transport};
use uuid::Uuid;
use validator::Validate;

use crate::audit::ClientIp;
use crate::auth::models::*;
use crate::auth::password;
use crate::auth::session;
use crate::config::AuthProvider;
use crate::error::ApiError;
use crate::state::AppState;

/// Name of the httpOnly refresh-token cookie.
const REFRESH_COOKIE: &str = "refresh_token";
/// Path the refresh cookie is scoped to. Keeping it off non-auth routes means
/// the browser only attaches the secret to `/api/auth/*` requests.
const REFRESH_COOKIE_PATH: &str = "/api/auth";

fn session_cookie(token: String, max_age_secs: i64, secure: bool) -> Cookie<'static> {
    Cookie::build((session::SESSION_COOKIE, token))
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::seconds(max_age_secs))
        .build()
}

fn clear_session_cookie() -> Cookie<'static> {
    Cookie::build((session::SESSION_COOKIE, ""))
        .path("/")
        .build()
}

fn require_local_auth(state: &AppState) -> Result<(), ApiError> {
    if state.config.auth_provider == AuthProvider::Local {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Local email/password auth is disabled".into(),
        ))
    }
}

async fn build_user_info(
    state: &AppState,
    user_id: Uuid,
    email: String,
    full_name: Option<String>,
    avatar_url: Option<String>,
) -> Result<UserInfo, ApiError> {
    let roles = session::current_roles(&state.pool, user_id).await?;
    Ok(UserInfo {
        id: user_id,
        email,
        full_name,
        avatar_url,
        roles,
    })
}

async fn issue_browser_session(
    state: &AppState,
    jar: CookieJar,
    user: UserInfo,
    provider: &str,
    mfa_verified: bool,
    client_ip: ClientIp,
    headers: &HeaderMap,
) -> Result<(CookieJar, Json<SessionView>), ApiError> {
    let fp = session::fingerprint(
        &state.config,
        client_ip.0,
        headers
            .get(axum::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok()),
    );
    let new_session = session::create_auth_session(
        &state.pool,
        user,
        session::SessionMetadata {
            provider: provider.to_string(),
            issuer: None,
            subject: None,
            encrypted_token_set: None,
            mfa_verified,
            idle_ttl: state.config.auth_session_idle_expiry,
            absolute_ttl: state.config.auth_session_absolute_expiry,
        },
        fp,
    )
    .await?;
    let jar = jar.add(session_cookie(
        new_session.cookie_token,
        state.config.auth_session_absolute_expiry.as_secs() as i64,
        state.config.cookie_secure,
    ));
    Ok((jar, Json(new_session.view)))
}

async fn revoke_upstream_if_configured(state: &AppState, session_hash: &str) {
    let Ok(Some(encrypted)) =
        session::encrypted_token_set_for_session(&state.pool, session_hash).await
    else {
        return;
    };
    let Ok(plaintext) = crate::auth::crypto::decrypt(&state.config.auth_token_enc_key, &encrypted)
    else {
        return;
    };
    let Ok(token_set) = serde_json::from_str::<session::StoredTokenSet>(&plaintext) else {
        return;
    };
    let Some(endpoint) = token_set.revocation_endpoint.as_deref() else {
        return;
    };
    let Some(token) = token_set
        .refresh_token
        .as_deref()
        .or(token_set.access_token.as_deref())
    else {
        return;
    };

    let mut form = vec![("token", token.to_string())];
    if let Some(client_id) = state.config.zitadel_client_id.as_deref() {
        form.push(("client_id", client_id.to_string()));
    }
    if let Some(secret) = state.config.zitadel_client_secret.as_deref() {
        form.push(("client_secret", secret.to_string()));
    }

    // The revocation endpoint came from the IdP's discovery document, so it is
    // outbound-guarded like every other OIDC hop (SSRF): validated URL, filtered
    // resolver, no redirect following. Best-effort — a failure only logs.
    let revoke = async {
        crate::auth::oidc_client::OidcClient::new(&state.config)?
            .post_form_ignoring_response(endpoint, &form)
            .await
    };
    if let Err(e) = revoke.await {
        tracing::warn!("upstream token revocation failed: {e}");
    }
}

/// A removal cookie matching the refresh cookie's name + path so the browser
/// clears it on logout.
fn clear_refresh_cookie() -> Cookie<'static> {
    Cookie::build((REFRESH_COOKIE, ""))
        .path(REFRESH_COOKIE_PATH)
        .build()
}

/// POST /api/auth/register
#[utoipa::path(
    post,
    path = "/api/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 200, description = "Registered and signed in", body = SessionView),
        (status = 409, description = "Email already registered", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["auth"]
)]
pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    client_ip: ClientIp,
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> Result<(CookieJar, Json<SessionView>), ApiError> {
    require_local_auth(&state)?;
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
    .await
    // The SELECT-EXISTS gate above races concurrent registrations for the
    // same email; the unique index is the real arbiter. Map its 23505 to a
    // 409 Conflict rather than leaking a 500 on a benign duplicate race.
    .map_err(ApiError::from_db_error)?;

    let user = UserInfo {
        id: user_id,
        email: body.email,
        full_name: Some(full_name),
        avatar_url: None,
        roles: vec!["user".to_string()],
    };
    let (jar, response) = issue_browser_session(
        &state,
        jar,
        user,
        AuthProvider::Local.as_str(),
        true,
        client_ip,
        &headers,
    )
    .await?;

    Ok((jar, response))
}

/// POST /api/auth/login
#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Signed in", body = SessionView),
        (status = 401, description = "Invalid credentials", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["auth"]
)]
pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    client_ip: ClientIp,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<(CookieJar, Json<SessionView>), ApiError> {
    require_local_auth(&state)?;
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
    .await?;

    // Run Argon2 on every path — including the misses — so response time does
    // not reveal whether the email exists or has a password set (timing
    // oracle). On a miss we verify the supplied password against a fixed decoy
    // hash and discard the result before returning Unauthorized.
    let user = match user {
        Some(u) => u,
        None => {
            let _ = password::verify_password(&body.password, password::DUMMY_HASH);
            return Err(ApiError::Unauthorized("Invalid email or password".into()));
        }
    };

    let hash = match user.password_hash.as_deref() {
        Some(h) => h,
        None => {
            let _ = password::verify_password(&body.password, password::DUMMY_HASH);
            return Err(ApiError::Unauthorized("Invalid email or password".into()));
        }
    };

    if !password::verify_password(&body.password, hash)? {
        return Err(ApiError::Unauthorized("Invalid email or password".into()));
    }

    // Update last login
    sqlx::query("UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1")
        .bind(user.id)
        .execute(&state.pool)
        .await?;

    let user_info =
        build_user_info(&state, user.id, user.email, user.full_name, user.avatar_url).await?;
    issue_browser_session(
        &state,
        jar,
        user_info,
        AuthProvider::Local.as_str(),
        true,
        client_ip,
        &headers,
    )
    .await
}

/// POST /api/auth/logout
#[utoipa::path(
    post,
    path = "/api/auth/logout",
    responses(
        (status = 200, description = "Signed out", body = serde_json::Value)
    ),
    tags = ["auth"]
)]
pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
    user: AuthenticatedUser,
) -> Result<(CookieJar, Json<serde_json::Value>), ApiError> {
    if let Some(session_hash) = user.session_hash.as_deref() {
        revoke_upstream_if_configured(&state, session_hash).await;
        session::revoke_auth_session(&state.pool, session_hash).await?;
    }

    if let Some(jti) = user.jti {
        session::revoke_access_token(&state.pool, jti).await?;
    }

    // Revoke all refresh tokens for this user
    session::revoke_all_user_tokens(&state.pool, user.user_id).await?;

    // Clear auth cookies so the browser stops sending them.
    let jar = jar
        .remove(clear_refresh_cookie())
        .remove(clear_session_cookie());

    Ok((jar, Json(serde_json::json!({ "message": "Logged out" }))))
}

/// GET /api/auth/session
#[utoipa::path(
    get,
    path = "/api/auth/session",
    responses(
        (status = 200, description = "Current browser session", body = SessionView)
    ),
    tags = ["auth"]
)]
pub async fn session_view(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<(CookieJar, Json<SessionView>), ApiError> {
    let Some(token) = jar
        .get(session::SESSION_COOKIE)
        .map(|c| c.value().to_string())
        .filter(|v| !v.is_empty())
    else {
        // No qd_session cookie at all: a plain anonymous request. Do NOT emit a
        // Set-Cookie — a cookie-less caller must not gain a pointless header.
        return Ok((jar, Json(SessionView::anonymous())));
    };

    match session::session_view_for_token(
        &state.pool,
        &token,
        state.config.auth_session_idle_expiry,
    )
    .await?
    {
        Some(view) => Ok((jar, Json(view))),
        None => {
            // A qd_session cookie was present but does not resolve to a live
            // session (stale/invalid/expired). Clear it here so the browser
            // stops sending a dead cookie. Otherwise csrf_middleware sees the
            // cookie on the next login POST and demands a CSRF token the client
            // can no longer obtain, and POST /api/auth/logout is unreachable for
            // the same reason (plus its AuthenticatedUser extractor 401s) —
            // locking the browser out until cookies are cleared by hand.
            // GET bypasses csrf_middleware and the web client loads the session
            // on init, so the dead cookie self-heals before any login POST. Use
            // the same removal helper as logout so name/path match how the
            // cookie is set at login and the browser actually drops it.
            let jar = jar.remove(clear_session_cookie());
            Ok((jar, Json(SessionView::anonymous())))
        }
    }
}

/// POST /api/auth/verify-email/send  and  /verify-email/resend
#[utoipa::path(
    post,
    path = "/api/auth/verify-email/send",
    request_body = SendVerificationCodeRequest,
    responses(
        (status = 200, description = "Verification code sent", body = VerificationResult)
    ),
    tags = ["auth"]
)]
pub async fn send_verification_code(
    State(state): State<AppState>,
    Json(body): Json<SendVerificationCodeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    use rand::Rng;

    // Enumeration + mail-bomb guard: only proceed if a user row exists for this
    // email. Return the same success envelope regardless so a caller can't
    // distinguish a real address from an unknown one by the response.
    let user_exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)")
            .bind(&body.email)
            .fetch_one(&state.pool)
            .await?;

    if !user_exists {
        return Ok(Json(serde_json::json!({
            "success": true,
            "message": "Verification code sent"
        })));
    }

    // Per-email send cap (~3 / 15 min). Enforced in-memory when Redis is down.
    if !state
        .verify_send_limiter
        .check(&format!("authsend:{}", body.email))
        .await
    {
        return Err(ApiError::RateLimited);
    }

    let code: String = format!("{:06}", rand::thread_rng().gen_range(100_000..1_000_000u32));
    let expires_at = Utc::now() + chrono::Duration::minutes(5);

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

    // Send the verification code via SMTP
    tracing::info!("Sending verification code to {}", body.email);

    let email_body = format!(
        "Hello,\n\n\
         Your QDesigner verification code is:\n\n\
         {}\n\n\
         This code expires in 5 minutes.\n\n\
         If you didn't request this, you can safely ignore this email.\n\n\
         - QDesigner Team",
        code
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
        .subject("Your QDesigner verification code")
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
            Ok(_) => tracing::info!("Verification email sent to {}", recipient_email),
            Err(e) => tracing::error!("Failed to send verification email: {e}"),
        }
    })
    .await
    .ok();

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Verification code sent"
    })))
}

/// POST /api/auth/verify-email/resend
#[utoipa::path(
    post,
    path = "/api/auth/verify-email/resend",
    request_body = SendVerificationCodeRequest,
    responses(
        (status = 200, description = "Verification code resent", body = VerificationResult)
    ),
    tags = ["auth"]
)]
pub async fn resend_verification_code(
    State(state): State<AppState>,
    Json(body): Json<SendVerificationCodeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    send_verification_code(State(state), Json(body)).await
}

/// POST /api/auth/verify-email/verify
#[utoipa::path(
    post,
    path = "/api/auth/verify-email/verify",
    request_body = VerifyCodeRequest,
    responses(
        (status = 200, description = "Verification result", body = VerificationResult)
    ),
    tags = ["auth"]
)]
pub async fn verify_code(
    State(state): State<AppState>,
    Json(body): Json<VerifyCodeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Per-email verify-attempt limiter (~5 / 15 min). Consume one slot on every
    // attempt (before checking the code) so brute force is bounded. On lockout
    // invalidate any stored code so a subsequent lucky guess can't land, then
    // signal 429 so the caller must wait out the window.
    if !state
        .verify_attempt_limiter
        .check(&format!("authverify:{}", body.email))
        .await
    {
        sqlx::query("UPDATE email_verification_codes SET used_at = NOW() WHERE email = $1")
            .bind(&body.email)
            .execute(&state.pool)
            .await?;
        return Err(ApiError::RateLimited);
    }

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
#[utoipa::path(
    post,
    path = "/api/auth/password-reset",
    request_body = PasswordResetRequest,
    responses(
        (status = 200, description = "Password reset initiated", body = crate::openapi::MessageResponse),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["auth"]
)]
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

        // Frontend origin for the reset link — unified through the shared
        // `app_origin()` helper (first CORS origin, trailing slash trimmed,
        // localhost fallback).
        let reset_link = format!(
            "{}/reset-password?token={}",
            state.config.app_origin(),
            token
        );

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
#[utoipa::path(
    post,
    path = "/api/auth/password-reset/confirm",
    request_body = PasswordResetConfirm,
    responses(
        (status = 200, description = "Password reset complete", body = crate::openapi::MessageResponse),
        (status = 400, description = "Invalid or expired reset token", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["auth"]
)]
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

    // Revoke every credential minted under the OLD password, in both stores:
    //
    //  1. `auth_sessions` — the opaque `qd_session` browser sessions. These are
    //     what a real logged-in browser actually holds; revoking only the
    //     refresh tokens below left an attacker's pre-existing browser session
    //     alive across the victim's password reset (up to the 7-day absolute
    //     TTL), which defeats the whole point of a reset.
    //  2. `refresh_tokens` — the JWT refresh material.
    //
    // Mirrors `users::delete_account`, which revokes both. Both run on the pool
    // (this handler is not inside the per-request RLS transaction) and neither
    // table is RLS-bound, so no GUC is needed.
    session::revoke_all_auth_sessions(&state.pool, user_id).await?;
    session::revoke_all_user_tokens(&state.pool, user_id).await?;

    Ok(Json(
        serde_json::json!({ "message": "Password has been reset successfully" }),
    ))
}
