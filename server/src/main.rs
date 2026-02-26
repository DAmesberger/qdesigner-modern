use std::net::SocketAddr;
use std::sync::Arc;

use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

mod api;
mod auth;
mod config;
mod db;
mod error;
mod middleware;
mod rbac;
mod state;
mod storage;
mod websocket;

use crate::auth::jwt::JwtManager;
use crate::config::Config;
use crate::middleware::cors::cors_layer;
use crate::middleware::rate_limit::RateLimiter;
use crate::rbac::manager::RbacManager;
use crate::state::AppState;
use crate::storage::s3::S3StorageService;
use crate::websocket::manager::WebSocketState;

#[tokio::main]
async fn main() {
    // ── Logging ──────────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .init();

    // ── Configuration ────────────────────────────────────────────────
    let config = Config::from_env();
    tracing::info!(
        "Starting QDesigner server on {}:{}",
        config.server_host,
        config.server_port
    );

    // ── Database ─────────────────────────────────────────────────────
    let pool = db::connect(&config.database_url)
        .await
        .expect("Failed to connect to database");

    db::run_migrations(&pool)
        .await
        .expect("Failed to run migrations");

    // ── JWT ──────────────────────────────────────────────────────────
    let jwt_manager = JwtManager::new(
        &config.jwt_secret,
        &config.jwt_refresh_secret,
        config.jwt_access_expiry,
        config.jwt_refresh_expiry,
    );

    // ── RBAC ─────────────────────────────────────────────────────────
    let rbac = RbacManager::new(pool.clone());

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
    let rate_limiter = RateLimiter::new(200, 60); // 200 req / 60s

    // ── WebSocket ────────────────────────────────────────────────────
    let websocket_state = WebSocketState::new();

    // ── App State ────────────────────────────────────────────────────
    let state = AppState {
        pool,
        jwt_manager: Arc::new(jwt_manager),
        rbac: Arc::new(rbac),
        storage: Arc::new(storage),
        websocket_state: Arc::new(websocket_state),
        redis,
        rate_limiter,
        config: Arc::new(config.clone()),
    };

    // ── Router ───────────────────────────────────────────────────────
    let app = api::router(state)
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
    axum::serve(listener, app).await.expect("Server error");
}
