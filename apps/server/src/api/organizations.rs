use axum::{
    extract::{Path, Query, State},
    Json,
};
use lettre::message::header::ContentType;
use lettre::transport::smtp::client::Tls;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
use crate::state::AppState;

// ── Helpers ──────────────────────────────────────────────────────────

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub domain: Option<String>,
    pub logo_url: Option<String>,
    pub settings: serde_json::Value,
    /// Data-residency region tag (E-RBAC-9), e.g. `eu`/`us`. Threaded into
    /// storage key prefixes; immutable in-app once the org owns data.
    pub data_region: String,
    /// When true, destructive tenant erasure is blocked (E-RBAC-9).
    pub legal_hold: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateOrgRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub slug: Option<String>,
    pub domain: Option<String>,
    pub logo_url: Option<String>,
    /// Data-residency region (E-RBAC-9). Chosen at creation and immutable in-app
    /// once the org owns data. Defaults to `eu` when omitted.
    pub data_region: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateOrgRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub domain: Option<String>,
    pub logo_url: Option<String>,
    pub settings: Option<serde_json::Value>,
}

/// Documented shape of `organizations.settings` (E-RBAC-8, ADR trail).
///
/// The column stays free-form JSONB — this struct is a *typed view* over the
/// keys the platform cares about, used to validate writes ([`validate_org_settings`])
/// and to surface branding anonymously ([`get_org_branding`]). Unknown keys
/// (e.g. the `defaults` block the settings UI stores) deserialize away and are
/// preserved on write because `update_organization` persists the caller's whole
/// object, not a re-serialization of this struct. Keys are camelCase to match the
/// JSON the frontend writes and the `settings->>'seatLimit'` reads in [`seat_usage`].
#[derive(Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrgSettings {
    /// Brand primary color as a CSS hex string (`#RGB` or `#RRGGBB`). Applied to
    /// participant chrome as the `--primary` token.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_color: Option<String>,
    /// Absolute http(s) or same-origin logo URL rendered on participant chrome.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<String>,
    /// Short header text shown above participant questionnaires.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participant_header: Option<String>,
    /// Default visibility for newly created projects (E-RBAC-1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_visibility: Option<String>,
    /// Seat cap (E-RBAC-4); enforced in [`seat_usage`] / [`enforce_seat_limit`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seat_limit: Option<i64>,
    /// When true, org member roles are managed by the IdP and not editable
    /// in-app (E-RBAC-6).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idp_managed_roles: Option<bool>,
}

/// True for `#RGB` / `#RRGGBB` CSS hex color strings (case-insensitive).
fn is_valid_hex_color(value: &str) -> bool {
    let Some(hex) = value.strip_prefix('#') else {
        return false;
    };
    (hex.len() == 3 || hex.len() == 6) && hex.chars().all(|c| c.is_ascii_hexdigit())
}

/// Validate the branding-relevant subset of `organizations.settings` on write.
/// Rejects malformed color formats and oversized logo URLs / header text; leaves
/// unknown keys untouched. A JSON `null` or absent settings is a no-op.
pub fn validate_org_settings(settings: &serde_json::Value) -> Result<(), ApiError> {
    if settings.is_null() {
        return Ok(());
    }
    if !settings.is_object() {
        return Err(ApiError::Validation(
            "settings must be a JSON object".into(),
        ));
    }

    let parsed: OrgSettings = serde_json::from_value(settings.clone())
        .map_err(|e| ApiError::Validation(format!("invalid settings: {e}")))?;

    if let Some(ref color) = parsed.primary_color {
        if !is_valid_hex_color(color) {
            return Err(ApiError::Validation(
                "primaryColor must be a hex color like #4f46e5".into(),
            ));
        }
    }
    if let Some(ref url) = parsed.logo_url {
        if url.len() > 2048 {
            return Err(ApiError::Validation(
                "logoUrl exceeds the 2048 character limit".into(),
            ));
        }
        let ok = url.starts_with("https://") || url.starts_with("http://") || url.starts_with('/');
        if !ok {
            return Err(ApiError::Validation(
                "logoUrl must be an absolute http(s) URL or a same-origin path".into(),
            ));
        }
    }
    if let Some(ref header) = parsed.participant_header {
        if header.chars().count() > 200 {
            return Err(ApiError::Validation(
                "participantHeader exceeds the 200 character limit".into(),
            ));
        }
    }
    Ok(())
}

