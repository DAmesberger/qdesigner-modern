use super::models::*;
use axum::{extract::Path, Json};
use uuid::Uuid;

use crate::error::ApiError;
use crate::middleware::auth::OptionalUser;
use crate::middleware::tx::Tx;

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

