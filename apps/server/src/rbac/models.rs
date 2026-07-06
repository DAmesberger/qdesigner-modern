/// Organization-level roles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrgRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl OrgRole {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            OrgRole::Owner => "owner",
            OrgRole::Admin => "admin",
            OrgRole::Member => "member",
            OrgRole::Viewer => "viewer",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(OrgRole::Owner),
            "admin" => Some(OrgRole::Admin),
            "member" => Some(OrgRole::Member),
            "viewer" => Some(OrgRole::Viewer),
            _ => None,
        }
    }
}

/// Project-level roles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectRole {
    Owner,
    Admin,
    Editor,
    Viewer,
}

impl ProjectRole {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            ProjectRole::Owner => "owner",
            ProjectRole::Admin => "admin",
            ProjectRole::Editor => "editor",
            ProjectRole::Viewer => "viewer",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(ProjectRole::Owner),
            "admin" => Some(ProjectRole::Admin),
            "editor" => Some(ProjectRole::Editor),
            "viewer" => Some(ProjectRole::Viewer),
            _ => None,
        }
    }
}

/// Fine-grained permission actions (E-RBAC-3).
///
/// Historically dead code (the platform authorized by coarse role tiers).
/// Activated by E-RBAC-3: the four system [`OrgRole`]s each resolve to a
/// default set (see [`OrgRole::default_permissions`]) and custom roles
/// (`org_roles.permissions text[]`) are stored as the [`as_str`](Self::as_str)
/// wire strings and parsed back with [`from_str`](Self::from_str).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Permission {
    // Organization
    OrgRead,
    OrgWrite,
    OrgManageMembers,
    OrgDelete,

    // Project
    ProjectRead,
    ProjectWrite,
    ProjectManageMembers,
    ProjectDelete,

    // Questionnaire
    QuestionnaireRead,
    QuestionnaireWrite,
    QuestionnairePublish,
    QuestionnaireDelete,

    // Session / Response
    SessionRead,
    SessionWrite,
    ResponseRead,
    ResponseWrite,

    // Media
    MediaRead,
    MediaWrite,
    MediaDelete,
}

impl Permission {
    pub fn as_str(&self) -> &'static str {
        match self {
            Permission::OrgRead => "org:read",
            Permission::OrgWrite => "org:write",
            Permission::OrgManageMembers => "org:manage_members",
            Permission::OrgDelete => "org:delete",
            Permission::ProjectRead => "project:read",
            Permission::ProjectWrite => "project:write",
            Permission::ProjectManageMembers => "project:manage_members",
            Permission::ProjectDelete => "project:delete",
            Permission::QuestionnaireRead => "questionnaire:read",
            Permission::QuestionnaireWrite => "questionnaire:write",
            Permission::QuestionnairePublish => "questionnaire:publish",
            Permission::QuestionnaireDelete => "questionnaire:delete",
            Permission::SessionRead => "session:read",
            Permission::SessionWrite => "session:write",
            Permission::ResponseRead => "response:read",
            Permission::ResponseWrite => "response:write",
            Permission::MediaRead => "media:read",
            Permission::MediaWrite => "media:write",
            Permission::MediaDelete => "media:delete",
        }
    }

    /// Parse the wire/storage string produced by [`as_str`](Self::as_str).
    /// Returns `None` for any unrecognised token — callers treat that as a
    /// validation error so a custom role can never persist a permission the
    /// gate can't resolve.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "org:read" => Some(Permission::OrgRead),
            "org:write" => Some(Permission::OrgWrite),
            "org:manage_members" => Some(Permission::OrgManageMembers),
            "org:delete" => Some(Permission::OrgDelete),
            "project:read" => Some(Permission::ProjectRead),
            "project:write" => Some(Permission::ProjectWrite),
            "project:manage_members" => Some(Permission::ProjectManageMembers),
            "project:delete" => Some(Permission::ProjectDelete),
            "questionnaire:read" => Some(Permission::QuestionnaireRead),
            "questionnaire:write" => Some(Permission::QuestionnaireWrite),
            "questionnaire:publish" => Some(Permission::QuestionnairePublish),
            "questionnaire:delete" => Some(Permission::QuestionnaireDelete),
            "session:read" => Some(Permission::SessionRead),
            "session:write" => Some(Permission::SessionWrite),
            "response:read" => Some(Permission::ResponseRead),
            "response:write" => Some(Permission::ResponseWrite),
            "media:read" => Some(Permission::MediaRead),
            "media:write" => Some(Permission::MediaWrite),
            "media:delete" => Some(Permission::MediaDelete),
            _ => None,
        }
    }

    /// Every permission, in declaration order. Powers the frontend
    /// permission-matrix editor and the migration's system-role seed.
    pub const ALL: [Permission; 19] = [
        Permission::OrgRead,
        Permission::OrgWrite,
        Permission::OrgManageMembers,
        Permission::OrgDelete,
        Permission::ProjectRead,
        Permission::ProjectWrite,
        Permission::ProjectManageMembers,
        Permission::ProjectDelete,
        Permission::QuestionnaireRead,
        Permission::QuestionnaireWrite,
        Permission::QuestionnairePublish,
        Permission::QuestionnaireDelete,
        Permission::SessionRead,
        Permission::SessionWrite,
        Permission::ResponseRead,
        Permission::ResponseWrite,
        Permission::MediaRead,
        Permission::MediaWrite,
        Permission::MediaDelete,
    ];
}

impl OrgRole {
    /// Default permission set for a built-in system role (E-RBAC-3).
    ///
    /// This is the preset a member resolves to when they carry **no**
    /// `custom_role_id`. The sets are deliberately monotonic with the
    /// [`org_role_level`](super::manager) tier ladder (Owner ⊇ Admin ⊇
    /// Member ⊇ Viewer) so switching a member between system roles never
    /// produces a surprising capability gap. The migration seeds one
    /// `org_roles` row per system role per org from exactly these lists, so
    /// the SQL presets and this table are the same data in two places.
    pub fn default_permissions(&self) -> &'static [Permission] {
        use Permission::*;
        match self {
            // Owner: unrestricted.
            OrgRole::Owner => &Permission::ALL,
            // Admin: everything except deleting the organization itself.
            OrgRole::Admin => &[
                OrgRead,
                OrgWrite,
                OrgManageMembers,
                ProjectRead,
                ProjectWrite,
                ProjectManageMembers,
                ProjectDelete,
                QuestionnaireRead,
                QuestionnaireWrite,
                QuestionnairePublish,
                QuestionnaireDelete,
                SessionRead,
                SessionWrite,
                ResponseRead,
                ResponseWrite,
                MediaRead,
                MediaWrite,
                MediaDelete,
            ],
            // Member: author + run studies, but no member/tenant admin and
            // no destructive deletes.
            OrgRole::Member => &[
                OrgRead,
                ProjectRead,
                ProjectWrite,
                QuestionnaireRead,
                QuestionnaireWrite,
                QuestionnairePublish,
                SessionRead,
                SessionWrite,
                ResponseRead,
                ResponseWrite,
                MediaRead,
                MediaWrite,
            ],
            // Viewer: read-only across the tenant.
            OrgRole::Viewer => &[
                OrgRead,
                ProjectRead,
                QuestionnaireRead,
                SessionRead,
                ResponseRead,
                MediaRead,
            ],
        }
    }
}