/// Lightweight, anonymously-readable branding for an organization (E-RBAC-8).
/// The participant fillout chrome fetches this to theme itself. Non-sensitive
/// by construction — only presentation fields, resolved with platform fallbacks
/// on the client.
#[derive(Debug, Serialize, ToSchema)]
pub struct OrgBranding {
    pub organization_id: Uuid,
    pub name: String,
    /// Brand primary color (`settings.primaryColor`), or null for the platform default.
    pub primary_color: Option<String>,
    /// Logo URL — `settings.logoUrl` if set, else the legacy `logo_url` column.
    pub logo_url: Option<String>,
    /// Optional participant header text (`settings.participantHeader`).
    pub participant_header: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct OrgMember {
    pub user_id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub role: String,
    pub status: String,
    pub joined_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Assigned custom role (E-RBAC-3), if any — its permissions override the
    /// `role` tier's defaults for this member.
    pub custom_role_id: Option<Uuid>,
    pub custom_role_name: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct AddMemberRequest {
    #[validate(email)]
    pub email: String,
    pub role: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct ChangeMemberRoleRequest {
    pub role: String,
}

/// Body for `POST /api/organizations/:id/transfer-ownership` (E-RBAC-5).
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct TransferOwnershipRequest {
    /// The org member who becomes the new owner. Must be an active member.
    pub new_owner_user_id: Uuid,
    /// Caller's current password — required to re-confirm a sensitive action.
    pub password: String,
    /// When true (default), the outgoing owner is demoted to `admin` in the
    /// same transaction. When false, the org ends up with two owners.
    #[serde(default = "default_demote")]
    pub demote_previous_owner: bool,
}

fn default_demote() -> bool {
    true
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Invitation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub email: String,
    pub role: String,
    pub token: Uuid,
    pub status: String,
    pub invited_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub custom_message: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateInvitationRequest {
    #[validate(email)]
    pub email: String,
    pub role: String,
    pub custom_message: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct DomainRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub domain: String,
    pub verification_token: Option<String>,
    pub verification_method: Option<String>,
    pub verified_at: Option<chrono::DateTime<chrono::Utc>>,
    pub auto_join_enabled: bool,
    pub include_subdomains: bool,
    pub default_role: String,
    #[schema(value_type = Vec<String>)]
    pub email_whitelist: sqlx::types::Json<Vec<String>>,
    #[schema(value_type = Vec<String>)]
    pub email_blacklist: sqlx::types::Json<Vec<String>>,
    pub welcome_message: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateDomainRequest {
    pub domain: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateDomainRequest {
    pub auto_join_enabled: Option<bool>,
    pub include_subdomains: Option<bool>,
    pub default_role: Option<String>,
    pub welcome_message: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct AutoJoinQuery {
    pub email: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AutoJoinResponse {
    pub can_auto_join: bool,
    pub organization_id: Option<Uuid>,
    pub organization_name: Option<String>,
    pub default_role: Option<String>,
    pub welcome_message: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct InvitationOrganizationSummary {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct InvitationInviterSummary {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct InvitationDetail {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub email: String,
    pub role: String,
    pub token: Uuid,
    pub status: String,
    pub invited_by: Option<InvitationInviterSummary>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub custom_message: Option<String>,
    pub organization: InvitationOrganizationSummary,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/organizations
#[utoipa::path(
    get,
    path = "/api/organizations",
    params(ListQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Organizations available to the current user", body = [Organization])
    ),
    tags = ["organizations"]
)]
pub async fn list_organizations(
    user: AuthenticatedUser,
    tx: Tx,
    Query(q): Query<ListQuery>,
) -> Result<Json<Vec<Organization>>, ApiError> {
    let mut tx = tx.tx().await?;
    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let orgs = sqlx::query_as::<_, Organization>(
        r#"
        SELECT o.id, o.name, o.slug, o.domain, o.logo_url, o.settings,
               o.data_region, o.legal_hold, o.created_at, o.updated_at
        FROM organizations o
        JOIN organization_members om ON om.organization_id = o.id
        WHERE om.user_id = $1 AND om.status = 'active' AND o.deleted_at IS NULL
        ORDER BY o.name
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user.user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(orgs))
}

/// POST /api/organizations
#[utoipa::path(
    post,
    path = "/api/organizations",
    request_body = CreateOrgRequest,
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Organization created", body = Organization),
        (status = 409, description = "Organization slug already taken", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn create_organization(
    user: AuthenticatedUser,
    tx: Tx,
    Json(body): Json<CreateOrgRequest>,
) -> Result<(axum::http::StatusCode, Json<Organization>), ApiError> {
    let mut tx = tx.tx().await?;
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Generate slug from name if not provided
    let slug = body.slug.unwrap_or_else(|| slugify(&body.name));

    // Residency region (E-RBAC-9): validated against the supported allowlist,
    // defaulting to `eu`.
    let data_region = crate::api::gdpr::normalize_data_region(body.data_region.as_deref())?;

    // Check slug uniqueness
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1)")
            .bind(&slug)
            .fetch_one(&mut **tx)
            .await?;

    if exists {
        return Err(ApiError::Conflict("Organization slug already taken".into()));
    }

    let org_id = Uuid::new_v4();

    let org = sqlx::query_as::<_, Organization>(
        r#"
        INSERT INTO organizations (id, name, slug, domain, logo_url, data_region, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, slug, domain, logo_url, settings,
                  data_region, legal_hold, created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(&body.name)
    .bind(&slug)
    .bind(&body.domain)
    .bind(&body.logo_url)
    .bind(&data_region)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    // Add the creator as owner
    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
        VALUES ($1, $2, 'owner', 'active', NOW())
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .execute(&mut **tx)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(org)))
}

/// GET /api/organizations/:id
#[utoipa::path(
    get,
    path = "/api/organizations/{id}",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Organization details", body = Organization),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Organization not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn get_organization(
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Organization>, ApiError> {
    let mut tx = tx.tx().await?;
    // Verify membership
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden(
            "Not a member of this organization".into(),
        ));
    }

    let org = sqlx::query_as::<_, Organization>(
        r#"
        SELECT id, name, slug, domain, logo_url, settings,
               data_region, legal_hold, created_at, updated_at
        FROM organizations WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    Ok(Json(org))
}

/// GET /api/organizations/:id/branding
///
/// Anonymous, lightweight branding read (E-RBAC-8). The participant fillout
/// chrome fetches this to theme itself. `organizations` is RLS-exempt (ADR 0015),
/// so this queries the pool directly like the public by-code questionnaire read —
/// no auth, no per-request tx. Returns only presentation fields.
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/branding",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    responses(
        (status = 200, description = "Organization branding", body = OrgBranding),
        (status = 404, description = "Organization not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn get_org_branding(
    State(state): State<AppState>,
    Path(org_id): Path<Uuid>,
) -> Result<Json<OrgBranding>, ApiError> {
    let org = sqlx::query_as::<_, Organization>(
        r#"
        SELECT id, name, slug, domain, logo_url, settings,
               data_region, legal_hold, created_at, updated_at
        FROM organizations WHERE id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(org_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    // Tolerate legacy / partially-shaped settings — fall back to defaults.
    let settings: OrgSettings = serde_json::from_value(org.settings.clone()).unwrap_or_default();

    Ok(Json(OrgBranding {
        organization_id: org.id,
        name: org.name,
        primary_color: settings.primary_color,
        // Prefer the structured settings key; fall back to the legacy column.
        logo_url: settings.logo_url.or(org.logo_url),
        participant_header: settings.participant_header,
    }))
}

/// PATCH /api/organizations/:id
#[utoipa::path(
    patch,
    path = "/api/organizations/{id}",
    request_body = UpdateOrgRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Updated organization", body = Organization),
        (status = 400, description = "No fields to update", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Organization not found", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn update_organization(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<UpdateOrgRequest>,
) -> Result<Json<Organization>, ApiError> {
    let mut tx = tx.tx().await?;
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Reject malformed branding before touching the DB (E-RBAC-8).
    if let Some(ref settings) = body.settings {
        validate_org_settings(settings)?;
    }

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgWrite,
    )
    .await?;

    let mut sets: Vec<String> = Vec::new();
    let mut idx = 2u32;

    if body.name.is_some() {
        sets.push(format!("name = ${idx}"));
        idx += 1;
    }
    if body.domain.is_some() {
        sets.push(format!("domain = ${idx}"));
        idx += 1;
    }
    if body.logo_url.is_some() {
        sets.push(format!("logo_url = ${idx}"));
        idx += 1;
    }
    if body.settings.is_some() {
        sets.push(format!("settings = ${idx}"));
    }

    if sets.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }

    sets.push("updated_at = NOW()".into());

    let sql = format!(
        "UPDATE organizations SET {} WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, slug, domain, logo_url, settings, data_region, legal_hold, created_at, updated_at",
        sets.join(", ")
    );

    let mut query = sqlx::query_as::<_, Organization>(&sql).bind(org_id);

    if let Some(ref v) = body.name {
        query = query.bind(v);
    }
    if let Some(ref v) = body.domain {
        query = query.bind(v);
    }
    if let Some(ref v) = body.logo_url {
        query = query.bind(v);
    }
    if let Some(ref v) = body.settings {
        query = query.bind(v);
    }

    let org = query
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;

    let mut changed: Vec<&str> = Vec::new();
    if body.name.is_some() {
        changed.push("name");
    }
    if body.domain.is_some() {
        changed.push("domain");
    }
    if body.logo_url.is_some() {
        changed.push("logo_url");
    }
    if body.settings.is_some() {
        changed.push("settings");
    }

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgUpdated,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({ "changed_fields": changed }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(org))
}

/// DELETE /api/organizations/:id  (soft delete)
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Organization deleted", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn delete_organization(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgDelete,
    )
    .await?;

    sqlx::query("UPDATE organizations SET deleted_at = NOW() WHERE id = $1")
        .bind(org_id)
        .execute(&mut **tx)
        .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgDeleted,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({}),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Organization deleted" }),
    ))
}

// ── Seats (E-RBAC-4) ─────────────────────────────────────────────────

/// Seat usage for an organization. `limit` is null when no `seatLimit` is set
/// in `organizations.settings` (unlimited). A "seat" is an active member or a
/// pending invitation (an outstanding invitation reserves a prospective seat).
#[derive(Debug, Serialize, ToSchema)]
pub struct SeatUsageResponse {
    /// Configured seat limit (`settings->>'seatLimit'`), or null when unlimited.
    pub limit: Option<i64>,
    /// Seats currently consumed (`active_members + pending_invitations`).
    pub used: i64,
    pub active_members: i64,
    pub pending_invitations: i64,
}

/// Read `(seat_limit, active_members, pending_invitations)` for an org in one
/// round-trip. Shared by the seats endpoint and the seat-limit enforcement in
/// `add_member` / `create_invitation`.
pub async fn seat_usage(
    conn: &mut sqlx::PgConnection,
    org_id: Uuid,
) -> Result<(Option<i64>, i64, i64), ApiError> {
    let row = sqlx::query_as::<_, (Option<i64>, i64, i64)>(
        r#"
        SELECT
            (o.settings->>'seatLimit')::bigint AS seat_limit,
            (SELECT COUNT(*) FROM organization_members m
               WHERE m.organization_id = o.id AND m.status = 'active') AS active_members,
            (SELECT COUNT(*) FROM organization_invitations i
               WHERE i.organization_id = o.id
                 AND i.accepted_at IS NULL
                 AND i.expires_at > NOW()) AS pending_invitations
        FROM organizations o
        WHERE o.id = $1
        "#,
    )
    .bind(org_id)
    .fetch_optional(conn)
    .await?
    .ok_or_else(|| ApiError::NotFound("Organization not found".into()))?;
    Ok(row)
}

/// Deny when adding one more seat would exceed the configured `seatLimit`.
/// No-op when no limit is set.
async fn enforce_seat_limit(conn: &mut sqlx::PgConnection, org_id: Uuid) -> Result<(), ApiError> {
    let (limit, active, pending) = seat_usage(conn, org_id).await?;
    if let Some(limit) = limit {
        let used = active + pending;
        if used >= limit {
            return Err(ApiError::SeatLimitReached(format!(
                "Organization seat limit reached ({used} of {limit} seats used)"
            )));
        }
    }
    Ok(())
}

/// GET /api/organizations/:id/seats
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/seats",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Seat usage", body = SeatUsageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Organization not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn get_seats(
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<SeatUsageResponse>, ApiError> {
    let mut tx = tx.tx().await?;

    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden("Not a member".into()));
    }

    let (limit, active_members, pending_invitations) = seat_usage(&mut tx, org_id).await?;

    Ok(Json(SeatUsageResponse {
        limit,
        used: active_members + pending_invitations,
        active_members,
        pending_invitations,
    }))
}

// ── Members ──────────────────────────────────────────────────────────

/// GET /api/organizations/:id/members
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/members",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Organization members", body = [OrgMember]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn list_members(
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<OrgMember>>, ApiError> {
    let mut tx = tx.tx().await?;
    // Verify membership
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden("Not a member".into()));
    }

    let members = sqlx::query_as::<_, OrgMember>(
        r#"
        SELECT u.id AS user_id, u.email, u.full_name, om.role, om.status, om.joined_at,
               om.custom_role_id, r.name AS custom_role_name
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        LEFT JOIN org_roles r ON r.id = om.custom_role_id
        WHERE om.organization_id = $1
        ORDER BY om.joined_at
        "#,
    )
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(members))
}

/// POST /api/organizations/:id/members
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/members",
    request_body = AddMemberRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Member added", body = crate::openapi::MessageResponse),
        (status = 400, description = "Invalid member request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "User not found", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn add_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<AddMemberRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    let mut tx = tx.tx().await?;
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Validate role value
    if !matches!(body.role.as_str(), "owner" | "admin" | "member" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, member, viewer".into(),
        ));
    }

