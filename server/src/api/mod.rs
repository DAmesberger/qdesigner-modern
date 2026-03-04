use axum::{
    middleware as axum_mw,
    routing::{delete, get, patch, post},
    Router,
};

use crate::middleware::rate_limit::rate_limit_middleware;
use crate::middleware::rls_context::set_rls_context;
use crate::state::AppState;

pub mod access;
pub mod auth;
pub mod comments;
pub mod dev;
pub mod health;
pub mod media;
pub mod organizations;
pub mod projects;
pub mod questionnaires;
pub mod sessions;
pub mod templates;
pub mod users;

/// Assemble the full application router.
pub fn router(state: AppState) -> Router {
    let auth_routes = Router::new()
        .route("/login", post(auth::login))
        .route("/register", post(auth::register))
        .route("/refresh", post(auth::refresh))
        .route("/logout", post(auth::logout))
        .route("/me", get(auth::me))
        .route("/verify-email", post(auth::verify_email))
        .route("/verify-email/send", post(auth::send_verification_code))
        .route("/verify-email/verify", post(auth::verify_code))
        .route("/verify-email/resend", post(auth::send_verification_code))
        .route("/password-reset", post(auth::password_reset))
        .route(
            "/password-reset/confirm",
            post(auth::confirm_password_reset),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ));

    let user_routes =
        Router::new().route("/me", get(users::get_profile).patch(users::update_profile))
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let org_routes = Router::new()
        .route(
            "/",
            get(organizations::list_organizations).post(organizations::create_organization),
        )
        .route(
            "/{id}",
            get(organizations::get_organization)
                .patch(organizations::update_organization)
                .delete(organizations::delete_organization),
        )
        .route(
            "/{id}/members",
            get(organizations::list_members).post(organizations::add_member),
        )
        .route(
            "/{id}/members/{user_id}",
            delete(organizations::remove_member),
        )
        .route(
            "/{id}/invitations",
            get(organizations::list_invitations).post(organizations::create_invitation),
        )
        .route(
            "/{id}/invitations/{inv_id}",
            delete(organizations::revoke_invitation),
        )
        .route(
            "/{id}/domains",
            get(organizations::list_domains).post(organizations::create_domain),
        )
        .route(
            "/{id}/domains/{did}",
            patch(organizations::update_domain).delete(organizations::delete_domain),
        )
        .route(
            "/{id}/domains/{did}/verify",
            post(organizations::verify_domain),
        )
        .route(
            "/{id}/templates",
            get(templates::list_templates).post(templates::create_template),
        )
        .route(
            "/{id}/templates/{tid}",
            get(templates::get_template)
                .patch(templates::update_template)
                .delete(templates::delete_template),
        )
        .route(
            "/{id}/analytics",
            get(sessions::cross_project_analytics),
        )
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let project_routes = Router::new()
        .route(
            "/",
            get(projects::list_projects).post(projects::create_project),
        )
        .route(
            "/{id}",
            get(projects::get_project)
                .patch(projects::update_project)
                .delete(projects::delete_project),
        )
        .route(
            "/{id}/questionnaires",
            get(questionnaires::list_questionnaires).post(questionnaires::create_questionnaire),
        )
        .route(
            "/{id}/questionnaires/{qid}",
            get(questionnaires::get_questionnaire)
                .patch(questionnaires::update_questionnaire)
                .delete(questionnaires::delete_questionnaire),
        )
        .route(
            "/{id}/questionnaires/{qid}/publish",
            post(questionnaires::publish_questionnaire),
        )
        .route(
            "/{id}/questionnaires/{qid}/bump-version",
            post(questionnaires::bump_version),
        )
        .route(
            "/{id}/questionnaires/{qid}/export",
            get(questionnaires::export_responses),
        )
        .route(
            "/{id}/members",
            get(projects::list_project_members).post(projects::add_project_member),
        )
        .route(
            "/{id}/members/{uid}",
            patch(projects::update_project_member).delete(projects::remove_project_member),
        )
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let invitation_routes = Router::new()
        .route("/pending", get(organizations::list_pending_invitations))
        .route("/{id}/accept", post(organizations::accept_invitation))
        .route("/{id}/decline", post(organizations::decline_invitation));

    let questionnaire_routes = Router::new()
        .route(
            "/by-code/{code}",
            get(questionnaires::get_questionnaire_by_code),
        )
        .route(
            "/{id}/versions",
            get(questionnaires::list_versions),
        )
        .route(
            "/{id}/condition-counts",
            get(sessions::condition_counts),
        )
        .route(
            "/{id}/comments",
            get(comments::list_comments).post(comments::create_comment),
        )
        .route(
            "/{id}/comments/{cid}",
            patch(comments::update_comment).delete(comments::delete_comment),
        );

    let session_routes = Router::new()
        .route(
            "/",
            get(sessions::list_sessions).post(sessions::create_session),
        )
        .route("/aggregate", get(sessions::aggregate_sessions))
        .route("/compare", get(sessions::compare_sessions))
        .route("/dashboard", get(sessions::dashboard_summary))
        .route("/timeseries", get(sessions::timeseries))
        .route("/filter", post(sessions::filter_sessions))
        .route(
            "/{id}",
            get(sessions::get_session).patch(sessions::update_session),
        )
        .route("/{id}/responses", get(sessions::get_responses).post(sessions::submit_response))
        .route("/{id}/events", get(sessions::get_events).post(sessions::submit_events))
        .route("/{id}/sync", post(sessions::sync_session))
        .route("/{id}/variables", get(sessions::get_variables).post(sessions::upsert_variable))
        .route("/{id}/media", post(media::upload_session_media))
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let media_routes = Router::new()
        .route("/", get(media::list_media).post(media::upload_media))
        .route("/{id}", get(media::get_media).delete(media::delete_media))
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let ws_route = Router::new().route("/ws", get(crate::websocket::handler::ws_upgrade));

    let base = Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .nest("/api/auth", auth_routes)
        .nest("/api/users", user_routes)
        .nest("/api/organizations", org_routes)
        .nest("/api/projects", project_routes)
        .nest("/api/invitations", invitation_routes)
        .nest("/api/questionnaires", questionnaire_routes)
        .nest("/api/sessions", session_routes)
        .nest("/api/media", media_routes)
        .nest("/api", ws_route)
        .route("/api/domains/auto-join", get(organizations::check_auto_join));

    let dev_helpers_enabled = cfg!(debug_assertions)
        || matches!(
            std::env::var("DEV_HELPERS_ENABLED")
                .ok()
                .as_deref()
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("1" | "true" | "yes" | "on")
        );

    let app = if dev_helpers_enabled {
        base.nest(
            "/api/dev",
            Router::new().route("/bootstrap-personas", post(dev::bootstrap_personas)),
        )
    } else {
        base
    };

    app.with_state(state)
}
