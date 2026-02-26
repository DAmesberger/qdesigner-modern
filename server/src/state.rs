use std::sync::Arc;

use sqlx::PgPool;

use crate::auth::jwt::JwtManager;
use crate::config::Config;
use crate::middleware::rate_limit::RateLimiter;
use crate::rbac::manager::RbacManager;
use crate::storage::s3::S3StorageService;
use crate::websocket::manager::WebSocketState;

/// Shared application state — cheaply cloneable via `Arc`.
#[derive(Clone)]
#[allow(dead_code)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_manager: Arc<JwtManager>,
    pub rbac: Arc<RbacManager>,
    pub storage: Arc<S3StorageService>,
    pub websocket_state: Arc<WebSocketState>,
    pub redis: Option<Arc<redis::Client>>,
    pub rate_limiter: RateLimiter,
    pub config: Arc<Config>,
}
