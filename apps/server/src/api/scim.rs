//! SCIM 2.0 provisioning (E-RBAC-7).
//!
//! An enterprise IdP (Okta / Entra / OneLogin) drives automated de/provisioning
//! against `/scim/v2/*` using a per-org bearer token (`scim_<prefix>_<secret>`,
//! stored as SHA-256 at rest — see 00039). A SCIM `User` create adds an active
//! `organization_members` row (`source='scim'`); a `PATCH active:false`, a
//! `PUT active:false`, or a `DELETE` suspends it (`status='suspended'`). Only
//! rows this connector provisioned (`source='scim'`) are ever mutated, and an
//! owner is never deactivated — so a directory can neither take over nor suspend
//! a hand-added owner. That rule is enforced on EVERY write, `POST` included:
//! a create whose email is already a member of the org is an update in disguise
//! and runs the same [`scim_mutation_denial`] guard (its `ON CONFLICT` upsert
//! used to rewrite `source`/`status` on a hand-added row, which both suspended
//! the member and re-labelled the row as SCIM-owned — after which the PATCH/PUT/
//! DELETE `source` checks admitted it).
//!
//! AUTH: the SCIM routes carry no JWT / RLS middleware (the caller is a machine
//! connector). Each handler resolves the bearer token to an org via
//! [`authenticate_scim`], then runs its work in a transaction whose
//! `app.user_id` GUC is the token's creator (a real org member) so the
//! membership-scoped RLS policies admit the reads/writes — the same
//! "act-as-creator" principal the API-key surface uses.
//!
//! SCOPE (honest): `Users` is implemented end-to-end (create / get / list with a
//! `userName eq` filter / PATCH / PUT / DELETE). `Groups` is a READ reflection of
//! the org's four role tiers and their members; group *mutation* (POST/PATCH/
//! DELETE Groups) returns a SCIM "not implemented" error rather than silently
//! succeeding — role assignment stays in the first-class roles/membership APIs.

use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::OrgRole;
use crate::state::AppState;

// ── Token auth ───────────────────────────────────────────────────────

/// The resolved SCIM connector context for one request.
struct ScimContext {
    token_id: Uuid,
    organization_id: Uuid,
    /// The token's creator — used as the RLS `app.user_id` principal.
    principal: Uuid,
}

/// SHA-256 (hex) of a bearer token, the at-rest form stored in `scim_tokens`.
pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

/// Generate a fresh `(plaintext_token, prefix)` SCIM bearer token. Layout:
/// `scim_<12 hex prefix>_<48 hex secret>`.
fn generate_scim_token() -> (String, String) {
    use rand::RngCore;
    let mut pbytes = [0u8; 6];
    let mut sbytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut pbytes);
    rand::thread_rng().fill_bytes(&mut sbytes);
    let prefix = hex::encode(pbytes);
    let secret = hex::encode(sbytes);
    (format!("scim_{prefix}_{secret}"), prefix)
}

/// Resolve + verify the `Authorization: Bearer <scim token>` header to a
/// [`ScimContext`]. Stamps `last_used_at`. 401 on any failure.
async fn authenticate_scim(state: &AppState, headers: &HeaderMap) -> Result<ScimContext, ApiError> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(|| ApiError::Unauthorized("Missing SCIM bearer token".into()))?;

    let hash = hash_token(token);

    #[derive(sqlx::FromRow)]
    struct Row {
        id: Uuid,
        organization_id: Uuid,
        created_by: Option<Uuid>,
        enabled: bool,
    }

    let row = sqlx::query_as::<_, Row>(
        "SELECT id, organization_id, created_by, enabled FROM scim_tokens WHERE token_hash = $1",
    )
    .bind(&hash)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::Unauthorized("Invalid SCIM token".into()))?;

    if !row.enabled {
        return Err(ApiError::Unauthorized("SCIM token is disabled".into()));
    }
    let principal = row
        .created_by
        .ok_or_else(|| ApiError::Unauthorized("SCIM token principal no longer exists".into()))?;

    sqlx::query("UPDATE scim_tokens SET last_used_at = now() WHERE id = $1")
        .bind(row.id)
        .execute(&state.pool)
        .await?;

    Ok(ScimContext {
        token_id: row.id,
        organization_id: row.organization_id,
        principal,
    })
}

