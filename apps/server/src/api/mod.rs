use axum::{
    extract::DefaultBodyLimit,
    middleware as axum_mw,
    routing::{delete, get, patch, post, put},
    Router,
};
use tower_http::catch_panic::CatchPanicLayer;

use crate::middleware::api_key::set_api_key_context;
use crate::middleware::fillout_rls_context::set_fillout_rls_context;
use crate::middleware::rate_limit::{
    rate_limit_middleware, session_create_rate_limit_middleware,
    session_media_rate_limit_middleware,
};
use crate::middleware::rls_context::set_rls_context;
use crate::middleware::series_rls_context::set_series_rls_context;
use crate::state::AppState;

pub mod access;
pub mod api_keys;
pub mod auth;
pub mod comments;
pub mod csv;
pub mod dev;
pub mod gdpr;
pub mod health;
pub mod media;
pub mod organizations;
pub mod project_invitations;
pub mod projects;
pub mod questionnaires;
pub mod roles;
pub mod scim;
pub mod series;
pub mod sessions;
pub mod sso;
pub mod templates;
pub mod users;
pub mod zitadel_auth;

/// Assemble the full application router.
pub fn router(state: AppState) -> Router {
    let auth_routes = Router::new()
        .route("/login", post(auth::login))
        .route("/register", post(auth::register))
        .route("/logout", post(auth::logout))
        .route("/session", get(auth::session_view))
        .route("/zitadel/start", get(zitadel_auth::zitadel_start))
        .route("/zitadel/callback", get(zitadel_auth::zitadel_callback))
        .route("/verify-email/send", post(auth::send_verification_code))
        .route("/verify-email/verify", post(auth::verify_code))
        .route("/verify-email/resend", post(auth::resend_verification_code))
        .route("/password-reset", post(auth::password_reset))
        .route(
            "/password-reset/confirm",
            post(auth::confirm_password_reset),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ))
        // Outermost: contain any panic in a handler or the rate-limit layer
        // as a 500 instead of aborting the connection task.
        .layer(CatchPanicLayer::new());

    let user_routes = Router::new()
        .route(
            "/me",
            get(users::get_profile)
                .patch(users::update_profile)
                .delete(users::delete_account),
        )
        .layer(CatchPanicLayer::new())
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
        .route("/{id}/seats", get(organizations::get_seats))
        .route("/{id}/branding", get(organizations::get_org_branding))
        .route(
            "/{id}/members",
            get(organizations::list_members).post(organizations::add_member),
        )
        .route(
            "/{id}/members/{user_id}",
            delete(organizations::remove_member),
        )
        .route(
            "/{id}/members/{user_id}/role",
            put(organizations::change_member_role),
        )
        .route(
            "/{id}/transfer-ownership",
            post(organizations::transfer_org_ownership),
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
        .route("/{id}/analytics", get(sessions::cross_project_analytics))
        .route("/{id}/audit", get(organizations::list_audit_events))
        // GDPR data export / erasure / residency (E-RBAC-9). The export POST is
        // additionally rate-limited (one heavy job per caller/window) on top of
        // the handler's one-in-flight-per-org guard.
        .route(
            "/{id}/export",
            post(gdpr::request_export).route_layer(axum_mw::from_fn_with_state(
                state.clone(),
                rate_limit_middleware,
            )),
        )
        .route("/{id}/export/{job_id}", get(gdpr::get_export))
        .route("/{id}/erase", post(gdpr::erase_org))
        .route("/{id}/data-region", put(gdpr::set_data_region))
        .route("/{id}/legal-hold", put(gdpr::set_legal_hold))
        .route(
            "/{id}/roles",
            get(roles::list_roles).post(roles::create_role),
        )
        .route(
            "/{id}/roles/{role_id}",
            patch(roles::update_role).delete(roles::delete_role),
        )
        .route(
            "/{id}/members/{user_id}/custom-role",
            put(roles::assign_member_role),
        )
        .route(
            "/{id}/sso",
            get(sso::list_providers).post(sso::create_provider),
        )
        .route(
            "/{id}/sso/{idp_id}",
            patch(sso::update_provider).delete(sso::delete_provider),
        )
        .route(
            "/{id}/api-keys",
            get(api_keys::list_api_keys).post(api_keys::create_api_key),
        )
        .route("/{id}/api-keys/{key_id}", delete(api_keys::revoke_api_key))
        .route(
            "/{id}/scim-tokens",
            get(scim::list_scim_tokens).post(scim::create_scim_token),
        )
        .route(
            "/{id}/scim-tokens/{token_id}",
            delete(scim::revoke_scim_token),
        )
        .layer(CatchPanicLayer::new())
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
        .route(
            "/{id}/transfer-ownership",
            post(projects::transfer_project_ownership),
        )
        // Project invitations (ADR 0033, Unit 3) — invite an email to
        // collaborate on THIS project; accept lands a (possibly cross-org)
        // project_members row. Token-keyed accept/get/decline live on the
        // sibling `/api/project-invitations` nest below.
        .route(
            "/{id}/invitations",
            get(project_invitations::list_project_invitations)
                .post(project_invitations::create_project_invitation),
        )
        .route(
            "/{id}/invitations/{inv_id}",
            delete(project_invitations::revoke_project_invitation),
        )
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let invitation_routes = Router::new()
        .route("/pending", get(organizations::list_pending_invitations))
        .route("/{id}", get(organizations::get_invitation))
        .route(
            "/{id}/accept",
            post(organizations::accept_invitation).route_layer(axum_mw::from_fn_with_state(
                state.clone(),
                rate_limit_middleware,
            )),
        )
        .route("/{id}/decline", post(organizations::decline_invitation))
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    // Project-invitation accept / get / decline — token-keyed, sibling of the
    // org `invitation_routes` above (ADR 0033, Unit 3). Accept is rate-limited
    // like the org accept.
    let project_invitation_routes = Router::new()
        .route("/{token}", get(project_invitations::get_project_invitation))
        .route(
            "/{token}/accept",
            post(project_invitations::accept_project_invitation).route_layer(
                axum_mw::from_fn_with_state(state.clone(), rate_limit_middleware),
            ),
        )
        .route(
            "/{token}/decline",
            post(project_invitations::decline_project_invitation),
        )
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let questionnaire_routes = Router::new()
        .route(
            "/by-code/{code}",
            get(questionnaires::get_questionnaire_by_code),
        )
        .route("/{id}/versions", get(questionnaires::list_versions))
        .route("/{id}/condition-counts", get(sessions::condition_counts))
        .route("/{id}/arm-counts", get(sessions::arm_counts))
        .route("/{id}/quota-status", get(sessions::quota_status))
        .route("/{id}/quota-cells", get(sessions::quota_cells))
        .route("/{id}/cohort-stats", get(sessions::public_cohort_stats))
        .route(
            "/{id}/server-variables",
            get(sessions::public_server_variables),
        )
        .route(
            "/{id}/comments",
            get(comments::list_comments).post(comments::create_comment),
        )
        .route(
            "/{id}/comments/{cid}",
            patch(comments::update_comment).delete(comments::delete_comment),
        )
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context));

    let session_routes = Router::new()
        // `POST /` is the anonymous session-create entry point — no JWT, and
        // every call burns a participant number + claims an experiment arm. It
        // carries its own generous per-IP budget (default 60/60s), applied to
        // the POST method ONLY so the authenticated researcher's `GET /` listing
        // keeps its normal (unlimited-here) path. The complementary
        // per-questionnaire ceiling lives in the handler.
        .route(
            "/",
            get(sessions::list_sessions).merge(post(sessions::create_session).route_layer(
                axum_mw::from_fn_with_state(state.clone(), session_create_rate_limit_middleware),
            )),
        )
        .route("/aggregate", get(sessions::aggregate_sessions))
        .route("/compare", get(sessions::compare_sessions))
        .route("/dashboard", get(sessions::dashboard_summary))
        .route("/timeseries", get(sessions::timeseries))
        .route(
            "/{id}",
            get(sessions::get_session).patch(sessions::update_session),
        )
        .route("/{id}/responses", get(sessions::get_responses))
        .route(
            "/{id}/events",
            get(sessions::get_events).post(sessions::submit_events),
        )
        .route(
            "/{id}/sync",
            post(sessions::sync_session)
                .route_layer(axum_mw::from_fn_with_state(
                    state.clone(),
                    rate_limit_middleware,
                ))
                // Offline-first fillout exists to accumulate LARGE batches: the
                // client (`FilloutUploadSync`) chunks at 200 rows, and a
                // reaction-time trial row carries a `timing_provenance` blob
                // (phaseTimeline + frameStats), so one chunk can plausibly
                // exceed axum's implicit 2 MiB default. A 413 there is
                // unrecoverable — the client retries the SAME payload forever
                // and the session eventually deadletters, losing its data to the
                // server. Override for this route only (same 26 MiB constant the
                // two media upload routes use); the global default still guards
                // every other JSON endpoint.
                .layer(DefaultBodyLimit::max(26 * 1024 * 1024)),
        )
        .route("/{id}/synced-client-ids", get(sessions::synced_client_ids))
        .route("/{id}/trials", get(sessions::get_trials))
        .route("/{id}/variables", get(sessions::get_variables))
        .route(
            "/{id}/media",
            post(media::upload_session_media)
                // Anonymous, unauthenticated write into object storage: rate-limit
                // it (default 120/60s per IP). The hard storage ceiling is the
                // per-session file-count / total-bytes quota inside the handler.
                .route_layer(axum_mw::from_fn_with_state(
                    state.clone(),
                    session_media_rate_limit_middleware,
                ))
                // Bound the multipart body before `field.bytes()` buffers it.
                // Sits just above the 25 MiB `validate_upload` cap so the
                // transport layer rejects gross oversends early. Overrides
                // axum's implicit 2 MiB default for this route only.
                .layer(DefaultBodyLimit::max(26 * 1024 * 1024)),
        )
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            set_fillout_rls_context,
        ));

    // Same-origin streaming proxy (contract D1). Runs under the
    // optional-JWT fillout context so anonymous fillout can fetch bytes of
    // assets referenced by a published questionnaire (RLS admits via the
    // 00025 media_assets_select_via_published_questionnaire policy), while
    // authenticated project members are admitted by the 00014 org-member
    // policy. Merged into media_routes so `/{id}/content` sits alongside
    // the JWT-only `/{id}` presigned handler with its own middleware stack.
    let media_content_routes = Router::new()
        .route("/{id}/content", get(media::stream_media_content))
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            set_fillout_rls_context,
        ));

    let media_routes = Router::new()
        .route(
            "/",
            get(media::list_media).merge(
                post(media::upload_media)
                    // Without this override axum's IMPLICIT 2 MiB default body
                    // limit applies, so every designer upload above ~2 MiB was
                    // rejected with 413 and the documented 25 MiB
                    // `media::MAX_UPLOAD_BYTES` cap was unreachable — audio and
                    // video stimuli routinely exceed 2 MiB. Matches the 26 MiB
                    // used on the session-media route: just above the 25 MiB
                    // `validate_upload` cap, so the transport layer sheds gross
                    // oversends and `validate_upload` still owns the real limit.
                    .layer(DefaultBodyLimit::max(26 * 1024 * 1024)),
            ),
        )
        .route("/{id}", get(media::get_media).delete(media::delete_media))
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context))
        .merge(media_content_routes);

    // Longitudinal / EMA study series (E-FLOW-2). The researcher surface
    // runs under the standard `set_rls_context` (JWT → app.user_id); the
    // anonymous participant surface (`/prompt/{token}/…`) runs under
    // `set_series_rls_context` (URL token → app.enrollment_token). Merged
    // like `media_routes` so both live under one `/api/series` nest, each
    // keeping its own middleware stack. The participant `…/complete` and
    // `…/unsubscribe` writes are rate-limited (anonymous, session-URL-only
    // credential).
    let series_public_routes = Router::new()
        .route("/prompt/{token}", get(series::resolve_prompt))
        .route(
            "/prompt/{token}/complete",
            post(series::complete_prompt).route_layer(axum_mw::from_fn_with_state(
                state.clone(),
                rate_limit_middleware,
            )),
        )
        .route(
            "/prompt/{token}/unsubscribe",
            post(series::unsubscribe_prompt).route_layer(axum_mw::from_fn_with_state(
                state.clone(),
                rate_limit_middleware,
            )),
        )
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            set_series_rls_context,
        ));

    let series_routes = Router::new()
        .route("/", get(series::list_series).post(series::create_series))
        .route("/{id}", patch(series::update_series))
        .route("/{id}/enroll", post(series::enroll))
        .route("/{id}/enrollments", get(series::list_enrollments))
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(state.clone(), set_rls_context))
        .merge(series_public_routes);

    // Anonymous SSO federation entry points (E-RBAC-6). No RLS context — the
    // start/callback flow provisions users/members on the app pool directly and
    // `resolve` is a public domain probe. Rate-limited like the auth routes.
    let sso_routes = Router::new()
        .route("/resolve", get(sso::resolve_sso))
        .route("/callback", get(sso::sso_callback))
        .route("/{org_slug}/start", get(sso::sso_start))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ))
        .layer(CatchPanicLayer::new());

    // Machine surface (E-RBAC-7). API-key authenticated (Authorization: Bearer
    // sk_...), scope-gated per route. The `set_api_key_context` middleware opens
    // an RLS tx bound to the key's creator and rate-limits by key id, so no
    // separate rate_limit layer is needed here.
    let machine_routes = Router::new()
        .route(
            "/questionnaires/{qid}/aggregate",
            get(api_keys::machine_aggregate),
        )
        .route(
            "/questionnaires/{qid}/export",
            get(api_keys::machine_export),
        )
        .route(
            "/organizations/{org}/members",
            post(api_keys::machine_add_member),
        )
        .layer(CatchPanicLayer::new())
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            set_api_key_context,
        ));

    // SCIM 2.0 provisioning (E-RBAC-7). Anonymous at the router layer — each
    // handler authenticates its per-org bearer token itself. Rate-limited like
    // the other machine/auth surfaces (keyed by peer IP for anonymous callers).
    let scim_routes = Router::new()
        .route("/Users", get(scim::list_users).post(scim::create_user))
        .route(
            "/Users/{id}",
            get(scim::get_user)
                .patch(scim::patch_user)
                .put(scim::replace_user)
                .delete(scim::delete_user),
        )
        .route(
            "/Groups",
            get(scim::list_groups).post(scim::groups_unsupported),
        )
        .route(
            "/Groups/{id}",
            get(scim::get_group)
                .patch(scim::groups_unsupported)
                .delete(scim::groups_unsupported),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            rate_limit_middleware,
        ))
        .layer(CatchPanicLayer::new());

    let ws_route = Router::new()
        .route("/ws", get(crate::websocket::handler::ws_upgrade))
        // Contain a panic in the synchronous upgrade handler as a 500.
        // (Panics inside the spawned socket task are already isolated by
        // tokio::spawn; this guards the pre-upgrade path.)
        .layer(CatchPanicLayer::new());

    let base = Router::new()
        .route("/health", get(health::health))
        .route("/ready", get(health::ready))
        .route("/openapi.json", get(crate::openapi::serve_openapi))
        .nest("/api/auth", auth_routes)
        .nest("/api/users", user_routes)
        .nest("/api/organizations", org_routes)
        .nest("/api/projects", project_routes)
        .nest("/api/invitations", invitation_routes)
        .nest("/api/project-invitations", project_invitation_routes)
        .nest("/api/questionnaires", questionnaire_routes)
        .nest("/api/sessions", session_routes)
        .nest("/api/series", series_routes)
        .nest("/api/media", media_routes)
        .nest("/api/sso", sso_routes)
        .nest("/api/v1", machine_routes)
        .nest("/scim/v2", scim_routes)
        .nest("/api", ws_route)
        .route(
            "/api/domains/auto-join",
            get(organizations::check_auto_join),
        );

    // Dev bootstrap helpers are compiled out of release builds entirely
    // (F012): `#[cfg(debug_assertions)]` removes the `/api/dev` nest from the
    // binary rather than gating it on a runtime env var that a release
    // deployment could accidentally flip on.
    #[cfg(debug_assertions)]
    let app = base.nest(
        "/api/dev",
        Router::new()
            .route("/bootstrap-personas", post(dev::bootstrap_personas))
            .layer(axum_mw::from_fn_with_state(
                state.clone(),
                rate_limit_middleware,
            )),
    );
    #[cfg(not(debug_assertions))]
    let app = base;

    app.with_state(state)
}
