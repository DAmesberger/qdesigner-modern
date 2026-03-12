use axum::Json;
use serde::Serialize;
use utoipa::openapi::security::{Http, HttpAuthScheme, SecurityScheme};
use utoipa::openapi::{ComponentsBuilder, OpenApi as OpenApiDoc};
use utoipa::{Modify, OpenApi, ToSchema};

use crate::api;
use crate::auth::models;

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorEnvelope {
    pub error: ErrorBody,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorBody {
    pub status: u16,
    pub message: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeletedResponse {
    pub deleted: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CountResponse {
    pub count: usize,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthStatus {
    pub status: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReadyChecks {
    pub database: bool,
    pub redis: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReadyStatus {
    pub status: String,
    pub checks: ReadyChecks,
}

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut OpenApiDoc) {
        let components = openapi
            .components
            .get_or_insert_with(|| ComponentsBuilder::new().build());
        components.add_security_scheme(
            "bearerAuth",
            SecurityScheme::Http(Http::new(HttpAuthScheme::Bearer)),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        api::health::health,
        api::health::ready,
        api::auth::register,
        api::auth::login,
        api::auth::refresh,
        api::auth::logout,
        api::auth::me,
        api::auth::verify_email,
        api::auth::send_verification_code,
        api::auth::resend_verification_code,
        api::auth::verify_code,
        api::auth::password_reset,
        api::auth::confirm_password_reset,
        api::users::get_profile,
        api::users::update_profile,
        api::organizations::list_organizations,
        api::organizations::create_organization,
        api::organizations::get_organization,
        api::organizations::update_organization,
        api::organizations::delete_organization,
        api::organizations::list_members,
        api::organizations::add_member,
        api::organizations::remove_member,
        api::organizations::list_invitations,
        api::organizations::create_invitation,
        api::organizations::list_pending_invitations,
        api::organizations::get_invitation,
        api::organizations::accept_invitation,
        api::organizations::decline_invitation,
        api::organizations::revoke_invitation,
        api::organizations::list_domains,
        api::organizations::create_domain,
        api::organizations::verify_domain,
        api::organizations::update_domain,
        api::organizations::delete_domain,
        api::organizations::check_auto_join,
        api::projects::list_projects,
        api::projects::create_project,
        api::projects::get_project,
        api::projects::update_project,
        api::projects::delete_project,
        api::projects::list_project_members,
        api::projects::add_project_member,
        api::projects::update_project_member,
        api::projects::remove_project_member,
        api::questionnaires::get_questionnaire_by_code,
        api::questionnaires::list_questionnaires,
        api::questionnaires::create_questionnaire,
        api::questionnaires::get_questionnaire,
        api::questionnaires::update_questionnaire,
        api::questionnaires::publish_questionnaire,
        api::questionnaires::bump_version,
        api::questionnaires::delete_questionnaire,
        api::questionnaires::export_responses,
        api::questionnaires::list_versions,
        api::comments::create_comment,
        api::comments::list_comments,
        api::comments::update_comment,
        api::comments::delete_comment,
        api::templates::list_templates,
        api::templates::create_template,
        api::templates::get_template,
        api::templates::update_template,
        api::templates::delete_template,
        api::sessions::create_session,
        api::sessions::check_duplicate,
        api::sessions::list_sessions,
        api::sessions::aggregate_sessions,
        api::sessions::compare_sessions,
        api::sessions::dashboard_summary,
        api::sessions::cross_project_analytics,
        api::sessions::get_session,
        api::sessions::get_responses,
        api::sessions::get_events,
        api::sessions::get_variables,
        api::sessions::update_session,
        api::sessions::condition_counts,
        api::sessions::quota_status,
        api::sessions::submit_response,
        api::sessions::submit_events,
        api::sessions::upsert_variable,
        api::sessions::sync_session,
        api::sessions::filter_sessions,
        api::sessions::timeseries,
        api::media::list_media,
        api::media::upload_media,
        api::media::get_media,
        api::media::delete_media,
        api::media::upload_session_media
    ),
    components(
        schemas(
            ErrorEnvelope,
            ErrorBody,
            SuccessResponse,
            MessageResponse,
            DeletedResponse,
            CountResponse,
            HealthStatus,
            ReadyStatus,
            ReadyChecks,
            models::LoginRequest,
            models::RegisterRequest,
            models::RefreshRequest,
            models::VerifyEmailRequest,
            models::PasswordResetRequest,
            models::SendVerificationCodeRequest,
            models::VerifyCodeRequest,
            models::VerificationResult,
            models::PasswordResetConfirm,
            models::AuthResponse,
            models::UserInfo,
            api::users::UserProfile,
            api::users::UpdateProfileRequest,
            api::organizations::Organization,
            api::organizations::CreateOrgRequest,
            api::organizations::UpdateOrgRequest,
            api::organizations::OrgMember,
            api::organizations::AddMemberRequest,
            api::organizations::Invitation,
            api::organizations::CreateInvitationRequest,
            api::organizations::PendingInvitation,
            api::organizations::InvitationOrganizationSummary,
            api::organizations::InvitationInviterSummary,
            api::organizations::InvitationDetail,
            api::organizations::DomainRecord,
            api::organizations::CreateDomainRequest,
            api::organizations::UpdateDomainRequest,
            api::organizations::AutoJoinResponse,
            api::projects::Project,
            api::projects::CreateProjectRequest,
            api::projects::UpdateProjectRequest,
            api::projects::ProjectMember,
            api::projects::AddProjectMemberRequest,
            api::projects::UpdateProjectMemberRequest,
            api::questionnaires::Questionnaire,
            api::questionnaires::QuestionnaireByCode,
            api::questionnaires::CreateQuestionnaireRequest,
            api::questionnaires::UpdateQuestionnaireRequest,
            api::questionnaires::BumpVersionRequest,
            api::questionnaires::QuestionnaireVersion,
            api::comments::CommentResponse,
            api::comments::CreateCommentRequest,
            api::comments::UpdateCommentRequest,
            api::templates::QuestionTemplate,
            api::templates::CreateTemplateRequest,
            api::templates::UpdateTemplateRequest,
            api::sessions::Session,
            api::sessions::CreateSessionRequest,
            api::sessions::UpdateSessionRequest,
            api::sessions::ResponseRecord,
            api::sessions::SubmitResponseRequest,
            api::sessions::SubmitResponsesPayload,
            api::sessions::InteractionEventRecord,
            api::sessions::SessionVariableRecord,
            api::sessions::SessionVariableRequest,
            api::sessions::InteractionEventRequest,
            api::sessions::NumericStatsSummary,
            api::sessions::SessionAggregateResponse,
            api::sessions::ParticipantStats,
            api::sessions::ComparisonDelta,
            api::sessions::SessionCompareResponse,
            api::sessions::CrossProjectAnalyticsResponse,
            api::sessions::QuestionnaireAnalytics,
            api::sessions::AggregateOverview,
            api::sessions::CrossComparison,
            api::sessions::DashboardSummary,
            api::sessions::QuestionnaireSummary,
            api::sessions::ActivityRecord,
            api::sessions::DashboardStats,
            api::sessions::CheckDuplicateRequest,
            api::sessions::CheckDuplicateResponse,
            api::sessions::SyncPayload,
            api::sessions::SyncResponseItem,
            api::sessions::SyncEventItem,
            api::sessions::SyncVariableItem,
            api::sessions::SyncResult,
            api::sessions::FilterRule,
            api::sessions::FilterGroup,
            api::sessions::FilterRequest,
            api::sessions::FilteredSessionRow,
            api::sessions::FilterResponse,
            api::sessions::TimeSeriesBucket,
            api::sessions::ConditionCount,
            api::sessions::QuotaStatusItem,
            api::sessions::QuotaStatusResponse,
            api::media::MediaAsset,
            api::media::MediaAssetWithUrl,
            api::media::MediaUploadRequest,
            api::media::SessionMediaAsset,
            api::media::SessionMediaWithUrl,
            api::media::SessionMediaUploadRequest
        )
    ),
    modifiers(&SecurityAddon),
    tags(
        (name = "health", description = "Service health and readiness probes"),
        (name = "auth", description = "Authentication and account recovery"),
        (name = "users", description = "User profile management"),
        (name = "organizations", description = "Organization management, invitations, and domains"),
        (name = "projects", description = "Project management and access control"),
        (name = "questionnaires", description = "Questionnaire authoring, publishing, and export"),
        (name = "comments", description = "Questionnaire comment threads"),
        (name = "templates", description = "Reusable question templates"),
        (name = "media", description = "Organization and session media assets"),
        (name = "sessions", description = "Questionnaire fillout sessions and persisted data"),
        (name = "analytics", description = "Aggregated analytics and filtering")
    )
)]
pub struct ApiDoc;

pub fn openapi() -> OpenApiDoc {
    ApiDoc::openapi()
}

pub async fn serve_openapi() -> Json<OpenApiDoc> {
    Json(openapi())
}