/// Begin a tx bound to the connector's RLS principal so membership-scoped
/// policies admit the reads/writes.
async fn begin_scoped(
    state: &AppState,
    ctx: &ScimContext,
) -> Result<sqlx::Transaction<'static, sqlx::Postgres>, ApiError> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(ctx.principal.to_string())
        .execute(&mut *tx)
        .await?;
    Ok(tx)
}

// ── SCIM response helpers ────────────────────────────────────────────

const USER_SCHEMA: &str = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA: &str = "urn:ietf:params:scim:schemas:core:2.0:Group";
const LIST_SCHEMA: &str = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const ERROR_SCHEMA: &str = "urn:ietf:params:scim:api:messages:2.0:Error";

/// A SCIM-shaped error body with the given HTTP status.
fn scim_error(status: StatusCode, detail: &str) -> Response {
    let body = json!({
        "schemas": [ERROR_SCHEMA],
        "detail": detail,
        "status": status.as_u16().to_string(),
    });
    (status, Json(body)).into_response()
}

/// One provisioned member as a SCIM User resource.
struct ScimUser {
    user_id: Uuid,
    email: String,
    full_name: Option<String>,
    active: bool,
}

impl ScimUser {
    fn to_json(&self) -> Value {
        json!({
            "schemas": [USER_SCHEMA],
            "id": self.user_id.to_string(),
            "userName": self.email,
            "displayName": self.full_name,
            "name": { "formatted": self.full_name },
            "emails": [ { "value": self.email, "primary": true } ],
            "active": self.active,
            "meta": {
                "resourceType": "User",
                "location": format!("/scim/v2/Users/{}", self.user_id),
            },
        })
    }
}

#[derive(sqlx::FromRow)]
struct MemberRow {
    user_id: Uuid,
    email: String,
    full_name: Option<String>,
    status: String,
    source: String,
    /// The member's org role. Not part of the SCIM `User` projection — it is
    /// read so the owner-protection guards below can refuse to deactivate an
    /// owner (a human may promote a SCIM-provisioned member to owner; the row
    /// keeps `source = 'scim'`, so the source check alone would not stop it).
    role: String,
}

impl MemberRow {
    fn to_scim(&self) -> ScimUser {
        ScimUser {
            user_id: self.user_id,
            email: self.email.clone(),
            full_name: self.full_name.clone(),
            active: self.status == "active",
        }
    }
}

const MEMBER_SELECT: &str = r#"
    SELECT u.id AS user_id, u.email, u.full_name, om.status, om.source, om.role
    FROM organization_members om
    JOIN users u ON u.id = om.user_id
    WHERE om.organization_id = $1
"#;

/// SCIM may only touch rows it provisioned, and may never deactivate an owner.
///
/// Returns the SCIM 409 to send back, or `None` when the mutation is allowed.
///
///   * **(a) takeover** — a row with `source <> 'scim'` was added by a human;
///     the connector must not claim, rename, suspend or deprovision it. (The
///     create path previously did exactly this: its `ON CONFLICT DO UPDATE`
///     rewrote `source` to `'scim'` and `status` on a hand-added row, after
///     which the `source != "scim"` checks on PATCH/PUT/DELETE — which exist to
///     stop precisely this — happily admitted the now-"SCIM-managed" row.)
///   * **(b) owner deactivation** — an owner is never deactivated by a
///     directory, even one whose row IS SCIM-sourced (a human can promote a
///     SCIM member to owner; the row keeps `source = 'scim'`).
///
/// Reactivating (`deactivating == false`) a SCIM-sourced owner stays allowed —
/// restoring access is not an escalation.
fn scim_mutation_denial(existing: &MemberRow, deactivating: bool) -> Option<Response> {
    if existing.source != "scim" {
        return Some(scim_error(
            StatusCode::CONFLICT,
            "This member is not managed by SCIM",
        ));
    }
    if deactivating && existing.role == "owner" {
        return Some(scim_error(
            StatusCode::CONFLICT,
            "An organization owner cannot be deactivated by SCIM",
        ));
    }
    None
}

