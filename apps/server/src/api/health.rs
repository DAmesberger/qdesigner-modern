use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::state::AppState;

/// GET /health — simple liveness probe.
#[utoipa::path(
    get,
    path = "/health",
    responses(
        (status = 200, description = "Service is alive", body = crate::openapi::HealthStatus)
    ),
    tag = "health"
)]
pub async fn health() -> (StatusCode, Json<Value>) {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}

/// GET /ready — checks DB connectivity (and Redis if configured).
#[utoipa::path(
    get,
    path = "/ready",
    responses(
        (status = 200, description = "All readiness checks passed", body = crate::openapi::ReadyStatus),
        (status = 503, description = "One or more readiness checks failed", body = crate::openapi::ReadyStatus)
    ),
    tag = "health"
)]
pub async fn ready(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    // Check database
    let db_ok = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .is_ok();

    // Check Redis (optional)
    let redis_ok = if let Some(ref redis) = state.redis {
        match redis.get_multiplexed_async_connection().await {
            Ok(mut conn) => redis::cmd("PING")
                .query_async::<String>(&mut conn)
                .await
                .map(|pong| pong == "PONG")
                .unwrap_or(false),
            Err(_) => false,
        }
    } else {
        true // Redis not configured, skip check
    };

    let all_ok = db_ok && redis_ok;
    let status = if all_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        status,
        Json(json!({
            "status": if all_ok { "ready" } else { "degraded" },
            "checks": {
                "database": db_ok,
                "redis": redis_ok,
            }
        })),
    )
}
