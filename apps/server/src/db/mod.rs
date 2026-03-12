use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// Create a connection pool and run embedded migrations.
pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .connect(database_url)
        .await?;

    tracing::info!("Database connected");
    Ok(pool)
}

/// Run SQL migrations embedded at compile time.
/// Migrations live in server/migrations/.
pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await?;
    tracing::info!("Migrations applied");
    Ok(())
}