    // Only owners can assign the owner role
    if body.role == "owner"
        && !state
            .rbac
            .has_org_role(
                &mut **tx,
                user.user_id,
                org_id,
                &crate::rbac::models::OrgRole::Owner,
            )
            .await?
    {
        return Err(ApiError::Forbidden(
            "Only owners can assign the owner role".into(),
        ));
    }

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgManageMembers,
    )
    .await?;

    let target_user = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
    )
    .bind(&body.email)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    // Seat model (E-RBAC-4): a re-add / role change of an already-active member
    // consumes no new seat; only a genuinely new active seat is gated.
    let already_active = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(target_user)
    .fetch_one(&mut **tx)
    .await?;

    if !already_active {
        enforce_seat_limit(&mut tx, org_id).await?;
    }

    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
        VALUES ($1, $2, $3, 'active', NOW())
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3, status = 'active'
        "#,
    )
    .bind(org_id)
    .bind(target_user)
    .bind(&body.role)
    .execute(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::MemberAdded,
            resource_type: resource::ORG_MEMBER,
            resource_id: Some(target_user),
            metadata: serde_json::json!({
                "target_user_id": target_user,
                "email": body.email,
                "role": body.role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "message": "Member added" })),
    ))
}

/// DELETE /api/organizations/:id/members/:user_id
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/members/{user_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("user_id" = Uuid, Path, description = "User id to remove")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Member removed", body = crate::openapi::MessageResponse),
        (status = 400, description = "Cannot remove the last owner", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn remove_member(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, target_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgManageMembers,
    )
    .await?;

    // Capture the target's current role (for both the last-owner guard and
    // the audit trail).
    let target_role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org_id)
    .bind(target_id)
    .fetch_optional(&mut **tx)
    .await?;

    // Prevent removing the last owner
    if target_id != user.user_id && target_role.as_deref() == Some("owner") {
        let owner_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
        )
        .bind(org_id)
        .fetch_one(&mut **tx)
        .await?;

        if owner_count <= 1 {
            return Err(ApiError::BadRequest("Cannot remove the last owner".into()));
        }
    }

    sqlx::query("DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2")
        .bind(org_id)
        .bind(target_id)
        .execute(&mut **tx)
        .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::MemberRemoved,
            resource_type: resource::ORG_MEMBER,
            resource_id: Some(target_id),
            metadata: serde_json::json!({
                "target_user_id": target_id,
                "role": target_role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Member removed" })))
}

/// PUT /api/organizations/:id/members/:user_id/role
#[utoipa::path(
    put,
    path = "/api/organizations/{id}/members/{user_id}/role",
    request_body = ChangeMemberRoleRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("user_id" = Uuid, Path, description = "User id whose role is changing")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Member role updated", body = crate::openapi::MessageResponse),
        (status = 400, description = "Invalid role or last-owner guard tripped", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Member not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn change_member_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, target_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ChangeMemberRoleRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    // Validate the requested role value.
    if !matches!(body.role.as_str(), "owner" | "admin" | "member" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, member, viewer".into(),
        ));
    }

    // Caller must be at least an admin of this org.
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgManageMembers,
    )
    .await?;

    // Look up the target member's current role (must be an active member).
    let current_role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(org_id)
    .bind(target_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Member not found".into()))?;

    // IdP-managed roles (E-RBAC-6 step 8): if the target was federated by an
    // enabled IdP that enforces role mapping, their org role is owned by the
    // IdP's group→role mapping on each login and must not be mutated by hand
    // (this also blocks an SSO-provisioned admin from self-changing their own
    // role). The manual path is refused for everyone under this posture.
    let idp_managed = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM users u
            JOIN org_identity_providers idp ON idp.id = u.idp_id
            WHERE u.id = $1
              AND idp.organization_id = $2
              AND idp.enforce_role_mapping = true
              AND idp.enabled = true
        )
        "#,
    )
    .bind(target_id)
    .bind(org_id)
    .fetch_one(&mut **tx)
    .await?;

    if idp_managed {
        return Err(ApiError::Forbidden(
            "This member's role is managed by SSO (IdP group mapping) and cannot be changed manually".into(),
        ));
    }

    // Only an owner may grant or revoke the owner role.
    let touches_owner = body.role == "owner" || current_role == "owner";
    if touches_owner
        && !state
            .rbac
            .has_org_role(
                &mut **tx,
                user.user_id,
                org_id,
                &crate::rbac::models::OrgRole::Owner,
            )
            .await?
    {
        return Err(ApiError::Forbidden(
            "Only an owner can grant or revoke the owner role".into(),
        ));
    }

    // Prevent demoting the last remaining owner.
    if current_role == "owner" && body.role != "owner" {
        let owner_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
        )
        .bind(org_id)
        .fetch_one(&mut **tx)
        .await?;

        if owner_count <= 1 {
            return Err(ApiError::BadRequest(
                "Cannot demote the last remaining owner".into(),
            ));
        }
    }

    // No-op fast path: role unchanged.
    if current_role == body.role {
        return Ok(Json(
            serde_json::json!({ "message": "Member role updated" }),
        ));
    }

    sqlx::query(
        "UPDATE organization_members SET role = $3 WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(org_id)
    .bind(target_id)
    .bind(&body.role)
    .execute(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::MemberRoleChanged,
            resource_type: resource::ORG_MEMBER,
            resource_id: Some(target_id),
            metadata: serde_json::json!({
                "target_user_id": target_id,
                "before": current_role,
                "after": body.role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Member role updated" }),
    ))
}

/// Guarded, atomic org-ownership mutation used by [`transfer_org_ownership`].
///
/// Extracted from the handler so it can be exercised at the SQL level
/// (`tests/ownership_transfer.rs`) without standing up the full `AppState`.
/// Runs entirely on the caller's connection/transaction so every check and
/// write commits or rolls back as a unit:
///   1. the new owner must be an active member (rejects transfer to a
///      non-member — the last-owner-safe sanctioned path),
///   2. promote the new owner to `owner`,
///   3. optionally demote the outgoing owner to `admin`,
///   4. re-count owners and refuse to commit if the org would be left
///      without one.
pub async fn transfer_org_ownership_tx(
    conn: &mut sqlx::PgConnection,
    org_id: Uuid,
    from_user_id: Uuid,
    new_owner_user_id: Uuid,
    demote_previous_owner: bool,
) -> Result<(), ApiError> {
    // (1) The new owner must be an active member of this org.
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(new_owner_user_id)
    .fetch_one(&mut *conn)
    .await?;

    if !is_member {
        return Err(ApiError::BadRequest(
            "New owner must be an active member of the organization".into(),
        ));
    }

    // (2) Promote the new owner.
    sqlx::query(
        "UPDATE organization_members SET role = 'owner' WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(org_id)
    .bind(new_owner_user_id)
    .execute(&mut *conn)
    .await?;

    // (3) Optionally demote the outgoing owner. Skipped when transferring to
    //     oneself (a no-op that must not strip the sole owner of the role).
    if demote_previous_owner && from_user_id != new_owner_user_id {
        sqlx::query(
            "UPDATE organization_members SET role = 'admin' WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
        )
        .bind(org_id)
        .bind(from_user_id)
        .execute(&mut *conn)
        .await?;
    }

    // (4) Never leave the org without an owner.
    let owner_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
    )
    .bind(org_id)
    .fetch_one(&mut *conn)
    .await?;

    if owner_count < 1 {
        return Err(ApiError::BadRequest(
            "Ownership transfer would leave the organization without an owner".into(),
        ));
    }

    Ok(())
}

/// POST /api/organizations/:id/transfer-ownership (E-RBAC-5)
///
/// The sanctioned, audited path to hand an organization to another member.
/// Unlike `change_member_role` — which refuses to demote the last owner —
/// this promotes the new owner *and* (by default) demotes the caller in one
/// transaction, so the org is never left ownerless. The caller must be a
/// current owner and re-confirm their password.
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/transfer-ownership",
    request_body = TransferOwnershipRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Ownership transferred", body = crate::openapi::MessageResponse),
        (status = 400, description = "Target is not a member / would leave no owner", body = crate::openapi::ErrorEnvelope),
        (status = 401, description = "Password re-confirmation failed", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Caller is not an owner", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn transfer_org_ownership(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<TransferOwnershipRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    // Caller must be a current owner of this org.
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Owner,
        )
        .await?
    {
        return Err(ApiError::Forbidden(
            "Only a current owner can transfer ownership".into(),
        ));
    }

    // Re-confirm the caller's password for this sensitive action.
    let hash = sqlx::query_scalar::<_, Option<String>>(
        "SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .flatten()
    .ok_or_else(|| ApiError::Unauthorized("Password confirmation required".into()))?;

    if !crate::auth::password::verify_password(&body.password, &hash)? {
        return Err(ApiError::Unauthorized("Incorrect password".into()));
    }

    let previous_role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or_else(|| "owner".into());

    transfer_org_ownership_tx(
        &mut tx,
        org_id,
        user.user_id,
        body.new_owner_user_id,
        body.demote_previous_owner,
    )
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::OrgOwnershipTransferred,
            resource_type: resource::ORGANIZATION,
            resource_id: Some(org_id),
            metadata: serde_json::json!({
                "transferred_from": user.user_id,
                "transferred_to": body.new_owner_user_id,
                "transferred_at": chrono::Utc::now().to_rfc3339(),
                "previous_owner_demoted": body.demote_previous_owner
                    && user.user_id != body.new_owner_user_id,
                "previous_owner_new_role": if body.demote_previous_owner
                    && user.user_id != body.new_owner_user_id
                {
                    "admin"
                } else {
                    previous_role.as_str()
                },
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Ownership transferred" }),
    ))
}

// ── Invitations ──────────────────────────────────────────────────────

/// GET /api/organizations/:id/invitations
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/invitations",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Pending organization invitations", body = [Invitation]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn list_invitations(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<Invitation>>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgManageMembers,
    )
    .await?;

    let invitations = sqlx::query_as::<_, Invitation>(
        r#"
        SELECT id, organization_id, email, role, token, status, invited_by, created_at, expires_at, accepted_at, custom_message
        FROM organization_invitations
        WHERE organization_id = $1 AND accepted_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC
        "#,
    )
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(invitations))
}

