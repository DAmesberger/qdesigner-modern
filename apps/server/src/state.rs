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
    /// Per-IP budget on anonymous session creation (`POST /api/sessions`).
    /// Deliberately generous (default 60/60s) — the auth-tuned `rate_limiter`
    /// would lock out a whole classroom starting a study behind one NAT.
    pub session_create_limiter: RateLimiter,
    /// Per-QUESTIONNAIRE budget on session creation (`qcreate:{qid}`, default
    /// 600/60s). Keyed on the study, not the caller, so a distributed flood
    /// cannot spray one questionnaire's `arm_counts` / participant numbering by
    /// rotating source IPs. Enforced inside `create_session` (the questionnaire
    /// id lives in the request body, not the URL).
    pub questionnaire_create_limiter: RateLimiter,
    /// Per-IP budget on the anonymous session-media upload route (default
    /// 120/60s). Complements the per-session file-count / total-bytes quota.
    pub session_media_limiter: RateLimiter,
    /// Per-IP budget on the anonymous client-error ingest route
    /// (`POST /api/client-errors`, default 30/60s). Its own bucket, never the
    /// auth limiter — a write-only crash-report sink open to fillout participants.
    pub client_error_limiter: RateLimiter,
    pub config: Arc<Config>,
}
