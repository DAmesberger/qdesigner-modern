//! SSO federation — OIDC (and SAML config surface) with just-in-time org
//! membership (E-RBAC-6).
//!
//! Three surfaces live here:
//!
//!   * **Admin CRUD** (`/api/organizations/{id}/sso`, owner-gated, runs inside
//!     the per-request RLS transaction): register/edit/delete a per-org
//!     identity provider. `client_secret` is encrypted at rest (AES-256-GCM,
//!     [`crypto`]) and never echoed back — responses carry only
//!     `has_client_secret`.
//!
//!   * **Login resolution** (`GET /api/sso/resolve`, anonymous): given an
//!     email, resolve whether the address's verified domain belongs to an org
//!     with an enabled IdP, returning the org slug + provider label so the
//!     login page can offer a "Sign in with SSO" button. Reuses the P8-T8
//!     `organization_domains` verified-domain data.
//!
//!   * **OIDC flow** (`GET /api/sso/{org_slug}/start` +
//!     `GET /api/sso/callback`, anonymous): the authorization-code flow. On
//!     callback the id_token is signature+claim validated against the IdP's
//!     JWKS, then the user and their active `organization_members` row are
//!     provisioned just-in-time at the group-mapped (or default) role, and an
//!     opaque browser session is issued through the same
//!     [`session`](crate::auth::session) path a password login uses.
//!
//! SAML is a first-class config protocol in the data model and admin CRUD, but
//! the runtime `start`/`callback` for `protocol = 'saml'` is a documented
//! not-yet-available stub — see [`saml_not_available`]. Enabling a real
//! samael-backed handler is deferred (its native xmlsec/libxml build is out of
//! scope for this unit); the schema + CRUD are ready for it.

use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::Redirect;
use axum::Json;
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::time::Duration;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::{AuthenticatedUser, UserInfo};
use crate::auth::session;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::OrgRole;
use crate::state::AppState;

/// AES-256-GCM encryption of the per-org IdP `client_secret` at rest.
///
/// The 32-byte key is SHA-256(config key) so the operator-supplied
/// `SSO_ENCRYPTION_KEY` (or the `JWT_SECRET` fallback) can be any length. Each
/// ciphertext embeds its own random 96-bit nonce; the stored string is
/// `"v1:<hex nonce>:<hex ciphertext>"`.
pub mod crypto {
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

    /// Encrypt `plaintext` under the key derived from `secret`.
    pub fn encrypt(secret: &str, plaintext: &str) -> Result<String, ApiError> {
        let cipher = cipher(secret);
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = cipher
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|_| ApiError::Internal("Failed to encrypt SSO secret".into()))?;
        Ok(format!("v1:{}:{}", hex::encode(nonce), hex::encode(ct)))
    }

    /// Decrypt a `"v1:<hex nonce>:<hex ct>"` string produced by [`encrypt`].
    pub fn decrypt(secret: &str, stored: &str) -> Result<String, ApiError> {
        let mut parts = stored.splitn(3, ':');
        match (parts.next(), parts.next(), parts.next()) {
            (Some("v1"), Some(nonce_hex), Some(ct_hex)) => {
                let nonce_bytes = hex::decode(nonce_hex)
                    .map_err(|_| ApiError::Internal("Corrupt SSO secret nonce".into()))?;
                let ct = hex::decode(ct_hex)
                    .map_err(|_| ApiError::Internal("Corrupt SSO secret ciphertext".into()))?;
                let nonce = GenericArray::from_slice(&nonce_bytes);
                let pt = cipher(secret)
                    .decrypt(nonce, ct.as_ref())
                    .map_err(|_| ApiError::Internal("Failed to decrypt SSO secret".into()))?;
                String::from_utf8(pt)
                    .map_err(|_| ApiError::Internal("Decrypted SSO secret is not UTF-8".into()))
            }
            _ => Err(ApiError::Internal(
                "Unrecognized SSO secret ciphertext format".into(),
            )),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn round_trips() {
            let ct = encrypt("key-material", "s3cr3t-value").unwrap();
            assert!(ct.starts_with("v1:"));
            assert_ne!(ct, "s3cr3t-value");
            assert_eq!(decrypt("key-material", &ct).unwrap(), "s3cr3t-value");
        }

        #[test]
        fn wrong_key_fails() {
            let ct = encrypt("key-a", "value").unwrap();
            assert!(decrypt("key-b", &ct).is_err());
        }

        #[test]
        fn nonce_is_random_per_call() {
            let a = encrypt("k", "same").unwrap();
            let b = encrypt("k", "same").unwrap();
            assert_ne!(a, b, "each ciphertext must carry a fresh nonce");
        }
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────

/// One identity provider, with the `client_secret` redacted to a presence
/// flag. Never carries the ciphertext or plaintext secret.
#[derive(Debug, Serialize, ToSchema)]
pub struct IdentityProviderRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub protocol: String,
    pub display_name: Option<String>,
    pub issuer: Option<String>,
    pub metadata_url: Option<String>,
    pub client_id: Option<String>,
    /// True when a `client_secret` is stored (its value is never returned).
    pub has_client_secret: bool,
    pub default_role: String,
    pub group_claim: String,
    #[schema(value_type = Object)]
    pub group_role_map: serde_json::Value,
    pub enforce_role_mapping: bool,
    pub enabled: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, sqlx::FromRow)]
