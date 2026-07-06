//! Append-only audit log of privileged actions (E-RBAC-2).
//!
//! Every privileged mutation (role change, invitation create/revoke,
//! member removal, domain verification, org update/delete, project
//! delete, project-member mutation) calls [`record`] on the SAME
//! per-request transaction that performs the mutation. Because the write
//! rides that transaction, the audit row commits iff the mutation
//! commits — there is no window where an action succeeds without a trail,
//! nor a trail without the action.
//!
//! Immutability is schema-enforced: `00034_audit_log.sql` REVOKEs
//! UPDATE/DELETE on `audit_events` from the application role, so a
//! recorded event can be read but never rewritten or erased through the
//! app connection.

use std::net::IpAddr;

use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use sqlx::PgConnection;
use uuid::Uuid;

use crate::error::ApiError;

/// Stable action identifiers written verbatim to `audit_events.action`.
///
/// The string values are a wire/storage contract — timeline UIs and
/// compliance exports key off them, so never rename an existing arm's
/// `as_str` output (add a new arm instead).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditAction {
    MemberAdded,
    MemberRoleChanged,
    MemberRemoved,
    InvitationCreated,
    InvitationRevoked,
    DomainVerified,
    OrgUpdated,
    OrgDeleted,
    ProjectDeleted,
    ProjectMemberAdded,
    ProjectMemberRoleChanged,
    ProjectMemberRemoved,
}

impl AuditAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuditAction::MemberAdded => "member.added",
            AuditAction::MemberRoleChanged => "member.role_changed",
            AuditAction::MemberRemoved => "member.removed",
            AuditAction::InvitationCreated => "invitation.created",
            AuditAction::InvitationRevoked => "invitation.revoked",
            AuditAction::DomainVerified => "domain.verified",
            AuditAction::OrgUpdated => "organization.updated",
            AuditAction::OrgDeleted => "organization.deleted",
            AuditAction::ProjectDeleted => "project.deleted",
            AuditAction::ProjectMemberAdded => "project_member.added",
            AuditAction::ProjectMemberRoleChanged => "project_member.role_changed",
            AuditAction::ProjectMemberRemoved => "project_member.removed",
        }
    }
}

/// Stable `resource_type` identifiers. Kept as associated `&str`s rather
/// than an enum so call sites read as plain data.
pub mod resource {
    pub const ORGANIZATION: &str = "organization";
    pub const ORG_MEMBER: &str = "organization_member";
    pub const INVITATION: &str = "invitation";
    pub const DOMAIN: &str = "domain";
    pub const PROJECT: &str = "project";
    pub const PROJECT_MEMBER: &str = "project_member";
}

/// One privileged action to append to the log.
pub struct AuditEvent {
    /// Organization the action belongs to (audit rows are org-scoped so
    /// org admins/owners can read their own tenant's trail).
    pub organization_id: Uuid,
    /// The authenticated user who performed the action.
    pub actor_user_id: Uuid,
    pub action: AuditAction,
    pub resource_type: &'static str,
    /// The primary entity acted upon (target user, invitation, domain,
    /// project, …). `None` only when there is no single subject.
    pub resource_id: Option<Uuid>,
    /// Free-form structured context (before/after values, target email,
    /// etc.). Rendered as expandable detail in the timeline UI.
    pub metadata: serde_json::Value,
    /// Actor IP (socket peer), if the request carried `ConnectInfo`.
    pub ip: Option<IpAddr>,
}

/// Append `event` to the audit log on the caller's transaction.
///
/// Takes `&mut PgConnection` so handlers pass `&mut **tx` (the pinned RLS
/// transaction) directly — the INSERT then commits/rolls-back atomically
/// with the surrounding mutation.
///
/// `ip` binds through a `text -> inet` cast so we avoid pulling in the
/// `ipnetwork` sqlx feature; a `None` binds as SQL NULL.
pub async fn record(conn: &mut PgConnection, event: AuditEvent) -> Result<(), ApiError> {
    sqlx::query(
        r#"
        INSERT INTO audit_events
            (organization_id, actor_user_id, action, resource_type, resource_id, metadata, ip)
        VALUES ($1, $2, $3, $4, $5, $6, $7::inet)
        "#,
    )
    .bind(event.organization_id)
    .bind(event.actor_user_id)
    .bind(event.action.as_str())
    .bind(event.resource_type)
    .bind(event.resource_id)
    .bind(event.metadata)
    .bind(event.ip.map(|ip| ip.to_string()))
    .execute(conn)
    .await?;
    Ok(())
}

/// Extractor yielding the request's socket peer IP, if available.
///
/// Populated by `into_make_service_with_connect_info::<SocketAddr>()`
/// (main.rs) — the same source the rate limiter keys on (P2-T5). Keying on
/// the socket peer rather than a client-controlled `X-Forwarded-For`
/// header keeps the audit trail honest (XFF is trivially spoofable). The
/// extractor is infallible: in the tower test harness (no `ConnectInfo`)
/// it yields `None` and audit rows simply carry a NULL ip.
#[derive(Debug, Clone, Copy, Default)]
pub struct ClientIp(pub Option<IpAddr>);

impl<S> FromRequestParts<S> for ClientIp
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let ip = parts
            .extensions
            .get::<ConnectInfo<std::net::SocketAddr>>()
            .map(|ci| ci.0.ip());
        Ok(ClientIp(ip))
    }
}
