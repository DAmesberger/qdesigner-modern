use super::models::*;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::auth::OptionalUser;
use crate::middleware::tx::Tx;
use crate::state::AppState;
use crate::websocket::manager::WsMessage;

/// POST /api/sessions — create a new session (can be anonymous).
#[utoipa::path(
    post,
    path = "/api/sessions",
    request_body = CreateSessionRequest,
    responses(
        (status = 201, description = "Session created", body = CreateSessionResponse),
        (status = 403, description = "Questionnaire not published or access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn create_session(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Json(body): Json<CreateSessionRequest>,
) -> Result<(axum::http::StatusCode, Json<CreateSessionResponse>), ApiError> {
    let mut tx = tx.tx().await?;

    // Verify the questionnaire exists and is published (or user is authenticated and has access).
    let q_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(body.questionnaire_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    if q_status != "published" && user.is_none() {
        return Err(ApiError::Forbidden("Questionnaire is not published".into()));
    }

    let participant_id = body
        .participant_id
        .or_else(|| user.as_ref().map(|u| u.user_id.to_string()));

    // Look up current questionnaire version if not provided in request
    let (ver_major, ver_minor, ver_patch) = if body.version_major.is_some() {
        (body.version_major, body.version_minor, body.version_patch)
    } else {
        let ver = sqlx::query_as::<_, (i32, i32, i32)>(
            "SELECT version_major, version_minor, version_patch FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(body.questionnaire_id)
        .fetch_optional(&mut **tx)
        .await?;

        match ver {
            Some((major, minor, patch)) => (Some(major), Some(minor), Some(patch)),
            None => (None, None, None),
        }
    };

    // P6.2: link authenticated sessions to the user_id so the dual-path
    // RLS policies in 00021 admit via `user_id = current_app_user_id()`.
    // Anonymous fillout keeps NULL.
    let session_user_id = user.as_ref().map(|u| u.user_id);

    let metadata = body
        .metadata
        .clone()
        .unwrap_or_else(|| serde_json::json!({}));

    // Fingerprint for create-time duplicate-participation detection.
    // Prefer the dedicated request field; fall back to the legacy
    // `metadata->>'fingerprint'` slot the pre-00026 client wrote to.
    let fingerprint = body.fingerprint.clone().or_else(|| {
        metadata
            .get("fingerprint")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    });

    // Slice 2.5: create-time dedup that works for anonymous callers. The
    // SECURITY DEFINER counter (00026) runs with the definer's BYPASSRLS
    // rights, so it sees prior COMPLETED sessions across all callers —
    // unlike a plain SELECT under `qdesigner_app`, which the anonymous
    // fillout GUC cannot admit through the 00021 dual-path policy. The
    // session is still created; `duplicate` lets the client react per the
    // questionnaire's fraud-prevention settings (repeat participation may
    // be allowed, so we do not hard-block here).
    let duplicate = match fingerprint.as_deref() {
        Some(fp) => {
            let prior: i64 =
                sqlx::query_scalar("SELECT public.count_completed_fingerprint_sessions($1, $2)")
                    .bind(body.questionnaire_id)
                    .bind(fp)
                    .fetch_one(&mut **tx)
                    .await?;
            prior > 0
        }
        None => false,
    };

    // P6.3: generate the session id in the handler and set `app.session_id`
    // before the INSERT. The INSERT's WITH CHECK and the SELECT applied to
    // RETURNING both admit via the session_id branch. This avoids relying
    // on the policy's bootstrap branch — bootstrap admits INSERT but
    // RETURNING also requires SELECT visibility, which the bootstrap
    // branch (deliberately) does not grant.
    let new_session_id = Uuid::new_v4();
    sqlx::query("SELECT set_config('app.session_id', $1, true)")
        .bind(new_session_id.to_string())
        .execute(&mut **tx)
        .await?;

    // E-FLOW-6: server-atomic between-subjects assignment + participant number.
    // Both run through SECURITY DEFINER functions (00031) inside THIS request
    // transaction, so they commit or roll back with the session INSERT below —
    // no orphan arm counts, and the allocation is race-free under concurrent
    // starts (the client's old read-a-snapshot-then-pick approach was not).
    //
    // participant_number is allocated for EVERY session (0-based, monotonic per
    // questionnaire): counterbalancing (`getBlockOrder`) needs a real, distinct
    // index per participant even for single-arm designs. Previously the runtime
    // never received one and every participant got Latin-square row 0.
    let participant_number: i64 =
        sqlx::query_scalar("SELECT public.allocate_participant_number($1)")
            .bind(body.questionnaire_id)
            .fetch_one(&mut **tx)
            .await?;

    // Read the (version-agnostic) experimental design straight from the
    // questionnaire definition so the assignment is server-authoritative and
    // cannot be forged by the client. When a between-subjects design declares
    // conditions, claim the least-full arm atomically (00031).
    let design: Option<serde_json::Value> = sqlx::query_scalar::<_, Option<serde_json::Value>>(
        "SELECT content->'settings'->'experimentalDesign' FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(body.questionnaire_id)
    .fetch_optional(&mut **tx)
    .await?
    .flatten();

    let mut assigned_condition: Option<String> = None;
    let mut assigned_condition_index: Option<i32> = None;
    if let Some(design) = design.as_ref() {
        let conditions: Vec<String> = design
            .get("conditions")
            .and_then(|c| c.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();

        if !conditions.is_empty() {
            let strategy = design
                .get("assignmentStrategy")
                .and_then(|s| s.as_str())
                .unwrap_or("balanced")
                .to_string();

            // No per-arm caps in the design config today; pass NULL (unlimited).
            let claim = sqlx::query_as::<_, ArmClaim>(
                "SELECT o_condition_name AS condition_name, \
                        o_condition_index AS condition_index, \
                        o_assigned_count AS assigned_count \
                 FROM public.claim_experiment_arm($1, $2, $3, $4)",
            )
            .bind(body.questionnaire_id)
            .bind(&conditions)
            .bind(&strategy)
            .bind(Option::<Vec<i64>>::None)
            .fetch_optional(&mut **tx)
            .await?;

            if let Some(claim) = claim {
                assigned_condition = Some(claim.condition_name);
                assigned_condition_index = Some(claim.condition_index);
            }
        }
    }

    let session = sqlx::query_as!(
        Session,
        r#"
        INSERT INTO sessions (id, questionnaire_id, participant_id, status, started_at,
                              browser_info, metadata,
                              questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch,
                              user_id, fingerprint,
                              participant_number, assigned_condition, assigned_condition_index)
        VALUES ($1, $2, $3, 'active', NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, questionnaire_id, participant_id, status as "status!",
                  started_at, completed_at, last_activity_at, metadata as "metadata!",
                  browser_info, created_at,
                  questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch
        "#,
        new_session_id,
        body.questionnaire_id,
        participant_id,
        body.browser_info,
        metadata,
        ver_major,
        ver_minor,
        ver_patch,
        session_user_id,
        fingerprint,
        participant_number,
        assigned_condition,
        assigned_condition_index,
    )
    .fetch_one(&mut **tx)
    .await?;

    // E-FLOW-2: bind a longitudinal/EMA wave session back to its series
    // enrollment. Done as a separate runtime UPDATE (rather than widening
    // the compile-checked INSERT macro, which would need a `.sqlx`
    // regeneration). Admitted by the dual-path RLS via the `app.session_id`
    // GUC set to `new_session_id` above.
    if let Some(resume_token) = body.resume_token {
        sqlx::query("UPDATE sessions SET resume_token = $1 WHERE id = $2")
            .bind(resume_token)
            .bind(new_session_id)
            .execute(&mut **tx)
            .await?;
    }

    // Broadcast session.created via WebSocket
    state.websocket_state.broadcast(WsMessage {
        channel: format!("questionnaire:{}", session.questionnaire_id),
        event: "session.created".to_string(),
        payload: serde_json::json!({
            "session_id": session.id,
            "questionnaire_id": session.questionnaire_id,
            "status": session.status,
        }),
    });

    Ok((
        axum::http::StatusCode::CREATED,
        Json(CreateSessionResponse {
            session,
            duplicate,
            participant_number,
            assigned_condition,
            assigned_condition_index,
        }),
    ))
}

/// POST /api/sessions/check-duplicate — check if a fingerprint already completed this questionnaire.
#[utoipa::path(
    post,
    path = "/api/sessions/check-duplicate",
    request_body = CheckDuplicateRequest,
    responses(
        (status = 200, description = "Duplicate check result", body = CheckDuplicateResponse)
    ),
    tags = ["sessions"]
)]
pub async fn check_duplicate(
    tx: Tx,
    Json(body): Json<CheckDuplicateRequest>,
) -> Result<Json<CheckDuplicateResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    // Only expose the completion count for a PUBLISHED questionnaire, matching
    // create_session's anonymous gate. Otherwise the SECURITY DEFINER counter
    // below (which bypasses RLS) would be a count-oracle over unpublished /
    // other-tenant drafts for any anonymous caller who guesses an id.
    let q_status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(body.questionnaire_id)
    .fetch_optional(&mut **tx)
    .await?;
    if q_status.as_deref() != Some("published") {
        return Ok(Json(CheckDuplicateResponse {
            is_duplicate: false,
            previous_completions: 0,
        }));
    }
    // Slice 2.5: delegate to the SECURITY DEFINER counter (00026), which
    // runs with the definer's BYPASSRLS rights and therefore sees prior
    // COMPLETED sessions across all callers. This replaces the pre-00026
    // plain SELECT under `qdesigner_app`, which always returned 0 for
    // anonymous fillout — the 00021 dual-path SELECT policy admits no
    // other session's row when the request carries no JWT and no matching
    // `app.session_id` GUC. That no-op was tracked in the P6.3 deferred
    // list / CLAUDE.md "Known TODOs".
    let count: i64 =
        sqlx::query_scalar("SELECT public.count_completed_fingerprint_sessions($1, $2)")
            .bind(body.questionnaire_id)
            .bind(&body.fingerprint)
            .fetch_one(&mut **tx)
            .await?;

    Ok(Json(CheckDuplicateResponse {
        is_duplicate: count > 0,
        previous_completions: count,
    }))
}

/// GET /api/sessions
#[utoipa::path(
    get,
    path = "/api/sessions",
    params(SessionListQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "List sessions for a questionnaire", body = [Session]),
        (status = 400, description = "questionnaire_id missing", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn list_sessions(
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<SessionListQuery>,
) -> Result<Json<Vec<Session>>, ApiError> {
    let mut tx = tx.tx().await?;
    // Require questionnaire_id so we can verify access
    let questionnaire_id = query.questionnaire_id.ok_or_else(|| {
        ApiError::BadRequest("questionnaire_id query parameter is required".into())
    })?;

    // Verify the user has access to this questionnaire's project org
    access::verify_questionnaire_access(&mut **tx, user.user_id, questionnaire_id).await?;

    let normalized_status = query
        .status
        .as_deref()
        .map(normalize_session_status)
        .transpose()?;

    let mut where_parts: Vec<String> = vec!["questionnaire_id = $1".to_string()];
    let mut bind_idx = 2u32;

    if query.participant_id.is_some() {
        where_parts.push(format!("participant_id = ${bind_idx}"));
        bind_idx += 1;
    }
    if normalized_status.is_some() {
        where_parts.push(format!("status = ${bind_idx}"));
    }

    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let offset = query.offset.unwrap_or(0).max(0);

    let sql = format!(
        r#"
        SELECT id, questionnaire_id, participant_id, status, started_at,
               completed_at, last_activity_at, metadata, browser_info, created_at,
               questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch
        FROM sessions
        WHERE {}
        ORDER BY created_at DESC LIMIT {} OFFSET {}
        "#,
        where_parts.join(" AND "),
        limit,
        offset
    );

    let mut db_query = sqlx::query_as::<_, Session>(&sql).bind(questionnaire_id);

    if let Some(participant_id) = query.participant_id {
        db_query = db_query.bind(participant_id);
    }
    if let Some(status) = normalized_status {
        db_query = db_query.bind(status);
    }

    let sessions = db_query.fetch_all(&mut **tx).await?;
    Ok(Json(sessions))
}

/// GET /api/sessions/:id
#[utoipa::path(
    get,
    path = "/api/sessions/{id}",
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Session details", body = Session),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn get_session(
    user: AuthenticatedUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Session>, ApiError> {
    let mut tx = tx.tx().await?;
    let session = sqlx::query_as!(
        Session,
        r#"
        SELECT id, questionnaire_id, participant_id, status as "status!",
               started_at, completed_at, last_activity_at, metadata as "metadata!",
               browser_info, created_at,
               questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch
        FROM sessions WHERE id = $1
        "#,
        session_id,
    )
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    // Verify the user has access to this session's questionnaire
    access::verify_questionnaire_access(&mut **tx, user.user_id, session.questionnaire_id).await?;

    Ok(Json(session))
}

/// GET /api/sessions/:id/responses
#[utoipa::path(
    get,
    path = "/api/sessions/{id}/responses",
    params(
        ("id" = Uuid, Path, description = "Session id"),
        ResponseListQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Session responses", body = [ResponseRecord]),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn get_responses(
    user: AuthenticatedUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    Query(query): Query<ResponseListQuery>,
) -> Result<Json<Vec<ResponseRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    ensure_session_access(&mut tx, user.user_id, session_id).await?;

    let limit = query.limit.unwrap_or(500).clamp(1, 5000);
    let offset = query.offset.unwrap_or(0).max(0);

    let responses = if let Some(ref question_id) = query.question_id {
        sqlx::query_as!(
            ResponseRecord,
            r#"
            SELECT id, session_id, question_id, value, reaction_time_us,
                   presented_at, answered_at, metadata as "metadata!", created_at, client_id
            FROM responses
            WHERE session_id = $1 AND question_id = $2
            ORDER BY created_at ASC
            LIMIT $3 OFFSET $4
            "#,
            session_id,
            question_id,
            limit,
            offset,
        )
        .fetch_all(&mut **tx)
        .await?
    } else {
        sqlx::query_as!(
            ResponseRecord,
            r#"
            SELECT id, session_id, question_id, value, reaction_time_us,
                   presented_at, answered_at, metadata as "metadata!", created_at, client_id
            FROM responses
            WHERE session_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
            "#,
            session_id,
            limit,
            offset,
        )
        .fetch_all(&mut **tx)
        .await?
    };

    Ok(Json(responses))
}

/// GET /api/sessions/:id/events
#[utoipa::path(
    get,
    path = "/api/sessions/{id}/events",
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Session interaction events", body = [InteractionEventRecord]),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn get_events(
    user: AuthenticatedUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Vec<InteractionEventRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    ensure_session_access(&mut tx, user.user_id, session_id).await?;

    let events = sqlx::query_as!(
        InteractionEventRecord,
        r#"
        SELECT id, session_id, event_type, question_id, timestamp_us,
               metadata as "metadata?", created_at, client_id
        FROM interaction_events
        WHERE session_id = $1
        ORDER BY timestamp_us ASC
        "#,
        session_id,
    )
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(events))
}

/// GET /api/sessions/:id/variables
#[utoipa::path(
    get,
    path = "/api/sessions/{id}/variables",
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Persisted session variables", body = [SessionVariableRecord]),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn get_variables(
    user: AuthenticatedUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Vec<SessionVariableRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    ensure_session_access(&mut tx, user.user_id, session_id).await?;

    let variables = sqlx::query_as!(
        SessionVariableRecord,
        r#"
        SELECT session_id, variable_name, variable_value as "variable_value?",
               created_at as "created_at?", updated_at as "updated_at?"
        FROM session_variables
        WHERE session_id = $1
        ORDER BY variable_name ASC
        "#,
        session_id,
    )
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(variables))
}