struct IdpRow {
    id: Uuid,
    organization_id: Uuid,
    protocol: String,
    display_name: Option<String>,
    issuer: Option<String>,
    metadata_url: Option<String>,
    client_id: Option<String>,
    has_client_secret: bool,
    default_role: String,
    group_claim: String,
    group_role_map: serde_json::Value,
    enforce_role_mapping: bool,
    enabled: bool,
    created_at: Option<DateTime<Utc>>,
    updated_at: Option<DateTime<Utc>>,
}

impl From<IdpRow> for IdentityProviderRecord {
    fn from(r: IdpRow) -> Self {
        IdentityProviderRecord {
            id: r.id,
            organization_id: r.organization_id,
            protocol: r.protocol,
            display_name: r.display_name,
            issuer: r.issuer,
            metadata_url: r.metadata_url,
            client_id: r.client_id,
            has_client_secret: r.has_client_secret,
            default_role: r.default_role,
            group_claim: r.group_claim,
            group_role_map: r.group_role_map,
            enforce_role_mapping: r.enforce_role_mapping,
            enabled: r.enabled,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

/// SELECT list of [`IdpRow`] columns; `has_client_secret` is computed so the
/// ciphertext never leaves the DB.
const IDP_SELECT: &str = r#"
    id, organization_id, protocol, display_name, issuer, metadata_url,
    client_id, (client_secret_enc IS NOT NULL) AS has_client_secret,
    default_role, group_claim, group_role_map, enforce_role_mapping,
    enabled, created_at, updated_at
"#;

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateIdpRequest {
    /// `"oidc"` or `"saml"`.
    pub protocol: String,
    pub display_name: Option<String>,
    /// OIDC issuer / SAML entity id.
    pub issuer: Option<String>,
    /// OIDC discovery URL / SAML metadata URL (reachability validated).
    pub metadata_url: Option<String>,
    pub client_id: Option<String>,
    /// Plaintext client secret; stored encrypted, never returned.
    pub client_secret: Option<String>,
    #[serde(default = "default_member")]
    pub default_role: String,
    pub group_claim: Option<String>,
    /// Object mapping IdP group name → org role (`admin`|`member`|`viewer`).
    #[serde(default)]
    #[schema(value_type = Object)]
    pub group_role_map: serde_json::Value,
    #[serde(default)]
    pub enforce_role_mapping: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateIdpRequest {
    pub display_name: Option<String>,
    pub issuer: Option<String>,
    pub metadata_url: Option<String>,
    pub client_id: Option<String>,
    /// Non-empty → re-encrypt and replace; empty string → clear the secret.
    pub client_secret: Option<String>,
    pub default_role: Option<String>,
    pub group_claim: Option<String>,
    #[schema(value_type = Object)]
    pub group_role_map: Option<serde_json::Value>,
    pub enforce_role_mapping: Option<bool>,
    pub enabled: Option<bool>,
}

fn default_member() -> String {
    "member".into()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct ResolveQuery {
    pub email: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ResolveResponse {
    pub sso_available: bool,
    pub org_slug: Option<String>,
    pub provider_name: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

// ── Validation helpers ───────────────────────────────────────────────

fn validate_protocol(p: &str) -> Result<(), ApiError> {
    match p {
        "oidc" | "saml" => Ok(()),
        _ => Err(ApiError::BadRequest(
            "protocol must be 'oidc' or 'saml'".into(),
        )),
    }
}

fn validate_role(r: &str) -> Result<(), ApiError> {
    match r {
        "admin" | "member" | "viewer" => Ok(()),
        _ => Err(ApiError::BadRequest(
            "default_role must be 'admin', 'member', or 'viewer'".into(),
        )),
    }
}

/// A `group_role_map` must be a JSON object whose values are valid roles.
fn validate_group_role_map(v: &serde_json::Value) -> Result<(), ApiError> {
    if v.is_null() {
        return Ok(());
    }
    let obj = v
        .as_object()
        .ok_or_else(|| ApiError::BadRequest("group_role_map must be a JSON object".into()))?;
    for role in obj.values() {
        let role = role
            .as_str()
            .ok_or_else(|| ApiError::BadRequest("group_role_map values must be strings".into()))?;
        validate_role(role)?;
    }
    Ok(())
}

/// Best-effort reachability probe for an OIDC discovery / SAML metadata URL.
/// Rejects non-http(s) URLs outright and requires a 2xx response within a
/// short timeout.
async fn validate_metadata_reachable(url: &str) -> Result<(), ApiError> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|_| ApiError::BadRequest("metadata_url is not a valid URL".into()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(ApiError::BadRequest(
            "metadata_url must be an http(s) URL".into(),
        ));
    }
    let client = http_client()?;
    let resp = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("metadata_url is not reachable: {e}")))?;
    if !resp.status().is_success() {
        return Err(ApiError::BadRequest(format!(
            "metadata_url returned HTTP {}",
            resp.status().as_u16()
        )));
    }
    Ok(())
}

async fn require_org_owner(
    state: &AppState,
    conn: &mut sqlx::PgConnection,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<(), ApiError> {
    if state
        .rbac
        .has_org_role(conn, user_id, org_id, &OrgRole::Owner)
        .await?
    {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Only an organization owner can manage SSO".into(),
        ))
    }
}

// ── Admin CRUD ───────────────────────────────────────────────────────

/// GET /api/organizations/:id/sso
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/sso",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Configured identity providers", body = [IdentityProviderRecord]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sso"]
)]
pub async fn list_providers(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<IdentityProviderRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_owner(&state, &mut tx, user.user_id, org_id).await?;

    let rows = sqlx::query_as::<_, IdpRow>(&format!(
        "SELECT {IDP_SELECT} FROM org_identity_providers WHERE organization_id = $1 ORDER BY created_at"
    ))
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// POST /api/organizations/:id/sso
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/sso",
    request_body = CreateIdpRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "Identity provider created", body = IdentityProviderRecord),
        (status = 400, description = "Invalid configuration", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sso"]
)]
pub async fn create_provider(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateIdpRequest>,
) -> Result<(axum::http::StatusCode, Json<IdentityProviderRecord>), ApiError> {
    validate_protocol(&body.protocol)?;
    if body.protocol == "saml" {
        return Err(saml_creation_not_available());
    }
    validate_role(&body.default_role)?;
    validate_group_role_map(&body.group_role_map)?;

    // Reachability is validated OUTSIDE the RLS tx so the pooled connection is
    // not held under the mutex across network I/O.
    if let Some(url) = body
        .metadata_url
        .as_deref()
        .filter(|u| !u.trim().is_empty())
    {
        validate_metadata_reachable(url).await?;
    }

    let secret_enc = match body.client_secret.as_deref().filter(|s| !s.is_empty()) {
        Some(secret) => Some(crypto::encrypt(state.config.sso_encryption_key(), secret)?),
        None => None,
    };
    let group_map = if body.group_role_map.is_null() {
        serde_json::json!({})
    } else {
        body.group_role_map
    };
    let group_claim = body.group_claim.unwrap_or_else(|| "groups".into());

    let mut tx = tx.tx().await?;
    require_org_owner(&state, &mut tx, user.user_id, org_id).await?;

    let row = sqlx::query_as::<_, IdpRow>(&format!(
        r#"
        INSERT INTO org_identity_providers
            (organization_id, protocol, display_name, issuer, metadata_url,
             client_id, client_secret_enc, default_role, group_claim,
             group_role_map, enforce_role_mapping, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING {IDP_SELECT}
        "#
    ))
    .bind(org_id)
    .bind(&body.protocol)
    .bind(&body.display_name)
    .bind(&body.issuer)
    .bind(&body.metadata_url)
    .bind(&body.client_id)
    .bind(&secret_enc)
    .bind(&body.default_role)
    .bind(&group_claim)
    .bind(&group_map)
    .bind(body.enforce_role_mapping)
    .bind(body.enabled)
    .fetch_one(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::SsoProviderCreated,
            resource_type: resource::IDENTITY_PROVIDER,
            resource_id: Some(row.id),
            metadata: serde_json::json!({
                "protocol": row.protocol,
                "display_name": row.display_name,
                "enabled": row.enabled,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(row.into())))
}

/// PATCH /api/organizations/:id/sso/:idp_id
#[utoipa::path(
    patch,
    path = "/api/organizations/{id}/sso/{idp_id}",
    request_body = UpdateIdpRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("idp_id" = Uuid, Path, description = "Identity provider id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Identity provider updated", body = IdentityProviderRecord),
        (status = 400, description = "Invalid configuration", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sso"]
)]
pub async fn update_provider(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, idp_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateIdpRequest>,
) -> Result<Json<IdentityProviderRecord>, ApiError> {
    if let Some(role) = body.default_role.as_deref() {
        validate_role(role)?;
    }
    if let Some(map) = body.group_role_map.as_ref() {
        validate_group_role_map(map)?;
    }
    if let Some(url) = body
        .metadata_url
        .as_deref()
        .filter(|u| !u.trim().is_empty())
    {
        validate_metadata_reachable(url).await?;
    }

    // `client_secret`: Some(non-empty) → re-encrypt; Some("") → clear;
    // None → leave unchanged. Encoded as a two-part update below.
    let secret_change: Option<Option<String>> = match body.client_secret.as_deref() {
        None => None,
        Some("") => Some(None),
        Some(secret) => Some(Some(crypto::encrypt(
            state.config.sso_encryption_key(),
            secret,
        )?)),
    };

    let mut tx = tx.tx().await?;
    require_org_owner(&state, &mut tx, user.user_id, org_id).await?;

    // COALESCE-driven partial update: each column keeps its current value when
    // the corresponding bind is NULL. `client_secret_enc` is handled by a
    // separate flag so it can be explicitly cleared.
    let (update_secret, new_secret) = match secret_change {
        None => (false, None),
        Some(v) => (true, v),
    };

    let row = sqlx::query_as::<_, IdpRow>(&format!(
        r#"
        UPDATE org_identity_providers SET
            display_name         = COALESCE($3, display_name),
            issuer               = COALESCE($4, issuer),
            metadata_url         = COALESCE($5, metadata_url),
            client_id            = COALESCE($6, client_id),
            client_secret_enc    = CASE WHEN $7 THEN $8 ELSE client_secret_enc END,
            default_role         = COALESCE($9, default_role),
            group_claim          = COALESCE($10, group_claim),
            group_role_map       = COALESCE($11, group_role_map),
            enforce_role_mapping = COALESCE($12, enforce_role_mapping),
            enabled              = COALESCE($13, enabled),
            updated_at           = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING {IDP_SELECT}
        "#
    ))
    .bind(idp_id)
    .bind(org_id)
    .bind(&body.display_name)
    .bind(&body.issuer)
    .bind(&body.metadata_url)
    .bind(&body.client_id)
    .bind(update_secret)
    .bind(&new_secret)
    .bind(&body.default_role)
    .bind(&body.group_claim)
    .bind(&body.group_role_map)
    .bind(body.enforce_role_mapping)
    .bind(body.enabled)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Identity provider not found".into()))?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::SsoProviderUpdated,
            resource_type: resource::IDENTITY_PROVIDER,
            resource_id: Some(row.id),
            metadata: serde_json::json!({
                "enabled": row.enabled,
                "secret_changed": update_secret,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(row.into()))
}

/// DELETE /api/organizations/:id/sso/:idp_id
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/sso/{idp_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("idp_id" = Uuid, Path, description = "Identity provider id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Identity provider deleted", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sso"]
)]
pub async fn delete_provider(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, idp_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_owner(&state, &mut tx, user.user_id, org_id).await?;

    let deleted =
        sqlx::query("DELETE FROM org_identity_providers WHERE id = $1 AND organization_id = $2")
            .bind(idp_id)
            .bind(org_id)
            .execute(&mut **tx)
            .await?
            .rows_affected();

    if deleted == 0 {
        return Err(ApiError::NotFound("Identity provider not found".into()));
    }

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::SsoProviderDeleted,
            resource_type: resource::IDENTITY_PROVIDER,
            resource_id: Some(idp_id),
            metadata: serde_json::json!({}),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Identity provider deleted" }),
    ))
}

