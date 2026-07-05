use super::models::*;
use axum::{
    extract::{Path, State},
    Json,
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::api::access;
use crate::error::ApiError;
use crate::middleware::auth::OptionalUser;
use crate::middleware::tx::Tx;
use crate::state::AppState;
use crate::websocket::manager::WsMessage;

/// POST /api/sessions/{id}/sync
#[utoipa::path(
    post,
    path = "/api/sessions/{id}/sync",
    request_body = SyncPayload,
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 200, description = "Session sync result", body = SyncResult),
        (status = 400, description = "Invalid sync payload", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn sync_session(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    Json(body): Json<SyncPayload>,
) -> Result<Json<SyncResult>, ApiError> {
    let mut tx = tx.tx().await?;

    // Offline-first: a session created while OFFLINE exists only on the client, so
    // materialize it here (idempotent) from the init fields the sync payload
    // carries. This runs under the fillout GUC (`app.session_id` = the URL-path id,
    // set by fillout_rls_context), so the 00021 `sessions_insert_dual` bootstrap
    // admits EXACTLY this session id — a caller can never create a session id they
    // do not already possess. The published-questionnaire gate mirrors
    // create_session so anonymous callers cannot open a session against an
    // unpublished / other-tenant questionnaire.
    if let Some(init) = &body.session {
        let already =
            sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1)")
                .bind(session_id)
                .fetch_one(&mut **tx)
                .await?;
        if !already {
            let q_status = sqlx::query_scalar::<_, String>(
                "SELECT status FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(init.questionnaire_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

            if q_status != "published" {
                match user.as_ref() {
                    Some(u) => {
                        access::verify_questionnaire_access(
                            &mut **tx,
                            u.user_id,
                            init.questionnaire_id,
                        )
                        .await?
                    }
                    None => {
                        return Err(ApiError::Forbidden("Questionnaire is not published".into()))
                    }
                }
            }

            let session_user_id = user.as_ref().map(|u| u.user_id);
            // Mirror create_session's normalization so an offline session
            // materializes identically to the same session created online:
            // participant_id falls back to the authenticated user, metadata
            // defaults to '{}' (COALESCE below) rather than SQL NULL.
            let participant_id = init
                .participant_id
                .clone()
                .or_else(|| user.as_ref().map(|u| u.user_id.to_string()));
            sqlx::query(
                r#"
                INSERT INTO sessions (id, questionnaire_id, participant_id, status, started_at,
                                      browser_info, metadata,
                                      questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch,
                                      user_id)
                VALUES ($1, $2, $3, 'active', NOW(), $4, COALESCE($5, '{}'::jsonb), $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
                "#,
            )
            .bind(session_id)
            .bind(init.questionnaire_id)
            .bind(&participant_id)
            .bind(&init.browser_info)
            .bind(&init.metadata)
            .bind(init.version_major)
            .bind(init.version_minor)
            .bind(init.version_patch)
            .bind(session_user_id)
            .execute(&mut **tx)
            .await?;
        }
    }

    // Verify session exists and user is authorized
    ensure_session_participant_or_member(&mut tx, user.as_ref(), session_id).await?;

    // Merge the payload's session metadata into the (possibly pre-existing) row.
    // The INSERT above only lands metadata for OFFLINE-created sessions; an
    // ONLINE-created session already exists (`already == true`), so its INSERT is
    // skipped and the final-snapshot metadata (e.g. `qualityReport`) would
    // otherwise be dropped. `COALESCE(metadata,'{}'::jsonb) || $2` is an
    // idempotent shallow merge that preserves prior keys, so running it on both
    // the freshly-inserted and pre-existing paths is safe. Runs under the fillout
    // GUC (`app.session_id` from the URL path), so the 00021 dual UPDATE policy
    // admits anonymous sync.
    if let Some(init) = &body.session {
        if let Some(meta) = &init.metadata {
            sqlx::query(
                "UPDATE sessions SET metadata = COALESCE(metadata, '{}'::jsonb) || $2 WHERE id = $1",
            )
            .bind(session_id)
            .bind(meta)
            .execute(&mut **tx)
            .await?;
        }
    }

    let mut responses_synced = 0i32;
    let mut events_synced = 0i32;
    let mut variables_synced = 0i32;
    let session_context = if body.variables.is_empty() {
        None
    } else {
        Some(fetch_session_variable_context(&mut **tx, session_id).await?)
    };
    let variable_definition_map = if let Some(context) = &session_context {
        let variable_names: Vec<String> = body
            .variables
            .iter()
            .filter_map(|item| normalize_variable_name(&item.variable_name).ok())
            .collect();

        load_variable_definition_map(&mut **tx, context, &variable_names).await?
    } else {
        HashMap::new()
    };

    // Sync responses with dedup
    for resp in &body.responses {
        let result = sqlx::query!(
            r#"
            INSERT INTO responses (session_id, question_id, value, reaction_time_us, presented_at, answered_at, metadata, client_id, timing_provenance)
            VALUES ($1, $2, $3, $4, $5::text::timestamptz, $6::text::timestamptz, COALESCE($7, '{}'::jsonb), $8, $9)
            ON CONFLICT (client_id) DO NOTHING
            "#,
            session_id,
            resp.question_id,
            resp.value,
            resp.reaction_time_us,
            resp.presented_at,
            resp.answered_at,
            resp.metadata,
            resp.client_id,
            resp.timing_provenance,
        )
        .execute(&mut **tx)
        .await?;

        if result.rows_affected() > 0 {
            responses_synced += 1;
        }
    }

    // Sync events with dedup
    for evt in &body.events {
        let result = sqlx::query!(
            r#"
            INSERT INTO interaction_events (session_id, event_type, question_id, timestamp_us, metadata, client_id)
            VALUES ($1, $2, $3, $4, COALESCE($5, '{}'::jsonb), $6)
            ON CONFLICT (client_id) DO NOTHING
            "#,
            session_id,
            evt.event_type,
            evt.question_id,
            evt.timestamp_us,
            evt.metadata,
            evt.client_id,
        )
        .execute(&mut **tx)
        .await?;

        if result.rows_affected() > 0 {
            events_synced += 1;
        }
    }

    // Sync variables (upsert)
    for var in &body.variables {
        let variable_name = normalize_variable_name(&var.variable_name)?;
        let normalized = normalize_variable_value(
            var.variable_value.clone(),
            var.value_type.as_deref(),
            var.source.as_deref(),
            variable_definition_map.get(&variable_name),
        );

        if let Some(context) = &session_context {
            persist_session_variable(&mut tx, session_id, context, &variable_name, normalized)
                .await?;
        }

        variables_synced += 1;
    }

    // Update session status if provided
    let normalized_status = body
        .status
        .as_deref()
        .map(normalize_session_status)
        .transpose()?;

    if let Some(ref status) = normalized_status {
        let sql = if status == "completed" {
            "UPDATE sessions SET status = $2, completed_at = COALESCE(completed_at, NOW()), last_activity_at = NOW() WHERE id = $1"
        } else {
            "UPDATE sessions SET status = $2, last_activity_at = NOW() WHERE id = $1"
        };

        sqlx::query(sql)
            .bind(session_id)
            .bind(status)
            .execute(&mut **tx)
            .await?;
    } else if responses_synced > 0 || events_synced > 0 || variables_synced > 0 {
        sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
            .bind(session_id)
            .execute(&mut **tx)
            .await?;
    }

    if normalized_status.as_deref() == Some("completed") {
        refresh_session_variable_projection(&mut tx, session_id).await?;
    }

    // Broadcast analytics event if new responses were synced
    if responses_synced > 0 {
        let questionnaire_id =
            sqlx::query_scalar::<_, Uuid>("SELECT questionnaire_id FROM sessions WHERE id = $1")
                .bind(session_id)
                .fetch_optional(&mut **tx)
                .await?;

        if let Some(qid) = questionnaire_id {
            state.websocket_state.broadcast(WsMessage {
                channel: format!("analytics:{qid}"),
                event: "response.synced".to_string(),
                payload: serde_json::json!({
                    "session_id": session_id,
                    "questionnaire_id": qid,
                    "responses_synced": responses_synced,
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                }),
            });
        }
    }

    Ok(Json(SyncResult {
        responses_synced,
        events_synced,
        variables_synced,
    }))
}

// ── Filter Endpoint ──────────────────────────────────────────────
