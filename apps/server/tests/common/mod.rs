//! Shared test-DB bootstrap for the server integration tests (P3-T1,
//! resolves F072/F073/F078).
//!
//! Replaces the per-file copy-pasted `get_test_pool()` helpers with one
//! shared entry point that:
//!
//!  1. **Self-provisions migrations.** Before handing out any pool it runs
//!     `sqlx::migrate!("./migrations")` against the migration DSN, so
//!     `cargo test` works on a bare Postgres — a fresh local stack and a
//!     fresh CI service alike. Guarded by a process-local `OnceCell`;
//!     `sqlx::migrate!` also takes a DB advisory lock and cargo runs the
//!     integration-test binaries sequentially, so cross-binary races are
//!     safe (each binary re-runs the idempotent migrate at most once).
//!
//!  2. **Hard-fails instead of false-green skipping.** When the env var
//!     `REQUIRE_DB` is truthy (`1`/`true`/`yes`/`on`) and the DB is
//!     unreachable (or migrations fail), it panics with a clear message
//!     rather than returning `None` — eliminating the skip-that-looks-like
//!     -a-pass. When `REQUIRE_DB` is unset it preserves the old local
//!     behaviour: return `None` so the guard site skips cleanly.
//!
//!  3. **Exposes two entry points** mirroring the production role split
//!     (ADR 0014): [`fixture_pool`] prefers `DATABASE_URL_MIGRATIONS`
//!     (the `qdesigner` superuser — BYPASSRLS, for seeding RLS-bound
//!     fixture tables), [`app_pool`] uses `DATABASE_URL` (the
//!     non-BYPASSRLS `qdesigner_app` role — the production posture).
//!
//! `.env.development` discovery matches the P3.4a note in CLAUDE.md
//! (`CARGO_MANIFEST_DIR` is `apps/server`; the file lives two levels up).
//! Crucially it only fills a var that is **not already set** in the
//! process env, so an explicit `DATABASE_URL` / `DATABASE_URL_MIGRATIONS`
//! / `REQUIRE_DB` (as CI provides) wins over the committed dev file — the
//! old unconditional overwrite silently repointed CI at the dev host.

#![allow(dead_code)]

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tokio::sync::OnceCell;

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use tower::ServiceExt;

use qdesigner_server::api;
use qdesigner_server::auth::jwt::JwtManager;
use qdesigner_server::config::Config;
use qdesigner_server::middleware::csrf::csrf_middleware;
use qdesigner_server::middleware::rate_limit::RateLimiter;
use qdesigner_server::rbac::manager::RbacManager;
use qdesigner_server::state::AppState;
use qdesigner_server::storage::s3::S3StorageService;
use qdesigner_server::websocket::manager::WebSocketState;
use qdesigner_server::websocket::yjs_store::YjsStore;

static PROVISIONED: OnceCell<()> = OnceCell::const_new();

/// Set `key` to `val` only when it is not already present in the process
/// env, so caller/CI-provided values win over the committed dev file.
fn set_if_absent(key: &str, val: &str) {
    if std::env::var_os(key).is_none() {
        std::env::set_var(key, val);
    }
}

/// Load `DATABASE_URL` / `DATABASE_URL_MIGRATIONS` from the repo-root
/// `.env.development` into the process env (only for vars not already set).
fn load_env() {
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join(".env.development"));
    if let Some(path) = env_path.as_ref() {
        if path.exists() {
            if let Ok(contents) = std::fs::read_to_string(path) {
                for line in contents.lines() {
                    if let Some(val) = line.strip_prefix("DATABASE_URL_MIGRATIONS=") {
                        set_if_absent("DATABASE_URL_MIGRATIONS", val.trim());
                    } else if let Some(val) = line.strip_prefix("DATABASE_URL=") {
                        set_if_absent("DATABASE_URL", val.trim());
                    } else if let Some(val) = line.strip_prefix("MINIO_ENDPOINT=") {
                        set_if_absent("MINIO_ENDPOINT", val.trim());
                    } else if let Some(val) = line.strip_prefix("MINIO_ACCESS_KEY=") {
                        set_if_absent("MINIO_ACCESS_KEY", val.trim());
                    } else if let Some(val) = line.strip_prefix("MINIO_SECRET_KEY=") {
                        set_if_absent("MINIO_SECRET_KEY", val.trim());
                    } else if let Some(val) = line.strip_prefix("SMTP_HOST=") {
                        set_if_absent("SMTP_HOST", val.trim());
                    } else if let Some(val) = line.strip_prefix("SMTP_PORT=") {
                        set_if_absent("SMTP_PORT", val.trim());
                    }
                }
            }
        }
    }
}