// ── Login resolution ─────────────────────────────────────────────────

/// GET /api/sso/resolve?email=user@corp.com
///
/// Anonymous. Resolves whether the email's verified domain (P8-T8
/// `organization_domains`) belongs to an org with an enabled IdP, so the login
/// page can offer a "Sign in with SSO" affordance and know which org slug to
/// hand to `start`.
#[utoipa::path(
    get,
    path = "/api/sso/resolve",
    params(("email" = String, Query, description = "Email whose domain is resolved")),
    responses((status = 200, description = "SSO availability for the email's domain", body = ResolveResponse)),
    tags = ["sso"]
)]
pub async fn resolve_sso(
    State(state): State<AppState>,
    Query(q): Query<ResolveQuery>,
) -> Result<Json<ResolveResponse>, ApiError> {
    let email_domain = q
        .email
        .rsplit_once('@')
        .map(|(_, d)| d.trim().to_lowercase())
        .filter(|d| !d.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Invalid email format".into()))?;

    #[derive(sqlx::FromRow)]
    struct Row {
        slug: String,
        display_name: Option<String>,
        protocol: String,
    }

    let row = sqlx::query_as::<_, Row>(
        r#"
        SELECT o.slug, idp.display_name, idp.protocol
        FROM organization_domains od
        JOIN organizations o ON o.id = od.organization_id
        JOIN org_identity_providers idp
          ON idp.organization_id = o.id AND idp.enabled = true
        WHERE od.domain = $1
          AND od.verified_at IS NOT NULL
          AND o.deleted_at IS NULL
        ORDER BY idp.created_at
        LIMIT 1
        "#,
    )
    .bind(&email_domain)
    .fetch_optional(&state.pool)
    .await?;

    Ok(Json(match row {
        Some(r) => ResolveResponse {
            sso_available: true,
            org_slug: Some(r.slug),
            provider_name: r.display_name,
            protocol: Some(r.protocol),
        },
        None => ResolveResponse {
            sso_available: false,
            org_slug: None,
            provider_name: None,
            protocol: None,
        },
    }))
}

// ── OIDC flow ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OidcDiscovery {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    jwks_uri: String,
}

