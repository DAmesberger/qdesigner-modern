//! Custom-role CRUD + member assignment (E-RBAC-3 step 5).
//!
//! An org admin/owner authors bespoke roles as `org_roles` rows whose
//! `permissions text[]` is the granular set (see `rbac::models::Permission`).
//! Assigning a custom role to a member (`custom_role_id`) makes that set the
//! member's EFFECTIVE authority, resolved by `RbacManager::resolve_permissions`
//! and enforced by `RbacManager::require_permission` on the migrated
//! endpoints.
//!
//! System roles (`is_system = true`, seeded by 00029) are read-only presets:
//! they surface in the matrix editor as templates but are immutable via this
//! API. Every mutation writes an append-only audit event on the same
//! transaction (E-RBAC-2).

use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::audit::{self, resource, AuditAction, AuditEvent, ClientIp};
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::{OrgRole, Permission};
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

/// One role definition (system preset or custom).
#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct OrgRoleRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub permissions: Vec<String>,
    pub is_system: bool,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// The full catalogue of assignable permission tokens — returned alongside
/// the roles so the matrix editor can render the checkbox grid without
/// hard-coding the list client-side.
#[derive(Debug, Serialize, ToSchema)]
pub struct RolesListResponse {
    pub roles: Vec<OrgRoleRecord>,
    pub available_permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRoleRequest {
    pub name: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRoleRequest {
    pub name: Option<String>,
    pub permissions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AssignCustomRoleRequest {
    /// The custom role to assign, or `null` to clear the assignment (demote
    /// the member back to their system-role defaults).
    pub custom_role_id: Option<Uuid>,
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Require the caller to be at least an org admin, else `Forbidden`.
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
        Err(ApiError::Forbidden("Requires admin role".into()))
    }
}

/// Reject any permission token that does not map to a known [`Permission`],
/// and normalise/dedup the list.
fn validate_permissions(raw: &[String]) -> Result<Vec<String>, ApiError> {
    let mut out: Vec<String> = Vec::with_capacity(raw.len());
    for p in raw {
        let parsed = Permission::from_str(p)
            .ok_or_else(|| ApiError::BadRequest(format!("Unknown permission: {p}")))?;
        let token = parsed.as_str().to_string();
        if !out.contains(&token) {
            out.push(token);
        }
    }
    Ok(out)
}

fn validate_name(name: &str) -> Result<String, ApiError> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 100 {
        return Err(ApiError::BadRequest(
            "Role name must be 1–100 characters".into(),
        ));
    }
    Ok(trimmed.to_string())
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/organizations/:id/roles
#[utoipa::path(
    get,
    path = "/api/organizations/{id}/roles",
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "System + custom roles", body = RolesListResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["roles"]
)]
pub async fn list_roles(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
) -> Result<Json<RolesListResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let roles = sqlx::query_as::<_, OrgRoleRecord>(
        r#"
        SELECT id, organization_id, name, permissions, is_system, created_at, updated_at
        FROM org_roles
        WHERE organization_id = $1
        ORDER BY is_system DESC, lower(name) ASC
        "#,
    )
    .bind(org_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(RolesListResponse {
        roles,
        available_permissions: Permission::ALL.iter().map(|p| p.as_str().to_string()).collect(),
    }))
}

/// POST /api/organizations/:id/roles
#[utoipa::path(
    post,
    path = "/api/organizations/{id}/roles",
    request_body = CreateRoleRequest,
    params(("id" = Uuid, Path, description = "Organization id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "Custom role created", body = OrgRoleRecord),
        (status = 400, description = "Invalid name or permission", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 409, description = "A role with that name already exists", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["roles"]
)]
pub async fn create_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateRoleRequest>,
) -> Result<(axum::http::StatusCode, Json<OrgRoleRecord>), ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let name = validate_name(&body.name)?;
    let permissions = validate_permissions(&body.permissions)?;

    let record = sqlx::query_as::<_, OrgRoleRecord>(
        r#"
        INSERT INTO org_roles (organization_id, name, permissions, is_system)
        VALUES ($1, $2, $3, false)
        RETURNING id, organization_id, name, permissions, is_system, created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(&name)
    .bind(&permissions)
    .fetch_one(&mut **tx)
    .await?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::RoleCreated,
            resource_type: resource::ROLE,
            resource_id: Some(record.id),
            metadata: serde_json::json!({
                "name": record.name,
                "permissions": record.permissions,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(record)))
}

