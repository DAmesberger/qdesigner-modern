use std::net::IpAddr;
use std::time::Duration;

use axum::http::HeaderMap;
use chrono::{DateTime, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::auth::crypto;
use crate::auth::models::{AuthenticatedUser, SessionOrganization, SessionView, UserInfo};
use crate::config::Config;
use crate::error::ApiError;

pub const SESSION_COOKIE: &str = "qd_session";
pub const CSRF_HEADER: &str = "x-csrf-token";

#[derive(Debug)]
pub struct NewSession {
    pub cookie_token: String,
    pub csrf_token: String,
    pub session_hash: String,
    pub view: SessionView,
}

#[derive(Debug, Clone)]
pub struct ClientFingerprint {
    pub ip_prefix: Option<String>,
    pub ip_hash: Option<String>,
    pub user_agent_hash: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionMetadata {
    pub provider: String,
    pub issuer: Option<String>,
    pub subject: Option<String>,
    pub encrypted_token_set: Option<String>,
    pub mfa_verified: bool,
    pub idle_ttl: Duration,
    pub absolute_ttl: Duration,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LoginStateRow {
    pub nonce_hash: String,
    pub pkce_verifier_enc: String,
    pub return_to: String,
    pub redirect_uri: String,
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub jwks_uri: String,
    pub introspection_endpoint: Option<String>,
    pub revocation_endpoint: Option<String>,
    pub client_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct NewLoginState<'a> {
    pub state: &'a str,
    pub nonce: &'a str,
    pub pkce_verifier: &'a str,
    pub return_to: &'a str,
    pub redirect_uri: &'a str,
    pub issuer: &'a str,
    pub authorization_endpoint: &'a str,
    pub token_endpoint: &'a str,
    pub jwks_uri: &'a str,
    pub introspection_endpoint: Option<&'a str>,
    pub revocation_endpoint: Option<&'a str>,
    pub client_id: &'a str,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct SecurityEvent<'a> {
    pub event_type: &'a str,
    pub outcome: &'a str,
    pub user_id: Option<Uuid>,
    pub provider: Option<&'a str>,
    pub issuer: Option<&'a str>,
    pub subject: Option<&'a str>,
    pub fingerprint: ClientFingerprint,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StoredTokenSet {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<i64>,
    pub obtained_at: DateTime<Utc>,
    pub revocation_endpoint: Option<String>,
}

pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn keyed_hash(key: &str, value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hasher.update(b":");
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(k, v)| (k == name && !v.is_empty()).then(|| v.to_string()))
}

pub fn extract_session_cookie(headers: &HeaderMap) -> Option<String> {
    extract_cookie(headers, SESSION_COOKIE)
}

pub fn fingerprint(
    config: &Config,
    ip: Option<IpAddr>,
    user_agent: Option<&str>,
) -> ClientFingerprint {
    let ip_prefix = ip.map(ip_prefix);
    let ip_hash = ip.map(|addr| keyed_hash(&config.auth_ip_hash_key, &addr.to_string()));
    let user_agent_hash = user_agent
        .filter(|ua| !ua.trim().is_empty())
        .map(|ua| keyed_hash(&config.auth_ip_hash_key, ua));
    ClientFingerprint {
        ip_prefix,
        ip_hash,
        user_agent_hash,
    }
}

fn ip_prefix(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v4) => {
            let octets = v4.octets();
            format!("{}.{}.{}.0/24", octets[0], octets[1], octets[2])
        }
        IpAddr::V6(v6) => {
            let segments = v6.segments();
            format!(
                "{:x}:{:x}:{:x}:{:x}::/64",
                segments[0], segments[1], segments[2], segments[3]
            )
        }
    }
}

pub async fn current_roles(pool: &PgPool, user_id: Uuid) -> Result<Vec<String>, ApiError> {
    let roles: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT role FROM organization_members WHERE user_id = $1 AND status = 'active'",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(if roles.is_empty() {
        vec!["user".to_string()]
    } else {
        roles
    })
}

