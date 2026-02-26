use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
#[serde(untagged)]
pub enum SubmitResponsesPayload {
    Single(SubmitResponseRequest),
    Batch {
        responses: Vec<SubmitResponseRequest>,
    },
}

#[derive(Debug, Deserialize)]
pub struct SessionVariableRequest {
    pub name: String,
    pub value: Value,
}

#[derive(Debug, Deserialize)]
pub struct InteractionEventRequest {
    #[serde(default, alias = "questionId")]
    pub question_id: Option<String>,
    #[serde(alias = "eventType")]
    pub event_type: String,
    #[serde(default, alias = "timestampUs")]
    pub timestamp_us: Option<i64>,
    #[serde(default)]
    pub timestamp: Option<f64>,
    #[serde(default, alias = "eventData")]
    pub event_data: Option<Value>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[allow(dead_code)]
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
        return Err(ApiError::Forbidden("Questionnaire is not published".into()));
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
    let normalized_status = body
        .status
        .as_deref()
        .map(normalize_session_status)
        .transpose()?;

    if normalized_status.is_some() {
        parts.push(format!("status = ${bind_idx}"));
        bind_idx += 1;

        // If completing, set completed_at
        if normalized_status.as_deref() == Some("completed") {
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

    if let Some(ref v) = normalized_status {
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
    Json(payload): Json<SubmitResponsesPayload>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    ensure_session_active(&state, session_id).await?;

    let responses = match payload {
        SubmitResponsesPayload::Single(response) => vec![response],
        SubmitResponsesPayload::Batch { responses } => responses,
    };

    if responses.is_empty() {
        return Err(ApiError::BadRequest("No responses provided".into()));
    }

    for response in responses.iter() {
        insert_response(&state, session_id, response).await?;
    }

    // Update last_activity_at on the session
    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "count": responses.len() })),
    ))
}

/// POST /api/sessions/:id/events
pub async fn submit_events(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(events): Json<Vec<InteractionEventRequest>>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    ensure_session_exists(&state, session_id).await?;

    if events.is_empty() {
        return Ok((
            axum::http::StatusCode::CREATED,
            Json(serde_json::json!({ "count": 0 })),
        ));
    }

    for event in events.iter() {
        let timestamp_us = event
            .timestamp_us
            .or_else(|| event.timestamp.map(|value| (value * 1000.0) as i64))
            .unwrap_or(0);

        let metadata = merge_event_metadata(event.metadata.clone(), event.event_data.clone());

        sqlx::query(
            r#"
            INSERT INTO interaction_events (session_id, event_type, question_id, timestamp_us, metadata)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(session_id)
        .bind(&event.event_type)
        .bind(&event.question_id)
        .bind(timestamp_us)
        .bind(metadata)
        .execute(&state.pool)
        .await?;
    }

    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "count": events.len() })),
    ))
}

/// POST /api/sessions/:id/variables
pub async fn upsert_variable(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<SessionVariableRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    ensure_session_exists(&state, session_id).await?;

    sqlx::query(
        r#"
        INSERT INTO session_variables (session_id, variable_name, variable_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, variable_name)
        DO UPDATE SET variable_value = EXCLUDED.variable_value, updated_at = NOW()
        "#,
    )
    .bind(session_id)
    .bind(&body.name)
    .bind(&body.value)
    .execute(&state.pool)
    .await?;

    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "success": true })),
    ))
}

fn normalize_session_status(status: &str) -> Result<String, ApiError> {
    let normalized = match status {
        "not_started" | "in_progress" | "paused" | "active" => "active",
        "completed" => "completed",
        "abandoned" => "abandoned",
        "expired" => "expired",
        _ => {
            return Err(ApiError::BadRequest(format!(
                "Invalid session status: {status}"
            )))
        }
    };

    Ok(normalized.to_string())
}

async fn ensure_session_active(state: &AppState, session_id: Uuid) -> Result<(), ApiError> {
    let status = sqlx::query_scalar::<_, String>("SELECT status FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if status != "active" {
        return Err(ApiError::BadRequest("Session is not active".into()));
    }

    Ok(())
}

async fn ensure_session_exists(state: &AppState, session_id: Uuid) -> Result<(), ApiError> {
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1)")
            .bind(session_id)
            .fetch_one(&state.pool)
            .await?;

    if !exists {
        return Err(ApiError::NotFound("Session not found".into()));
    }

    Ok(())
}

async fn insert_response(
    state: &AppState,
    session_id: Uuid,
    response: &SubmitResponseRequest,
) -> Result<ResponseRecord, ApiError> {
    let metadata = response
        .metadata
        .clone()
        .unwrap_or_else(|| serde_json::json!({}));

    let inserted = sqlx::query_as::<_, ResponseRecord>(
        r#"
        INSERT INTO responses (session_id, question_id, value, reaction_time_us,
                               presented_at, answered_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, session_id, question_id, value, reaction_time_us,
                  presented_at, answered_at, metadata, created_at
        "#,
    )
    .bind(session_id)
    .bind(&response.question_id)
    .bind(&response.value)
    .bind(response.reaction_time_us)
    .bind(response.presented_at)
    .bind(response.answered_at)
    .bind(metadata)
    .fetch_one(&state.pool)
    .await?;

    Ok(inserted)
}

fn merge_event_metadata(metadata: Option<Value>, event_data: Option<Value>) -> Value {
    match (metadata, event_data) {
        (Some(Value::Object(mut metadata_map)), Some(Value::Object(event_data_map))) => {
            metadata_map.insert("event_data".to_string(), Value::Object(event_data_map));
            Value::Object(metadata_map)
        }
        (Some(existing), Some(event_data)) => {
            serde_json::json!({
                "metadata": existing,
                "event_data": event_data,
            })
        }
        (Some(existing), None) => existing,
        (None, Some(event_data)) => serde_json::json!({ "event_data": event_data }),
        (None, None) => serde_json::json!({}),
    }
}
