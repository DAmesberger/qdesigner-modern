use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::response::Redirect;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::audit::ClientIp;
use crate::auth::models::UserInfo;
use crate::auth::oidc_client::{
    code_challenge, discovery_url, CodeExchange, IdTokenInput, OidcClient,
};
use crate::auth::session;
use crate::config::AuthProvider;
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct StartQuery {
    pub return_to: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IntrospectionResponse {
    active: bool,
    amr: Option<serde_json::Value>,
    acr: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthStartResponse {
    pub authorization_url: String,
}

fn safe_return_to(raw: Option<String>) -> String {
    raw.filter(|value| {
        value.starts_with('/')
            && !value.starts_with("//")
            && !value.starts_with("/\\")
            && !value.contains('\n')
            && !value.contains('\r')
    })
    .unwrap_or_else(|| "/".into())
}

fn app_redirect(state: &AppState, path: &str) -> String {
    format!(
        "{}{}",
        state.config.public_app_origin.trim_end_matches('/'),
        if path.starts_with('/') { path } else { "/" }
    )
}

fn session_cookie(token: String, max_age_secs: i64, secure: bool) -> Cookie<'static> {
    Cookie::build((session::SESSION_COOKIE, token))
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::seconds(max_age_secs))
        .build()
}

fn require_zitadel(state: &AppState) -> Result<(), ApiError> {
    if state.config.auth_provider == AuthProvider::Zitadel {
        Ok(())
    } else {
        Err(ApiError::Forbidden("Zitadel auth is disabled".into()))
    }
}

fn mfa_from_claims(claims: &serde_json::Value, allow_sms_email: bool) -> bool {
    let accepted = |value: &str| {
        matches!(
            value.to_ascii_lowercase().as_str(),
            "mfa" | "otp" | "totp" | "webauthn" | "passkey" | "fido" | "u2f"
        ) || (allow_sms_email && matches!(value.to_ascii_lowercase().as_str(), "sms" | "email"))
    };

    if let Some(amr) = claims.get("amr") {
        match amr {
            serde_json::Value::Array(values) => {
                if values.iter().filter_map(|v| v.as_str()).any(&accepted) {
                    return true;
                }
            }
            serde_json::Value::String(value) if value.split([' ', ',']).any(accepted) => {
                return true;
            }
            _ => {}
        }
    }

    claims
        .get("acr")
        .and_then(|v| v.as_str())
        .map(|acr| {
            let normalized = acr.to_ascii_lowercase();
            normalized.contains("mfa")
                || normalized.contains("multi-factor")
                || normalized.contains("2fa")
        })
        .unwrap_or(false)
}

/// Ask the IdP's introspection endpoint whether the access token carries an MFA
/// factor.
///
/// The endpoint arrives from a discovery document and is therefore in the same
/// attacker-controlled class as the rest of the flow, so it goes out through the
/// [`OidcClient`] (URL-validated, guarded resolver, no redirects) rather than a
/// bare `reqwest::Client` — which is why this takes the client rather than its
/// HTTP handle. `OidcClient` no longer exposes one.
async fn mfa_from_introspection(
    oidc: &OidcClient,
    endpoint: Option<&str>,
    access_token: Option<&str>,
    state: &AppState,
) -> Result<bool, ApiError> {
    let Some(endpoint) = endpoint else {
        return Ok(false);
    };
    let Some(access_token) = access_token else {
        return Ok(false);
    };

    let mut form = vec![("token", access_token.to_string())];
    if let Some(client_id) = state.config.zitadel_client_id.as_deref() {
        form.push(("client_id", client_id.to_string()));
    }
    if let Some(secret) = state.config.zitadel_client_secret.as_deref() {
        form.push(("client_secret", secret.to_string()));
    }

    let response: IntrospectionResponse = oidc
        .post_form_json(endpoint, &form, "Zitadel introspection failed")
        .await?;

    if !response.active {
        return Ok(false);
    }

    let claims = serde_json::json!({
        "amr": response.amr,
        "acr": response.acr,
    });
    Ok(mfa_from_claims(
        &claims,
        state.config.zitadel_allow_sms_email_mfa,
    ))
}

