use axum::{
    routing::{delete, get, post},
    Router,
};

use crate::state::AppState;

pub mod auth;
pub mod health;
pub mod media;
pub mod organizations;
pub mod projects;
pub mod questionnaires;
pub mod sessions;
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
        .route("/password-reset", post(auth::password_reset));

    let user_routes =
        Router::new().route("/me", get(users::get_profile).patch(users::update_profile));

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
        );

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
        );

    let questionnaire_routes = Router::new().route(
        "/by-code/{code}",
        get(questionnaires::get_questionnaire_by_code),
    );

    let session_routes = Router::new()
        .route("/", post(sessions::create_session))
        .route(
            "/{id}",
            get(sessions::get_session).patch(sessions::update_session),
        )
        .route("/{id}/responses", post(sessions::submit_response))
        .route("/{id}/events", post(sessions::submit_events))
        .route("/{id}/variables", post(sessions::upsert_variable));

    let media_routes = Router::new()
        .route("/", get(media::list_media).post(media::upload_media))
        .route("/{id}", get(media::get_media).delete(media::delete_media));

    let ws_route = Router::new().route("/ws", get(crate::websocket::handler::ws_upgrade));

    Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .nest("/api/auth", auth_routes)
        .nest("/api/users", user_routes)
        .nest("/api/organizations", org_routes)
        .nest("/api/projects", project_routes)
        .nest("/api/questionnaires", questionnaire_routes)
        .nest("/api/sessions", session_routes)
        .nest("/api/media", media_routes)
        .nest("/api", ws_route)
        .with_state(state)
}