/// PATCH /api/organizations/:id/roles/:role_id
#[utoipa::path(
    patch,
    path = "/api/organizations/{id}/roles/{role_id}",
    request_body = UpdateRoleRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("role_id" = Uuid, Path, description = "Role id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Custom role updated", body = OrgRoleRecord),
        (status = 400, description = "Invalid name or permission", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied or system role is immutable", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Role not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["roles"]
)]
pub async fn update_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, role_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRoleRequest>,
) -> Result<Json<OrgRoleRecord>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let is_system = sqlx::query_scalar::<_, bool>(
        "SELECT is_system FROM org_roles WHERE id = $1 AND organization_id = $2",
    )
    .bind(role_id)
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Role not found".into()))?;

    if is_system {
        return Err(ApiError::Forbidden(
            "System roles are immutable".into(),
        ));
    }

    let name = match body.name {
        Some(n) => Some(validate_name(&n)?),
        None => None,
    };
    let permissions = match body.permissions {
        Some(p) => Some(validate_permissions(&p)?),
        None => None,
    };

    // COALESCE keeps the existing value for any field the caller omitted.
    let record = sqlx::query_as::<_, OrgRoleRecord>(
        r#"
        UPDATE org_roles
        SET name = COALESCE($3, name),
            permissions = COALESCE($4, permissions),
            updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND is_system = false
        RETURNING id, organization_id, name, permissions, is_system, created_at, updated_at
        "#,
    )
    .bind(role_id)
    .bind(org_id)
    .bind(name.as_deref())
    .bind(permissions.as_deref())
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Role not found".into()))?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::RoleUpdated,
            resource_type: resource::ROLE,
            resource_id: Some(record.id),
            metadata: serde_json::json!({
                "name": record.name,
                "permissions": record.permissions,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(record))
}

/// DELETE /api/organizations/:id/roles/:role_id
#[utoipa::path(
    delete,
    path = "/api/organizations/{id}/roles/{role_id}",
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("role_id" = Uuid, Path, description = "Role id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Custom role deleted", body = crate::openapi::DeletedResponse),
        (status = 403, description = "Access denied or system role is immutable", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Role not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["roles"]
)]
pub async fn delete_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, role_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    let is_system = sqlx::query_scalar::<_, bool>(
        "SELECT is_system FROM org_roles WHERE id = $1 AND organization_id = $2",
    )
    .bind(role_id)
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Role not found".into()))?;

    if is_system {
        return Err(ApiError::Forbidden(
            "System roles cannot be deleted".into(),
        ));
    }

    // Members holding this role fall back to their system-role defaults via
    // the ON DELETE SET NULL FK on organization_members.custom_role_id.
    sqlx::query("DELETE FROM org_roles WHERE id = $1 AND organization_id = $2 AND is_system = false")
        .bind(role_id)
        .bind(org_id)
        .execute(&mut **tx)
        .await?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::RoleDeleted,
            resource_type: resource::ROLE,
            resource_id: Some(role_id),
            metadata: serde_json::json!({}),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

/// PUT /api/organizations/:id/members/:user_id/custom-role
///
/// Assign (or clear, with `custom_role_id: null`) a member's custom role.
/// The referenced role must belong to the same org.
#[utoipa::path(
    put,
    path = "/api/organizations/{id}/members/{user_id}/custom-role",
    request_body = AssignCustomRoleRequest,
    params(
        ("id" = Uuid, Path, description = "Organization id"),
        ("user_id" = Uuid, Path, description = "Member user id")
    ),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Custom role assignment updated", body = crate::openapi::MessageResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Member or role not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["roles"]
)]
pub async fn assign_member_role(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    client_ip: ClientIp,
    tx: Tx,
    Path((org_id, target_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<AssignCustomRoleRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;
    require_org_admin(&state, &mut tx, user.user_id, org_id).await?;

    // The target must be an active member of this org.
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')",
    )
    .bind(org_id)
    .bind(target_id)
    .fetch_one(&mut **tx)
    .await?;
    if !is_member {
        return Err(ApiError::NotFound("Member not found".into()));
    }

    // The role, when provided, must belong to this org.
    if let Some(role_id) = body.custom_role_id {
        let role_ok = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM org_roles WHERE id = $1 AND organization_id = $2)",
        )
        .bind(role_id)
        .bind(org_id)
        .fetch_one(&mut **tx)
        .await?;
        if !role_ok {
            return Err(ApiError::NotFound("Role not found".into()));
        }
    }

    sqlx::query(
        "UPDATE organization_members SET custom_role_id = $3 WHERE organization_id = $1 AND user_id = $2 AND status = 'active'",
    )
    .bind(org_id)
    .bind(target_id)
    .bind(body.custom_role_id)
    .execute(&mut **tx)
    .await?;

    audit::record(
        &mut **tx,
        AuditEvent {
            organization_id: org_id,
            actor_user_id: user.user_id,
            action: AuditAction::MemberCustomRoleAssigned,
            resource_type: resource::ORG_MEMBER,
            resource_id: Some(target_id),
            metadata: serde_json::json!({
                "target_user_id": target_id,
                "custom_role_id": body.custom_role_id,
            }),
            ip: client_ip.0,
        },
    )
    .await?;

    Ok(Json(serde_json::json!({ "message": "Custom role updated" })))
}
