use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthProvider {
    Local,
    Zitadel,
}

impl AuthProvider {
    fn from_env_value(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "local" => Self::Local,
            "zitadel" => Self::Zitadel,
            other => panic!("AUTH_PROVIDER must be 'local' or 'zitadel', got '{other}'"),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Zitadel => "zitadel",
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Config {
    // Database
    pub database_url: String,
    // Optional separate DSN for migrations (P6.1: app connects as
    // qdesigner_app, migrations continue as qdesigner). Falls back to
    // `database_url` when unset so single-role deployments keep working.
    pub database_url_migrations: Option<String>,

    // JWT
    pub jwt_secret: String,
    pub jwt_refresh_secret: String,
    pub jwt_access_expiry: Duration,
    pub jwt_refresh_expiry: Duration,

    // S3 / MinIO
    pub minio_endpoint: String,
    pub minio_access_key: String,
    pub minio_secret_key: String,
    pub minio_bucket: String,

    // Redis (optional)
    pub redis_url: Option<String>,

    // SMTP
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_from: String,

    // CORS
    pub cors_origins: Vec<String>,

    // Public origin of the participant-facing SvelteKit app, used to build
    // absolute links in outbound email (e.g. the E-FLOW-2 series resume
    // link `{public_app_origin}/q/{code}?token=…`). Defaults to the first
    // CORS origin (the app origin) when `PUBLIC_APP_ORIGIN` is unset.
    pub public_app_origin: String,

    // Server
    pub server_host: String,
    pub server_port: u16,

    // Auth provider. Shared/production deployments must use Zitadel; local
    // email/password login is kept only for local development and tests.
    pub auth_provider: AuthProvider,
    pub auth_token_enc_key: String,
    pub auth_session_idle_expiry: Duration,
    pub auth_session_absolute_expiry: Duration,
    pub auth_session_retention: Duration,
    pub security_event_retention: Duration,
    pub auth_ip_hash_key: String,

    // Primary Zitadel/OIDC configuration.
    pub zitadel_issuer: Option<String>,
    pub zitadel_client_id: Option<String>,
    pub zitadel_client_secret: Option<String>,
    pub zitadel_redirect_uri: Option<String>,
    pub zitadel_post_logout_redirect_uri: Option<String>,
    pub zitadel_include_profile_scope: bool,
    pub zitadel_allow_sms_email_mfa: bool,

    // Symmetric key used to encrypt per-org IdP `client_secret`s at rest
    // (E-RBAC-6). When unset it falls back to `jwt_secret` at the call site, so
    // dev/test never need a separate secret; production should set a dedicated
    // `SSO_ENCRYPTION_KEY`. Only ever consumed through
    // [`Config::sso_encryption_key`], which applies the fallback.
    pub sso_encryption_key: Option<String>,

    /// Hosts the SSO/OIDC path may reach over plain `http` and at a non-public
    /// address (`SSO_ALLOWED_INSECURE_HOSTS`, comma-separated). **Empty by
    /// default** — the production posture is https-to-the-public-internet only.
    ///
    /// This exists because a local Zitadel (`http://localhost:8080`) and the
    /// test suite's in-process IdP are indistinguishable, at the network layer,
    /// from the SSRF targets the guard is there to stop (Postgres on 15434,
    /// Redis on 16381, MinIO on 19003, cloud metadata on 169.254.169.254). So
    /// the exemption is written down by an operator rather than inferred, and it
    /// is an exact host match: allowing `localhost` allows nothing else.
    ///
    /// See [`auth::ssrf`](crate::auth::ssrf) for what it exempts a host from.
    pub sso_allowed_insecure_hosts: Vec<String>,

    // Whether the refresh_token cookie carries the `Secure` attribute. Defaults
    // to true (production posture). Browsers accept Secure cookies over
    // http://localhost, so the default is fine for the standard dev setup; set
    // COOKIE_SECURE=false only for non-localhost plain-http dev where the
    // browser would otherwise drop the cookie.
    pub cookie_secure: bool,

    /// Number of TRUSTED reverse proxies sitting between the internet and this
    /// server (`TRUSTED_PROXY_HOPS`). Governs how the rate limiter derives a
    /// client IP.
    ///
    /// - **Unset / 0 (default)** — the socket peer IP (`ConnectInfo`) is the
    ///   bucket key and `X-Forwarded-For` is **ignored entirely**. A
    ///   directly-exposed deployment therefore cannot be spoofed out of its
    ///   bucket by a forged header.
    /// - **`N` ≥ 1** — the client IP is taken from the `X-Forwarded-For` chain
    ///   **counting from the right** (the trusted end): the `N`-th entry from
    ///   the right, i.e. `chain[len - N]`. Each trusted proxy appends the peer
    ///   it received the request from, so the rightmost `N` entries were
    ///   written by our own infrastructure and the entry just left of them is
    ///   the address the outermost trusted proxy actually saw. Anything further
    ///   left is client-supplied and untrustworthy — a client can freely
    ///   PREPEND fake entries, which shifts the chain left but cannot move the
    ///   right-counted index. Left-counting (`chain[0]`) would hand the client
    ///   direct control of its own bucket key.
    ///
    /// A chain shorter than `N` (or an unparseable entry at the counted index)
    /// means the request did not traverse the configured proxies; the limiter
    /// falls back to the socket peer IP rather than trusting client input.
    pub trusted_proxy_hops: Option<usize>,

    /// Per-IP budget on anonymous session creation (`POST /api/sessions`).
    /// Default 60 req / 60 s — comfortably above a whole classroom starting a
    /// study together behind one NAT, far below a flood.
    /// `SESSION_CREATE_RATE_LIMIT_MAX` / `SESSION_CREATE_RATE_LIMIT_WINDOW_SECS`.
    pub session_create_rate_max: u64,
    pub session_create_rate_window_secs: i64,

    /// Per-QUESTIONNAIRE budget on session creation (`qcreate:{qid}`). A
    /// distributed flood spread over many IPs would slip past the per-IP budget
    /// while still inflating that study's `arm_counts` / participant numbering,
    /// so the study itself carries a creation-rate ceiling. Default 600 req /
    /// 60 s — 10 starts/second on a single questionnaire, an order of magnitude
    /// above the largest realistic simultaneous cohort.
    /// `QUESTIONNAIRE_CREATE_RATE_LIMIT_MAX` / `..._WINDOW_SECS`.
    pub questionnaire_create_rate_max: u64,
    pub questionnaire_create_rate_window_secs: i64,

    /// Per-IP budget on the anonymous session-media upload route
    /// (`POST /api/sessions/{id}/media`). Default 120 req / 60 s — twice the
    /// session-create budget because one session may answer several
    /// file-upload questions.
    /// `SESSION_MEDIA_RATE_LIMIT_MAX` / `SESSION_MEDIA_RATE_LIMIT_WINDOW_SECS`.
    pub session_media_rate_max: u64,
    pub session_media_rate_window_secs: i64,

    /// Per-SESSION storage quota on anonymous session-media uploads: a file
    /// COUNT and a total BYTES budget, both enforced server-side before the S3
    /// write. Defaults: 20 files / 100 MiB — a questionnaire with a couple of
    /// dozen file-answer questions still fits, while a single session can no
    /// longer push unbounded 25 MiB blobs into object storage.
    /// `SESSION_MEDIA_MAX_FILES` / `SESSION_MEDIA_MAX_TOTAL_BYTES`.
    pub session_media_max_files: i64,
    pub session_media_max_total_bytes: i64,
}

impl Config {
    pub fn from_env() -> Self {
        // Load env files in priority order (first-set wins, later files don't override)
        dotenvy::dotenv().ok(); // server/.env (local override)
        dotenvy::from_filename("../.env.development").ok(); // root .env.development
        dotenvy::from_filename("../.env").ok(); // root .env (legacy fallback)

        let app_host = env_or("APP_HOST", "localhost");
        let app_port: u16 = std::env::var("APP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(4173);
        let default_app_origin = format!("http://{}:{}", app_host, app_port);
        let public_app_origin =
            std::env::var("PUBLIC_APP_ORIGIN").unwrap_or_else(|_| default_app_origin.clone());

        // CORS origins double as the app-origin source for invite/SSO links.
        // A production-like deployment MUST configure them; otherwise those
        // absolute links would silently point at the localhost dev fallback.
        let cors_origins_raw = std::env::var("CORS_ORIGINS")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
        if let Err(msg) =
            require_cors_in_production(is_production_like(), cors_origins_raw.as_deref())
        {
            panic!("{msg}");
        }
        let cors_origins: Vec<String> = cors_origins_raw
            .unwrap_or_else(|| default_app_origin.clone())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let jwt_access_expiry_secs: u64 = std::env::var("JWT_ACCESS_EXPIRY_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(900); // 15 minutes

        let jwt_refresh_expiry_secs: u64 = std::env::var("JWT_REFRESH_EXPIRY_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(604800); // 7 days
        let auth_session_idle_secs: u64 = std::env::var("AUTH_SESSION_IDLE_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8 * 60 * 60);
        let auth_session_absolute_secs: u64 = std::env::var("AUTH_SESSION_ABSOLUTE_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(7 * 24 * 60 * 60);
        let auth_session_retention_secs: u64 = std::env::var("AUTH_SESSION_RETENTION_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30 * 24 * 60 * 60);
        let security_event_retention_secs: u64 = std::env::var("SECURITY_EVENT_RETENTION_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(365 * 24 * 60 * 60);
        let auth_provider = AuthProvider::from_env_value(
            &std::env::var("AUTH_PROVIDER").unwrap_or_else(|_| "local".into()),
        );
        let auth_token_enc_key = std::env::var("AUTH_TOKEN_ENC_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| {
                if auth_provider == AuthProvider::Zitadel {
                    panic!("AUTH_TOKEN_ENC_KEY environment variable is required for Zitadel auth")
                }
                env_or("JWT_SECRET", "dev-only-auth-token-encryption-key")
            });
        let auth_ip_hash_key = std::env::var("AUTH_IP_HASH_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| auth_token_enc_key.clone());
        guard_auth_provider(auth_provider);

        let zitadel_issuer = std::env::var("ZITADEL_ISSUER")
            .ok()
            .map(|v| v.trim_end_matches('/').to_string())
            .filter(|v| !v.is_empty());
        let zitadel_client_id = std::env::var("ZITADEL_CLIENT_ID")
            .ok()
            .filter(|v| !v.trim().is_empty());
        let zitadel_client_secret = std::env::var("ZITADEL_CLIENT_SECRET")
            .ok()
            .filter(|v| !v.trim().is_empty());
        let zitadel_redirect_uri = std::env::var("ZITADEL_REDIRECT_URI")
            .ok()
            .filter(|v| !v.trim().is_empty());
        if auth_provider == AuthProvider::Zitadel
            && (zitadel_issuer.is_none()
                || zitadel_client_id.is_none()
                || zitadel_redirect_uri.is_none())
        {
            panic!(
                "ZITADEL_ISSUER, ZITADEL_CLIENT_ID, and ZITADEL_REDIRECT_URI are required when AUTH_PROVIDER=zitadel"
            );
        }

        Self {
            database_url: env_required("DATABASE_URL"),
            database_url_migrations: std::env::var("DATABASE_URL_MIGRATIONS").ok(),
            jwt_secret: env_required("JWT_SECRET"),
            jwt_refresh_secret: env_required("JWT_REFRESH_SECRET"),
            jwt_access_expiry: Duration::from_secs(jwt_access_expiry_secs),
            jwt_refresh_expiry: Duration::from_secs(jwt_refresh_expiry_secs),
            minio_endpoint: env_or("MINIO_ENDPOINT", "http://localhost:9000"),
            minio_access_key: env_or("MINIO_ACCESS_KEY", "minioadmin"),
            minio_secret_key: env_or("MINIO_SECRET_KEY", "minioadmin"),
            minio_bucket: env_or("MINIO_BUCKET", "qdesigner-media"),
            redis_url: std::env::var("REDIS_URL").ok(),
            smtp_host: env_or("SMTP_HOST", "localhost"),
            smtp_port: std::env::var("SMTP_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1025),
            smtp_from: env_or("SMTP_FROM", "noreply@qdesigner.local"),
            cors_origins,
            public_app_origin,
            server_host: env_or("SERVER_HOST", "0.0.0.0"),
            server_port: std::env::var("SERVER_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4100),
            auth_provider,
            auth_token_enc_key,
            auth_session_idle_expiry: Duration::from_secs(auth_session_idle_secs),
            auth_session_absolute_expiry: Duration::from_secs(auth_session_absolute_secs),
            auth_session_retention: Duration::from_secs(auth_session_retention_secs),
            security_event_retention: Duration::from_secs(security_event_retention_secs),
            auth_ip_hash_key,
            zitadel_issuer,
            zitadel_client_id,
            zitadel_client_secret,
            zitadel_redirect_uri,
            zitadel_post_logout_redirect_uri: std::env::var("ZITADEL_POST_LOGOUT_REDIRECT_URI")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            zitadel_include_profile_scope: env_flag("ZITADEL_INCLUDE_PROFILE_SCOPE", false),
            zitadel_allow_sms_email_mfa: env_flag("ZITADEL_ALLOW_SMS_EMAIL_MFA", false),
            sso_encryption_key: std::env::var("SSO_ENCRYPTION_KEY")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            sso_allowed_insecure_hosts: std::env::var("SSO_ALLOWED_INSECURE_HOSTS")
                .unwrap_or_default()
                .split(',')
                .map(|h| h.trim().to_string())
                .filter(|h| !h.is_empty())
                .collect(),
            cookie_secure: std::env::var("COOKIE_SECURE")
                .ok()
                .map(|v| !matches!(v.trim().to_ascii_lowercase().as_str(), "false" | "0" | "no"))
                .unwrap_or(true),
            // 0 is spelled the same as "absent": no trusted proxy → socket IP.
            trusted_proxy_hops: env_parse::<usize>("TRUSTED_PROXY_HOPS").filter(|&n| n > 0),
            session_create_rate_max: env_parse("SESSION_CREATE_RATE_LIMIT_MAX").unwrap_or(60),
            session_create_rate_window_secs: env_parse("SESSION_CREATE_RATE_LIMIT_WINDOW_SECS")
                .unwrap_or(60),
            questionnaire_create_rate_max: env_parse("QUESTIONNAIRE_CREATE_RATE_LIMIT_MAX")
                .unwrap_or(600),
            questionnaire_create_rate_window_secs: env_parse(
                "QUESTIONNAIRE_CREATE_RATE_LIMIT_WINDOW_SECS",
            )
            .unwrap_or(60),
            session_media_rate_max: env_parse("SESSION_MEDIA_RATE_LIMIT_MAX").unwrap_or(120),
            session_media_rate_window_secs: env_parse("SESSION_MEDIA_RATE_LIMIT_WINDOW_SECS")
                .unwrap_or(60),
            session_media_max_files: env_parse("SESSION_MEDIA_MAX_FILES").unwrap_or(20),
            session_media_max_total_bytes: env_parse("SESSION_MEDIA_MAX_TOTAL_BYTES")
                .unwrap_or(100 * 1024 * 1024),
        }
    }

    /// Resolve the effective SSO-secret encryption key, falling back to the
    /// JWT signing secret when no dedicated `SSO_ENCRYPTION_KEY` is set. The
    /// raw string is hashed to a 32-byte AES-256 key by
    /// [`crate::api::sso::crypto`], so any length is acceptable.
    pub fn sso_encryption_key(&self) -> &str {
        self.sso_encryption_key
            .as_deref()
            .unwrap_or(&self.jwt_secret)
    }

    /// The app (SPA) origin used to build absolute links in outbound email
    /// (org invitations) and SSO callback bounce-backs — the first configured
    /// CORS origin with any trailing slash trimmed. In production-like
    /// environments [`Config::from_env`] fails loud when `CORS_ORIGINS` is
    /// unset, so this is always the operator-configured origin there, never the
    /// localhost dev fallback.
    pub fn app_origin(&self) -> &str {
        resolve_app_origin(&self.cors_origins)
    }
}

fn env_required(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("{key} environment variable is required"))
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// Parse an env var into `T`, yielding `None` when unset, blank, or malformed
/// (callers supply the default). Mirrors the `.ok().and_then(|v| v.parse().ok())`
/// idiom already used for the numeric expiries.
fn env_parse<T: std::str::FromStr>(key: &str) -> Option<T> {
    std::env::var(key)
        .ok()
        .and_then(|v| v.trim().parse::<T>().ok())
}

fn env_flag(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(default)
}

/// True when an env var signals a production-like deployment. Shared by the
/// auth-provider guard and the CORS/app-origin guard so both fail loud under
/// the same convention: `APP_ENV`/`RUST_ENV`/`NODE_ENV`/`ENVIRONMENT` set to
/// `prod`/`production`/`staging`/`shared`.
fn is_production_like() -> bool {
    ["APP_ENV", "RUST_ENV", "NODE_ENV", "ENVIRONMENT"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .any(|v| {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "prod" | "production" | "staging" | "shared"
            )
        })
}

/// Enforce that a production-like deployment configures `CORS_ORIGINS` (the
/// sole source of the app origin used for invite/SSO links). Pure so it can be
/// unit tested without mutating process env; returns the fail-loud message on
/// violation.
fn require_cors_in_production(
    production_like: bool,
    cors_origins_raw: Option<&str>,
) -> Result<(), String> {
    let has_origin = cors_origins_raw
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    if production_like && !has_origin {
        return Err("CORS_ORIGINS is required in production-like environments \
             (APP_ENV/RUST_ENV/NODE_ENV/ENVIRONMENT set to prod/production/staging/shared). \
             It is the sole source of the app origin used to build invitation and SSO \
             callback links; without it those links would point at the http://localhost:4173 \
             dev fallback."
            .into());
    }
    Ok(())
}

/// Resolve the app (SPA) origin: the first configured CORS origin with any
/// trailing slash trimmed. Pure sibling of [`Config::app_origin`].
fn resolve_app_origin(cors_origins: &[String]) -> &str {
    cors_origins
        .first()
        .map(|s| s.trim_end_matches('/'))
        .unwrap_or("http://localhost:4173")
}

fn guard_auth_provider(provider: AuthProvider) {
    if provider != AuthProvider::Local {
        return;
    }
    if is_production_like() {
        panic!("AUTH_PROVIDER=local is not allowed in production-like environments");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_cors_in_production_rejects_missing_origin() {
        assert!(require_cors_in_production(true, None).is_err());
        assert!(require_cors_in_production(true, Some("")).is_err());
        assert!(require_cors_in_production(true, Some("   ")).is_err());
    }

    #[test]
    fn require_cors_in_production_accepts_configured_origin() {
        assert!(require_cors_in_production(true, Some("https://app.example.com")).is_ok());
    }

    #[test]
    fn require_cors_in_production_allows_dev_fallback() {
        // Non-prod environments keep the localhost fallback (no origin required).
        assert!(require_cors_in_production(false, None).is_ok());
        assert!(require_cors_in_production(false, Some("")).is_ok());
    }

    #[test]
    fn resolve_app_origin_trims_trailing_slash() {
        let origins = vec!["https://app.example.com/".to_string()];
        assert_eq!(resolve_app_origin(&origins), "https://app.example.com");
    }

    #[test]
    fn resolve_app_origin_uses_first_origin() {
        let origins = vec![
            "https://app.example.com".to_string(),
            "https://admin.example.com".to_string(),
        ];
        assert_eq!(resolve_app_origin(&origins), "https://app.example.com");
    }

    #[test]
    fn resolve_app_origin_falls_back_when_empty() {
        assert_eq!(resolve_app_origin(&[]), "http://localhost:4173");
    }
}