/// POST /api/organizations/:id/invitations
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/invitations",
    request_body = CreateInvitationRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Invitation created", body = Invitation),
        (status = 400, description = "Invalid invitation request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn create_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateInvitationRequest>,
) -> Result<(axum::http::StatusCode, Json<Invitation>), ApiError> {
    let mut tx = tx.tx().await?;
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Validate role value
    if !matches!(body.role.as_str(), "owner" | "admin" | "member" | "viewer") {
        return Err(ApiError::BadRequest(
            "Invalid role. Must be one of: owner, admin, member, viewer".into(),
        ));
    }

    // Only owners can assign the owner role.
    //
    // `OrgManageMembers` maps to the **Admin** tier (`min_org_role_for`), and
    // `accept_invitation` applies the invitation's role verbatim — so without
    // this guard an org admin could mint an owner by invitation, escalating
    // past the tier the direct paths enforce. Mirrors the identical guard in
    // `add_member` and `change_member_role`; the invitation row is the only
    // place the role is ever set (no update/resend path re-writes it), so
    // guarding creation closes the escalation.
    if body.role == "owner"
        && !state
            .rbac
            .has_org_role(
                &mut **tx,
                user.user_id,
                org_id,
                &crate::rbac::models::OrgRole::Owner,
            )
            .await?
    {
        return Err(ApiError::Forbidden(
            "Only owners can assign the owner role".into(),
        ));
    }

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgManageMembers,
    )
    .await?;

    // Seat model (E-RBAC-4): a pending invitation reserves a prospective seat.
    enforce_seat_limit(&mut tx, org_id).await?;

    let expires_at = chrono::Utc::now() + chrono::Duration::days(7);

    let invitation = sqlx::query_as::<_, Invitation>(
        r#"
        INSERT INTO organization_invitations (organization_id, email, role, invited_by, expires_at, custom_message)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, organization_id, email, role, token, status, invited_by, created_at, expires_at, accepted_at, custom_message
        "#,
    )
    .bind(org_id)
    .bind(&body.email)
    .bind(&body.role)
    .bind(user.user_id)
    .bind(expires_at)
    .bind(&body.custom_message)
    .fetch_one(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::InvitationCreated,
            resource_type: resource::INVITATION,
            resource_id: Some(invitation.id),
            metadata: serde_json::json!({
                "email": body.email,
                "role": body.role,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    // Send invitation email
    let org_name = sqlx::query_scalar::<_, String>("SELECT name FROM organizations WHERE id = $1")
        .bind(org_id)
        .fetch_optional(&mut **tx)
        .await?
        .unwrap_or_else(|| "your organization".to_string());

    let invite_link = format!("{}/invite/{}", state.config.app_origin(), invitation.token);

    let mut email_body = format!(
        "Hello,\n\n\
         You've been invited to join \"{}\" on QDesigner as a {}.\n\n",
        org_name, body.role
    );

    if let Some(ref msg) = body.custom_message {
        email_body.push_str(&format!("Message from the inviter:\n{}\n\n", msg));
    }

    email_body.push_str(&format!(
        "Click the link below to accept the invitation:\n{}\n\n\
         This invitation expires in 7 days.\n\n\
         - QDesigner Team",
        invite_link
    ));

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
        .subject(format!(
            "You've been invited to join {} on QDesigner",
            org_name
        ))
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
            Ok(_) => tracing::info!("Invitation email sent to {}", recipient_email),
            Err(e) => tracing::error!("Failed to send invitation email: {e}"),
        }
    })
    .await
    .ok();

    Ok((axum::http::StatusCode::CREATED, Json(invitation)))
}