/// GET /api/auth/zitadel/start?return_to=/dashboard
#[utoipa::path(
    get,
    path = "/api/auth/zitadel/start",
    params(("return_to" = Option<String>, Query, description = "Same-origin app path to return to")),
    responses(
        (status = 303, description = "Redirect to Zitadel"),
        (status = 403, description = "Zitadel auth disabled", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["auth"]
)]
pub async fn zitadel_start(
    State(state): State<AppState>,
    Query(query): Query<StartQuery>,
) -> Result<Redirect, ApiError> {
    require_zitadel(&state)?;
    let issuer = state
        .config
        .zitadel_issuer
        .as_deref()
        .ok_or_else(|| ApiError::Internal("Zitadel issuer is not configured".into()))?;
    let client_id = state
        .config
        .zitadel_client_id
        .as_deref()
        .ok_or_else(|| ApiError::Internal("Zitadel client id is not configured".into()))?;
    let redirect_uri = state
        .config
        .zitadel_redirect_uri
        .as_deref()
        .ok_or_else(|| ApiError::Internal("Zitadel redirect URI is not configured".into()))?;

    let discovery = OidcClient::new(&state.config)?
        .discover(&discovery_url(issuer))
        .await?;

    if discovery.issuer.trim_end_matches('/') != issuer.trim_end_matches('/') {
        return Err(ApiError::BadRequest("Zitadel issuer mismatch".into()));
    }

    let login_state = session::random_token();
    let nonce = session::random_token();
    let pkce_verifier = session::random_token();
    let return_to = safe_return_to(query.return_to);
    session::store_login_state(
        &state.pool,
        &state.config,
        session::NewLoginState {
            state: &login_state,
            nonce: &nonce,
            pkce_verifier: &pkce_verifier,
            return_to: &return_to,
            redirect_uri,
            issuer: &discovery.issuer,
            authorization_endpoint: &discovery.authorization_endpoint,
            token_endpoint: &discovery.token_endpoint,
            jwks_uri: &discovery.jwks_uri,
            introspection_endpoint: discovery.introspection_endpoint.as_deref(),
            revocation_endpoint: discovery.revocation_endpoint.as_deref(),
            client_id,
            expires_at: Utc::now() + ChronoDuration::minutes(10),
        },
    )
    .await?;

    let mut authorize = reqwest::Url::parse(&discovery.authorization_endpoint)
        .map_err(|_| ApiError::BadRequest("Zitadel authorization endpoint is invalid".into()))?;
    let mut scope = "openid email offline_access".to_string();
    if state.config.zitadel_include_profile_scope {
        scope.push_str(" profile");
    }
    authorize
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scope", &scope)
        .append_pair("state", &login_state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &code_challenge(&pkce_verifier))
        .append_pair("code_challenge_method", "S256");

    Ok(Redirect::to(authorize.as_str()))
}

/// GET /api/auth/zitadel/callback
#[utoipa::path(
    get,
    path = "/api/auth/zitadel/callback",
    responses(
        (status = 303, description = "Redirect back to app with session cookie"),
        (status = 400, description = "Invalid callback", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["auth"]
)]
pub async fn zitadel_callback(
    State(state): State<AppState>,
    client_ip: ClientIp,
    headers: HeaderMap,
    jar: CookieJar,
    Query(query): Query<CallbackQuery>,
) -> Result<(CookieJar, Redirect), ApiError> {
    require_zitadel(&state)?;
    if let Some(error) = query.error.as_deref() {
        return Ok((
            jar,
            Redirect::to(&app_redirect(
                &state,
                &format!("/login?auth_error={}", url_encode(error)),
            )),
        ));
    }

    let code = query
        .code
        .as_deref()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Missing authorization code".into()))?;
    let state_token = query
        .state
        .as_deref()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Missing state".into()))?;

    let login_state = session::consume_login_state(&state.pool, state_token)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Unknown or replayed login state".into()))?;
    if login_state.expires_at < Utc::now() {
        return Err(ApiError::BadRequest("Login state expired".into()));
    }
    let pkce_verifier = crate::auth::crypto::decrypt(
        &state.config.auth_token_enc_key,
        &login_state.pkce_verifier_enc,
    )?;

    // Token exchange + id_token validation (signature, iss/aud/exp, nonce) run
    // on the shared OIDC client; `claims` is proof-of-validation.
    let oidc = OidcClient::new(&state.config)?;
    let token = oidc
        .exchange_code(CodeExchange {
            token_endpoint: &login_state.token_endpoint,
            code,
            redirect_uri: &login_state.redirect_uri,
            client_id: &login_state.client_id,
            client_secret: state.config.zitadel_client_secret.as_deref(),
            code_verifier: Some(&pkce_verifier),
        })
        .await?;

    let claims = oidc
        .verify_id_token(IdTokenInput {
            id_token: &token.id_token,
            jwks_uri: &login_state.jwks_uri,
            client_id: &login_state.client_id,
            issuer: &login_state.issuer,
            expected_nonce_hash: &login_state.nonce_hash,
        })
        .await?;

    let mfa_verified =
        if mfa_from_claims(claims.as_json(), state.config.zitadel_allow_sms_email_mfa) {
            true
        } else {
            mfa_from_introspection(
                &oidc,
                login_state.introspection_endpoint.as_deref(),
                token.access_token.as_deref(),
                &state,
            )
            .await?
        };
    if !mfa_verified {
        record_security(
            &state,
            &headers,
            client_ip,
            "login.mfa_required",
            "failure",
            None,
            Some(&login_state.issuer),
            claims.get("sub").and_then(|v| v.as_str()),
            serde_json::json!({}),
        )
        .await;
        return Err(ApiError::Forbidden(
            "Multi-factor authentication is required".into(),
        ));
    }

    let subject = claims
        .get("sub")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::BadRequest("id_token subject missing".into()))?;
    let email = claims
        .get("email")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| ApiError::BadRequest("id_token email missing".into()))?;
    let email_verified = claims
        .get("email_verified")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !email_verified {
        return Err(ApiError::Forbidden(
            "Verified email is required to link a Zitadel identity".into(),
        ));
    }
    let full_name = claims
        .get("name")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .unwrap_or_else(|| email.split('@').next().unwrap_or("User").to_string());

    let (user_id, user_email, user_name, avatar_url) =
        provision_or_link_user(&state, &login_state.issuer, subject, &email, &full_name).await?;

    let roles = session::current_roles(&state.pool, user_id).await?;
    let user_info = UserInfo {
        id: user_id,
        email: user_email,
        full_name: user_name,
        avatar_url,
        roles,
    };
    let token_set = session::StoredTokenSet {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        id_token: Some(token.id_token),
        token_type: token.token_type,
        expires_in: token.expires_in,
        obtained_at: Utc::now(),
        revocation_endpoint: login_state.revocation_endpoint,
    };
    let encrypted_token_set = crate::auth::crypto::encrypt(
        &state.config.auth_token_enc_key,
        &serde_json::to_string(&token_set)
            .map_err(|e| ApiError::Internal(format!("serialize token set: {e}")))?,
    )?;
    let fp = session::fingerprint(
        &state.config,
        client_ip.0,
        headers
            .get(axum::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok()),
    );
    let new_session = session::create_auth_session(
        &state.pool,
        user_info,
        session::SessionMetadata {
            provider: AuthProvider::Zitadel.as_str().to_string(),
            issuer: Some(login_state.issuer.clone()),
            subject: Some(subject.to_string()),
            encrypted_token_set: Some(encrypted_token_set),
            mfa_verified,
            idle_ttl: state.config.auth_session_idle_expiry,
            absolute_ttl: state.config.auth_session_absolute_expiry,
        },
        fp,
    )
    .await?;

    record_security(
        &state,
        &headers,
        client_ip,
        "login",
        "success",
        Some(user_id),
        Some(&login_state.issuer),
        Some(subject),
        serde_json::json!({ "provider": "zitadel", "mfa_verified": true }),
    )
    .await;

    let jar = jar.add(session_cookie(
        new_session.cookie_token,
        state.config.auth_session_absolute_expiry.as_secs() as i64,
        state.config.cookie_secure,
    ));
    Ok((
        jar,
        Redirect::to(&app_redirect(&state, &login_state.return_to)),
    ))
}

