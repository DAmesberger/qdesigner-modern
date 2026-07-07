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
    // Custom roles / granular permissions (E-RBAC-3).
    RoleCreated,
    RoleUpdated,
    RoleDeleted,
    /// A member was (re)assigned a custom role, or had it cleared — the
    /// "permission granted/revoked" event of E-RBAC-3 step 8.
    MemberCustomRoleAssigned,
    /// Organization ownership was transferred to another member — the
    /// atomic "owner handover" of E-RBAC-5 (promotes the new owner, may
    /// demote the outgoing owner, all in one guarded tx).
    OrgOwnershipTransferred,
    /// Project ownership was transferred to another member (E-RBAC-5).
    ProjectOwnershipTransferred,
    // SSO federation (E-RBAC-6).
    /// A member signed in through a federated IdP (OIDC/SAML), which may
    /// have JIT-provisioned the user and/or their org membership.
    SsoLogin,
    /// An org owner registered a new identity provider.
    SsoProviderCreated,
    /// An org owner edited an identity provider's configuration.
    SsoProviderUpdated,
    /// An org owner deleted an identity provider.
    SsoProviderDeleted,
    // API keys / service accounts (E-RBAC-7).
    /// An owner/admin minted a new API key (the plaintext is shown once).
    ApiKeyCreated,
    /// An API key was presented for the first time (first successful auth).
    ApiKeyFirstUsed,
    /// An owner/admin revoked an API key.
    ApiKeyRevoked,
    // SCIM provisioning (E-RBAC-7).
    /// An owner/admin minted a per-org SCIM bearer token.
    ScimTokenCreated,
    /// An owner/admin revoked (disabled) a SCIM bearer token.
    ScimTokenRevoked,
    /// A directory connector provisioned (created/activated) a member via SCIM.
    ScimUserProvisioned,
    /// A directory connector deactivated a member via SCIM (active=false).
    ScimUserDeactivated,
    // GDPR data export / erasure / residency (E-RBAC-9).
    /// An owner requested an org-scoped GDPR data export (DSAR bundle).
    OrgExportRequested,
    /// A ready export artifact's presigned download URL was issued (the
    /// closest server-observable "downloaded" event; audited once).
    OrgExportDownloaded,
    /// An owner executed a guarded tenant data erasure (participant data
    /// removed; audit_events retained through the erasure per compliance).
    OrgDataErased,
    /// An org's data-residency region was set (create-time / pre-data only).
    OrgDataRegionSet,
    /// An org's legal hold was enabled or released.
    OrgLegalHoldChanged,
    // Cross-project / external-guest sharing (E-RBAC-10).
    /// A project or questionnaire was shared with a (possibly external) user
    /// by email, granting a scoped, optionally time-limited role.
    ShareCreated,
    /// A previously-granted resource share was revoked.
    ShareRevoked,
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
            AuditAction::RoleCreated => "role.created",
            AuditAction::RoleUpdated => "role.updated",
            AuditAction::RoleDeleted => "role.deleted",
            AuditAction::MemberCustomRoleAssigned => "member.custom_role_assigned",
            AuditAction::OrgOwnershipTransferred => "organization.ownership_transferred",
            AuditAction::ProjectOwnershipTransferred => "project.ownership_transferred",
            AuditAction::SsoLogin => "sso.login",
            AuditAction::SsoProviderCreated => "sso.provider_created",
            AuditAction::SsoProviderUpdated => "sso.provider_updated",
            AuditAction::SsoProviderDeleted => "sso.provider_deleted",
            AuditAction::ApiKeyCreated => "api_key.created",
            AuditAction::ApiKeyFirstUsed => "api_key.first_used",
            AuditAction::ApiKeyRevoked => "api_key.revoked",
            AuditAction::ScimTokenCreated => "scim_token.created",
            AuditAction::ScimTokenRevoked => "scim_token.revoked",
            AuditAction::ScimUserProvisioned => "scim.user_provisioned",
            AuditAction::ScimUserDeactivated => "scim.user_deactivated",
            AuditAction::OrgExportRequested => "organization.export_requested",
            AuditAction::OrgExportDownloaded => "organization.export_downloaded",
            AuditAction::OrgDataErased => "organization.data_erased",
            AuditAction::OrgDataRegionSet => "organization.data_region_set",
            AuditAction::OrgLegalHoldChanged => "organization.legal_hold_changed",
            AuditAction::ShareCreated => "share.created",
            AuditAction::ShareRevoked => "share.revoked",
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
    pub const ROLE: &str = "org_role";
    pub const IDENTITY_PROVIDER: &str = "identity_provider";
    pub const API_KEY: &str = "api_key";
    pub const SCIM_TOKEN: &str = "scim_token";
    pub const SCIM_USER: &str = "scim_user";
    pub const DATA_EXPORT: &str = "data_export";
    pub const SHARE: &str = "resource_share";
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