// ── Invitation accept / decline / revoke ─────────────────────────────

/// Model returned for pending-invitation list (includes org context).
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct PendingInvitation {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub email: String,
    pub role: String,
    pub token: Uuid,
    pub status: String,
    pub invited_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub custom_message: Option<String>,
}

/// GET /api/invitations/pending
/// Returns all pending invitations addressed to the authenticated user's email.
#[utoipa::path(
    get,
    path = "/api/invitations/pending",
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Pending invitations for the current user", body = [PendingInvitation]),
        (status = 404, description = "User not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn list_pending_invitations(
    user: AuthenticatedUser,
    tx: Tx,
) -> Result<Json<Vec<PendingInvitation>>, ApiError> {
    let mut tx = tx.tx().await?;
    // Look up the user's email
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let invitations = sqlx::query_as::<_, PendingInvitation>(
        r#"
        SELECT i.id, i.organization_id, o.name AS organization_name,
               i.email, i.role, i.token, i.status, i.invited_by, i.created_at, i.expires_at, i.custom_message
        FROM organization_invitations i
        JOIN organizations o ON o.id = i.organization_id AND o.deleted_at IS NULL
        WHERE i.email = $1 AND i.status = 'pending' AND i.expires_at > NOW()
        ORDER BY i.created_at DESC
        "#,
    )
    .bind(&email)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(invitations))
}

#[derive(Debug, sqlx::FromRow)]
struct InvitationLookupRow {
    id: Uuid,
    organization_id: Uuid,
    email: String,
    role: String,
    token: Uuid,
    status: String,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
    accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    custom_message: Option<String>,
    organization_name: String,
    organization_slug: String,
    invited_by_id: Option<Uuid>,
    invited_by_email: Option<String>,
    invited_by_full_name: Option<String>,
}

