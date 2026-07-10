use std::net::SocketAddr;
use std::sync::Arc;

use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use qdesigner_server::auth::jwt::JwtManager;
use qdesigner_server::config::Config;
use qdesigner_server::middleware::cors::cors_layer;
use qdesigner_server::middleware::csrf::csrf_middleware;
use qdesigner_server::middleware::rate_limit::RateLimiter;
use qdesigner_server::rbac::manager::RbacManager;
use qdesigner_server::state::AppState;
use qdesigner_server::storage::s3::S3StorageService;
use qdesigner_server::websocket::manager::WebSocketState;
use qdesigner_server::{api, auth, db, openapi, websocket};

#[tokio::main]
async fn main() {
    // ── Logging ──────────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();

    if let Some(path) = std::env::args()
        .skip(1)
        .find(|arg| arg != "--export-openapi")
    {
        if std::env::args().any(|arg| arg == "--export-openapi") {
            let doc = openapi::openapi();
            let payload =
                serde_json::to_string_pretty(&doc).expect("failed to serialize OpenAPI document");
            std::fs::write(&path, payload).expect("failed to write OpenAPI document");
            tracing::info!("Exported OpenAPI document to {}", path);
            return;
        }
    } else if std::env::args().any(|arg| arg == "--export-openapi") {
        let doc = openapi::openapi();
        let payload =
            serde_json::to_string_pretty(&doc).expect("failed to serialize OpenAPI document");
        println!("{payload}");
        return;
    }

    // ── Configuration ────────────────────────────────────────────────
    let config = Config::from_env();
    tracing::info!(
        "Starting QDesigner server on {}:{}",
        config.server_host,
        config.server_port
    );

    // ── Database ─────────────────────────────────────────────────────
    // P6.1: migrations run as the bootstrap superuser `qdesigner` if a
    // dedicated DSN is supplied (DATABASE_URL_MIGRATIONS); the app pool
    // then opens against `qdesigner_app` via DATABASE_URL. When the
    // migration DSN is unset, migrations run on the app pool — preserves
    // single-role setups (legacy and prod-without-the-split).
    if let Some(migration_url) = config.database_url_migrations.as_deref() {
        db::run_migrations_with_url(migration_url)
            .await
            .expect("Failed to run migrations (via DATABASE_URL_MIGRATIONS)");
    }

    let pool = db::connect(&config.database_url)
        .await
        .expect("Failed to connect to database");

    if config.database_url_migrations.is_none() {
        db::run_migrations(&pool)
            .await
            .expect("Failed to run migrations");
    }

    // Empirical probe (P6.1): log the role the app pool actually
    // connected as. The .env.development DATABASE_URL change is the only
    // thing flipping it; if the file isn't read, everything else looks
    // fine but the role hasn't changed.
    match sqlx::query_scalar::<_, String>("SELECT current_user")
        .fetch_one(&pool)
        .await
    {
        Ok(role) => tracing::info!(db_role = %role, "app pool connected as DB role"),
        Err(e) => tracing::warn!("could not probe current_user: {e}"),
    }

    // ── JWT ──────────────────────────────────────────────────────────
    let jwt_manager = JwtManager::new(
        &config.jwt_secret,
        &config.jwt_refresh_secret,
        config.jwt_access_expiry,
        config.jwt_refresh_expiry,
    );

    // ── RBAC ─────────────────────────────────────────────────────────
    let rbac = RbacManager::new();

    // ── S3 / MinIO ───────────────────────────────────────────────────
    let storage = S3StorageService::new(
        &config.minio_endpoint,
        &config.minio_access_key,
        &config.minio_secret_key,
        &config.minio_bucket,
    )
    .await
    .expect("Failed to initialise S3 storage");

    // ── Redis (optional) ─────────────────────────────────────────────
    let redis = if let Some(ref url) = config.redis_url {
        match redis::Client::open(url.as_str()) {
            Ok(client) => {
                tracing::info!("Redis connected");
                Some(Arc::new(client))
            }
            Err(e) => {
                tracing::warn!("Redis connection failed (continuing without): {e}");
                None
            }
        }
    } else {
        tracing::info!("Redis not configured — rate limiting uses in-memory store");
        None
    };

    // ── Rate Limiter ─────────────────────────────────────────────────
    // 10 req / 60s, Redis-backed when available (per-process in-memory fallback).
    let rate_limiter = RateLimiter::new(10, 60, redis.clone());
    // Per-email verification-code send cap (~3 / 15 min) and verify-attempt
    // limiter (~5 / 15 min). Both reuse the same Redis+in-memory RateLimiter so
    // the in-memory fallback still enforces per-process when Redis is down.
    let verify_send_limiter = RateLimiter::new(3, 900, redis.clone());
    let verify_attempt_limiter = RateLimiter::new(5, 900, redis.clone());
    // Dedicated, more generous bucket for the machine (API-key) surface (F-30):
    // the auth-tuned 10/60s is too tight for high-throughput integrations.
    // Env-tunable (API_KEY_RATE_LIMIT_MAX / API_KEY_RATE_LIMIT_WINDOW_SECS);
    // defaults to 300 req / 60s. Kept out of Config (read here) to stay surgical.
    let api_key_rate_max = std::env::var("API_KEY_RATE_LIMIT_MAX")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(300);
    let api_key_rate_window = std::env::var("API_KEY_RATE_LIMIT_WINDOW_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(60);
    let api_key_rate_limiter =
        RateLimiter::new(api_key_rate_max, api_key_rate_window, redis.clone());

    // ── WebSocket ────────────────────────────────────────────────────
    let mut websocket_state = WebSocketState::new();

    // ── Redis Bridge (optional) ──────────────────────────────────────
    if let Some(ref redis_client) = redis {
        let bridge = websocket::redis_bridge::RedisBridge::new(redis_client.clone());
        websocket_state.set_redis_bridge(bridge);
    }

    let websocket_state = Arc::new(websocket_state);

    // Start Redis bridge subscriber if configured.
    if let Some(ref redis_client) = redis {
        let bridge = websocket::redis_bridge::RedisBridge::new(redis_client.clone());
        bridge.start(websocket_state.clone());
    }

    // ── Yjs Store ────────────────────────────────────────────────────
    // Pool-backed: the store is the sole seeder of each collaborative document
    // (loads/persists the authoritative CRDT binary from `yjs_state`).
    let yjs_store = websocket::yjs_store::YjsStore::new(pool.clone());

    // ── Revoked-access-token purger ───────────────────────────────────
    // revoked_tokens entries only matter until the access token would have
    // expired anyway; without a purger this table grows unbounded and is
    // hit on every authenticated request.
    {
        let pool = pool.clone();
        let access_ttl = config.jwt_access_expiry;
        let session_retention = config.auth_session_retention;
        let security_event_retention = config.security_event_retention;
        tokio::spawn(async move {
            // Sweep daily; the per-row lookup stays cheap because expired
            // rows are deleted long before they accumulate.
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(24 * 60 * 60));
            loop {
                interval.tick().await;
                let ttl =
                    chrono::Duration::from_std(access_ttl).unwrap_or(chrono::Duration::hours(1));
                match auth::session::purge_expired_revoked_tokens(&pool, ttl).await {
                    Ok(deleted) if deleted > 0 => {
                        tracing::info!(deleted, "purged expired revoked_tokens");
                    }
                    Ok(_) => {}
                    Err(e) => tracing::warn!("revoked_tokens purge failed: {e}"),
                }
                match auth::session::purge_expired_auth_data(
                    &pool,
                    session_retention,
                    security_event_retention,
                )
                .await
                {
                    Ok((states, sessions, events)) if states > 0 || sessions > 0 || events > 0 => {
                        tracing::info!(
                            login_states = states,
                            sessions,
                            security_events = events,
                            "purged expired auth data"
                        );
                    }
                    Ok(_) => {}
                    Err(e) => tracing::warn!("auth data purge failed: {e}"),
                }
            }
        });
    }

    // ── App State ────────────────────────────────────────────────────
    let state = AppState {
        pool,
        jwt_manager: Arc::new(jwt_manager),
        rbac: Arc::new(rbac),
        storage: Arc::new(storage),
        websocket_state,
        yjs_store,
        redis,
        rate_limiter,
        verify_send_limiter,
        verify_attempt_limiter,
        api_key_rate_limiter,
        config: Arc::new(config.clone()),
    };

    // ── Series scheduler (E-FLOW-2) ───────────────────────────────────
    // Background tick that scans due longitudinal/EMA prompts, sends the
    // reminder via the SMTP path, and advances the scheduler cursor. Runs
    // for the process lifetime (fire-and-forget, like the revoked-token
    // purger above). Uses SECURITY DEFINER functions so the non-BYPASSRLS
    // app pool can still see the cross-tenant due set.
    qdesigner_server::series::spawn_scheduler(state.clone());

    // ── Expired-resource-share purger (F-31) ─────────────────────────
    // Hourly cleanup of lapsed `resource_shares` rows (already inert on reads,
    // but they accrete without this). Fire-and-forget, like the scheduler above.
    qdesigner_server::housekeeping::spawn_share_purge(state.clone());

    // ── Router ───────────────────────────────────────────────────────
    let app = api::router(state.clone())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            csrf_middleware,
        ))
        .layer(cors_layer(&config.cors_origins))
        .layer(TraceLayer::new_for_http());

    // ── Serve ────────────────────────────────────────────────────────
    let addr: SocketAddr = format!("{}:{}", config.server_host, config.server_port)
        .parse()
        .expect("Invalid server address");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    tracing::info!("Listening on {addr}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("Server error");
}
