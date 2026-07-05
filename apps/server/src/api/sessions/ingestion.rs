use super::models::*;
use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::OptionalUser;
use crate::middleware::tx::Tx;
use crate::state::AppState;
use crate::websocket::manager::WsMessage;

/// POST /api/sessions/:id/responses
#[utoipa::path(
    post,
    path = "/api/sessions/{id}/responses",
    request_body = SubmitResponsesPayload,
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 201, description = "Responses persisted", body = crate::openapi::CountResponse),
        (status = 400, description = "No responses provided or session inactive", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn submit_response(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    Json(payload): Json<SubmitResponsesPayload>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    let mut tx = tx.tx().await?;

    // Session must be active and the caller must be the participant or an org member
    ensure_session_active(&mut **tx, session_id).await?;
    ensure_session_participant_or_member(&mut tx, user.as_ref(), session_id).await?;

    let responses = match payload {
        SubmitResponsesPayload::Single(response) => vec![response],
        SubmitResponsesPayload::Batch { responses } => responses,
    };

    if responses.is_empty() {
        return Err(ApiError::BadRequest("No responses provided".into()));
    }

    let response_count = responses.len();

    for response in responses.iter() {
        insert_response(&mut **tx, session_id, response).await?;
    }

    // Update last_activity_at on the session
    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

    // Broadcast response.submitted via WebSocket
    let questionnaire_id =
        sqlx::query_scalar::<_, Uuid>("SELECT questionnaire_id FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_optional(&mut **tx)
            .await?;

    if let Some(qid) = questionnaire_id {
        state.websocket_state.broadcast(WsMessage {
            channel: format!("questionnaire:{qid}"),
            event: "response.submitted".to_string(),
            payload: serde_json::json!({
                "session_id": session_id,
                "questionnaire_id": qid,
                "count": response_count,
            }),
        });
        // Also broadcast on analytics channel for real-time dashboards
        state.websocket_state.broadcast(WsMessage {
            channel: format!("analytics:{qid}"),
            event: "response.submitted".to_string(),
            payload: serde_json::json!({
                "session_id": session_id,
                "questionnaire_id": qid,
                "count": response_count,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }),
        });
    }

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "count": response_count })),
    ))
}

/// POST /api/sessions/:id/events
#[utoipa::path(
    post,
    path = "/api/sessions/{id}/events",
    request_body = Vec<InteractionEventRequest>,
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 201, description = "Events persisted", body = crate::openapi::CountResponse),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn submit_events(
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    Json(events): Json<Vec<InteractionEventRequest>>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    let mut tx = tx.tx().await?;

    ensure_session_exists(&mut **tx, session_id).await?;
    ensure_session_participant_or_member(&mut tx, user.as_ref(), session_id).await?;

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

        sqlx::query!(
            r#"
            INSERT INTO interaction_events (session_id, event_type, question_id, timestamp_us, metadata)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            session_id,
            event.event_type,
            event.question_id,
            timestamp_us,
            metadata,
        )
        .execute(&mut **tx)
        .await?;
    }

    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "count": events.len() })),
    ))
}

/// POST /api/sessions/:id/variables
#[utoipa::path(
    post,
    path = "/api/sessions/{id}/variables",
    request_body = SessionVariableRequest,
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 201, description = "Variable persisted", body = crate::openapi::SuccessResponse),
        (status = 400, description = "Invalid variable payload", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn upsert_variable(
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    Json(body): Json<SessionVariableRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    let mut tx = tx.tx().await?;

    ensure_session_exists(&mut **tx, session_id).await?;
    ensure_session_participant_or_member(&mut tx, user.as_ref(), session_id).await?;

    let variable_name = normalize_variable_name(&body.name)?;
    let context = fetch_session_variable_context(&mut **tx, session_id).await?;
    let definition_map =
        load_variable_definition_map(&mut **tx, &context, std::slice::from_ref(&variable_name))
            .await?;
    let normalized = normalize_variable_value(
        Some(body.value),
        body.value_type.as_deref(),
        body.source.as_deref(),
        definition_map.get(&variable_name),
    );

    persist_session_variable(&mut tx, session_id, &context, &variable_name, normalized).await?;

    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "success": true })),
    ))
}