/// True when `REQUIRE_DB` is set to a truthy value — flips unreachable-DB
/// from a silent skip into a hard panic (no false green). Public so the
/// storage/SMTP reachability gates in `storage_minio.rs` /
/// `http_media_email.rs` reuse the exact same semantics (P3-T3).
pub fn require_db() -> bool {
    std::env::var("REQUIRE_DB")
        .map(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

/// Run the migrations against the migration DSN exactly once per test
/// binary. Idempotent (sqlx tracks applied migrations + takes an advisory
/// lock). On failure: panic under `REQUIRE_DB`, otherwise return quietly.
async fn provision() {
    PROVISIONED
        .get_or_init(|| async {
            load_env();
            let url = std::env::var("DATABASE_URL_MIGRATIONS")
                .or_else(|_| std::env::var("DATABASE_URL"))
                .ok();
            let Some(url) = url else {
                if require_db() {
                    panic!(
                        "REQUIRE_DB set but neither DATABASE_URL_MIGRATIONS nor \
                         DATABASE_URL is set — cannot provision migrations"
                    );
                }
                return;
            };
            let pool = match PgPoolOptions::new().max_connections(1).connect(&url).await {
                Ok(p) => p,
                Err(e) => {
                    if require_db() {
                        panic!("REQUIRE_DB set but migration DSN unreachable: {e}");
                    }
                    return;
                }
            };
            if let Err(e) = sqlx::migrate!("./migrations").run(&pool).await {
                pool.close().await;
                if require_db() {
                    panic!("REQUIRE_DB set but migrations failed to apply: {e}");
                }
                return;
            }
            pool.close().await;
        })
        .await;
}

/// Superuser (`qdesigner`) pool for seeding RLS-bound fixture tables.
/// Prefers `DATABASE_URL_MIGRATIONS`, falls back to `DATABASE_URL`.
pub async fn fixture_pool() -> Option<PgPool> {
    provision().await;
    load_env();
    let url =
        match std::env::var("DATABASE_URL_MIGRATIONS").or_else(|_| std::env::var("DATABASE_URL")) {
            Ok(u) => u,
            Err(_) => {
                if require_db() {
                    panic!(
                        "REQUIRE_DB=1 but neither DATABASE_URL_MIGRATIONS nor \
                     DATABASE_URL is set"
                    );
                }
                return None;
            }
        };
    match PgPool::connect(&url).await {
        Ok(p) => Some(p),
        Err(e) => {
            if require_db() {
                panic!("REQUIRE_DB=1 but migration/fixture DSN unreachable: {e}");
            }
            None
        }
    }
}

/// Application-role (`qdesigner_app`, non-BYPASSRLS) pool — the production
/// posture. Uses `DATABASE_URL` only.
pub async fn app_pool() -> Option<PgPool> {
    provision().await;
    load_env();
    let url = match std::env::var("DATABASE_URL") {
        Ok(u) => u,
        Err(_) => {
            if require_db() {
                panic!("REQUIRE_DB=1 but DATABASE_URL (qdesigner_app) is not set");
            }
            return None;
        }
    };
    match PgPool::connect(&url).await {
        Ok(p) => Some(p),
        Err(e) => {
            if require_db() {
                panic!("REQUIRE_DB=1 but app (qdesigner_app) DSN unreachable: {e}");
            }
            None
        }
    }
}

// ── HTTP handler harness (P3-T2, F074) ───────────────────────────────
//
// Builds a real `AppState` + `api::router` wrapped with the same
// `csrf_middleware` layer `main.rs` applies, then drives it via
// `tower::ServiceExt::oneshot` (no TCP socket). Users/tenants are
// provisioned THROUGH the API in each test, so the harness exercises the
// full extractor → middleware → handler → RLS-tx stack end to end.
//
// Storage uses `S3StorageService::new_unchecked` so only Postgres needs
// to be up. `RateLimiter` is deliberately created with a very high cap so
// the production 10/60s auth limiter can't flake these tests.

/// MinIO connection params from the process env, with the same
/// `.env.development` fallback the DB pools use (P3-T3). Defaults match the
/// dev stack so a bare `cargo test` on the local compose stack works.
pub fn minio_params() -> (String, String, String) {
    load_env();
    let endpoint =
        std::env::var("MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:19003".into());
    let access = std::env::var("MINIO_ACCESS_KEY").unwrap_or_else(|_| "minioadmin".into());
    let secret = std::env::var("MINIO_SECRET_KEY").unwrap_or_else(|_| "minioadmin".into());
    (endpoint, access, secret)
}

/// SMTP host/port from the process env (`.env.development` fallback). The
/// dev stack's MailPit listens on `localhost:11026`; CI overrides via
/// `SMTP_HOST`/`SMTP_PORT`.
pub fn smtp_params() -> (String, u16) {
    load_env();
    let host = std::env::var("SMTP_HOST").unwrap_or_else(|_| "localhost".into());
    let port = std::env::var("SMTP_PORT")
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(11026);
    (host, port)
}

/// MailPit HTTP API base URL for the message-arrival probe. Not carried in
/// `.env.development`; defaults to the dev stack's web UI/API port (18026).
pub fn mailpit_http() -> String {
    std::env::var("MAILPIT_HTTP").unwrap_or_else(|_| "http://localhost:18026".into())
}

/// Construct a test `AppState` around an already-built storage service and
/// env-sourced MinIO/SMTP config. Shared by [`build_test_state`] (storage
/// stubbed with `new_unchecked`) and [`build_media_test_state`] (real
/// `S3StorageService::new`). Returns `None` when no DB is reachable.
async fn build_state_with_storage(storage: Arc<S3StorageService>) -> Option<AppState> {
    let pool = app_pool().await?;

    let jwt_manager = JwtManager::new(
        "test-secret-32-chars-minimum-padding-padding",
        "test-refresh-secret-32-chars-minimum-pad",
        Duration::from_secs(900),
        Duration::from_secs(604_800),
    );

    let (minio_endpoint, minio_access_key, minio_secret_key) = minio_params();
    let (smtp_host, smtp_port) = smtp_params();

    // Config built as a struct literal — `Config::from_env` env_requires the
    // JWT secrets and would panic in-harness (see P3-T2 WATCH). SMTP/MinIO
    // fields are sourced from env so the email path targets the running
    // MailPit (dev 11026 / CI 1025) rather than a hardcoded port.
    let config = Config {
        database_url: std::env::var("DATABASE_URL").unwrap_or_default(),
        database_url_migrations: std::env::var("DATABASE_URL_MIGRATIONS").ok(),
        jwt_secret: "test-secret-32-chars-minimum-padding-padding".into(),
        jwt_refresh_secret: "test-refresh-secret-32-chars-minimum-pad".into(),
        jwt_access_expiry: Duration::from_secs(900),
        jwt_refresh_expiry: Duration::from_secs(604_800),
        minio_endpoint,
        minio_access_key,
        minio_secret_key,
        minio_bucket: "qdesigner-test".into(),
        redis_url: None,
        smtp_host,
        smtp_port,
        smtp_from: "noreply@qdesigner.local".into(),
        cors_origins: vec!["http://localhost:4173".into()],
        public_app_origin: "http://localhost:4173".into(),
        server_host: "127.0.0.1".into(),
        server_port: 4100,
        sso_encryption_key: None,
        cookie_secure: false,
    };

    Some(AppState {
        pool,
        jwt_manager: Arc::new(jwt_manager),
        rbac: Arc::new(RbacManager::new()),
        storage,
        websocket_state: Arc::new(WebSocketState::new()),
        yjs_store: YjsStore::new(),
        redis: None,
        rate_limiter: RateLimiter::new(10_000, 60, None),
        verify_send_limiter: RateLimiter::new(10_000, 60, None),
        verify_attempt_limiter: RateLimiter::new(10_000, 60, None),
        config: Arc::new(config),
    })
}

/// Construct a test `AppState` bound to the app-role (`qdesigner_app`)
/// pool — the production posture. Storage is stubbed with
/// `S3StorageService::new_unchecked` so only Postgres needs to be up.
/// Returns `None` when no DB is reachable (mirrors the `app_pool` skip
/// contract; panics under `REQUIRE_DB`).
pub async fn build_test_state() -> Option<AppState> {
    let (endpoint, access, secret) = minio_params();
    let storage = Arc::new(S3StorageService::new_unchecked(
        &endpoint,
        &access,
        &secret,
        "qdesigner-test",
    ));
    build_state_with_storage(storage).await
}

/// Construct a test `AppState` whose storage is a REAL
/// [`S3StorageService::new`] against the env-configured MinIO and the given
/// `bucket` (its create-if-missing path is exercised on first use). Used by
/// the media-proxy round-trip test so `POST /api/media` → `GET
/// /api/media/{id}/content` streams through actual object storage.
///
/// On unreachable MinIO applies the shared gate: panic under `REQUIRE_DB`,
/// otherwise return `None` (skip). Also returns `None` when no DB is up.
pub async fn build_media_test_state(bucket: &str) -> Option<AppState> {
    let (endpoint, access, secret) = minio_params();
    let storage = match S3StorageService::new(&endpoint, &access, &secret, bucket).await {
        Ok(s) => Arc::new(s),
        Err(e) => {
            if require_db() {
                panic!("REQUIRE_DB=1 but MinIO unreachable at {endpoint}: {e}");
            }
            return None;
        }
    };
    build_state_with_storage(storage).await
}

/// Wrap `api::router(state)` with the outermost `csrf_middleware` layer,
/// mirroring `main.rs`. The CORS/Trace layers are intentionally omitted —
/// they are not under test here.
pub fn test_app(state: AppState) -> Router {
    api::router(state).layer(axum::middleware::from_fn(csrf_middleware))
}

/// Build a JSON request. Always sets `X-Requested-With: XMLHttpRequest`
/// (so the CSRF layer admits state-changing methods); adds a Bearer token
/// and/or a JSON body when supplied.
pub fn json_req(
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<&serde_json::Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("x-requested-with", "XMLHttpRequest");
    if let Some(t) = token {
        builder = builder.header("authorization", format!("Bearer {t}"));
    }
    let body = match body {
        Some(v) => {
            builder = builder.header("content-type", "application/json");
            Body::from(serde_json::to_vec(v).expect("serialize request body"))
        }
        None => Body::empty(),
    };
    builder.body(body).expect("build request")
}

/// Drive a fully-built request through the router and return
/// `(status, headers, json)`. An empty or non-JSON body decodes to
/// `Value::Null`.
pub async fn send_full(
    app: &Router,
    req: Request<Body>,
) -> (StatusCode, HeaderMap, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(req)
        .await
        .expect("router oneshot should not error");
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes();
    let value = if bytes.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null)
    };
    (status, headers, value)
}

