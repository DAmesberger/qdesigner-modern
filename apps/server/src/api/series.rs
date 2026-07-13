//! Longitudinal / EMA study-series API (E-FLOW-2).
//!
//! Two audiences on one `/api/series` nest (merged routers, each with its
//! own RLS-context layer — mirrors `media_routes`):
//!
//! - **Researcher** (`set_rls_context`, `app.user_id`): create/list/update
//!   a [`study_series`], enroll participants, list enrollments. Authorized
//!   by [`crate::authz::authorize`] at `Scope::Project` (ADR 0034): the
//!   reads (`list_series`/`list_enrollments`) require `ProjectRead`, the
//!   mutations (`create_series`/`update_series`/`enroll`) require
//!   `ProjectWrite` — so a project viewer can no longer mutate schedules or
//!   enroll participants. The owning project is resolved from the
//!   questionnaire id (RLS-exempt `questionnaire_definitions`).
//! - **Participant** (`set_series_rls_context`, `app.enrollment_token`):
//!   resolve a reminder link, post completion back (advances the
//!   enrollment + schedules the next wave), and unsubscribe. Anonymous —
//!   the unguessable `resume_token` is the credential.
//!
//! All queries are runtime-checked (`sqlx::query*`, not the `query!`
//! macros) so the new tables need no `.sqlx` offline-cache regeneration.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
use crate::series::schedule::{self, ScheduleKind, WaveDef};
use crate::state::AppState;

