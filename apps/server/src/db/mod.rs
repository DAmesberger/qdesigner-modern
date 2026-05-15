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

/// Run migrations against a one-shot pool opened on the given DSN.
///
/// Phase 6 splits the migration role (`qdesigner`, full DDL rights) from
/// the application role (`qdesigner_app`, DML-only, non-BYPASSRLS).
/// `main.rs` calls this with the migration DSN before opening the long-
/// lived application pool. The throwaway pool is closed when the
/// returned future completes so the migration connections are released.
pub async fn run_migrations_with_url(
    database_url: &str,
) -> Result<(), sqlx::migrate::MigrateError> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .min_connections(1)
        .connect(database_url)
        .await
        .map_err(sqlx::migrate::MigrateError::from)?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    pool.close().await;
    tracing::info!("Migrations applied (via migration DSN)");
    Ok(())
}
