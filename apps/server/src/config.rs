use std::time::Duration;

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

    // Symmetric key used to encrypt per-org IdP `client_secret`s at rest
    // (E-RBAC-6). When unset it falls back to `jwt_secret` at the call site, so
    // dev/test never need a separate secret; production should set a dedicated
    // `SSO_ENCRYPTION_KEY`. Only ever consumed through
    // [`Config::sso_encryption_key`], which applies the fallback.
    pub sso_encryption_key: Option<String>,

    // Whether the refresh_token cookie carries the `Secure` attribute. Defaults
    // to true (production posture). Browsers accept Secure cookies over
    // http://localhost, so the default is fine for the standard dev setup; set
    // COOKIE_SECURE=false only for non-localhost plain-http dev where the
    // browser would otherwise drop the cookie.
    pub cookie_secure: bool,
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

        let jwt_access_expiry_secs: u64 = std::env::var("JWT_ACCESS_EXPIRY_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(900); // 15 minutes

        let jwt_refresh_expiry_secs: u64 = std::env::var("JWT_REFRESH_EXPIRY_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(604800); // 7 days

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
            cors_origins: std::env::var("CORS_ORIGINS")
                .unwrap_or(default_app_origin)
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            public_app_origin,
            server_host: env_or("SERVER_HOST", "0.0.0.0"),
            server_port: std::env::var("SERVER_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4100),
            sso_encryption_key: std::env::var("SSO_ENCRYPTION_KEY")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            cookie_secure: std::env::var("COOKIE_SECURE")
                .ok()
                .map(|v| !matches!(v.trim().to_ascii_lowercase().as_str(), "false" | "0" | "no"))
                .unwrap_or(true),
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
}

fn env_required(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("{key} environment variable is required"))
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