/// Drive a request and return `(status, headers, raw body bytes)` — for
/// binary responses (e.g. the media streaming proxy) where the body is not
/// JSON and must be compared byte-for-byte.
pub async fn send_raw(app: &Router, req: Request<Body>) -> (StatusCode, HeaderMap, Vec<u8>) {
    let response = app
        .clone()
        .oneshot(req)
        .await
        .expect("router oneshot should not error");
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("collect response body")
        .to_bytes()
        .to_vec();
    (status, headers, bytes)
}

/// Convenience wrapper around [`send_full`] that drops the headers.
pub async fn send(app: &Router, req: Request<Body>) -> (StatusCode, serde_json::Value) {
    let (status, _headers, value) = send_full(app, req).await;
    (status, value)
}

/// Build + drive a JSON request in one call.
pub async fn json_request(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<&serde_json::Value>,
) -> (StatusCode, serde_json::Value) {
    send(app, json_req(method, uri, token, body)).await
}

/// Extract a single cookie value from a response's `Set-Cookie` headers.
/// Returns the raw value (before the first `;`).
pub fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    for value in headers.get_all("set-cookie").iter() {
        let s = value.to_str().ok()?;
        if let Some(rest) = s.strip_prefix(&prefix) {
            let val = rest.split(';').next().unwrap_or("").to_string();
            return Some(val);
        }
    }
    None
}