// ── SCIM Users ───────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ScimUserBody {
    #[serde(rename = "userName")]
    user_name: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    name: Option<ScimName>,
    emails: Option<Vec<ScimEmail>>,
    active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ScimName {
    formatted: Option<String>,
    #[serde(rename = "givenName")]
    given_name: Option<String>,
    #[serde(rename = "familyName")]
    family_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ScimEmail {
    value: String,
}

/// Resolve the primary email from a SCIM User body (`userName`, else first
/// `emails[].value`).
fn resolve_email(body: &ScimUserBody) -> Option<String> {
    body.user_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_lowercase())
        .or_else(|| {
            body.emails
                .as_ref()
                .and_then(|e| e.first())
                .map(|e| e.value.trim().to_lowercase())
        })
        .filter(|s| !s.is_empty())
}

/// Derive a display name from the SCIM body, falling back to the email local
/// part.
fn resolve_full_name(body: &ScimUserBody, email: &str) -> String {
    if let Some(dn) = body
        .display_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        return dn.trim().to_string();
    }
    if let Some(name) = &body.name {
        if let Some(f) = name.formatted.as_deref().filter(|s| !s.trim().is_empty()) {
            return f.trim().to_string();
        }
        let parts: Vec<&str> = [name.given_name.as_deref(), name.family_name.as_deref()]
            .into_iter()
            .flatten()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if !parts.is_empty() {
            return parts.join(" ");
        }
    }
    email.split('@').next().unwrap_or("User").to_string()
}