// ── DTOs ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct SeriesRecord {
    pub id: Uuid,
    pub questionnaire_id: Uuid,
    pub name: String,
    pub schedule_kind: String,
    pub wave_defs: Value,
    pub timezone: String,
    pub reminder_subject: String,
    pub reminder_body: String,
    pub random_seed: i64,
    pub status: String,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateSeriesRequest {
    pub questionnaire_id: Uuid,
    pub name: String,
    /// One of `fixed` | `random-interval` | `event`. Defaults to `fixed`.
    pub schedule_kind: Option<String>,
    /// Array of wave definitions (see `schedule::WaveDef`).
    pub wave_defs: Option<Value>,
    pub timezone: Option<String>,
    pub reminder_subject: Option<String>,
    pub reminder_body: Option<String>,
    /// Base seed for reproducible `random-interval` schedules.
    pub random_seed: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateSeriesRequest {
    pub name: Option<String>,
    pub schedule_kind: Option<String>,
    pub wave_defs: Option<Value>,
    pub timezone: Option<String>,
    pub reminder_subject: Option<String>,
    pub reminder_body: Option<String>,
    /// `active` | `archived`.
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct SeriesListQuery {
    pub questionnaire_id: Uuid,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct EnrollmentRecord {
    pub id: Uuid,
    pub series_id: Uuid,
    pub participant_ref: Option<String>,
    pub contact_channel: String,
    pub channel_kind: String,
    pub status: String,
    pub next_prompt_at: Option<chrono::DateTime<chrono::Utc>>,
    pub resume_token: Uuid,
    pub current_wave_index: i32,
    pub enrolled_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct EnrollRequest {
    pub participant_ref: Option<String>,
    /// Delivery address for `channel_kind` (an email address for `email`).
    pub contact_channel: String,
    /// Only `email` is supported today. Defaults to `email`.
    pub channel_kind: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EnrollResponse {
    #[serde(flatten)]
    pub enrollment: EnrollmentRecord,
    /// Absolute participant resume link (also delivered by every reminder).
    pub resume_link: String,
    /// Number of prompts materialized at enrollment (all waves for
    /// fixed/random schedules; 1 for event schedules).
    pub materialized_waves: i64,
}

/// What the participant client needs to open the correct wave from a
/// reminder link. `wave_index` + `series_elapsed_days` are exposed to the
/// runtime as the `_waveIndex` / `_seriesElapsedDays` flow variables.
#[derive(Debug, Serialize, ToSchema)]
pub struct SeriesPromptResolution {
    pub enrollment_id: Uuid,
    pub series_id: Uuid,
    pub questionnaire_id: Uuid,
    pub questionnaire_code: String,
    pub wave_index: i32,
    pub wave_label: Option<String>,
    pub total_waves: i64,
    /// Whole days since enrollment (floor). Seeds `_seriesElapsedDays`.
    pub series_elapsed_days: i64,
    /// Enrollment status: `active` | `completed` | `withdrawn`.
    pub status: String,
    /// When the CURRENT wave's prompt is scheduled (for the "come back
    /// later" state when it is in the future).
    pub scheduled_at: Option<chrono::DateTime<chrono::Utc>>,
    /// When the NEXT wave is due (participant "come back later" copy).
    pub next_prompt_at: Option<chrono::DateTime<chrono::Utc>>,
    pub version_major: Option<i32>,
    pub version_minor: Option<i32>,
    pub version_patch: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CompletePromptRequest {
    /// The fillout session that completed this wave.
    pub session_id: Uuid,
    /// The wave that was completed. Defaults to the enrollment's current
    /// wave when omitted.
    pub wave_index: Option<i32>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CompletePromptResponse {
    /// Enrollment status after advancing: `active` (more waves) or
    /// `completed` (series finished).
    pub status: String,
    pub next_wave_index: Option<i32>,
    pub next_prompt_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UnsubscribeResponse {
    pub status: String,
}

// ── Researcher handlers ──────────────────────────────────────────────

/// POST /api/series — create a study series for a questionnaire.
#[utoipa::path(
    post,
    path = "/api/series",
    request_body = CreateSeriesRequest,
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "Series created", body = SeriesRecord),
        (status = 403, description = "No access to questionnaire", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["series"]
)]
pub async fn create_series(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Json(body): Json<CreateSeriesRequest>,
) -> Result<(axum::http::StatusCode, Json<SeriesRecord>), ApiError> {
    let mut tx = tx.tx().await?;
    let project_id = questionnaire_project_id(&mut **tx, body.questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectWrite,
    )
    .await?;

    let kind = ScheduleKind::parse(body.schedule_kind.as_deref().unwrap_or("fixed"));
    let wave_defs = body.wave_defs.unwrap_or_else(|| Value::Array(Vec::new()));

    let record = sqlx::query_as::<_, SeriesRecord>(
        r#"
        INSERT INTO study_series
            (questionnaire_id, name, schedule_kind, wave_defs, timezone,
             reminder_subject, reminder_body, random_seed, created_by)
        VALUES ($1, $2, $3, $4,
                COALESCE($5, 'UTC'),
                COALESCE($6, 'Your next questionnaire is ready'),
                COALESCE($7, 'It is time for your next questionnaire. Open it here:\n\n{{link}}\n\nTo stop receiving these: {{unsubscribe}}'),
                COALESCE($8, 0),
                $9)
        RETURNING id, questionnaire_id, name, schedule_kind, wave_defs, timezone,
                  reminder_subject, reminder_body, random_seed, status, created_at
        "#,
    )
    .bind(body.questionnaire_id)
    .bind(&body.name)
    .bind(kind.as_str())
    .bind(&wave_defs)
    .bind(body.timezone.as_deref())
    .bind(body.reminder_subject.as_deref())
    .bind(body.reminder_body.as_deref())
    .bind(body.random_seed)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(record)))
}

/// GET /api/series?questionnaire_id=… — list series for a questionnaire.
#[utoipa::path(
    get,
    path = "/api/series",
    params(SeriesListQuery),
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Series for a questionnaire", body = [SeriesRecord])),
    tags = ["series"]
)]
pub async fn list_series(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Query(q): Query<SeriesListQuery>,
) -> Result<Json<Vec<SeriesRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    let project_id = questionnaire_project_id(&mut **tx, q.questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

    let rows = sqlx::query_as::<_, SeriesRecord>(
        r#"
        SELECT id, questionnaire_id, name, schedule_kind, wave_defs, timezone,
               reminder_subject, reminder_body, random_seed, status, created_at
        FROM study_series
        WHERE questionnaire_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(q.questionnaire_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(rows))
}

/// PATCH /api/series/{id} — update series definition / reminder copy.
#[utoipa::path(
    patch,
    path = "/api/series/{id}",
    request_body = UpdateSeriesRequest,
    params(("id" = Uuid, Path, description = "Series id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 200, description = "Series updated", body = SeriesRecord),
        (status = 404, description = "Series not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["series"]
)]
pub async fn update_series(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(series_id): Path<Uuid>,
    Json(body): Json<UpdateSeriesRequest>,
) -> Result<Json<SeriesRecord>, ApiError> {
    let mut tx = tx.tx().await?;
    let questionnaire_id = series_questionnaire_id(&mut tx, series_id).await?;
    let project_id = questionnaire_project_id(&mut **tx, questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectWrite,
    )
    .await?;

    let normalized_kind = body
        .schedule_kind
        .as_deref()
        .map(|k| ScheduleKind::parse(k).as_str().to_string());

    let record = sqlx::query_as::<_, SeriesRecord>(
        r#"
        UPDATE study_series SET
            name             = COALESCE($2, name),
            schedule_kind    = COALESCE($3, schedule_kind),
            wave_defs        = COALESCE($4, wave_defs),
            timezone         = COALESCE($5, timezone),
            reminder_subject = COALESCE($6, reminder_subject),
            reminder_body    = COALESCE($7, reminder_body),
            status           = COALESCE($8, status),
            updated_at       = now()
        WHERE id = $1
        RETURNING id, questionnaire_id, name, schedule_kind, wave_defs, timezone,
                  reminder_subject, reminder_body, random_seed, status, created_at
        "#,
    )
    .bind(series_id)
    .bind(body.name.as_deref())
    .bind(normalized_kind.as_deref())
    .bind(body.wave_defs.as_ref())
    .bind(body.timezone.as_deref())
    .bind(body.reminder_subject.as_deref())
    .bind(body.reminder_body.as_deref())
    .bind(body.status.as_deref())
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Series not found".into()))?;

    Ok(Json(record))
}

/// POST /api/series/{id}/enroll — enroll a participant and materialize the
/// prompt window (all waves for fixed/random; wave 0 for event).
#[utoipa::path(
    post,
    path = "/api/series/{id}/enroll",
    request_body = EnrollRequest,
    params(("id" = Uuid, Path, description = "Series id")),
    security(("bearerAuth" = [])),
    responses(
        (status = 201, description = "Participant enrolled", body = EnrollResponse),
        (status = 403, description = "No access to series", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["series"]
)]
pub async fn enroll(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(series_id): Path<Uuid>,
    Json(body): Json<EnrollRequest>,
) -> Result<(axum::http::StatusCode, Json<EnrollResponse>), ApiError> {
    let mut tx = tx.tx().await?;

    // Load the series (RLS admits via org member) and gate the mutation.
    let series = sqlx::query_as::<_, SeriesRecord>(
        r#"
        SELECT id, questionnaire_id, name, schedule_kind, wave_defs, timezone,
               reminder_subject, reminder_body, random_seed, status, created_at
        FROM study_series WHERE id = $1
        "#,
    )
    .bind(series_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Series not found".into()))?;

    let project_id = questionnaire_project_id(&mut **tx, series.questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectWrite,
    )
    .await?;

    let channel_kind = body.channel_kind.as_deref().unwrap_or("email");
    if channel_kind != "email" {
        return Err(ApiError::BadRequest(
            "Only the 'email' contact channel is supported".into(),
        ));
    }
    if body.contact_channel.trim().is_empty() {
        return Err(ApiError::BadRequest("contact_channel is required".into()));
    }

    // Per-enrollment seed so a random-interval schedule is reproducible yet
    // distinct per participant.
    let enrollment_seed: i64 = rand::random::<i64>();

    let enrollment = sqlx::query_as::<_, EnrollmentRecord>(
        r#"
        INSERT INTO series_enrollment
            (series_id, participant_ref, contact_channel, channel_kind, random_seed)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, series_id, participant_ref, contact_channel, channel_kind,
                  status, next_prompt_at, resume_token, current_wave_index, enrolled_at
        "#,
    )
    .bind(series_id)
    .bind(body.participant_ref.as_deref())
    .bind(body.contact_channel.trim())
    .bind(channel_kind)
    .bind(enrollment_seed)
    .fetch_one(&mut **tx)
    .await?;

    // Materialize the prompt window.
    let kind = ScheduleKind::parse(&series.schedule_kind);
    let waves = WaveDef::parse_all(&series.wave_defs);
    let enrolled_at = enrollment.enrolled_at.unwrap_or_else(chrono::Utc::now);
    let scheduled = schedule::compute_wave_schedule(
        kind,
        &waves,
        enrolled_at,
        series.random_seed,
        enrollment_seed,
    );

    let mut first_prompt_at: Option<chrono::DateTime<chrono::Utc>> = None;
    for wave in &scheduled {
        sqlx::query(
            r#"
            INSERT INTO series_prompt (enrollment_id, wave_index, scheduled_at)
            VALUES ($1, $2, $3)
            "#,
        )
        .bind(enrollment.id)
        .bind(wave.wave_index)
        .bind(wave.scheduled_at)
        .execute(&mut **tx)
        .await?;
        if first_prompt_at.is_none() || Some(wave.scheduled_at) < first_prompt_at {
            first_prompt_at = Some(wave.scheduled_at);
        }
    }

    // Point the scheduler cursor at the earliest materialized prompt.
    let enrollment = sqlx::query_as::<_, EnrollmentRecord>(
        r#"
        UPDATE series_enrollment
           SET next_prompt_at = $2, current_wave_index = 0, updated_at = now()
         WHERE id = $1
        RETURNING id, series_id, participant_ref, contact_channel, channel_kind,
                  status, next_prompt_at, resume_token, current_wave_index, enrolled_at
        "#,
    )
    .bind(enrollment.id)
    .bind(first_prompt_at)
    .fetch_one(&mut **tx)
    .await?;

    let code = questionnaire_code(series.questionnaire_id);
    let resume_link = format!(
        "{}/q/{}?token={}",
        state.config.public_app_origin.trim_end_matches('/'),
        code,
        enrollment.resume_token
    );

    Ok((
        axum::http::StatusCode::CREATED,
        Json(EnrollResponse {
            enrollment,
            resume_link,
            materialized_waves: scheduled.len() as i64,
        }),
    ))
}

/// GET /api/series/{id}/enrollments — list enrollments for a series.
#[utoipa::path(
    get,
    path = "/api/series/{id}/enrollments",
    params(("id" = Uuid, Path, description = "Series id")),
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Enrollments", body = [EnrollmentRecord])),
    tags = ["series"]
)]
pub async fn list_enrollments(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(series_id): Path<Uuid>,
) -> Result<Json<Vec<EnrollmentRecord>>, ApiError> {
    let mut tx = tx.tx().await?;
    let questionnaire_id = series_questionnaire_id(&mut tx, series_id).await?;
    let project_id = questionnaire_project_id(&mut **tx, questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

    let rows = sqlx::query_as::<_, EnrollmentRecord>(
        r#"
        SELECT id, series_id, participant_ref, contact_channel, channel_kind,
               status, next_prompt_at, resume_token, current_wave_index, enrolled_at
        FROM series_enrollment
        WHERE series_id = $1
        ORDER BY enrolled_at DESC
        "#,
    )
    .bind(series_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(rows))
}

// ── Participant handlers (anonymous, enrollment-token context) ───────

/// GET /api/series/prompt/{resume_token} — resolve a reminder link to the
/// current wave (+ pinned version + `_waveIndex` / `_seriesElapsedDays`).
/// Marks the current wave's prompt opened.
#[utoipa::path(
    get,
    path = "/api/series/prompt/{resume_token}",
    params(("resume_token" = Uuid, Path, description = "Enrollment resume token")),
    responses(
        (status = 200, description = "Resolved prompt", body = SeriesPromptResolution),
        (status = 404, description = "Unknown or invalid token", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["series"]
)]
pub async fn resolve_prompt(
    tx: Tx,
    Path(resume_token): Path<Uuid>,
) -> Result<Json<SeriesPromptResolution>, ApiError> {
    let mut tx = tx.tx().await?;

    // RLS admits this row only when app.enrollment_token = resume_token
    // (set by set_series_rls_context from the URL). A bad token → 0 rows.
    let enrollment = sqlx::query_as::<_, EnrollmentRecord>(
        r#"
        SELECT id, series_id, participant_ref, contact_channel, channel_kind,
               status, next_prompt_at, resume_token, current_wave_index, enrolled_at
        FROM series_enrollment
        WHERE resume_token = $1
        "#,
    )
    .bind(resume_token)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invalid or expired link".into()))?;

    let series = sqlx::query_as::<_, SeriesRecord>(
        r#"
        SELECT id, questionnaire_id, name, schedule_kind, wave_defs, timezone,
               reminder_subject, reminder_body, random_seed, status, created_at
        FROM study_series WHERE id = $1
        "#,
    )
    .bind(enrollment.series_id)
    .fetch_one(&mut **tx)
    .await?;

    // Version to pin for a fresh wave session (RLS-exempt table).
    let version = sqlx::query_as::<_, (Option<i32>, Option<i32>, Option<i32>)>(
        "SELECT version_major, version_minor, version_patch \
         FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(series.questionnaire_id)
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or((None, None, None));

    // Current wave prompt (for its scheduled_at, and to mark it opened).
    let scheduled_at = sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
        "SELECT scheduled_at FROM series_prompt \
         WHERE enrollment_id = $1 AND wave_index = $2",
    )
    .bind(enrollment.id)
    .bind(enrollment.current_wave_index)
    .fetch_optional(&mut **tx)
    .await?;

    // Mark opened (idempotent) for the current wave when it exists and is
    // still open. Best-effort; does not gate resolution.
    if enrollment.status == "active" {
        sqlx::query(
            r#"
            UPDATE series_prompt
               SET opened_at = COALESCE(opened_at, now()),
                   status = CASE WHEN status = 'delivered' THEN 'opened' ELSE status END
             WHERE enrollment_id = $1 AND wave_index = $2 AND completed_at IS NULL
            "#,
        )
        .bind(enrollment.id)
        .bind(enrollment.current_wave_index)
        .execute(&mut **tx)
        .await?;
    }

    let waves = WaveDef::parse_all(&series.wave_defs);
    let wave_label = waves
        .get(enrollment.current_wave_index.max(0) as usize)
        .and_then(|w| w.label.clone());

    let elapsed_days = enrollment
        .enrolled_at
        .map(|start| (chrono::Utc::now() - start).num_days().max(0))
        .unwrap_or(0);

    Ok(Json(SeriesPromptResolution {
        enrollment_id: enrollment.id,
        series_id: series.id,
        questionnaire_id: series.questionnaire_id,
        questionnaire_code: questionnaire_code(series.questionnaire_id),
        wave_index: enrollment.current_wave_index,
        wave_label,
        total_waves: waves.len() as i64,
        series_elapsed_days: elapsed_days,
        status: enrollment.status,
        scheduled_at,
        next_prompt_at: enrollment.next_prompt_at,
        version_major: version.0,
        version_minor: version.1,
        version_patch: version.2,
    }))
}

/// POST /api/series/prompt/{resume_token}/complete — advance the enrollment
/// after a wave is completed. Binds the session to the wave prompt and
/// schedules the next wave (materialized already for fixed/random; computed
/// now for event).
#[utoipa::path(
    post,
    path = "/api/series/prompt/{resume_token}/complete",
    request_body = CompletePromptRequest,
    params(("resume_token" = Uuid, Path, description = "Enrollment resume token")),
    responses(
        (status = 200, description = "Enrollment advanced", body = CompletePromptResponse),
        (status = 404, description = "Unknown or invalid token", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["series"]
)]
pub async fn complete_prompt(
    tx: Tx,
    Path(resume_token): Path<Uuid>,
    Json(body): Json<CompletePromptRequest>,
) -> Result<Json<CompletePromptResponse>, ApiError> {
    let mut tx = tx.tx().await?;

    let enrollment = sqlx::query_as::<_, EnrollmentRecord>(
        r#"
        SELECT id, series_id, participant_ref, contact_channel, channel_kind,
               status, next_prompt_at, resume_token, current_wave_index, enrolled_at
        FROM series_enrollment
        WHERE resume_token = $1
        "#,
    )
    .bind(resume_token)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Invalid or expired link".into()))?;

    let completed_wave = body.wave_index.unwrap_or(enrollment.current_wave_index);

    // Mark the wave prompt completed and bind the session. The FK check on
    // session_id runs at the system layer (bypasses RLS), so binding works
    // even though the anonymous caller cannot SELECT the session row.
    let now = chrono::Utc::now();
    sqlx::query(
        r#"
        UPDATE series_prompt
           SET completed_at = COALESCE(completed_at, $3),
               status = 'completed',
               session_id = COALESCE(session_id, $4)
         WHERE enrollment_id = $1 AND wave_index = $2
        "#,
    )
    .bind(enrollment.id)
    .bind(completed_wave)
    .bind(now)
    .bind(body.session_id)
    .execute(&mut **tx)
    .await?;

    // Determine the next wave.
    let series = sqlx::query_as::<_, SeriesRecord>(
        r#"
        SELECT id, questionnaire_id, name, schedule_kind, wave_defs, timezone,
               reminder_subject, reminder_body, random_seed, status, created_at
        FROM study_series WHERE id = $1
        "#,
    )
    .bind(enrollment.series_id)
    .fetch_one(&mut **tx)
    .await?;

    let kind = ScheduleKind::parse(&series.schedule_kind);
    let waves = WaveDef::parse_all(&series.wave_defs);

    // For event schedules the next wave is created lazily from THIS
    // completion; for fixed/random it was materialized at enrollment.
    if kind == ScheduleKind::Event {
        // enrollment.random_seed is not returned in EnrollmentRecord; read it.
        let enrollment_seed: i64 =
            sqlx::query_scalar("SELECT random_seed FROM series_enrollment WHERE id = $1")
                .bind(enrollment.id)
                .fetch_one(&mut **tx)
                .await?;

        if let Some(next) = schedule::next_event_wave_time(
            &waves,
            completed_wave,
            now,
            series.random_seed,
            enrollment_seed,
        ) {
            // INSERT the next wave's prompt (idempotent on the unique
            // (enrollment_id, wave_index) — ignore a duplicate from a
            // double completion).
            sqlx::query(
                r#"
                INSERT INTO series_prompt (enrollment_id, wave_index, scheduled_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (enrollment_id, wave_index) DO NOTHING
                "#,
            )
            .bind(enrollment.id)
            .bind(next.wave_index)
            .bind(next.scheduled_at)
            .execute(&mut **tx)
            .await?;
        }
    }

    // Recompute the cursor: earliest still-uncompleted prompt.
    let next_row = sqlx::query_as::<_, (i32, chrono::DateTime<chrono::Utc>)>(
        r#"
        SELECT wave_index, scheduled_at
        FROM series_prompt
        WHERE enrollment_id = $1 AND completed_at IS NULL
        ORDER BY scheduled_at ASC
        LIMIT 1
        "#,
    )
    .bind(enrollment.id)
    .fetch_optional(&mut **tx)
    .await?;

    let (new_status, next_wave_index, next_prompt_at) = match next_row {
        Some((wave_index, scheduled_at)) => ("active", Some(wave_index), Some(scheduled_at)),
        None => ("completed", None, None),
    };

    sqlx::query(
        r#"
        UPDATE series_enrollment
           SET status = $2,
               current_wave_index = COALESCE($3, current_wave_index),
               next_prompt_at = $4,
               updated_at = now()
         WHERE id = $1
        "#,
    )
    .bind(enrollment.id)
    .bind(new_status)
    .bind(next_wave_index)
    .bind(next_prompt_at)
    .execute(&mut **tx)
    .await?;

    Ok(Json(CompletePromptResponse {
        status: new_status.to_string(),
        next_wave_index,
        next_prompt_at,
    }))
}

/// POST /api/series/prompt/{resume_token}/unsubscribe — opt out. Flips the
/// enrollment to `withdrawn`; the scheduler stops sending (its due scan
/// filters `status='active'`).
#[utoipa::path(
    post,
    path = "/api/series/prompt/{resume_token}/unsubscribe",
    params(("resume_token" = Uuid, Path, description = "Enrollment resume token")),
    responses(
        (status = 200, description = "Unsubscribed", body = UnsubscribeResponse),
        (status = 404, description = "Unknown or invalid token", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["series"]
)]
pub async fn unsubscribe_prompt(
    tx: Tx,
    Path(resume_token): Path<Uuid>,
) -> Result<Json<UnsubscribeResponse>, ApiError> {
    let mut tx = tx.tx().await?;

    let updated = sqlx::query(
        r#"
        UPDATE series_enrollment
           SET status = 'withdrawn', next_prompt_at = NULL, updated_at = now()
         WHERE resume_token = $1
        "#,
    )
    .bind(resume_token)
    .execute(&mut **tx)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(ApiError::NotFound("Invalid or expired link".into()));
    }

    Ok(Json(UnsubscribeResponse {
        status: "withdrawn".to_string(),
    }))
}

// ── Helpers ──────────────────────────────────────────────────────────

/// Resolve a series' owning questionnaire id (RLS-admitted for org
/// members). 404 when the series is invisible / absent.
async fn series_questionnaire_id(
    conn: &mut sqlx::PgConnection,
    series_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>("SELECT questionnaire_id FROM study_series WHERE id = $1")
        .bind(series_id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or_else(|| ApiError::NotFound("Series not found".into()))
}

/// Resolve the owning project for a questionnaire via a plain query.
///
/// `questionnaire_definitions` is RLS-exempt (ADR 0012), so this lookup is
/// RLS-independent — series then authorize at `Scope::Project` (ADR 0034).
/// Returns `NotFound` when the questionnaire is absent/soft-deleted.
async fn questionnaire_project_id<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    questionnaire_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT project_id FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(questionnaire_id)
    .fetch_optional(executor)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))
}

/// Derive the public fillout code from a questionnaire id — the first 8
/// hex chars of the UUID, upper-cased (matches the by-code endpoint).
fn questionnaire_code(questionnaire_id: Uuid) -> String {
    questionnaire_id
        .simple()
        .to_string()
        .chars()
        .take(8)
        .collect::<String>()
        .to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::questionnaire_code;
    use uuid::Uuid;

    #[test]
    fn code_is_first_8_hex_uppercased() {
        let id = Uuid::parse_str("abcdef12-3456-7890-abcd-ef1234567890").unwrap();
        assert_eq!(questionnaire_code(id), "ABCDEF12");
    }
}