/// A user provisioned through the API: id, access token, and email.
pub struct TestUser {
    pub id: uuid::Uuid,
    pub token: String,
    pub email: String,
}

/// Register a fresh user through `POST /api/auth/register`. Uses a unique
/// email so repeated test runs don't collide on the users unique index.
pub async fn register_user(app: &Router) -> TestUser {
    let email = format!("p3t2-{}@example.test", uuid::Uuid::new_v4());
    let body = serde_json::json!({
        "email": email,
        "password": "demo123456",
        "full_name": "P3T2 User",
    });
    let (status, json) = json_request(app, "POST", "/api/auth/register", None, Some(&body)).await;
    assert_eq!(status, StatusCode::OK, "register should succeed: {json:?}");
    let token = json["access_token"]
        .as_str()
        .expect("access_token in register response")
        .to_string();
    let id = json["user"]["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("user.id in register response");
    TestUser { id, token, email }
}

/// A tenant owned by one user, provisioned through the API: an org (the
/// user is `owner`), one project under it, and one (draft) questionnaire.
pub struct TestTenant {
    pub org_id: uuid::Uuid,
    pub project_id: uuid::Uuid,
    pub questionnaire_id: uuid::Uuid,
}

/// Create org → project → questionnaire under `token`'s user via the real
/// API handlers. The questionnaire is left in `draft` status; callers that
/// need a public fillout target publish it explicitly.
pub async fn provision_tenant(app: &Router, token: &str) -> TestTenant {
    let suffix = &uuid::Uuid::new_v4().to_string()[..8];

    let org_body = serde_json::json!({ "name": format!("Org {suffix}") });
    let (status, org) = json_request(
        app,
        "POST",
        "/api/organizations",
        Some(token),
        Some(&org_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create org: {org:?}");
    let org_id = org["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("org id");

    let project_body = serde_json::json!({
        "organization_id": org_id,
        "name": format!("Project {suffix}"),
        "code": format!("PC{suffix}"),
    });
    let (status, project) = json_request(
        app,
        "POST",
        "/api/projects",
        Some(token),
        Some(&project_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create project: {project:?}");
    let project_id = project["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("project id");

    let q_body = serde_json::json!({ "name": format!("Questionnaire {suffix}") });
    let (status, q) = json_request(
        app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaires"),
        Some(token),
        Some(&q_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create questionnaire: {q:?}");
    let questionnaire_id = q["id"]
        .as_str()
        .and_then(|s| uuid::Uuid::parse_str(s).ok())
        .expect("questionnaire id");

    TestTenant {
        org_id,
        project_id,
        questionnaire_id,
    }
}