/// POST /scim/v2/Users — provision (create + activate) a member.
pub async fn create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ScimUserBody>,
) -> Response {
    match create_user_inner(&state, &headers, body).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

async fn create_user_inner(
    state: &AppState,
    headers: &HeaderMap,
    body: ScimUserBody,
) -> Result<Response, ApiError> {
    let ctx = authenticate_scim(state, headers).await?;

    let email = resolve_email(&body)
        .ok_or_else(|| ApiError::BadRequest("SCIM user requires userName or emails".into()))?;
    let full_name = resolve_full_name(&body, &email);
    let active = body.active.unwrap_or(true);
    let status = if active { "active" } else { "suspended" };

    let mut tx = begin_scoped(state, &ctx).await?;

    // An existing account for this email, if any. Resolved BEFORE any write so
    // the ownership guard below can refuse without having already mutated the
    // `users` row (a directory must not be able to rename a hand-added member
    // either).
    let existing_user_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL",
    )
    .bind(&email)
    .fetch_optional(&mut *tx)
    .await?;

    // Ownership guard (see `scim_mutation_denial`): a create against an email
    // that is ALREADY a member of this org is an update in disguise, and must
    // obey the same rules as PATCH / PUT / DELETE — never take over a row this
    // connector did not provision, never deactivate an owner.
    if let Some(uid) = existing_user_id {
        if let Some(existing) = fetch_member(&mut tx, ctx.organization_id, uid).await? {
            if let Some(denial) = scim_mutation_denial(&existing, !active) {
                return Ok(denial);
            }
        }
    }

    // Find or create the users row (a SCIM-provisioned account carries no
    // password; it authenticates via the org's federated SSO or an invite).
    let user_id = match existing_user_id {
        Some(id) => {
            // Keep the display name fresh from the directory.
            sqlx::query(
                "UPDATE users SET full_name = COALESCE(NULLIF($2, ''), full_name), updated_at = now() WHERE id = $1",
            )
            .bind(id)
            .bind(&full_name)
            .execute(&mut *tx)
            .await?;
            id
        }
        None => {
            let new_id = Uuid::new_v4();
            sqlx::query(
                r#"
                INSERT INTO users (id, email, full_name, email_verified)
                VALUES ($1, $2, $3, true)
                "#,
            )
            .bind(new_id)
            .bind(&email)
            .bind(&full_name)
            .execute(&mut *tx)
            .await
            .map_err(ApiError::from_db_error)?;
            new_id
        }
    };

    // The `DO UPDATE ... WHERE` re-states the guard at the DB layer so no future
    // caller (or a race between the check above and this statement) can revive
    // the takeover: the update only lands on a row this connector owns, and only
    // when it is not deactivating an owner. `role` is never written on conflict —
    // SCIM does not manage role assignment (that stays in the roles/membership
    // APIs), so an owner's role survives regardless.
    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role, status, source, joined_at)
        VALUES ($1, $2, 'member', $3, 'scim', NOW())
        ON CONFLICT (organization_id, user_id)
          DO UPDATE SET status = $3, source = 'scim'
          WHERE organization_members.source = 'scim'
            AND (organization_members.role <> 'owner' OR $3 = 'active')
        "#,
    )
    .bind(ctx.organization_id)
    .bind(user_id)
    .bind(status)
    .execute(&mut *tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: ctx.organization_id,
            actor_user_id: ctx.principal,
            action: AuditAction::ScimUserProvisioned,
            resource_type: resource::SCIM_USER,
            resource_id: Some(user_id),
            metadata: json!({ "email": email, "active": active, "scim_token_id": ctx.token_id }),
            ip: None,
        },
    )
    .await?;

    tx.commit().await?;

    let user = ScimUser {
        user_id,
        email,
        full_name: Some(full_name),
        active,
    };
    Ok((StatusCode::CREATED, Json(user.to_json())).into_response())
}

#[derive(Debug, Deserialize)]
pub struct UsersListQuery {
    filter: Option<String>,
}