#[derive(Debug, Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize)]
struct Jwk {
    kid: Option<String>,
    n: Option<String>,
    e: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    id_token: String,
}

/// The IdP config columns the flow needs.
#[derive(Debug, sqlx::FromRow)]
struct IdpFlowRow {
    id: Uuid,
    organization_id: Uuid,
    protocol: String,
    metadata_url: Option<String>,
    client_id: Option<String>,
    client_secret_enc: Option<String>,
    default_role: String,
    group_claim: String,
    group_role_map: serde_json::Value,
    enforce_role_mapping: bool,
}

fn http_client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| ApiError::Internal(format!("HTTP client build failed: {e}")))
}

fn random_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Build the server-facing OIDC redirect_uri from the inbound request host.
/// The IdP redirects the browser back to THIS server, so the callback URL is
/// the server's own origin (not the SPA's).
fn callback_redirect_uri(headers: &HeaderMap) -> String {
    let host = headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost");
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    format!("{scheme}://{host}/api/sso/callback")
}

/// The SPA origin the callback bounces the freshly-minted token back to.
/// Delegates to [`crate::config::Config::app_origin`] so the origin resolution
/// (and the production-like fail-loud on a missing origin) is unified with the
/// invite-email link builder.
fn app_origin(state: &AppState) -> String {
    state.config.app_origin().to_string()
}

