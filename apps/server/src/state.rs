use std::sync::Arc;

use sqlx::PgPool;

use crate::auth::jwt::JwtManager;
use crate::config::Config;
use crate::middleware::rate_limit::RateLimiter;
use crate::rbac::manager::RbacManager;
use crate::storage::s3::S3StorageService;
use crate::websocket::manager::WebSocketState;
use crate::websocket::yjs_store::YjsStore;

/// Shared application state — cheaply cloneable via `Arc`.
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_manager: Arc<JwtManager>,
    pub rbac: Arc<RbacManager>,
    pub storage: Arc<S3StorageService>,
    pub websocket_state: Arc<WebSocketState>,
    pub yjs_store: YjsStore,
    pub redis: Option<Arc<redis::Client>>,
    pub rate_limiter: RateLimiter,
    /// Per-email cap on verification-code sends (`authsend:{email}`).
    pub verify_send_limiter: RateLimiter,
    /// Per-email cap on verify-code attempts (`authverify:{email}`).
    pub verify_attempt_limiter: RateLimiter,
    /// Dedicated, more generous limiter for the machine (API-key) surface
    /// (`apikey:{id}`). Kept separate from `rate_limiter` so machine
    /// integrations get a higher budget without loosening the auth cap (F-30).
    pub api_key_rate_limiter: RateLimiter,
    pub config: Arc<Config>,
}