/// GET /scim/v2/Users[?filter=userName eq "x"] — list provisioned members.
pub async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<UsersListQuery>,
) -> Response {
    match list_users_inner(&state, &headers, q).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

/// Parse `userName eq "value"` out of a SCIM filter expression (the only
/// operator IdP provisioning connectors rely on for reconciliation).
fn parse_username_filter(filter: &str) -> Option<String> {
    let lower = filter.to_lowercase();
    let idx = lower.find("username eq ")?;
    let rest = &filter[idx + "username eq ".len()..];
    let trimmed = rest.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(trimmed);
    Some(unquoted.trim().to_lowercase())
}

async fn list_users_inner(
    state: &AppState,
    headers: &HeaderMap,
    q: UsersListQuery,
) -> Result<Response, ApiError> {
    let ctx = authenticate_scim(state, headers).await?;
    let mut tx = begin_scoped(state, &ctx).await?;

    let email_filter = q.filter.as_deref().and_then(parse_username_filter);

    let sql =
        format!("{MEMBER_SELECT} AND ($2::text IS NULL OR lower(u.email) = $2) ORDER BY u.email");
    let rows = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(ctx.organization_id)
        .bind(email_filter.as_deref())
        .fetch_all(&mut *tx)
        .await?;

    tx.commit().await?;

    let resources: Vec<Value> = rows.iter().map(|r| r.to_scim().to_json()).collect();
    let body = json!({
        "schemas": [LIST_SCHEMA],
        "totalResults": resources.len(),
        "startIndex": 1,
        "itemsPerPage": resources.len(),
        "Resources": resources,
    });
    Ok((StatusCode::OK, Json(body)).into_response())
}

/// GET /scim/v2/Users/{id}
pub async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Response {
    match get_user_inner(&state, &headers, user_id).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

async fn get_user_inner(
    state: &AppState,
    headers: &HeaderMap,
    user_id: Uuid,
) -> Result<Response, ApiError> {
    let ctx = authenticate_scim(state, headers).await?;
    let mut tx = begin_scoped(state, &ctx).await?;

    let row = fetch_member(&mut tx, ctx.organization_id, user_id).await?;
    tx.commit().await?;

    match row {
        Some(r) => Ok((StatusCode::OK, Json(r.to_scim().to_json())).into_response()),
        None => Ok(scim_error(StatusCode::NOT_FOUND, "User not found")),
    }
}

async fn fetch_member(
    tx: &mut sqlx::Transaction<'static, sqlx::Postgres>,
    org_id: Uuid,
    user_id: Uuid,
) -> Result<Option<MemberRow>, ApiError> {
    let sql = format!("{MEMBER_SELECT} AND om.user_id = $2");
    let row = sqlx::query_as::<_, MemberRow>(&sql)
        .bind(org_id)
        .bind(user_id)
        .fetch_optional(&mut **tx)
        .await?;
    Ok(row)
}

#[derive(Debug, Deserialize)]
pub struct ScimPatchBody {
    #[serde(rename = "Operations")]
    operations: Option<Vec<ScimPatchOp>>,
}

#[derive(Debug, Deserialize)]
pub struct ScimPatchOp {
    op: String,
    path: Option<String>,
    value: Option<Value>,
}

/// Extract the target `active` flag from a SCIM PatchOp body. Supports both
/// `{"path":"active","value":false}` and `{"value":{"active":false}}` shapes.
fn patch_active(body: &ScimPatchBody) -> Option<bool> {
    let ops = body.operations.as_ref()?;
    let mut result = None;
    for op in ops {
        if !matches!(op.op.to_lowercase().as_str(), "replace" | "add") {
            continue;
        }
        match op.path.as_deref() {
            Some(p) if p.eq_ignore_ascii_case("active") => {
                if let Some(v) = op.value.as_ref().and_then(coerce_bool) {
                    result = Some(v);
                }
            }
            _ => {
                if let Some(v) = op
                    .value
                    .as_ref()
                    .and_then(|v| v.get("active"))
                    .and_then(coerce_bool)
                {
                    result = Some(v);
                }
            }
        }
    }
    result
}

/// SCIM connectors sometimes send `active` as the JSON string "false".
fn coerce_bool(v: &Value) -> Option<bool> {
    match v {
        Value::Bool(b) => Some(*b),
        Value::String(s) => match s.to_lowercase().as_str() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

/// PATCH /scim/v2/Users/{id}
pub async fn patch_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
    Json(body): Json<ScimPatchBody>,
) -> Response {
    let active = patch_active(&body);
    match set_active_inner(&state, &headers, user_id, active).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

/// PUT /scim/v2/Users/{id} — full replace; we honour the `active` field.
pub async fn replace_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
    Json(body): Json<ScimUserBody>,
) -> Response {
    match set_active_inner(&state, &headers, user_id, body.active).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

/// Apply an `active` change to a SCIM-provisioned member. `None` leaves the
/// status untouched and just returns the current resource.
async fn set_active_inner(
    state: &AppState,
    headers: &HeaderMap,
    user_id: Uuid,
    active: Option<bool>,
) -> Result<Response, ApiError> {
    let ctx = authenticate_scim(state, headers).await?;
    let mut tx = begin_scoped(state, &ctx).await?;

    let Some(existing) = fetch_member(&mut tx, ctx.organization_id, user_id).await? else {
        return Ok(scim_error(StatusCode::NOT_FOUND, "User not found"));
    };

    // Only SCIM-provisioned rows are directory-managed, and an owner is never
    // deactivated by the directory (see `scim_mutation_denial`).
    if let Some(denial) = scim_mutation_denial(&existing, active == Some(false)) {
        return Ok(denial);
    }

    let final_status = match active {
        Some(true) => "active",
        Some(false) => "suspended",
        None => existing.status.as_str(),
    };

    if let Some(active) = active {
        sqlx::query(
            "UPDATE organization_members SET status = $3 WHERE organization_id = $1 AND user_id = $2",
        )
        .bind(ctx.organization_id)
        .bind(user_id)
        .bind(final_status)
        .execute(&mut *tx)
        .await?;

        if !active {
            audit::record(
                &mut tx,
                AuditEvent {
                    organization_id: ctx.organization_id,
                    actor_user_id: ctx.principal,
                    action: AuditAction::ScimUserDeactivated,
                    resource_type: resource::SCIM_USER,
                    resource_id: Some(user_id),
                    metadata: json!({ "email": existing.email, "scim_token_id": ctx.token_id }),
                    ip: None,
                },
            )
            .await?;
        } else {
            audit::record(
                &mut tx,
                AuditEvent {
                    organization_id: ctx.organization_id,
                    actor_user_id: ctx.principal,
                    action: AuditAction::ScimUserProvisioned,
                    resource_type: resource::SCIM_USER,
                    resource_id: Some(user_id),
                    metadata: json!({ "email": existing.email, "reactivated": true }),
                    ip: None,
                },
            )
            .await?;
        }
    }

    tx.commit().await?;

    let user = ScimUser {
        user_id,
        email: existing.email,
        full_name: existing.full_name,
        active: final_status == "active",
    };
    Ok((StatusCode::OK, Json(user.to_json())).into_response())
}

/// DELETE /scim/v2/Users/{id} — soft remove (suspend).
pub async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Response {
    match delete_user_inner(&state, &headers, user_id).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

async fn delete_user_inner(
    state: &AppState,
    headers: &HeaderMap,
    user_id: Uuid,
) -> Result<Response, ApiError> {
    let ctx = authenticate_scim(state, headers).await?;
    let mut tx = begin_scoped(state, &ctx).await?;

    let Some(existing) = fetch_member(&mut tx, ctx.organization_id, user_id).await? else {
        return Ok(scim_error(StatusCode::NOT_FOUND, "User not found"));
    };
    // DELETE is a deprovision (suspend) — same guard as PATCH/PUT.
    if let Some(denial) = scim_mutation_denial(&existing, true) {
        return Ok(denial);
    }

    sqlx::query(
        "UPDATE organization_members SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(ctx.organization_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: ctx.organization_id,
            actor_user_id: ctx.principal,
            action: AuditAction::ScimUserDeactivated,
            resource_type: resource::SCIM_USER,
            resource_id: Some(user_id),
            metadata: json!({ "email": existing.email, "deleted": true }),
            ip: None,
        },
    )
    .await?;

    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

// ── SCIM Groups (read reflection of role tiers) ──────────────────────

const ROLE_TIERS: [&str; 4] = ["owner", "admin", "member", "viewer"];

/// GET /scim/v2/Groups — one SCIM Group per org role tier, with its members.
pub async fn list_groups(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match groups_inner(&state, &headers, None).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

/// GET /scim/v2/Groups/{role}
pub async fn get_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(role): Path<String>,
) -> Response {
    match groups_inner(&state, &headers, Some(role)).await {
        Ok(resp) => resp,
        Err(e) => api_error_to_scim(e),
    }
}

async fn groups_inner(
    state: &AppState,
    headers: &HeaderMap,
    only_role: Option<String>,
) -> Result<Response, ApiError> {
    let ctx = authenticate_scim(state, headers).await?;

    if let Some(role) = only_role.as_deref() {
        if !ROLE_TIERS.contains(&role) {
            return Ok(scim_error(StatusCode::NOT_FOUND, "Group not found"));
        }
    }

    let mut tx = begin_scoped(state, &ctx).await?;
    let rows = sqlx::query_as::<_, (String, Uuid, String)>(
        r#"
        SELECT om.role, u.id, u.email
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = $1 AND om.status = 'active'
        ORDER BY om.role, u.email
        "#,
    )
    .bind(ctx.organization_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;

    let build = |role: &str| -> Value {
        let members: Vec<Value> = rows
            .iter()
            .filter(|(r, _, _)| r == role)
            .map(|(_, id, email)| json!({ "value": id.to_string(), "display": email }))
            .collect();
        json!({
            "schemas": [GROUP_SCHEMA],
            "id": role,
            "displayName": role,
            "members": members,
            "meta": { "resourceType": "Group", "location": format!("/scim/v2/Groups/{role}") },
        })
    };

    match only_role {
        Some(role) => Ok((StatusCode::OK, Json(build(&role))).into_response()),
        None => {
            let resources: Vec<Value> = ROLE_TIERS.iter().map(|r| build(r)).collect();
            let body = json!({
                "schemas": [LIST_SCHEMA],
                "totalResults": resources.len(),
                "startIndex": 1,
                "itemsPerPage": resources.len(),
                "Resources": resources,
            });
            Ok((StatusCode::OK, Json(body)).into_response())
        }
    }
}

/// POST/PATCH/DELETE /scim/v2/Groups — group mutation is intentionally not
/// supported; role membership is managed through the first-class roles APIs.
pub async fn groups_unsupported(State(state): State<AppState>, headers: HeaderMap) -> Response {
    // Still authenticate so an unauthorized caller gets 401, not 501.
    match authenticate_scim(&state, &headers).await {
        Ok(_) => scim_error(
            StatusCode::NOT_IMPLEMENTED,
            "SCIM group mutation is not supported; manage roles via the roles API",
        ),
        Err(e) => api_error_to_scim(e),
    }
}

// ── Error mapping ────────────────────────────────────────────────────

/// Render an [`ApiError`] surfaced by a SCIM handler as a SCIM-shaped error
/// body, preserving the HTTP status the error maps to.
fn api_error_to_scim(err: ApiError) -> Response {
    let status = match &err {
        ApiError::BadRequest(_) | ApiError::Validation(_) => StatusCode::BAD_REQUEST,
        ApiError::Unauthorized(_) | ApiError::Jwt(_) => StatusCode::UNAUTHORIZED,
        ApiError::Forbidden(_) => StatusCode::FORBIDDEN,
        ApiError::NotFound(_) => StatusCode::NOT_FOUND,
        ApiError::Conflict(_) | ApiError::SeatLimitReached(_) => StatusCode::CONFLICT,
        ApiError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    let detail = match &err {
        ApiError::BadRequest(m)
        | ApiError::Unauthorized(m)
        | ApiError::Forbidden(m)
        | ApiError::NotFound(m)
        | ApiError::Conflict(m)
        | ApiError::SeatLimitReached(m)
        | ApiError::Validation(m) => m.clone(),
        ApiError::RateLimited => "Rate limit exceeded".to_string(),
        other => {
            tracing::error!("SCIM internal error: {other}");
            "Internal server error".to_string()
        }
    };
    scim_error(status, &detail)
}

// ── Admin: SCIM token CRUD (owner/admin, JWT + RLS) ──────────────────

/// One SCIM bearer token with the secret redacted.
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ScimTokenRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub prefix: String,
    pub enabled: bool,
    pub created_by: Option<Uuid>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

const SCIM_TOKEN_SELECT: &str = r#"
    id, organization_id, name, prefix, enabled, created_by, last_used_at, created_at
"#;

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateScimTokenRequest {
    pub name: Option<String>,
}

/// Returned once on creation — the plaintext `token` is unrecoverable after.
#[derive(Debug, Serialize, ToSchema)]
pub struct CreateScimTokenResponse {
    /// The full plaintext SCIM bearer token. Shown ONCE.
    pub token: String,
    pub scim_token: ScimTokenRecord,
}

async fn require_org_admin(
    state: &AppState,
    conn: &mut sqlx::PgConnection,
    user_id: Uuid,
    org_id: Uuid,
) -> Result<(), ApiError> {
    if state
        .rbac
        .has_org_role(conn, user_id, org_id, &OrgRole::Admin)
        .await?
    {
        Ok(())
    } else {
        Err(ApiError::Forbidden(
            "Requires admin role to manage SCIM tokens".into(),
        ))
    }
}

/// GET /api/organizations/:id/scim-tokens
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/scim-tokens",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "SCIM tokens (secrets redacted)", body = [ScimTokenRecord]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["scim"]
)]
pub async fn list_scim_tokens(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<Vec<ScimTokenRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let rows = sqlx::query_as::<_, ScimTokenRecord>(&format!(
        "SELECT {SCIM_TOKEN_SELECT} FROM scim_tokens WHERE organization_id = $1 ORDER BY created_at DESC"
    ))
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(rows))
}

/// POST /api/organizations/:id/scim-tokens
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/scim-tokens",
    request_body = CreateScimTokenRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "SCIM token created — plaintext shown once", body = CreateScimTokenResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["scim"]
)]
pub async fn create_scim_token(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateScimTokenRequest>,
) -> Result<(StatusCode, Json<CreateScimTokenResponse>), ApiError> {
    let name = body
        .name
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("SCIM token")
        .to_string();
    if name.len() > 100 {
        return Err(ApiError::BadRequest(
            "SCIM token name must be at most 100 characters".into(),
        ));
    }

    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let (plaintext, prefix) = generate_scim_token();
    let token_hash = hash_token(&plaintext);

    let record = sqlx::query_as::<_, ScimTokenRecord>(&format!(
        r#"
        INSERT INTO scim_tokens (organization_id, name, token_hash, prefix, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING {SCIM_TOKEN_SELECT}
        "#
    ))
    .bind(org_id)
    .bind(&name)
    .bind(&token_hash)
    .bind(&prefix)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ScimTokenCreated,
            resource_type: resource::SCIM_TOKEN,
            resource_id: Some(record.id),
            metadata: json!({ "name": record.name, "prefix": record.prefix }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(CreateScimTokenResponse {
            token: plaintext,
            scim_token: record,
        }),
    ))
}

/// DELETE /api/organizations/:id/scim-tokens/:token_id — disable (soft-revoke).
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/scim-tokens/{token_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("token_id" = Uuid, Path, description = "SCIM token id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "SCIM token revoked", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Not found or already revoked", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["scim"]
)]
pub async fn revoke_scim_token(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, token_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let revoked = sqlx::query_scalar::<_, Uuid>(
        r#"
        UPDATE scim_tokens SET enabled = false
        WHERE id = $1 AND organization_id = $2 AND enabled = true
        RETURNING id
        "#,
    )
    .bind(token_id)
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?;

    if revoked.is_none() {
        return Err(ApiError::NotFound(
            "SCIM token not found or already revoked".into(),
        ));
    }

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::ScimTokenRevoked,
            resource_type: resource::SCIM_TOKEN,
            resource_id: Some(token_id),
            metadata: json!({}),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "SCIM token revoked" })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_username_filter() {
        assert_eq!(
            parse_username_filter("userName eq \"alice@corp.com\""),
            Some("alice@corp.com".to_string())
        );
        assert_eq!(
            parse_username_filter("userName Eq \"Bob@Corp.com\""),
            Some("bob@corp.com".to_string())
        );
        assert_eq!(parse_username_filter("displayName co \"x\""), None);
    }

    #[test]
    fn extracts_patch_active() {
        let body: ScimPatchBody = serde_json::from_value(json!({
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [{ "op": "replace", "path": "active", "value": false }]
        }))
        .unwrap();
        assert_eq!(patch_active(&body), Some(false));

        let body2: ScimPatchBody = serde_json::from_value(json!({
            "Operations": [{ "op": "replace", "value": { "active": true } }]
        }))
        .unwrap();
        assert_eq!(patch_active(&body2), Some(true));
    }
}
