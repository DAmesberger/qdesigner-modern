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

/// Rows per multi-row INSERT chunk in [`sync_session`]. Bounds the per-statement
/// bind count well under Postgres' 65535-parameter limit: responses bind 9
/// columns/row (500 × 9 = 4500 binds) and events 6 columns/row.
const SYNC_BATCH_ROWS: usize = 500;

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
    // Ack-driven marking (E-OFF-4): every client_id / variable name the server
    // durably holds after this sync, returned so the client flips ONLY these to
    // synced=1. A committed `ON CONFLICT (client_id) DO NOTHING` chunk guarantees
    // every id it carried is now present (freshly inserted OR already there from a
    // prior partial sync), so we ack the whole chunk on success.
    let mut accepted_client_ids: Vec<Uuid> = Vec::new();
    let mut accepted_variable_names: Vec<String> = Vec::new();
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

    // Sync responses with dedup — chunked multi-row inserts instead of one
    // round-trip per row. `ON CONFLICT (client_id) DO NOTHING` preserves the
    // idempotent dedup, and `rows_affected()` on the batch counts only the rows
    // actually inserted (skipped duplicates don't count), matching the prior
    // per-row `> 0` accounting exactly. presented_at/answered_at keep the
    // Postgres-side text→timestamptz parse (bound as Option<String>); metadata
    // keeps the COALESCE(..,'{}') default.
    for chunk in body.responses.chunks(SYNC_BATCH_ROWS) {
        let mut builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "INSERT INTO responses (session_id, question_id, value, reaction_time_us, \
             presented_at, answered_at, metadata, client_id, timing_provenance) ",
        );
        builder.push_values(chunk, |mut row, resp| {
            row.push_bind(session_id)
                .push_bind(&resp.question_id)
                .push_bind(&resp.value)
                .push_bind(resp.reaction_time_us)
                .push_bind(&resp.presented_at)
                .push_unseparated("::text::timestamptz")
                .push_bind(&resp.answered_at)
                .push_unseparated("::text::timestamptz");
            row.push("COALESCE(");
            row.push_bind_unseparated(&resp.metadata);
            row.push_unseparated("::jsonb, '{}'::jsonb)");
            row.push_bind(&resp.client_id)
                .push_bind(&resp.timing_provenance);
        });
        builder.push(" ON CONFLICT (client_id) DO NOTHING");
        let result = builder.build().execute(&mut **tx).await?;
        responses_synced += result.rows_affected() as i32;
        // Statement committed → every client_id in this chunk is now durably held.
        accepted_client_ids.extend(chunk.iter().map(|resp| resp.client_id));
    }

    // Sync events with dedup — same chunked strategy as responses.
    for chunk in body.events.chunks(SYNC_BATCH_ROWS) {
        let mut builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
            "INSERT INTO interaction_events (session_id, event_type, question_id, \
             timestamp_us, metadata, client_id) ",
        );
        builder.push_values(chunk, |mut row, evt| {
            row.push_bind(session_id)
                .push_bind(&evt.event_type)
                .push_bind(&evt.question_id)
                .push_bind(evt.timestamp_us);
            row.push("COALESCE(");
            row.push_bind_unseparated(&evt.metadata);
            row.push_unseparated("::jsonb, '{}'::jsonb)");
            row.push_bind(&evt.client_id);
        });
        builder.push(" ON CONFLICT (client_id) DO NOTHING");
        let result = builder.build().execute(&mut **tx).await?;
        events_synced += result.rows_affected() as i32;
        // Same ack contract as responses — the committed chunk is durably held.
        accepted_client_ids.extend(chunk.iter().map(|evt| evt.client_id));
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
            // Durably upserted → ack this name so the client marks exactly this
            // variable row synced (never the whole session).
            accepted_variable_names.push(variable_name);
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
        // E-FLOW-7: atomically claim the participant's interlocking quota cell
        // at completion, inside this same transaction, so concurrent completions
        // can never overfill a cell. The client pins which cell the participant
        // is in (`metadata.quotaCell.key`); the CAP is resolved authoritatively
        // from the questionnaire definition here — never from the client. A
        // rejected claim (cell already full — a race lost) is flagged on the
        // session so researchers can filter over-cap completions.
        claim_quota_cell_at_completion(&mut tx, session_id).await?;
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
        accepted_client_ids,
        accepted_variable_names,
    }))
}