/// Stub response for `protocol = 'saml'` runtime flows. SAML config is stored
/// and manageable through the admin CRUD, but the samael-backed assertion
/// handling is deferred (native xmlsec/libxml build out of scope for E-RBAC-6).
fn saml_not_available() -> ApiError {
    ApiError::BadRequest(
        "SAML SSO is configured but this build does not include the SAML runtime. \
         Use an OIDC provider, or build with SAML support enabled."
            .into(),
    )
}

/// Rejection for attempts to *configure* a new `protocol = 'saml'` IdP. Since
/// the runtime `start`/`callback` can't complete a SAML login yet
/// ([`saml_not_available`]), the admin CRUD blocks creating one so an org can't
/// silently configure a provider nobody can sign in through (F-27). Pre-existing
/// saml rows stay readable/manageable — `protocol` is immutable on update — so
/// this only guards the create path.
fn saml_creation_not_available() -> ApiError {
    ApiError::BadRequest(
        "SAML is not yet available in this build. Configure an OIDC provider instead.".into(),
    )
}

/// GET /api/sso/:org_slug/start
///
/// Anonymous. Resolves the org's enabled IdP, fetches OIDC discovery, records a
/// single-use login-state row (CSRF `state` + `nonce`, pinned endpoints), and
/// redirects the browser to the IdP authorization endpoint.
#[utoipa::path(
    get,
    path = "/api/sso/{org_slug}/start",
    params(("org_slug" = String, Path, description = "Organization slug")),
    responses(
        (status = 303, description = "Redirect to the identity provider"),
        (status = 404, description = "No SSO configured for this organization", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sso"]
)]
pub async fn sso_start(
    State(state): State<AppState>,
    Path(org_slug): Path<String>,
    headers: HeaderMap,
) -> Result<Redirect, ApiError> {
    let idp = sqlx::query_as::<_, IdpFlowRow>(
        r#"
        SELECT idp.id, idp.organization_id, idp.protocol, idp.metadata_url,
               idp.client_id, idp.client_secret_enc, idp.default_role,
               idp.group_claim, idp.group_role_map, idp.enforce_role_mapping
        FROM org_identity_providers idp
        JOIN organizations o ON o.id = idp.organization_id
        WHERE o.slug = $1 AND o.deleted_at IS NULL AND idp.enabled = true
        ORDER BY idp.created_at
        LIMIT 1
        "#,
    )
    .bind(&org_slug)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("No SSO configured for this organization".into()))?;

    if idp.protocol != "oidc" {
        return Err(saml_not_available());
    }

    let metadata_url = idp
        .metadata_url
        .as_deref()
        .filter(|u| !u.trim().is_empty())
        .ok_or_else(|| ApiError::BadRequest("Identity provider has no metadata_url".into()))?;
    let client_id = idp
        .client_id
        .as_deref()
        .filter(|c| !c.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Identity provider has no client_id".into()))?;

    let client = http_client()?;
    let disc: OidcDiscovery = client
        .get(metadata_url)
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("OIDC discovery failed: {e}")))?
        .error_for_status()
        .map_err(|e| ApiError::BadRequest(format!("OIDC discovery HTTP error: {e}")))?
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("OIDC discovery is not valid JSON: {e}")))?;

    let state_tok = random_token();
    let nonce = random_token();
    let redirect_uri = callback_redirect_uri(&headers);
    let expires_at = Utc::now() + ChronoDuration::minutes(10);

    sqlx::query(
        r#"
        INSERT INTO sso_login_states
            (state, idp_id, nonce, redirect_uri, token_endpoint, jwks_uri, issuer, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(&state_tok)
    .bind(idp.id)
    .bind(&nonce)
    .bind(&redirect_uri)
    .bind(&disc.token_endpoint)
    .bind(&disc.jwks_uri)
    .bind(&disc.issuer)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    let mut authorize = reqwest::Url::parse(&disc.authorization_endpoint)
        .map_err(|_| ApiError::BadRequest("IdP authorization_endpoint is invalid".into()))?;
    authorize
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", "openid email profile")
        .append_pair("state", &state_tok)
        .append_pair("nonce", &nonce);

    Ok(Redirect::to(authorize.as_str()))
}

/// GET /api/sso/callback?code=...&state=...
///
/// Anonymous. Completes the authorization-code exchange, validates the
/// id_token, JIT-provisions the user + membership, mints an opaque app session,
/// and bounces the browser back to the SPA. Browser-visible tokens are not
/// returned from this flow.
#[utoipa::path(
    get,
    path = "/api/sso/callback",
    params(
        ("code" = Option<String>, Query, description = "Authorization code"),
        ("state" = Option<String>, Query, description = "Opaque CSRF state")
    ),
    responses(
        (status = 303, description = "Redirect back to the app with a session"),
        (status = 400, description = "Invalid callback", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sso"]
)]
pub async fn sso_callback(
    State(state): State<AppState>,
    client_ip: ClientIp,
    headers: HeaderMap,
    jar: CookieJar,
    Query(q): Query<CallbackQuery>,
) -> Result<(CookieJar, Redirect), ApiError> {
    if let Some(err) = q.error.as_deref() {
        let dest = format!("{}/login?sso_error={}", app_origin(&state), urlencode(err));
        return Ok((jar, Redirect::to(&dest)));
    }

    let code = q
        .code
        .as_deref()
        .filter(|c| !c.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Missing authorization code".into()))?;
    let state_tok = q
        .state
        .as_deref()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::BadRequest("Missing state".into()))?;

    // Consume the single-use login-state row (deleted regardless of outcome).
    #[derive(sqlx::FromRow)]
    struct LoginState {
        idp_id: Uuid,
        nonce: String,
        redirect_uri: String,
        token_endpoint: String,
        jwks_uri: String,
        issuer: String,
        expires_at: DateTime<Utc>,
    }

    let login_state = sqlx::query_as::<_, LoginState>(
        r#"
        DELETE FROM sso_login_states WHERE state = $1
        RETURNING idp_id, nonce, redirect_uri, token_endpoint, jwks_uri, issuer, expires_at
        "#,
    )
    .bind(state_tok)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Unknown or expired SSO state".into()))?;

    if login_state.expires_at < Utc::now() {
        return Err(ApiError::BadRequest("SSO state has expired".into()));
    }

    let idp = sqlx::query_as::<_, IdpFlowRow>(
        r#"
        SELECT id, organization_id, protocol, metadata_url, client_id,
               client_secret_enc, default_role, group_claim, group_role_map,
               enforce_role_mapping
        FROM org_identity_providers WHERE id = $1
        "#,
    )
    .bind(login_state.idp_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::BadRequest("Identity provider no longer exists".into()))?;

    if idp.protocol != "oidc" {
        return Err(saml_not_available());
    }

    let client_id = idp
        .client_id
        .clone()
        .ok_or_else(|| ApiError::BadRequest("Identity provider has no client_id".into()))?;
    let client_secret = match idp.client_secret_enc.as_deref() {
        Some(enc) => Some(crypto::decrypt(state.config.sso_encryption_key(), enc)?),
        None => None,
    };

    // ── Token exchange ──
    let http = http_client()?;
    let mut form: Vec<(&str, String)> = vec![
        ("grant_type", "authorization_code".into()),
        ("code", code.to_string()),
        ("redirect_uri", login_state.redirect_uri.clone()),
        ("client_id", client_id.clone()),
    ];
    if let Some(secret) = client_secret.as_deref() {
        form.push(("client_secret", secret.to_string()));
    }
    let token: TokenResponse = http
        .post(&login_state.token_endpoint)
        .form(&form)
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Token exchange failed: {e}")))?
        .error_for_status()
        .map_err(|e| ApiError::BadRequest(format!("Token endpoint HTTP error: {e}")))?
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Token response is not valid JSON: {e}")))?;

    // ── id_token validation ──
    let claims = validate_id_token(
        &http,
        &token.id_token,
        &login_state.jwks_uri,
        &client_id,
        &login_state.issuer,
    )
    .await?;

    if claims.get("nonce").and_then(|v| v.as_str()) != Some(login_state.nonce.as_str()) {
        return Err(ApiError::BadRequest("id_token nonce mismatch".into()));
    }

    let external_subject = claims
        .get("sub")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ApiError::BadRequest("id_token has no subject".into()))?
        .to_string();
    let email = claims
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase());
    let full_name = claims
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let groups = extract_groups(&claims, &idp.group_claim);
    let mapped_role =
        map_group_role(&idp.group_role_map, &groups).unwrap_or_else(|| idp.default_role.clone());

    // ── JIT provisioning (single tx) ──
    let mut tx = state.pool.begin().await?;

    // 1) Resolve by (idp, subject); else link an existing email; else create.
    let existing_by_subject = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE idp_id = $1 AND external_subject = $2",
    )
    .bind(idp.id)
    .bind(&external_subject)
    .fetch_optional(&mut *tx)
    .await?;

    let (user_id, user_email, provisioned) = match existing_by_subject {
        Some(id) => {
            let em = sqlx::query_scalar::<_, String>("SELECT email FROM users WHERE id = $1")
                .bind(id)
                .fetch_one(&mut *tx)
                .await?;
            (id, em, false)
        }
        None => {
            let email = email.clone().ok_or_else(|| {
                ApiError::BadRequest("id_token has no email to provision an account".into())
            })?;
            // Link an existing password/local account by email.
            let linked = sqlx::query_scalar::<_, Uuid>(
                r#"
                UPDATE users
                SET idp_id = $1, external_subject = $2, email_verified = true, updated_at = now()
                WHERE email = $3 AND deleted_at IS NULL
                RETURNING id
                "#,
            )
            .bind(idp.id)
            .bind(&external_subject)
            .bind(&email)
            .fetch_optional(&mut *tx)
            .await?;

            match linked {
                Some(id) => (id, email, true),
                None => {
                    let new_id = Uuid::new_v4();
                    let name = full_name
                        .clone()
                        .unwrap_or_else(|| email.split('@').next().unwrap_or("User").to_string());
                    sqlx::query(
                        r#"
                        INSERT INTO users (id, email, full_name, email_verified, idp_id, external_subject)
                        VALUES ($1, $2, $3, true, $4, $5)
                        "#,
                    )
                    .bind(new_id)
                    .bind(&email)
                    .bind(&name)
                    .bind(idp.id)
                    .bind(&external_subject)
                    .execute(&mut *tx)
                    .await
                    .map_err(ApiError::from_db_error)?;
                    (new_id, email, true)
                }
            }
        }
    };

    // Set the transaction-local `app.user_id` GUC to the resolved user, the
    // same way `middleware::rls_context` does for authenticated requests. This
    // path runs on the app pool with no RLS context of its own, and the
    // `organization_members` upsert below uses ON CONFLICT DO UPDATE, which
    // requires the (self) row to be admitted by the SELECT policy
    // (`user_id = current_app_user_id()`). It also makes the roles read-back
    // return the member's own rows.
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user_id.to_string())
        .execute(&mut *tx)
        .await?;

    // 2) Upsert an active membership. Under enforce_role_mapping the IdP owns
    //    the role on every login; otherwise we only (re)activate and never
    //    downgrade an existing manually-granted role.
    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (organization_id, user_id) DO UPDATE
          SET status = 'active',
              role = CASE WHEN $4 THEN EXCLUDED.role ELSE organization_members.role END
        "#,
    )
    .bind(idp.organization_id)
    .bind(user_id)
    .bind(&mapped_role)
    .bind(idp.enforce_role_mapping)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE users SET last_login_at = now(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    // 3) Audit the federated login on the same tx.
    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: idp.organization_id,
            actor_user_id: user_id,
            action: AuditAction::SsoLogin,
            resource_type: resource::IDENTITY_PROVIDER,
            resource_id: Some(idp.id),
            metadata: serde_json::json!({
                "email": user_email,
                "groups": groups,
                "role": mapped_role,
                "provisioned": provisioned,
                "external_subject": external_subject,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    // Roles claim = the member's active org roles (matches the password path).
    let roles: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT role FROM organization_members WHERE user_id = $1 AND status = 'active'",
    )
    .bind(user_id)
    .fetch_all(&mut *tx)
    .await?;
    let roles = if roles.is_empty() {
        vec!["user".to_string()]
    } else {
        roles
    };
    let profile = sqlx::query("SELECT full_name, avatar_url FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
    let full_name: Option<String> = profile.get("full_name");
    let avatar_url: Option<String> = profile.get("avatar_url");

    tx.commit().await?;

    // ── Mint the opaque app session (same cookie model as password login) ──
    let fp = session::fingerprint(
        &state.config,
        client_ip.0,
        headers
            .get(axum::http::header::USER_AGENT)
            .and_then(|v| v.to_str().ok()),
    );
    let new_session = session::create_auth_session(
        &state.pool,
        UserInfo {
            id: user_id,
            email: user_email,
            full_name,
            avatar_url,
            roles,
        },
        session::SessionMetadata {
            provider: "sso".to_string(),
            issuer: Some(login_state.issuer),
            subject: Some(external_subject),
            encrypted_token_set: None,
            mfa_verified: false,
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

    // Bounce back to the SPA. The session is available only via qd_session.
    let dest = format!("{}/sso/complete", app_origin(&state));
    Ok((jar, Redirect::to(&dest)))
}

/// Validate an OIDC id_token: fetch the JWKS, select the signing key by `kid`,
/// verify the RS256 signature, and check `iss`/`aud`/`exp`. Returns the claim
/// set as a JSON object on success.
async fn validate_id_token(
    http: &reqwest::Client,
    id_token: &str,
    jwks_uri: &str,
    client_id: &str,
    issuer: &str,
) -> Result<serde_json::Value, ApiError> {
    use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

    let header =
        decode_header(id_token).map_err(|e| ApiError::BadRequest(format!("Bad id_token: {e}")))?;

    let jwks: Jwks = http
        .get(jwks_uri)
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("JWKS fetch failed: {e}")))?
        .error_for_status()
        .map_err(|e| ApiError::BadRequest(format!("JWKS HTTP error: {e}")))?
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("JWKS is not valid JSON: {e}")))?;

    // Match on kid when the header carries one; otherwise take the first RSA key.
    let jwk = jwks
        .keys
        .iter()
        .find(|k| match (&header.kid, &k.kid) {
            (Some(h), Some(k)) => h == k,
            _ => false,
        })
        .or_else(|| jwks.keys.iter().find(|k| k.n.is_some() && k.e.is_some()))
        .ok_or_else(|| ApiError::BadRequest("No matching JWKS key for id_token".into()))?;

    let n = jwk
        .n
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("JWKS key missing modulus".into()))?;
    let e = jwk
        .e
        .as_deref()
        .ok_or_else(|| ApiError::BadRequest("JWKS key missing exponent".into()))?;

    let key = DecodingKey::from_rsa_components(n, e)
        .map_err(|e| ApiError::BadRequest(format!("Invalid JWKS RSA key: {e}")))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&[issuer]);

    let data = decode::<serde_json::Value>(id_token, &key, &validation)
        .map_err(|e| ApiError::BadRequest(format!("id_token validation failed: {e}")))?;
    Ok(data.claims)
}

