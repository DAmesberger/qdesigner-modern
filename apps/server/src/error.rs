use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    /// Org seat model (E-RBAC-4): adding a member or creating an invitation
    /// would exceed the organization's configured `seatLimit`. Serializes as a
    /// 409 carrying a stable `code: "seat_limit_reached"` so the frontend can
    /// discriminate it from other conflicts.
    #[error("Seat limit reached: {0}")]
    SeatLimitReached(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Rate limited")]
    RateLimited,

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
}

impl ApiError {
    /// Map a `sqlx::Error` to an `ApiError`, translating a Postgres
    /// unique-violation (SQLSTATE 23505) into a `Conflict` (409) rather
    /// than a generic `Database` (500). Used at INSERT call sites where a
    /// TOCTOU race between a SELECT-EXISTS gate and the INSERT can surface
    /// a duplicate-key error that is semantically a conflict, not a bug.
    pub fn from_db_error(err: sqlx::Error) -> ApiError {
        if err
            .as_database_error()
            .and_then(|e| e.code())
            .as_deref()
            == Some("23505")
        {
            ApiError::Conflict("Resource already exists".into())
        } else {
            ApiError::Database(err)
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            ApiError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            ApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg.clone()),
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            ApiError::SeatLimitReached(msg) => (StatusCode::CONFLICT, msg.clone()),
            ApiError::Validation(msg) => (StatusCode::UNPROCESSABLE_ENTITY, msg.clone()),
            ApiError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "Rate limit exceeded".to_string(),
            ),
            ApiError::Internal(msg) => {
                tracing::error!("Internal error: {msg}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            ApiError::Database(err) => {
                tracing::error!("Database error: {err}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            ApiError::Jwt(_) => (StatusCode::UNAUTHORIZED, "Invalid token".to_string()),
        };

        let mut error_obj = json!({
            "status": status.as_u16(),
            "message": message,
        });

        // Attach a stable machine-readable code for error variants the
        // frontend needs to branch on (typed errors).
        if let ApiError::SeatLimitReached(_) = &self {
            error_obj["code"] = json!("seat_limit_reached");
        }

        let body = json!({ "error": error_obj });

        (status, axum::Json(body)).into_response()
    }
}