/// GET /api/invitations/:id
#[utoipa::path(
    get,
    path = "/api/invitations/{id}",
    params(
        ("id" = Uuid, Path, description = "Invitation token")
    ),
    responses(
        (status = 200, description = "Invitation detail", body = InvitationDetail),
        (status = 404, description = "Invitation not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn get_invitation(
    State(state): State<AppState>,
    Path(invitation_token): Path<Uuid>,
) -> Result<Json<InvitationDetail>, ApiError> {
    let row = sqlx::query_as::<_, InvitationLookupRow>(
        r#"
        SELECT
            i.id,
            i.organization_id,
            i.email,
            i.role,
            i.token,
            CASE
                WHEN i.status = 'pending' AND i.expires_at <= NOW() THEN 'expired'
                ELSE i.status
            END AS status,
            i.created_at,
            i.expires_at,
            i.accepted_at,
            i.custom_message,
            o.name AS organization_name,
            o.slug AS organization_slug,
            u.id AS invited_by_id,
            u.email AS invited_by_email,
            u.full_name AS invited_by_full_name
        FROM organization_invitations i
        JOIN organizations o ON o.id = i.organization_id AND o.deleted_at IS NULL
        LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.token = $1
        "#,
    )
    .bind(invitation_token)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invitation not found".into()))?;

    Ok(Json(InvitationDetail {
        id: row.id,
        organization_id: row.organization_id,
        email: row.email,
        role: row.role,
        token: row.token,
        status: row.status,
        invited_by: row.invited_by_id.map(|id| InvitationInviterSummary {
            id,
            email: row.invited_by_email.unwrap_or_default(),
            full_name: row.invited_by_full_name,
        }),
        created_at: row.created_at,
        expires_at: row.expires_at,
        accepted_at: row.accepted_at,
        custom_message: row.custom_message,
        organization: InvitationOrganizationSummary {
            id: row.organization_id,
            name: row.organization_name,
            slug: row.organization_slug,
        },
    }))
}

/// POST /api/invitations/:id/accept
#[utoipa::path(
    post,
    path = "/api/invitations/{id}/accept",
    params(
        ("id" = Uuid, Path, description = "Invitation id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Invitation accepted", body = crate::openapi::MessageResponse),
        (status = 404, description = "Invitation not found or expired", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn accept_invitation(
    user: AuthenticatedUser,
    tx: Tx,
    Path(invitation_token): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    // Look up the user's email
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    // Fetch the invitation — must be pending, not expired, and addressed to this user
    let row = sqlx::query_as::<_, (Uuid, String)>(
        r#"
        SELECT organization_id, role
        FROM organization_invitations
        WHERE token = $1 AND email = $2 AND status = 'pending' AND expires_at > NOW()
        "#,
    )
    .bind(invitation_token)
    .bind(&email)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invitation not found or expired".into()))?;

    let (org_id, role) = row;

    // Mark invitation as accepted
    sqlx::query(
        "UPDATE organization_invitations SET status = 'accepted', accepted_at = NOW() WHERE token = $1",
    )
    .bind(invitation_token)
    .execute(&mut **tx)
    .await?;

    // Add user as org member (upsert in case they were previously removed)
    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
        VALUES ($1, $2, $3, 'active', NOW())
        ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $3, status = 'active', joined_at = NOW()
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .bind(&role)
    .execute(&mut **tx)
    .await?;

    Ok(Json(
        serde_json::json!({ "message": "Invitation accepted" }),
    ))
}

/// POST /api/invitations/:id/decline
#[utoipa::path(
    post,
    path = "/api/invitations/{id}/decline",
    params(
        ("id" = Uuid, Path, description = "Invitation id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Invitation declined", body = crate::openapi::MessageResponse),
        (status = 404, description = "Invitation not found or already processed", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn decline_invitation(
    user: AuthenticatedUser,
    tx: Tx,
    Path(invitation_token): Path<Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    let email = sqlx::query_scalar::<_, String>(
        "SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(user.user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    let rows_affected = sqlx::query(
        r#"
        UPDATE organization_invitations
        SET status = 'declined', declined_at = NOW()
        WHERE token = $1 AND email = $2 AND status = 'pending'
        "#,
    )
    .bind(invitation_token)
    .bind(&email)
    .execute(&mut **tx)
    .await?
    .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound(
            "Invitation not found or already processed".into(),
        ));
    }

    Ok(Json(
        serde_json::json!({ "message": "Invitation declined" }),
    ))
}

/// DELETE /api/organizations/:id/invitations/:inv_id  (revoke)
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/invitations/{inv_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("inv_id" = Uuid, Path, description = "Invitation id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Invitation revoked", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Invitation not found or already processed", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn revoke_invitation(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Organization(org_id),
        Permission::OrgManageMembers,
    )
    .await?;

    let revoked_email = sqlx::query_scalar::<_, String>(
        r#"
        UPDATE organization_invitations
        SET status = 'revoked'
        WHERE id = $1 AND organization_id = $2 AND status = 'pending'
        RETURNING email
        "#,
    )
    .bind(invitation_id)
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?;

    let Some(email) = revoked_email else {
        return Err(ApiError::NotFound(
            "Invitation not found or already processed".into(),
        ));
    };

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::InvitationRevoked,
            resource_type: resource::INVITATION,
            resource_id: Some(invitation_id),
            metadata: serde_json::json!({ "email": email }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Invitation revoked" })))
}

// ── Domains ──────────────────────────────────────────────────────────

/// GET /api/organizations/:id/domains
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/domains",
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Verified and pending organization domains", body = [DomainRecord]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn list_domains(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<DomainRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let domains = sqlx::query_as::<_, DomainRecord>(
        r#"
        SELECT id, organization_id, domain, verification_token, verification_method,
               verified_at, auto_join_enabled, include_subdomains, default_role,
               email_whitelist, email_blacklist, welcome_message, created_at
        FROM organization_domains
        WHERE organization_id = $1
        ORDER BY created_at
        "#,
    )
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(domains))
}

/// POST /api/organizations/:id/domains
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/domains",
    request_body = CreateDomainRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Domain created", body = DomainRecord),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn create_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateDomainRequest>,
) -> Result<(axum::http::StatusCode, Json<DomainRecord>), ApiError> {
    let mut tx = tx.tx().await?;
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let verification_token = Uuid::new_v4().to_string();

    let record = sqlx::query_as::<_, DomainRecord>(
        r#"
        INSERT INTO organization_domains (organization_id, domain, verification_token, verification_method)
        VALUES ($1, $2, $3, 'dns_txt')
        RETURNING id, organization_id, domain, verification_token, verification_method,
                  verified_at, auto_join_enabled, include_subdomains, default_role,
                  email_whitelist, email_blacklist, welcome_message, created_at
        "#,
    )
    .bind(org_id)
    .bind(&body.domain)
    .bind(&verification_token)
    .fetch_one(&mut **tx)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(record)))
}