/// Pull the group list from an id_token claim. Accepts a JSON array of strings
/// or a single space/comma-separated string.
fn extract_groups(claims: &serde_json::Value, group_claim: &str) -> Vec<String> {
    match claims.get(group_claim) {
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect(),
        Some(serde_json::Value::String(s)) => s
            .split([' ', ','])
            .filter(|g| !g.is_empty())
            .map(|g| g.to_string())
            .collect(),
        _ => Vec::new(),
    }
}

/// Rank an org role for "most privileged wins" selection among matched groups.
fn role_rank(role: &str) -> u8 {
    match role {
        "owner" => 4,
        "admin" => 3,
        "member" => 2,
        "viewer" => 1,
        _ => 0,
    }
}

/// Map the caller's groups to an org role via `group_role_map`. When multiple
/// groups match, the most privileged role wins. Returns `None` when no group
/// maps (caller falls back to the IdP's `default_role`).
fn map_group_role(map: &serde_json::Value, groups: &[String]) -> Option<String> {
    let obj = map.as_object()?;
    let mut best: Option<String> = None;
    for group in groups {
        if let Some(role) = obj.get(group).and_then(|v| v.as_str()) {
            if role_rank(role) > best.as_deref().map(role_rank).unwrap_or(0) {
                best = Some(role.to_string());
            }
        }
    }
    best
}

/// Minimal application/x-www-form-urlencoded-style component encoder for the
/// few values we splice into redirect URLs (tokens are hex; this guards the
/// error string and the JWT's `.`/`-`/`_` which are already URL-safe).
fn urlencode(s: &str) -> String {
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

fn session_cookie(token: String, max_age_secs: i64, secure: bool) -> Cookie<'static> {
    Cookie::build((session::SESSION_COOKIE, token))
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(time::Duration::seconds(max_age_secs))
        .build()
}
