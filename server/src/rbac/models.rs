/// Organization-level roles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrgRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl OrgRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            OrgRole::Owner => "owner",
            OrgRole::Admin => "admin",
            OrgRole::Member => "member",
            OrgRole::Viewer => "viewer",
        }
    }

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
    pub fn as_str(&self) -> &'static str {
        match self {
            ProjectRole::Owner => "owner",
            ProjectRole::Admin => "admin",
            ProjectRole::Editor => "editor",
            ProjectRole::Viewer => "viewer",
        }
    }

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

/// Permission constants used by require_permission middleware.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
}