/// POST /api/organizations/:id/domains/:did/verify
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/domains/{did}/verify",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("did" = Uuid, Path, description = "Domain id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Domain verified", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Domain not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn verify_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, domain_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Phase 1 (inside the RLS tx): authorize and read the per-domain challenge
    // token. The guard is dropped at the end of this block so the pooled DB
    // connection is not held under the mutex across the DNS network I/O below.
    let (domain, token) = {
        let mut tx = tx.tx().await?;
        if !state
            .rbac
            .has_org_role(
                &mut **tx,
                user.user_id,
                org_id,
                &crate::rbac::models::OrgRole::Admin,
            )
            .await?
        {
            return Err(ApiError::Forbidden("Requires admin role".into()));
        }

        let row = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT domain, verification_token FROM organization_domains \
             WHERE id = $1 AND organization_id = $2",
        )
        .bind(domain_id)
        .bind(org_id)
        .fetch_optional(&mut **tx)
        .await?;

        match row {
            Some(row) => row,
            None => return Err(ApiError::NotFound("Domain not found".into())),
        }
    };

    let token = token.ok_or_else(|| {
        ApiError::Conflict("Domain has no verification token; recreate the domain".into())
    })?;

    // Phase 2 (outside the tx guard): prove ownership via a DNS TXT record at
    // `_qdesigner-verify.<domain>` whose value matches the per-domain token.
    // No unconditional auto-verify — `verify_domain_ownership` returns false
    // unless a live TXT lookup (feature `dns-verify`) confirms the record.
    if !verify_domain_ownership(&domain, &token).await? {
        return Err(ApiError::Validation(format!(
            "Domain ownership not verified. Create a DNS TXT record at \
             _qdesigner-verify.{domain} with the value \"{token}\", then retry."
        )));
    }

    // Phase 3 (re-enter the tx): record the successful verification and
    // append the audit event on the same transaction.
    {
        let mut tx = tx.tx().await?;
        let rows_affected = sqlx::query(
            "UPDATE organization_domains SET verified_at = NOW(), last_verified_at = NOW() \
             WHERE id = $1 AND organization_id = $2",
        )
        .bind(domain_id)
        .bind(org_id)
        .execute(&mut **tx)
        .await?
        .rows_affected();

        if rows_affected == 0 {
            return Err(ApiError::NotFound("Domain not found".into()));
        }

        audit::record(
            &mut tx,
            AuditEvent {
                organization_id: org_id,
                actor_user_id: user.user_id,
                action: AuditAction::DomainVerified,
                resource_type: resource::DOMAIN,
                resource_id: Some(domain_id),
                metadata: serde_json::json!({ "domain": domain }),
                ip: client_ip.0,
            },
        )
        .await?;
    }

    Ok(Json(serde_json::json!({
        "verified": true,
        "message": "Domain verified"
    })))
}

/// Prove domain ownership by resolving a DNS TXT record at
/// `_qdesigner-verify.<domain>` and matching it against the per-domain
/// verification token. Enabled by the `dns-verify` cargo feature.
#[cfg(feature = "dns-verify")]
async fn verify_domain_ownership(domain: &str, token: &str) -> Result<bool, ApiError> {
    use hickory_resolver::config::{ResolverConfig, ResolverOpts};
    use hickory_resolver::TokioAsyncResolver;

    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());
    let fqdn = format!("_qdesigner-verify.{domain}");

    let lookup = match resolver.txt_lookup(fqdn).await {
        Ok(lookup) => lookup,
        // NXDOMAIN / no records / transient failure — treat as "not yet
        // verified" rather than a hard error so the caller can retry.
        Err(err) => {
            tracing::debug!("TXT lookup for {domain} ownership failed: {err}");
            return Ok(false);
        }
    };

    let expected = token.as_bytes();
    let matched = lookup
        .iter()
        .any(|txt| txt.iter().any(|data| **data == *expected));
    Ok(matched)
}

/// Default build: the DNS resolver is compiled out, so ownership can never be
/// auto-proven. Returns false and the caller responds with a 422 telling the
/// operator which TXT record to publish (and to enable `dns-verify`).
#[cfg(not(feature = "dns-verify"))]
async fn verify_domain_ownership(_domain: &str, _token: &str) -> Result<bool, ApiError> {
    Ok(false)
}

