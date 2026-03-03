use std::time::Duration;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Config {
    // Database
    pub database_url: String,

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

    // Server
    pub server_host: String,
    pub server_port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        // Try .env in current dir first, then parent (for monorepo layout)
        if dotenvy::dotenv().is_err() {
            dotenvy::from_filename("../.env.development").ok();
        }

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
            jwt_secret: env_required("JWT_SECRET"),
            jwt_refresh_secret: env_or("JWT_REFRESH_SECRET", "refresh-secret-change-me"),
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
                .unwrap_or_else(|_| "http://localhost:5173,http://localhost:5174".into())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            server_host: env_or("SERVER_HOST", "0.0.0.0"),
            server_port: std::env::var("SERVER_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
        }
    }
}

fn env_required(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("{key} environment variable is required"))
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