pub async fn session_organizations(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<SessionOrganization>, ApiError> {
    sqlx::query_as::<_, SessionOrganization>(
        r#"
        SELECT o.id, o.name, o.slug, om.role
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.user_id = $1
          AND om.status = 'active'
          AND o.deleted_at IS NULL
        ORDER BY o.name
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(ApiError::from)
}

pub async fn create_auth_session(
    pool: &PgPool,
    user: UserInfo,
    metadata: SessionMetadata,
    fingerprint: ClientFingerprint,
) -> Result<NewSession, ApiError> {
    let cookie_token = random_token();
    let csrf_token = random_token();
    let session_hash = hash_token(&cookie_token);
    let csrf_hash = hash_token(&csrf_token);
    let now = Utc::now();
    let idle_expires_at =
        now + chrono::Duration::from_std(metadata.idle_ttl).unwrap_or(chrono::Duration::hours(8));
    let absolute_expires_at = now
        + chrono::Duration::from_std(metadata.absolute_ttl).unwrap_or(chrono::Duration::days(7));

    sqlx::query(
        r#"
        INSERT INTO auth_sessions
            (session_hash, user_id, provider, issuer, subject, encrypted_token_set,
             mfa_verified, csrf_token_hash, idle_expires_at, absolute_expires_at,
             user_agent_hash, ip_prefix, ip_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        "#,
    )
    .bind(&session_hash)
    .bind(user.id)
    .bind(&metadata.provider)
    .bind(&metadata.issuer)
    .bind(&metadata.subject)
    .bind(&metadata.encrypted_token_set)
    .bind(metadata.mfa_verified)
    .bind(&csrf_hash)
    .bind(idle_expires_at)
    .bind(absolute_expires_at)
    .bind(&fingerprint.user_agent_hash)
    .bind(&fingerprint.ip_prefix)
    .bind(&fingerprint.ip_hash)
    .execute(pool)
    .await?;

    let organizations = session_organizations(pool, user.id).await?;
    let view = SessionView {
        authenticated: true,
        provider: Some(metadata.provider),
        roles: user.roles.clone(),
        organizations,
        expires_at: Some(idle_expires_at.min(absolute_expires_at)),
        csrf_token: Some(csrf_token.clone()),
        mfa_verified: metadata.mfa_verified,
        user: Some(user),
    };

    Ok(NewSession {
        cookie_token,
        csrf_token,
        session_hash,
        view,
    })
}

pub async fn resolve_session_token(
    pool: &PgPool,
    token: &str,
    idle_ttl: Duration,
) -> Result<Option<AuthenticatedUser>, ApiError> {
    let session_hash = hash_token(token);
    let row = sqlx::query(
        r#"
        SELECT s.user_id, s.provider, s.mfa_verified, u.email
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_hash = $1
          AND s.revoked_at IS NULL
          AND s.idle_expires_at > now()
          AND s.absolute_expires_at > now()
          AND u.deleted_at IS NULL
        "#,
    )
    .bind(&session_hash)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let user_id: Uuid = row.get("user_id");
    let email: String = row.get("email");
    let provider: String = row.get("provider");
    let mfa_verified: bool = row.get("mfa_verified");
    let roles = current_roles(pool, user_id).await?;

    let new_idle =
        Utc::now() + chrono::Duration::from_std(idle_ttl).unwrap_or(chrono::Duration::hours(8));
    sqlx::query(
        r#"
        UPDATE auth_sessions
        SET last_seen_at = now(),
            idle_expires_at = LEAST(absolute_expires_at, $2)
        WHERE session_hash = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(&session_hash)
    .bind(new_idle)
    .execute(pool)
    .await?;

    Ok(Some(AuthenticatedUser {
        user_id,
        email,
        roles,
        provider,
        mfa_verified,
        session_hash: Some(session_hash),
        jti: None,
    }))
}

pub async fn session_view_for_token(
    pool: &PgPool,
    token: &str,
    idle_ttl: Duration,
) -> Result<Option<SessionView>, ApiError> {
    let Some(user) = resolve_session_token(pool, token, idle_ttl).await? else {
        return Ok(None);
    };
    let row = sqlx::query(
        r#"
        SELECT u.id, u.email, u.full_name, u.avatar_url,
               s.provider, s.idle_expires_at, s.absolute_expires_at
        FROM auth_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_hash = $1
        "#,
    )
    .bind(
        user.session_hash
            .as_deref()
            .ok_or_else(|| ApiError::Unauthorized("Missing session".into()))?,
    )
    .fetch_one(pool)
    .await?;

    let expires_at: DateTime<Utc> = row
        .get::<DateTime<Utc>, _>("idle_expires_at")
        .min(row.get::<DateTime<Utc>, _>("absolute_expires_at"));
    let user_info = UserInfo {
        id: row.get("id"),
        email: row.get("email"),
        full_name: row.get("full_name"),
        avatar_url: row.get("avatar_url"),
        roles: user.roles.clone(),
    };
    let csrf_token = rotate_csrf_token(
        pool,
        user.session_hash
            .as_deref()
            .ok_or_else(|| ApiError::Unauthorized("Missing session".into()))?,
    )
    .await?;

    Ok(Some(SessionView {
        authenticated: true,
        provider: Some(row.get("provider")),
        user: Some(user_info),
        mfa_verified: user.mfa_verified,
        roles: user.roles.clone(),
        organizations: session_organizations(pool, user.user_id).await?,
        expires_at: Some(expires_at),
        csrf_token: Some(csrf_token),
    }))
}

pub async fn validate_csrf(
    pool: &PgPool,
    session_token: &str,
    csrf_token: &str,
) -> Result<bool, ApiError> {
    let session_hash = hash_token(session_token);
    let csrf_hash = hash_token(csrf_token);
    let valid = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM auth_sessions
            WHERE session_hash = $1
              AND csrf_token_hash = $2
              AND revoked_at IS NULL
              AND idle_expires_at > now()
              AND absolute_expires_at > now()
        )
        "#,
    )
    .bind(session_hash)
    .bind(csrf_hash)
    .fetch_one(pool)
    .await?;
    Ok(valid)
}

pub async fn rotate_csrf_token(pool: &PgPool, session_hash: &str) -> Result<String, ApiError> {
    let csrf_token = random_token();
    let csrf_hash = hash_token(&csrf_token);
    let updated = sqlx::query("UPDATE auth_sessions SET csrf_token_hash = $2 WHERE session_hash = $1 AND revoked_at IS NULL")
        .bind(session_hash)
        .bind(csrf_hash)
        .execute(pool)
        .await?
        .rows_affected();
    if updated == 0 {
        return Err(ApiError::Unauthorized("Session not found".into()));
    }
    Ok(csrf_token)
}

pub async fn revoke_auth_session(pool: &PgPool, session_hash: &str) -> Result<(), ApiError> {
    sqlx::query(
        "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()), encrypted_token_set = NULL WHERE session_hash = $1",
    )
    .bind(session_hash)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn revoke_auth_session_token(pool: &PgPool, token: &str) -> Result<(), ApiError> {
    revoke_auth_session(pool, &hash_token(token)).await
}

pub async fn revoke_all_auth_sessions(
    executor: impl sqlx::PgExecutor<'_>,
    user_id: Uuid,
) -> Result<(), ApiError> {
    sqlx::query(
        "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()), encrypted_token_set = NULL WHERE user_id = $1",
    )
    .bind(user_id)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn encrypted_token_set_for_session(
    pool: &PgPool,
    session_hash: &str,
) -> Result<Option<String>, ApiError> {
    sqlx::query_scalar(
        "SELECT encrypted_token_set FROM auth_sessions WHERE session_hash = $1 AND revoked_at IS NULL",
    )
    .bind(session_hash)
    .fetch_optional(pool)
    .await
    .map_err(ApiError::from)
}

pub async fn store_login_state(
    pool: &PgPool,
    config: &Config,
    login: NewLoginState<'_>,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO auth_login_states
            (state_hash, provider, nonce_hash, pkce_verifier_enc, return_to,
             redirect_uri, issuer, authorization_endpoint, token_endpoint, jwks_uri,
             introspection_endpoint, revocation_endpoint, client_id, expires_at)
        VALUES ($1, 'zitadel', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        "#,
    )
    .bind(hash_token(login.state))
    .bind(hash_token(login.nonce))
    .bind(crypto::encrypt(
        &config.auth_token_enc_key,
        login.pkce_verifier,
    )?)
    .bind(login.return_to)
    .bind(login.redirect_uri)
    .bind(login.issuer)
    .bind(login.authorization_endpoint)
    .bind(login.token_endpoint)
    .bind(login.jwks_uri)
    .bind(login.introspection_endpoint)
    .bind(login.revocation_endpoint)
    .bind(login.client_id)
    .bind(login.expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn consume_login_state(
    pool: &PgPool,
    state: &str,
) -> Result<Option<LoginStateRow>, ApiError> {
    let row = sqlx::query_as::<_, LoginStateRow>(
        r#"
        DELETE FROM auth_login_states
        WHERE state_hash = $1
        RETURNING nonce_hash, pkce_verifier_enc, return_to, redirect_uri, issuer,
                  authorization_endpoint, token_endpoint, jwks_uri,
                  introspection_endpoint, revocation_endpoint, client_id, expires_at
        "#,
    )
    .bind(hash_token(state))
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn link_external_identity(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    provider: &str,
    issuer: &str,
    subject: &str,
    user_id: Uuid,
    email: Option<&str>,
    email_verified: bool,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO external_identities
            (provider, issuer, subject, user_id, email_at_link, email_verified_at_link)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (provider, issuer, subject) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              email_at_link = EXCLUDED.email_at_link,
              email_verified_at_link = EXCLUDED.email_verified_at_link,
              last_seen_at = now()
        "#,
    )
    .bind(provider)
    .bind(issuer)
    .bind(subject)
    .bind(user_id)
    .bind(email)
    .bind(email_verified)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn record_security_event(
    pool: &PgPool,
    event: SecurityEvent<'_>,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO security_events
            (event_type, outcome, user_id, provider, issuer, subject,
             ip_prefix, ip_hash, user_agent_hash, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(event.event_type)
    .bind(event.outcome)
    .bind(event.user_id)
    .bind(event.provider)
    .bind(event.issuer)
    .bind(event.subject)
    .bind(event.fingerprint.ip_prefix)
    .bind(event.fingerprint.ip_hash)
    .bind(event.fingerprint.user_agent_hash)
    .bind(event.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn purge_expired_auth_data(
    pool: &PgPool,
    session_retention: Duration,
    security_event_retention: Duration,
) -> Result<(u64, u64, u64), ApiError> {
    let now = Utc::now();
    let session_cutoff =
        now - chrono::Duration::from_std(session_retention).unwrap_or(chrono::Duration::days(30));
    let event_cutoff = now
        - chrono::Duration::from_std(security_event_retention)
            .unwrap_or(chrono::Duration::days(365));

    let login_states = sqlx::query("DELETE FROM auth_login_states WHERE expires_at < now()")
        .execute(pool)
        .await?
        .rows_affected();
    let sessions = sqlx::query(
        r#"
        DELETE FROM auth_sessions
        WHERE (revoked_at IS NOT NULL AND revoked_at < $1)
           OR (absolute_expires_at < $1)
        "#,
    )
    .bind(session_cutoff)
    .execute(pool)
    .await?
    .rows_affected();
    let security_events = sqlx::query("DELETE FROM security_events WHERE created_at < $1")
        .bind(event_cutoff)
        .execute(pool)
        .await?
        .rows_affected();
    Ok((login_states, sessions, security_events))
}

/// Store a refresh token's JTI so we can revoke it later.
pub async fn store_refresh_token(
    pool: &PgPool,
    user_id: Uuid,
    jti: Uuid,
    expires_at: chrono::DateTime<chrono::Utc>,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (jti, user_id, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(jti)
    .bind(user_id)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

/// Check whether a refresh JTI is still valid (exists and not revoked).
pub async fn is_refresh_token_valid(pool: &PgPool, jti: Uuid) -> Result<bool, ApiError> {
    let row = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM refresh_tokens
            WHERE jti = $1
              AND revoked = false
              AND expires_at > NOW()
        )
        "#,
    )
    .bind(jti)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Revoke a single refresh token by JTI.
pub async fn revoke_refresh_token(pool: &PgPool, jti: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        UPDATE refresh_tokens SET revoked = true WHERE jti = $1
        "#,
    )
    .bind(jti)
    .execute(pool)
    .await?;
    Ok(())
}

/// Revoke all refresh tokens for a user (e.g. on password change).
pub async fn revoke_all_user_tokens(
    executor: impl sqlx::PgExecutor<'_>,
    user_id: Uuid,
) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        UPDATE refresh_tokens SET revoked = true WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .execute(executor)
    .await?;
    Ok(())
}

/// Add an access token JTI to the revoked set (for logout).
pub async fn revoke_access_token(pool: &PgPool, jti: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO revoked_tokens (jti) VALUES ($1)
        ON CONFLICT (jti) DO NOTHING
        "#,
    )
    .bind(jti)
    .execute(pool)
    .await?;
    Ok(())
}

/// Check whether an access token JTI has been revoked.
pub async fn is_access_token_revoked(pool: &PgPool, jti: Uuid) -> Result<bool, ApiError> {
    let row = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE jti = $1)
        "#,
    )
    .bind(jti)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// Purge revoked-access-token entries older than `older_than`. An entry only
/// matters until the original access token would have expired; after that
/// the JWT is rejected on its own merits and the revocation row is dead
/// weight that grows the per-request lookup unbounded.
pub async fn purge_expired_revoked_tokens(
    pool: &PgPool,
    older_than: chrono::Duration,
) -> Result<u64, ApiError> {
    let cutoff = chrono::Utc::now() - older_than;
    let result = sqlx::query(
        r#"
        DELETE FROM revoked_tokens WHERE revoked_at < $1
        "#,
    )
    .bind(cutoff)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}