/// PATCH /api/organizations/:id/domains/:did
#[utoipa::path(
    patch,
    path = "/api/organizations/{id}/domains/{did}",
    request_body = UpdateDomainRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("did" = Uuid, Path, description = "Domain id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Updated domain", body = DomainRecord),
        (status = 400, description = "No fields to update", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Domain not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn update_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path((org_id, domain_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateDomainRequest>,
) -> Result<Json<DomainRecord>, ApiError> {
    let mut tx = tx.tx().await?;
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let mut sets: Vec<String> = Vec::new();
    let mut idx = 3u32;

    if body.auto_join_enabled.is_some() {
        sets.push(format!("auto_join_enabled = ${idx}"));
        idx += 1;
    }
    if body.include_subdomains.is_some() {
        sets.push(format!("include_subdomains = ${idx}"));
        idx += 1;
    }
    if body.default_role.is_some() {
        sets.push(format!("default_role = ${idx}"));
        idx += 1;
    }
    if body.welcome_message.is_some() {
        sets.push(format!("welcome_message = ${idx}"));
        let _ = idx; // suppress unused warning
    }

    if sets.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }

    let sql = format!(
        "UPDATE organization_domains SET {} WHERE id = $1 AND organization_id = $2 \
         RETURNING id, organization_id, domain, verification_token, verification_method, \
         verified_at, auto_join_enabled, include_subdomains, default_role, \
         email_whitelist, email_blacklist, welcome_message, created_at",
        sets.join(", ")
    );

    let mut query = sqlx::query_as::<_, DomainRecord>(&sql)
        .bind(domain_id)
        .bind(org_id);

    if let Some(v) = body.auto_join_enabled {
        query = query.bind(v);
    }
    if let Some(v) = body.include_subdomains {
        query = query.bind(v);
    }
    if let Some(ref v) = body.default_role {
        query = query.bind(v);
    }
    if let Some(ref v) = body.welcome_message {
        query = query.bind(v);
    }

    let record = query
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Domain not found".into()))?;

    Ok(Json(record))
}

/// DELETE /api/organizations/:id/domains/:did
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/domains/{did}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("did" = Uuid, Path, description = "Domain id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Domain deleted", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Domain not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn delete_domain(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path((org_id, domain_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let rows_affected =
        sqlx::query("DELETE FROM organization_domains WHERE id = $1 AND organization_id = $2")
            .bind(domain_id)
            .bind(org_id)
            .execute(&mut **tx)
            .await?
            .rows_affected();

    if rows_affected == 0 {
        return Err(ApiError::NotFound("Domain not found".into()));
    }

    Ok(Json(serde_json::json!({ "message": "Domain deleted" })))
}

/// GET /api/domains/auto-join?email=user@example.com
#[utoipa::path(
    get,
    path = "/api/domains/auto-join",
    params(AutoJoinQuery),
    responses(
        (status = 200, description = "Auto-join resolution for an email address", body = AutoJoinResponse),
        (status = 400, description = "Invalid email format", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn check_auto_join(
    State(state): State<AppState>,
    Query(q): Query<AutoJoinQuery>,
) -> Result<Json<AutoJoinResponse>, ApiError> {
    let email_domain = q
        .email
        .rsplit_once('@')
        .map(|(_, d)| d.to_lowercase())
        .ok_or_else(|| ApiError::BadRequest("Invalid email format".into()))?;

    #[derive(sqlx::FromRow)]
    struct AutoJoinRow {
        organization_id: Uuid,
        organization_name: String,
        default_role: String,
        welcome_message: Option<String>,
    }

    let row = sqlx::query_as::<_, AutoJoinRow>(
        r#"
        SELECT od.organization_id, o.name AS organization_name,
               od.default_role, od.welcome_message
        FROM organization_domains od
        JOIN organizations o ON o.id = od.organization_id
        WHERE od.domain = $1
          AND od.verified_at IS NOT NULL
          AND od.auto_join_enabled = true
          AND o.deleted_at IS NULL
        LIMIT 1
        "#,
    )
    .bind(&email_domain)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => Ok(Json(AutoJoinResponse {
            can_auto_join: true,
            organization_id: Some(r.organization_id),
            organization_name: Some(r.organization_name),
            default_role: Some(r.default_role),
            welcome_message: r.welcome_message,
        })),
        None => Ok(Json(AutoJoinResponse {
            can_auto_join: false,
            organization_id: None,
            organization_name: None,
            default_role: None,
            welcome_message: None,
        })),
    }
}

// ── Audit log (E-RBAC-2) ─────────────────────────────────────────────

/// One row of the org audit timeline, joined with the actor's identity.
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct AuditEventRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub actor_user_id: Option<Uuid>,
    pub actor_email: Option<String>,
    pub actor_full_name: Option<String>,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<Uuid>,
    pub metadata: serde_json::Value,
    /// Actor IP as a plain host string (no netmask), or null.
    pub ip: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Paginated audit-timeline page. `next_cursor` is present only when more
/// rows may exist (the page came back full); pass it back as `cursor`.
#[derive(Debug, Serialize, ToSchema)]
pub struct AuditListResponse {
    pub events: Vec<AuditEventRecord>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct AuditListQuery {
    /// Exact `action` string filter (e.g. `member.role_changed`).
    pub action: Option<String>,
    /// Filter to a single actor user id.
    pub actor: Option<Uuid>,
    /// Inclusive lower bound on `created_at` (RFC 3339).
    pub from: Option<chrono::DateTime<chrono::Utc>>,
    /// Inclusive upper bound on `created_at` (RFC 3339).
    pub to: Option<chrono::DateTime<chrono::Utc>>,
    /// Opaque keyset cursor from a prior page's `next_cursor`.
    pub cursor: Option<String>,
    /// Page size (1..=200, default 50).
    pub limit: Option<i64>,
}

/// GET /api/organizations/:id/audit
///
/// Reverse-chronological, keyset-paginated audit timeline for one
/// organization. Org admin/owner gated (defense-in-depth: the
/// `audit_events_select` RLS policy also admits only active admins/owners).
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/audit",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        AuditListQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Audit timeline page", body = AuditListResponse),
        (status = 400, description = "Invalid cursor", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["organizations"]
)]
pub async fn list_audit_events(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Query(q): Query<AuditListQuery>,
) -> Result<Json<AuditListResponse>, ApiError> {
    let mut tx = tx.tx().await?;

    if !state
        .rbac
        .has_org_role(
            &mut **tx,
            user.user_id,
            org_id,
            &crate::rbac::models::OrgRole::Admin,
        )
        .await?
    {
        return Err(ApiError::Forbidden("Requires admin role".into()));
    }

    let limit = q.limit.unwrap_or(50).clamp(1, 200);

    // Keyset cursor: "<rfc3339 created_at>|<uuid id>". The id tie-breaks
    // rows sharing a created_at so pages never skip or duplicate.
    let (cursor_ts, cursor_id) = match q.cursor.as_deref() {
        Some(c) => {
            let (ts_str, id_str) = c
                .split_once('|')
                .ok_or_else(|| ApiError::BadRequest("Invalid cursor".into()))?;
            let ts = chrono::DateTime::parse_from_rfc3339(ts_str)
                .map_err(|_| ApiError::BadRequest("Invalid cursor timestamp".into()))?
                .with_timezone(&chrono::Utc);
            let id = Uuid::parse_str(id_str)
                .map_err(|_| ApiError::BadRequest("Invalid cursor id".into()))?;
            (Some(ts), Some(id))
        }
        None => (None, None),
    };

    let events = sqlx::query_as::<_, AuditEventRecord>(
        r#"
        SELECT ae.id, ae.organization_id, ae.actor_user_id,
               u.email AS actor_email, u.full_name AS actor_full_name,
               ae.action, ae.resource_type, ae.resource_id, ae.metadata,
               host(ae.ip) AS ip, ae.created_at
        FROM audit_events ae
        LEFT JOIN users u ON u.id = ae.actor_user_id
        WHERE ae.organization_id = $1
          AND ($2::text IS NULL OR ae.action = $2)
          AND ($3::uuid IS NULL OR ae.actor_user_id = $3)
          AND ($4::timestamptz IS NULL OR ae.created_at >= $4)
          AND ($5::timestamptz IS NULL OR ae.created_at <= $5)
          AND ($6::timestamptz IS NULL
               OR ae.created_at < $6
               OR (ae.created_at = $6 AND ae.id < $7))
        ORDER BY ae.created_at DESC, ae.id DESC
        LIMIT $8
        "#,
    )
    .bind(org_id)
    .bind(&q.action)
    .bind(q.actor)
    .bind(q.from)
    .bind(q.to)
    .bind(cursor_ts)
    .bind(cursor_id)
    .bind(limit)
    .fetch_all(&mut **tx)
    .await?;

    // A full page means there may be more; emit a cursor from the last row.
    let next_cursor = if events.len() as i64 == limit {
        events.last().and_then(|e| {
            e.created_at
                .map(|ts| format!("{}|{}", ts.to_rfc3339(), e.id))
        })
    } else {
        None
    };

    Ok(Json(AuditListResponse {
        events,
        next_cursor,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn valid_hex_colors_accepted() {
        assert!(is_valid_hex_color("#fff"));
        assert!(is_valid_hex_color("#4f46e5"));
        assert!(is_valid_hex_color("#ABCDEF"));
    }

    #[test]
    fn malformed_hex_colors_rejected() {
        assert!(!is_valid_hex_color("4f46e5")); // missing '#'
        assert!(!is_valid_hex_color("#12")); // too short
        assert!(!is_valid_hex_color("#12345")); // wrong length
        assert!(!is_valid_hex_color("#gggggg")); // non-hex
        assert!(!is_valid_hex_color("rgb(0,0,0)")); // unsupported format
    }

    #[test]
    fn validate_rejects_malformed_primary_color() {
        let settings = json!({ "primaryColor": "not-a-color" });
        assert!(validate_org_settings(&settings).is_err());
    }

    #[test]
    fn validate_accepts_well_formed_branding() {
        let settings = json!({
            "primaryColor": "#4f46e5",
            "logoUrl": "https://cdn.example.com/logo.png",
            "participantHeader": "Amescon Research Lab",
            "seatLimit": 25,
            // Unknown key must be tolerated (the settings UI stores this block).
            "defaults": { "timeLimit": 30 }
        });
        assert!(validate_org_settings(&settings).is_ok());
    }

    #[test]
    fn validate_rejects_non_http_logo_url() {
        let settings = json!({ "logoUrl": "javascript:alert(1)" });
        assert!(validate_org_settings(&settings).is_err());
    }

    #[test]
    fn validate_rejects_oversized_participant_header() {
        let settings = json!({ "participantHeader": "x".repeat(201) });
        assert!(validate_org_settings(&settings).is_err());
    }

    #[test]
    fn validate_noop_for_null_and_empty() {
        assert!(validate_org_settings(&serde_json::Value::Null).is_ok());
        assert!(validate_org_settings(&json!({})).is_ok());
    }
}