async fn provision_or_link_user(
    state: &AppState,
    issuer: &str,
    subject: &str,
    email: &str,
    full_name: &str,
) -> Result<(Uuid, String, Option<String>, Option<String>), ApiError> {
    let mut tx = state.pool.begin().await?;

    if let Some(user_id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM external_identities WHERE provider = 'zitadel' AND issuer = $1 AND subject = $2",
    )
    .bind(issuer)
    .bind(subject)
    .fetch_optional(&mut *tx)
    .await?
    {
        let row = sqlx::query(
            "SELECT email, full_name, avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| ApiError::Unauthorized("Linked user no longer exists".into()))?;
        sqlx::query(
            "UPDATE external_identities SET last_seen_at = now() WHERE provider = 'zitadel' AND issuer = $1 AND subject = $2",
        )
        .bind(issuer)
        .bind(subject)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE users SET last_login_at = now(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok((
            user_id,
            row.get("email"),
            row.get("full_name"),
            row.get("avatar_url"),
        ));
    }

    let user_id = match sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE lower(email) = $1 AND deleted_at IS NULL",
    )
    .bind(email)
    .fetch_optional(&mut *tx)
    .await?
    {
        Some(id) => {
            sqlx::query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            id
        }
        None => {
            let id = Uuid::new_v4();
            sqlx::query(
                r#"
                INSERT INTO users (id, email, full_name, email_verified)
                VALUES ($1, $2, $3, true)
                "#,
            )
            .bind(id)
            .bind(email)
            .bind(full_name)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from_db_error)?;
            id
        }
    };

    session::link_external_identity(
        &mut tx,
        "zitadel",
        issuer,
        subject,
        user_id,
        Some(email),
        true,
    )
    .await?;
    sqlx::query("UPDATE users SET last_login_at = now(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    let row = sqlx::query(
        "SELECT email, full_name, avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok((
        user_id,
        row.get("email"),
        row.get("full_name"),
        row.get("avatar_url"),
    ))
}

#[allow(clippy::too_many_arguments)]
async fn record_security(
    state: &AppState,
    headers: &HeaderMap,
    client_ip: ClientIp,
    event_type: &str,
    outcome: &str,
    user_id: Option<Uuid>,
    issuer: Option<&str>,
    subject: Option<&str>,
    metadata: serde_json::Value,
) {
    let fp = session::fingerprint(
        &state.config,
        client_ip.0,
        headers
            .get(axum::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok()),
    );
    if let Err(e) = session::record_security_event(
        &state.pool,
        session::SecurityEvent {
            event_type,
            outcome,
            user_id,
            provider: Some("zitadel"),
            issuer,
            subject,
            fingerprint: fp,
            metadata,
        },
    )
    .await
    {
        tracing::warn!("failed to record security event: {e}");
    }
}

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