/// GET /api/sessions/{id}/synced-client-ids
///
/// Lightweight reconcile probe (E-OFF-5): returns the `client_id`s the server
/// durably holds for the session (responses + interaction events). The client
/// diffs its locally-`acked` ledger rows against this set and re-queues anything
/// the server does not actually have — defending against a client-side
/// over-marking that would otherwise strand data. Runs under the fillout GUC
/// (`app.session_id` from the URL path), so an anonymous session can probe its
/// own durability; `ensure_session_participant_or_member` gates access.
#[utoipa::path(
    get,
    path = "/api/sessions/{id}/synced-client-ids",
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 200, description = "Client ids the server durably holds", body = SyncedClientIdsResponse),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn synced_client_ids(
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
) -> Result<Json<SyncedClientIdsResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    ensure_session_participant_or_member(&mut tx, user.as_ref(), session_id).await?;

    let client_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT client_id FROM responses
        WHERE session_id = $1 AND client_id IS NOT NULL
        UNION
        SELECT client_id FROM interaction_events
        WHERE session_id = $1 AND client_id IS NOT NULL
        "#,
    )
    .bind(session_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(SyncedClientIdsResponse { client_ids }))
}

/// E-FLOW-7: at completion, atomically claim the participant's interlocking
/// quota cell. The client pins *which* cell the participant is in via
/// `metadata.quotaCell.key`; the per-cell CAP is resolved authoritatively here
/// from the questionnaire definition (a client-supplied target is never
/// trusted). A rejected claim (cell already full — a completion race lost) sets
/// `metadata.quotaCellOverflow = true` so over-cap completions can be filtered.
///
/// No-op when the session has no pinned cell (no cross-quota configured, or the
/// pinned cell no longer exists in the definition). Runs in the caller's
/// transaction so the claim and the completion commit/roll back together.
pub(crate) async fn claim_quota_cell_at_completion(
    conn: &mut sqlx::PgConnection,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let row = sqlx::query_as::<_, (Uuid, serde_json::Value)>(
        "SELECT questionnaire_id, COALESCE(metadata, '{}'::jsonb) FROM sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&mut *conn)
    .await?;

    let Some((questionnaire_id, metadata)) = row else {
        return Ok(());
    };

    // The client-pinned cell key (which interlocking cell the participant fell
    // into, computed from their live in-survey variables).
    let cell_key = metadata
        .get("quotaCell")
        .and_then(|c| c.get("key"))
        .and_then(|v| v.as_str());
    let Some(cell_key) = cell_key else {
        return Ok(());
    };

    // Resolve the cap server-side from the questionnaire definition: match the
    // pinned key against the configured cross-quota cells (re-serialized with
    // the same canonical key format the client uses).
    let settings = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT COALESCE(content->'settings', '{}'::jsonb) FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(questionnaire_id)
    .fetch_optional(&mut *conn)
    .await?
    .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));

    let Some(target) = resolve_configured_cell_target(&settings, cell_key) else {
        // Pinned cell isn't in the current definition — don't claim.
        return Ok(());
    };

    let claimed = sqlx::query_scalar::<_, i64>("SELECT public.claim_quota_cell($1, $2, $3)")
        .bind(questionnaire_id)
        .bind(cell_key)
        .bind(target)
        .fetch_one(&mut *conn)
        .await?;

    if claimed < 0 {
        // Cell was already full at completion (race lost). Flag, don't fail —
        // the session already completed; the atomic counter simply didn't grow.
        sqlx::query(
            "UPDATE sessions SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{quotaCellOverflow}', 'true'::jsonb) WHERE id = $1",
        )
        .bind(session_id)
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

/// Canonical serialization of an interlocking cell's `values` map — sorted
/// `name=value` pairs joined by `|`. MUST match the client
/// `QuotaService.quotaCellKey` so a server-resolved cell matches the
/// client-pinned key exactly.
fn quota_cell_key(values: &serde_json::Map<String, serde_json::Value>) -> String {
    let mut pairs: Vec<(String, String)> = values
        .iter()
        .map(|(k, v)| {
            let val = v.as_str().map(|s| s.to_string()).unwrap_or_else(|| match v {
                serde_json::Value::Null => String::new(),
                other => other.to_string(),
            });
            (k.clone(), val)
        })
        .collect();
    pairs.sort();
    pairs
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("|")
}

/// Find, among the configured cross-quota cells in `settings.quotas[*].cells`,
/// the cell whose canonical key equals `cell_key`, and return its `target`
/// (0 ⇒ uncapped). Returns `None` when no configured cell matches.
fn resolve_configured_cell_target(settings: &serde_json::Value, cell_key: &str) -> Option<i64> {
    let groups = settings.get("quotas")?.as_array()?;
    for group in groups {
        let cells = match group.get("cells").and_then(|c| c.as_array()) {
            Some(c) => c,
            None => continue,
        };
        for cell in cells {
            let values = match cell.get("values").and_then(|v| v.as_object()) {
                Some(v) => v,
                None => continue,
            };
            if quota_cell_key(values) == cell_key {
                return Some(cell.get("target").and_then(|t| t.as_i64()).unwrap_or(0));
            }
        }
    }
    None
}

// ── Filter Endpoint ──────────────────────────────────────────────
