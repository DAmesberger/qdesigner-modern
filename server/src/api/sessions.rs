use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::auth::OptionalUser;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Session {
    pub id: Uuid,
    pub questionnaire_id: Uuid,
    pub participant_id: Option<String>,
    pub status: String,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_activity_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: serde_json::Value,
    pub browser_info: Option<serde_json::Value>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub questionnaire_id: Uuid,
    pub participant_id: Option<String>,
    pub browser_info: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionRequest {
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ResponseRecord {
    pub id: Uuid,
    pub session_id: Uuid,
    pub question_id: String,
    pub value: serde_json::Value,
    pub reaction_time_us: Option<i64>,
    pub presented_at: Option<chrono::DateTime<chrono::Utc>>,
    pub answered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: serde_json::Value,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitResponseRequest {
    pub question_id: String,
    pub value: serde_json::Value,
    /// Microsecond-precision reaction time (BIGINT).
    pub reaction_time_us: Option<i64>,
    pub presented_at: Option<chrono::DateTime<chrono::Utc>>,
    pub answered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct SessionListQuery {
    pub questionnaire_id: Option<Uuid>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// POST /api/sessions — create a new session (can be anonymous).
pub async fn create_session(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Json(body): Json<CreateSessionRequest>,
) -> Result<(axum::http::StatusCode, Json<Session>), ApiError> {
    // Verify the questionnaire exists and is published (or user is authenticated and has access).
    let q_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(body.questionnaire_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    if q_status != "published" && user.is_none() {
        return Err(ApiError::Forbidden(
            "Questionnaire is not published".into(),
        ));
    }

    let participant_id = body
        .participant_id
        .or_else(|| user.as_ref().map(|u| u.user_id.to_string()));

    let session = sqlx::query_as::<_, Session>(
        r#"
        INSERT INTO sessions (questionnaire_id, participant_id, status, started_at,
                              browser_info, metadata)
        VALUES ($1, $2, 'active', NOW(), $3, $4)
        RETURNING id, questionnaire_id, participant_id, status, started_at,
                  completed_at, last_activity_at, metadata, browser_info, created_at
        "#,
    )
    .bind(body.questionnaire_id)
    .bind(&participant_id)
    .bind(&body.browser_info)
    .bind(body.metadata.unwrap_or_else(|| serde_json::json!({})))
    .fetch_one(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(session)))
}

/// GET /api/sessions/:id
pub async fn get_session(
    State(state): State<AppState>,
    _user: AuthenticatedUser,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Session>, ApiError> {
    let session = sqlx::query_as::<_, Session>(
        r#"
        SELECT id, questionnaire_id, participant_id, status, started_at,
               completed_at, last_activity_at, metadata, browser_info, created_at
        FROM sessions WHERE id = $1
        "#,
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    Ok(Json(session))
}

/// PATCH /api/sessions/:id
pub async fn update_session(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<UpdateSessionRequest>,
) -> Result<Json<Session>, ApiError> {
    let mut parts: Vec<String> = vec!["last_activity_at = NOW()".into()];
    let mut bind_idx = 2u32;

    if body.status.is_some() {
        parts.push(format!("status = ${bind_idx}"));
        bind_idx += 1;

        // If completing, set completed_at
        if body.status.as_deref() == Some("completed") {
            parts.push("completed_at = NOW()".into());
        }
    }
    if body.metadata.is_some() {
        parts.push(format!("metadata = ${bind_idx}"));
    }

    let sql = format!(
        r#"UPDATE sessions SET {}
        WHERE id = $1
        RETURNING id, questionnaire_id, participant_id, status, started_at,
                  completed_at, last_activity_at, metadata, browser_info, created_at"#,
        parts.join(", ")
    );

    let mut query = sqlx::query_as::<_, Session>(&sql).bind(session_id);

    if let Some(ref v) = body.status {
        query = query.bind(v);
    }
    if let Some(ref v) = body.metadata {
        query = query.bind(v);
    }

    let session = query
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    Ok(Json(session))
}

/// POST /api/sessions/:id/responses
pub async fn submit_response(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<SubmitResponseRequest>,
) -> Result<(axum::http::StatusCode, Json<ResponseRecord>), ApiError> {
    // Verify session exists and is active
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if status != "active" {
        return Err(ApiError::BadRequest("Session is not active".into()));
    }

    let response = sqlx::query_as::<_, ResponseRecord>(
        r#"
        INSERT INTO responses (session_id, question_id, value, reaction_time_us,
                               presented_at, answered_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, session_id, question_id, value, reaction_time_us,
                  presented_at, answered_at, metadata, created_at
        "#,
    )
    .bind(session_id)
    .bind(&body.question_id)
    .bind(&body.value)
    .bind(body.reaction_time_us)
    .bind(body.presented_at)
    .bind(body.answered_at)
    .bind(body.metadata.unwrap_or_else(|| serde_json::json!({})))
    .fetch_one(&state.pool)
    .await?;

    // Update last_activity_at on the session
    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((axum::http::StatusCode::CREATED, Json(response)))
}