/// PATCH /api/sessions/:id
#[utoipa::path(
    patch,
    path = "/api/sessions/{id}",
    request_body = UpdateSessionRequest,
    params(
        ("id" = Uuid, Path, description = "Session id")
    ),
    responses(
        (status = 200, description = "Session updated", body = Session),
        (status = 404, description = "Session not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["sessions"]
)]
pub async fn update_session(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    tx: Tx,
    Path(session_id): Path<Uuid>,
    Json(body): Json<UpdateSessionRequest>,
) -> Result<Json<Session>, ApiError> {
    let mut tx = tx.tx().await?;
    // Verify session ownership: either the participant or an org member.
    ensure_session_participant_or_member(&mut tx, user.as_ref(), session_id).await?;
    let mut parts: Vec<String> = vec!["last_activity_at = NOW()".into()];
    let mut bind_idx = 2u32;
    let normalized_status = body
        .status
        .as_deref()
        .map(normalize_session_status)
        .transpose()?;

    if let Some(ref status) = normalized_status {
        if status == "completed" {
            // Completing is always allowed; stamp completed_at.
            parts.push(format!("status = ${bind_idx}"));
            parts.push("completed_at = NOW()".into());
        } else {
            // Defense-in-depth: never let a non-terminal update ('active')
            // regress an already-completed session. This guards against the
            // fillout progress-update / completion write race (a trailing
            // per-question 'in_progress' update landing after completion) and
            // any out-of-order offline sync. A completed session stays
            // completed.
            parts.push(format!(
                "status = CASE WHEN status = 'completed' THEN status ELSE ${bind_idx} END"
            ));
        }
        bind_idx += 1;
    }
    if body.metadata.is_some() {
        parts.push(format!("metadata = ${bind_idx}"));
    }

    let sql = format!(
        r#"UPDATE sessions SET {}
        WHERE id = $1
        RETURNING id, questionnaire_id, participant_id, status, started_at,
                  completed_at, last_activity_at, metadata, browser_info, created_at,
                  questionnaire_version_major, questionnaire_version_minor, questionnaire_version_patch"#,
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
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if session.status == "completed" {
        refresh_session_variable_projection(&mut tx, session_id).await?;
    }

    // Broadcast session update via WebSocket
    let ws_event = if session.status == "completed" {
        "session.completed"
    } else {
        "session.updated"
    };
    state.websocket_state.broadcast(WsMessage {
        channel: format!("questionnaire:{}", session.questionnaire_id),
        event: ws_event.to_string(),
        payload: serde_json::json!({
            "session_id": session.id,
            "questionnaire_id": session.questionnaire_id,
            "status": session.status,
        }),
    });

    Ok(Json(session))
}
