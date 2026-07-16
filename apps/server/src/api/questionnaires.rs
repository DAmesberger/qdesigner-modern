use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::Validate;

use crate::api::csv::csv_field;
use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct Questionnaire {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub version: i32,
    pub content: serde_json::Value,
    pub status: String,
    pub settings: serde_json::Value,
    pub created_by: Option<Uuid>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub published_at: Option<chrono::DateTime<chrono::Utc>>,
    pub version_major: i32,
    pub version_minor: i32,
    pub version_patch: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct QuestionnaireByCode {
    pub id: Uuid,
    pub name: String,
    /// Owning organization id — lets the anonymous fillout route fetch org
    /// branding (`GET /api/organizations/{id}/branding`, E-RBAC-8) to theme the
    /// participant chrome.
    pub organization_id: Uuid,
    pub definition: serde_json::Value,
    pub is_active: bool,
    pub start_date: Option<chrono::NaiveDate>,
    pub end_date: Option<chrono::NaiveDate>,
    pub project: serde_json::Value,
    pub variables: serde_json::Value,
    pub global_scripts: serde_json::Value,
    pub version_major: i32,
    pub version_minor: i32,
    pub version_patch: i32,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateQuestionnaireRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub description: Option<String>,
    pub content: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateQuestionnaireRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub content: Option<serde_json::Value>,
    pub status: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct QuestionnaireListQuery {
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Path extractors ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ProjectQuestionnairePath {
    pub id: Uuid,  // project_id
    pub qid: Uuid, // questionnaire_id
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct QuestionnaireCodePath {
    pub code: String,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/questionnaires/by-code/:code
#[utoipa::path(
    get,
    path = "/api/questionnaires/by-code/{code}",
    params(
        ("code" = String, Path, description = "Public questionnaire code")
    ),
    responses(
        (status = 200, description = "Published questionnaire resolved by code", body = QuestionnaireByCode),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn get_questionnaire_by_code(
    State(state): State<AppState>,
    Path(path): Path<QuestionnaireCodePath>,
) -> Result<Json<QuestionnaireByCode>, ApiError> {
    let code = path.code.trim().to_uppercase();
    if code.len() < 6
        || code.len() > 12
        || !code
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return Err(ApiError::NotFound("Questionnaire not found".into()));
    }

    let questionnaire = sqlx::query_as::<_, QuestionnaireByCode>(
        r#"
        SELECT
            q.id,
            q.name,
            p.organization_id,
            q.content AS definition,
            (q.status = 'published' AND p.status = 'active') AS is_active,
            p.start_date,
            p.end_date,
            jsonb_build_object('id', p.id, 'name', p.name) AS project,
            COALESCE(q.content->'variables', '{}'::jsonb) AS variables,
            COALESCE(
                q.content->'global_scripts',
                q.content->'globalScripts',
                '{}'::jsonb
            ) AS global_scripts,
            q.version_major, q.version_minor, q.version_patch
        FROM questionnaire_definitions q
        JOIN projects p ON p.id = q.project_id
        WHERE UPPER(SUBSTRING(REPLACE(q.id::text, '-', ''), 1, 8)) = $1
          AND q.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND q.status = 'published'
        LIMIT 1
        "#,
    )
    .bind(&code)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    Ok(Json(questionnaire))
}

/// GET /api/projects/:id/questionnaires
#[utoipa::path(
    get,
    path = "/api/projects/{id}/questionnaires",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        QuestionnaireListQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "List questionnaires for a project", body = [Questionnaire]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn list_questionnaires(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Query(q): Query<QuestionnaireListQuery>,
) -> Result<Json<Vec<Questionnaire>>, ApiError> {
    let mut tx = tx.tx().await?;

    // Verify access to the project
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::QuestionnaireRead,
    )
    .await?;

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let questionnaires = if let Some(ref status) = q.status {
        sqlx::query_as::<_, Questionnaire>(
            r#"
            SELECT id, project_id, name, description, version, content, status,
                   settings, created_by, created_at, updated_at, published_at,
                   version_major, version_minor, version_patch
            FROM questionnaire_definitions
            WHERE project_id = $1 AND status = $2 AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(project_id)
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(&mut **tx)
        .await?
    } else {
        sqlx::query_as::<_, Questionnaire>(
            r#"
            SELECT id, project_id, name, description, version, content, status,
                   settings, created_by, created_at, updated_at, published_at,
                   version_major, version_minor, version_patch
            FROM questionnaire_definitions
            WHERE project_id = $1 AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&mut **tx)
        .await?
    };

    Ok(Json(questionnaires))
}

/// POST /api/projects/:id/questionnaires
#[utoipa::path(
    post,
    path = "/api/projects/{id}/questionnaires",
    request_body = CreateQuestionnaireRequest,
    params(
        ("id" = Uuid, Path, description = "Project id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 201, description = "Questionnaire created", body = Questionnaire),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn create_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateQuestionnaireRequest>,
) -> Result<(axum::http::StatusCode, Json<Questionnaire>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let mut tx = tx.tx().await?;

    // Verify write access
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::QuestionnaireWrite,
    )
    .await?;

    let content = body.content.unwrap_or_else(|| serde_json::json!({}));
    let settings = body.settings.unwrap_or_else(|| serde_json::json!({}));

    let q = sqlx::query_as::<_, Questionnaire>(
        r#"
        INSERT INTO questionnaire_definitions
            (project_id, name, description, content, settings, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, project_id, name, description, version, content, status,
                  settings, created_by, created_at, updated_at, published_at,
                  version_major, version_minor, version_patch
        "#,
    )
    .bind(project_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&content)
    .bind(&settings)
    .bind(user.user_id)
    .fetch_one(&mut **tx)
    .await
    // A duplicate (project_id, name, version) trips the unique index; that is a
    // benign conflict (retryable client-side), not a server fault. Map its 23505
    // to a 409 rather than letting `?` route it through Database → 500.
    .map_err(ApiError::from_db_error)?;

    sync_questionnaire_variable_definitions(&mut tx, &q).await?;

    Ok((axum::http::StatusCode::CREATED, Json(q)))
}

/// GET /api/projects/:id/questionnaires/:qid
#[utoipa::path(
    get,
    path = "/api/projects/{id}/questionnaires/{qid}",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("qid" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire details", body = Questionnaire),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn get_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(path): Path<ProjectQuestionnairePath>,
) -> Result<Json<Questionnaire>, ApiError> {
    let mut tx = tx.tx().await?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(path.id),
        Permission::QuestionnaireRead,
    )
    .await?;

    let q = sqlx::query_as::<_, Questionnaire>(
        r#"
        SELECT id, project_id, name, description, version, content, status,
               settings, created_by, created_at, updated_at, published_at,
               version_major, version_minor, version_patch
        FROM questionnaire_definitions
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(path.qid)
    .bind(path.id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    Ok(Json(q))
}

/// PATCH /api/projects/:id/questionnaires/:qid
#[utoipa::path(
    patch,
    path = "/api/projects/{id}/questionnaires/{qid}",
    request_body = UpdateQuestionnaireRequest,
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("qid" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire updated", body = Questionnaire),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope),
        (status = 422, description = "Validation error", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn update_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(path): Path<ProjectQuestionnairePath>,
    Json(body): Json<UpdateQuestionnaireRequest>,
) -> Result<Json<Questionnaire>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    let mut tx = tx.tx().await?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(path.id),
        Permission::QuestionnaireWrite,
    )
    .await?;

    // Snapshot current state into questionnaire_versions before updating
    snapshot_questionnaire_version(&mut tx, path.qid, user.user_id).await?;

    // Handle publish action
    if body.status.as_deref() == Some("published") {
        let q = sqlx::query_as::<_, Questionnaire>(
            r#"
            UPDATE questionnaire_definitions
            SET status = 'published', published_at = NOW(), updated_at = NOW(),
                version = version + 1
            WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
            RETURNING id, project_id, name, description, version, content, status,
                      settings, created_by, created_at, updated_at, published_at,
                      version_major, version_minor, version_patch
            "#,
        )
        .bind(path.qid)
        .bind(path.id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

        sync_questionnaire_variable_definitions(&mut tx, &q).await?;

        return Ok(Json(q));
    }

    // Build dynamic update
    let mut parts: Vec<String> = vec!["version = version + 1".into()];
    let mut bind_idx = 3u32; // $1 = qid, $2 = project_id

    if body.name.is_some() {
        parts.push(format!("name = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.description.is_some() {
        parts.push(format!("description = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.content.is_some() {
        parts.push(format!("content = ${bind_idx}"));
        bind_idx += 1;
        // F-37 (corrected): invalidate the cached CRDT binary ONLY when this
        // content write is genuinely out-of-band — i.e. when NO collab room is
        // currently seeding this questionnaire.
        //
        // The original F-37 NULLed `yjs_state` on *every* content write on the
        // premise that a content write is always the non-collab autosave writer.
        // That premise is false: the debounced autosave keeps running DURING a
        // collab session (it is triggered by collab-driven edits — a remote Yjs
        // update flips the store dirty), so an unconditional NULL wiped the live
        // room's authoritative binary on essentially every keystroke. The
        // sole-seeder invariant (the server reloads `yjs_state` verbatim to
        // preserve CRDT item identity across reconnects/restarts) was thereby
        // broken: after a restart or room eviction the CRDT re-seeds with fresh
        // identity, and a reconnecting tab duplicates every page.
        //
        // An open room in `YjsStore` is the authority: while it is live it owns
        // `yjs_state` (kept fresh by its own debounced persist) and must not be
        // clobbered. Only when no room is open is the write truly out-of-band
        // (REST-only edit, import, template apply, API-key update); there the
        // stale `yjs_state` must be dropped so the next room re-seeds from the
        // fresh content instead of masking this edit.
        if !state.yjs_store.has_active_room(&path.qid).await {
            parts.push("yjs_state = NULL".into());
        }
    }
    if body.status.is_some() {
        parts.push(format!("status = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.settings.is_some() {
        parts.push(format!("settings = ${bind_idx}"));
    }

    if parts.len() == 1 {
        // Only the version increment, no actual fields to update
        return Err(ApiError::BadRequest("No fields to update".into()));
    }
    parts.push("updated_at = NOW()".into());

    let sql = format!(
        r#"UPDATE questionnaire_definitions SET {}
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        RETURNING id, project_id, name, description, version, content, status,
                  settings, created_by, created_at, updated_at, published_at,
                  version_major, version_minor, version_patch"#,
        parts.join(", ")
    );

    let mut query = sqlx::query_as::<_, Questionnaire>(&sql)
        .bind(path.qid)
        .bind(path.id);

    if let Some(ref v) = body.name {
        query = query.bind(v);
    }
    if let Some(ref v) = body.description {
        query = query.bind(v);
    }
    if let Some(ref v) = body.content {
        query = query.bind(v);
    }
    if let Some(ref v) = body.status {
        query = query.bind(v);
    }
    if let Some(ref v) = body.settings {
        query = query.bind(v);
    }

    let q = query
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    sync_questionnaire_variable_definitions(&mut tx, &q).await?;

    Ok(Json(q))
}

/// POST /api/projects/:id/questionnaires/:qid/publish
#[utoipa::path(
    post,
    path = "/api/projects/{id}/questionnaires/{qid}/publish",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("qid" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire published", body = Questionnaire),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn publish_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(path): Path<ProjectQuestionnairePath>,
) -> Result<Json<Questionnaire>, ApiError> {
    let mut tx = tx.tx().await?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(path.id),
        Permission::QuestionnairePublish,
    )
    .await?;

    snapshot_questionnaire_version(&mut tx, path.qid, user.user_id).await?;

    let questionnaire = sqlx::query_as::<_, Questionnaire>(
        r#"
        UPDATE questionnaire_definitions
        SET status = 'published', published_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        RETURNING id, project_id, name, description, version, content, status,
                  settings, created_by, created_at, updated_at, published_at,
                  version_major, version_minor, version_patch
        "#,
    )
    .bind(path.qid)
    .bind(path.id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    sync_questionnaire_variable_definitions(&mut tx, &questionnaire).await?;

    Ok(Json(questionnaire))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct BumpVersionRequest {
    pub bump_type: String, // "major", "minor", "patch"
}

/// POST /api/projects/:id/questionnaires/:qid/bump-version
#[utoipa::path(
    post,
    path = "/api/projects/{id}/questionnaires/{qid}/bump-version",
    request_body = BumpVersionRequest,
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("qid" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire version incremented", body = Questionnaire),
        (status = 400, description = "Invalid bump type", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn bump_version(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(path): Path<ProjectQuestionnairePath>,
    Json(body): Json<BumpVersionRequest>,
) -> Result<Json<Questionnaire>, ApiError> {
    let mut tx = tx.tx().await?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(path.id),
        Permission::QuestionnaireWrite,
    )
    .await?;

    // Snapshot current version first
    snapshot_questionnaire_version(&mut tx, path.qid, user.user_id).await?;

    let q = match body.bump_type.as_str() {
        "major" => {
            sqlx::query_as::<_, Questionnaire>(
                r#"
                UPDATE questionnaire_definitions
                SET version_major = version_major + 1,
                    version_minor = 0,
                    version_patch = 0,
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
                RETURNING id, project_id, name, description, version, content, status,
                          settings, created_by, created_at, updated_at, published_at,
                          version_major, version_minor, version_patch
                "#,
            )
            .bind(path.qid)
            .bind(path.id)
            .fetch_optional(&mut **tx)
            .await?
        }
        "minor" => {
            sqlx::query_as::<_, Questionnaire>(
                r#"
                UPDATE questionnaire_definitions
                SET version_minor = version_minor + 1,
                    version_patch = 0,
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
                RETURNING id, project_id, name, description, version, content, status,
                          settings, created_by, created_at, updated_at, published_at,
                          version_major, version_minor, version_patch
                "#,
            )
            .bind(path.qid)
            .bind(path.id)
            .fetch_optional(&mut **tx)
            .await?
        }
        "patch" => {
            sqlx::query_as::<_, Questionnaire>(
                r#"
                UPDATE questionnaire_definitions
                SET version_patch = version_patch + 1,
                    version = version + 1,
                    updated_at = NOW()
                WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
                RETURNING id, project_id, name, description, version, content, status,
                          settings, created_by, created_at, updated_at, published_at,
                          version_major, version_minor, version_patch
                "#,
            )
            .bind(path.qid)
            .bind(path.id)
            .fetch_optional(&mut **tx)
            .await?
        }
        _ => {
            return Err(ApiError::BadRequest(
                "bump_type must be 'major', 'minor', or 'patch'".into(),
            ))
        }
    };

    let questionnaire = q.ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;
    sync_questionnaire_variable_definitions(&mut tx, &questionnaire).await?;

    Ok(Json(questionnaire))
}

/// DELETE /api/projects/:id/questionnaires/:qid  (soft delete)
#[utoipa::path(
    delete,
    path = "/api/projects/{id}/questionnaires/{qid}",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("qid" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire deleted", body = serde_json::Value),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn delete_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(path): Path<ProjectQuestionnairePath>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(path.id),
        Permission::QuestionnaireDelete,
    )
    .await?;

    let result = sqlx::query(
        "UPDATE questionnaire_definitions SET deleted_at = NOW() WHERE id = $1 AND project_id = $2",
    )
    .bind(path.qid)
    .bind(path.id)
    .execute(&mut **tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Questionnaire not found".into()));
    }

    Ok(Json(
        serde_json::json!({ "message": "Questionnaire deleted" }),
    ))
}

// ── Export ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, IntoParams)]
pub struct ExportQuery {
    pub format: Option<String>,
    /// Comma-separated list: variables, events, metadata
    pub include: Option<String>,
    /// Use SPSS-compatible 8-char column names
    pub spss: Option<bool>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
struct ExportRow {
    session_id: Uuid,
    participant_id: Option<String>,
    session_status: String,
    started_at: Option<chrono::DateTime<chrono::Utc>>,
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    question_id: String,
    value: serde_json::Value,
    reaction_time_us: Option<i64>,
    presented_at: Option<chrono::DateTime<chrono::Utc>>,
    answered_at: Option<chrono::DateTime<chrono::Utc>>,
    /// The exact questionnaire semver the session was filled out against. Without
    /// it an export cannot be tied back to the instrument that produced it, which
    /// makes the result set unusable for replication. Three separate components
    /// (never a pre-rendered string) — the consumer composes `major.minor.patch`.
    /// Null for sessions that predate version pinning.
    questionnaire_version_major: Option<i32>,
    questionnaire_version_minor: Option<i32>,
    questionnaire_version_patch: Option<i32>,
    /// Per-response timing provenance: which clocks produced the onset and the
    /// response stamp, the display/output latency corrections applied, and frame
    /// health. This blob is the evidence behind the platform's sub-millisecond
    /// timing claim, so it has to travel with the data it justifies.
    timing_provenance: Option<serde_json::Value>,
}

/// The export SELECT.
///
/// Public so `tests/export_integrity.rs` exercises the query the handler
/// actually runs rather than a copy that can silently drift out of sync — the
/// version pin and the timing provenance are only trustworthy if THIS statement
/// selects them.
pub const EXPORT_ROWS_SQL: &str = r#"
        SELECT
            s.id AS session_id,
            s.participant_id,
            s.status AS session_status,
            s.started_at,
            s.completed_at,
            r.question_id,
            r.value,
            r.reaction_time_us,
            r.presented_at,
            r.answered_at,
            s.questionnaire_version_major,
            s.questionnaire_version_minor,
            s.questionnaire_version_patch,
            r.timing_provenance
        FROM sessions s
        JOIN responses r ON r.session_id = s.id
        WHERE s.questionnaire_id = $1
        ORDER BY s.created_at ASC, r.created_at ASC
        "#;

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
struct ExportVariableRow {
    session_id: Uuid,
    variable_name: String,
    variable_value: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
struct ExportEventRow {
    session_id: Uuid,
    event_type: String,
    question_id: Option<String>,
    timestamp_us: i64,
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
struct ExportSessionMetadata {
    session_id: Uuid,
    metadata: serde_json::Value,
    browser_info: Option<serde_json::Value>,
}

/// GET /api/projects/:id/questionnaires/:qid/export
#[utoipa::path(
    get,
    path = "/api/projects/{id}/questionnaires/{qid}/export",
    params(
        ("id" = Uuid, Path, description = "Project id"),
        ("qid" = Uuid, Path, description = "Questionnaire id"),
        ExportQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire export", body = serde_json::Value),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn export_responses(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(path): Path<ProjectQuestionnairePath>,
    Query(query): Query<ExportQuery>,
) -> Result<Response, ApiError> {
    let mut tx = tx.tx().await?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(path.id),
        Permission::ResponseRead,
    )
    .await?;

    // Verify questionnaire exists
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM questionnaire_definitions WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL)",
    )
    .bind(path.qid)
    .bind(path.id)
    .fetch_one(&mut **tx)
    .await?;

    if !exists {
        return Err(ApiError::NotFound("Questionnaire not found".into()));
    }

    // Parse include flags
    let include_set: std::collections::HashSet<String> = query
        .include
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    let include_variables = include_set.contains("variables");
    let include_events = include_set.contains("events");
    let include_metadata = include_set.contains("metadata");
    let spss_names = query.spss.unwrap_or(false);

    let rows = sqlx::query_as::<_, ExportRow>(EXPORT_ROWS_SQL)
        .bind(path.qid)
        .fetch_all(&mut **tx)
        .await?;

    // Optionally fetch variables
    let variables = if include_variables {
        sqlx::query_as::<_, ExportVariableRow>(
            r#"
            SELECT sv.session_id, sv.variable_name, sv.variable_value
            FROM session_variables sv
            JOIN sessions s ON s.id = sv.session_id
            WHERE s.questionnaire_id = $1
            ORDER BY sv.session_id, sv.variable_name
            "#,
        )
        .bind(path.qid)
        .fetch_all(&mut **tx)
        .await?
    } else {
        vec![]
    };

    // Optionally fetch events
    let events = if include_events {
        sqlx::query_as::<_, ExportEventRow>(
            r#"
            SELECT ie.session_id, ie.event_type, ie.question_id, ie.timestamp_us, ie.metadata
            FROM interaction_events ie
            JOIN sessions s ON s.id = ie.session_id
            WHERE s.questionnaire_id = $1
            ORDER BY ie.session_id, ie.timestamp_us
            "#,
        )
        .bind(path.qid)
        .fetch_all(&mut **tx)
        .await?
    } else {
        vec![]
    };

    // Optionally fetch session metadata
    let session_metadata = if include_metadata {
        sqlx::query_as::<_, ExportSessionMetadata>(
            r#"
            SELECT s.id AS session_id, s.metadata, s.browser_info
            FROM sessions s
            WHERE s.questionnaire_id = $1
            ORDER BY s.created_at ASC
            "#,
        )
        .bind(path.qid)
        .fetch_all(&mut **tx)
        .await?
    } else {
        vec![]
    };

    let format = query.format.as_deref().unwrap_or("json");

    match format {
        "csv" => {
            let csv_out = render_export_csv(&rows, spss_names);

            Ok((
                [
                    (axum::http::header::CONTENT_TYPE, "text/csv; charset=utf-8"),
                    (
                        axum::http::header::CONTENT_DISPOSITION,
                        "attachment; filename=\"export.csv\"",
                    ),
                ],
                csv_out,
            )
                .into_response())
        }
        _ => {
            // JSON format with optional extra data
            let mut result = serde_json::json!({ "responses": rows });

            if include_variables {
                result["variables"] = serde_json::json!(variables);
            }
            if include_events {
                result["events"] = serde_json::json!(events);
            }
            if include_metadata {
                result["session_metadata"] = serde_json::json!(session_metadata);
            }

            // If no extras included, return flat array for backward compat
            if !include_variables && !include_events && !include_metadata {
                return Ok(Json(serde_json::json!(rows)).into_response());
            }

            Ok(Json(result).into_response())
        }
    }
}

impl ExportRow {
    /// Compose the session's version pin as `major.minor.patch`.
    ///
    /// An unpinned (or partially pinned) session renders as an EMPTY field, never
    /// as `0.0.0` — a reader must be able to tell "no version was recorded" apart
    /// from "version zero". This mirrors the client's `formatQuestionnaireVersion`.
    fn version_pin(&self) -> String {
        match (
            self.questionnaire_version_major,
            self.questionnaire_version_minor,
            self.questionnaire_version_patch,
        ) {
            (Some(major), Some(minor), Some(patch)) => format!("{major}.{minor}.{patch}"),
            _ => String::new(),
        }
    }
}

/// Render the export rows as CSV.
///
/// Extracted from the handler so the column contract and the escaping are
/// testable without standing up an HTTP round-trip — this producer previously
/// had no test at all, which is how it shipped interpolating four unescaped
/// client-supplied fields straight into a `format!`.
fn render_export_csv(rows: &[ExportRow], spss_names: bool) -> String {
    // Column names: standard or SPSS-compatible 8-char.
    let headers: [&str; 12] = if spss_names {
        [
            "sess_id", "part_id", "s_status", "q_ver", "s_start", "s_end", "q_id", "q_resp",
            "q_rt_us", "q_pres", "q_ans", "t_prov",
        ]
    } else {
        [
            "session_id",
            "participant_id",
            "session_status",
            "questionnaire_version",
            "started_at",
            "completed_at",
            "question_id",
            "value",
            "reaction_time_us",
            "presented_at",
            "answered_at",
            "timing_provenance",
        ]
    };

    let mut csv_out = headers.join(",");
    csv_out.push('\n');

    for row in rows {
        let value_str = match &row.value {
            serde_json::Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        let provenance_str = row
            .timing_provenance
            .as_ref()
            .map(|p| p.to_string())
            .unwrap_or_default();

        // EVERY field goes through `csv_field`. Previously only `value` was
        // escaped, so a participant id of `a,b` — client-supplied at session
        // creation — shifted every column after it.
        let fields = [
            row.session_id.to_string(),
            row.participant_id.clone().unwrap_or_default(),
            row.session_status.clone(),
            row.version_pin(),
            row.started_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
            row.completed_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
            row.question_id.clone(),
            value_str,
            row.reaction_time_us
                .map(|v| v.to_string())
                .unwrap_or_default(),
            row.presented_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
            row.answered_at.map(|t| t.to_rfc3339()).unwrap_or_default(),
            provenance_str,
        ];

        csv_out.push_str(
            &fields
                .iter()
                .map(|f| csv_field(f))
                .collect::<Vec<_>>()
                .join(","),
        );
        csv_out.push('\n');
    }

    csv_out
}

// ── Version History ──────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct QuestionnaireVersion {
    pub id: Uuid,
    pub questionnaire_id: Uuid,
    pub version: i32,
    pub content: serde_json::Value,
    pub title: Option<String>,
    pub description: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub created_by: Option<Uuid>,
    pub version_major: i32,
    pub version_minor: i32,
    pub version_patch: i32,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct VersionListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// GET /api/questionnaires/:id/versions
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/versions",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        VersionListQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Questionnaire version history", body = [QuestionnaireVersion]),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["questionnaires"]
)]
pub async fn list_versions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(questionnaire_id): Path<Uuid>,
    Query(q): Query<VersionListQuery>,
) -> Result<Json<Vec<QuestionnaireVersion>>, ApiError> {
    let mut tx = tx.tx().await?;

    // Verify access via the questionnaire's project
    let project_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT project_id FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(questionnaire_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::QuestionnaireRead,
    )
    .await?;

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let versions = sqlx::query_as::<_, QuestionnaireVersion>(
        r#"
        SELECT id, questionnaire_id, version, content, title, description,
               created_at, created_by,
               version_major, version_minor, version_patch
        FROM questionnaire_versions
        WHERE questionnaire_id = $1
        ORDER BY version DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(questionnaire_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(versions))
}

/// Snapshot the current questionnaire state into the versions table.
///
/// Takes an exclusive row lock on the questionnaire *before* reading its
/// version so that concurrent save/publish/bump requests are serialized on
/// this questionnaire — without the lock, two transactions could both read the
/// same `version` for their snapshot before either increments it and then both
/// try to INSERT the same `(questionnaire_id, version)` pair, colliding on the
/// `idx_questionnaire_versions_identity` unique index (HTTP 500).
///
/// The INSERT is also idempotent (`ON CONFLICT ... DO NOTHING`): publish does
/// not bump `version`, so re-publishing — or any save that doesn't advance the
/// version — must not create a duplicate snapshot row. `DO NOTHING` (rather
/// than `DO UPDATE`) preserves the first snapshot captured for a given version
/// number, which is the published/historical content for that version.
async fn snapshot_questionnaire_version(
    conn: &mut sqlx::PgConnection,
    questionnaire_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    // Serialize concurrent version mutations on this questionnaire.
    sqlx::query(
        r#"
        SELECT 1 FROM questionnaire_definitions
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE
        "#,
    )
    .bind(questionnaire_id)
    .execute(&mut *conn)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO questionnaire_versions (questionnaire_id, version, content, title, description, created_by, version_major, version_minor, version_patch)
        SELECT id, version, content, name, description, $2, version_major, version_minor, version_patch
        FROM questionnaire_definitions
        WHERE id = $1 AND deleted_at IS NULL
        ON CONFLICT (questionnaire_id, version) DO NOTHING
        "#,
    )
    .bind(questionnaire_id)
    .bind(user_id)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

fn extract_questionnaire_variable_definitions(content: &Value) -> Vec<(String, Value)> {
    let Some(variables) = content.get("variables") else {
        return Vec::new();
    };

    match variables {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                let Value::Object(object) = item else {
                    return None;
                };

                let name = object
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| object.get("id").and_then(Value::as_str))
                    .map(str::trim)
                    .filter(|name| !name.is_empty())?;

                Some((name.to_string(), item.clone()))
            })
            .collect(),
        Value::Object(entries) => entries
            .iter()
            .map(|(fallback_name, definition)| {
                let mut normalized = definition.clone();
                let name = definition
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| definition.get("id").and_then(Value::as_str))
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .unwrap_or(fallback_name);

                if let Value::Object(object) = &mut normalized {
                    object
                        .entry("name".to_string())
                        .or_insert_with(|| Value::String(name.to_string()));
                }

                (name.to_string(), normalized)
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn normalize_variable_declared_type(definition: &Value) -> String {
    definition
        .get("type")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("json")
        .to_ascii_lowercase()
}

fn normalize_variable_source_kind(definition: &Value) -> &'static str {
    if definition.get("formula").is_some() {
        "script"
    } else {
        definition
            .get("source")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| match value.to_ascii_lowercase().as_str() {
                "script" | "computed" => "script",
                "response" => "response",
                "manual" | "declared" => "declared",
                _ => "declared",
            })
            .unwrap_or("declared")
    }
}

fn normalize_variable_storage(declared_type: &str) -> (&'static str, &'static str) {
    match declared_type {
        "number" | "integer" | "float" | "double" | "reaction_time" | "stimulus_onset" => {
            ("scalar", "numeric")
        }
        "string" | "text" => ("scalar", "text"),
        "boolean" | "bool" => ("scalar", "boolean"),
        "date" | "time" | "datetime" | "timestamp" => ("scalar", "timestamp"),
        _ => ("raw", "none"),
    }
}

/// Reconcile the questionnaire_variable_definitions rows for one (q, version)
/// pair: delete-then-insert. Takes the caller's per-request connection so the
/// DELETE/INSERT pair commits together with whatever else the handler does;
/// before P5 this helper opened its own sub-transaction off `state.pool`,
/// which was unnecessary once handlers themselves run inside a tx.
async fn sync_questionnaire_variable_definitions(
    conn: &mut sqlx::PgConnection,
    questionnaire: &Questionnaire,
) -> Result<(), ApiError> {
    let definitions = extract_questionnaire_variable_definitions(&questionnaire.content);

    sqlx::query(
        r#"
        DELETE FROM questionnaire_variable_definitions
        WHERE questionnaire_id = $1
          AND version_major = $2
          AND version_minor = $3
          AND version_patch = $4
        "#,
    )
    .bind(questionnaire.id)
    .bind(questionnaire.version_major)
    .bind(questionnaire.version_minor)
    .bind(questionnaire.version_patch)
    .execute(&mut *conn)
    .await?;

    for (name, definition) in definitions {
        let declared_type = normalize_variable_declared_type(&definition);
        let source_kind = normalize_variable_source_kind(&definition);
        let (storage_class, index_strategy) = normalize_variable_storage(&declared_type);

        sqlx::query(
            r#"
            INSERT INTO questionnaire_variable_definitions (
                questionnaire_id,
                version_major,
                version_minor,
                version_patch,
                variable_name,
                declared_type,
                source_kind,
                storage_class,
                index_strategy,
                definition
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#,
        )
        .bind(questionnaire.id)
        .bind(questionnaire.version_major)
        .bind(questionnaire.version_minor)
        .bind(questionnaire.version_patch)
        .bind(name)
        .bind(declared_type)
        .bind(source_kind)
        .bind(storage_class)
        .bind(index_strategy)
        .bind(definition)
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

// Access helpers are in crate::api::access

#[cfg(test)]
mod export_csv_tests {
    use super::*;

    /// A pinned, fully-populated export row.
    fn row(overrides: impl FnOnce(&mut ExportRow)) -> ExportRow {
        let mut r = ExportRow {
            session_id: Uuid::nil(),
            participant_id: Some("p-1".into()),
            session_status: "completed".into(),
            started_at: None,
            completed_at: None,
            question_id: "q-1".into(),
            value: serde_json::json!("congruent"),
            reaction_time_us: Some(420_000),
            presented_at: None,
            answered_at: None,
            questionnaire_version_major: Some(1),
            questionnaire_version_minor: Some(4),
            questionnaire_version_patch: Some(2),
            timing_provenance: Some(serde_json::json!({ "onsetMethod": "raf" })),
        };
        overrides(&mut r);
        r
    }

    fn data_line(csv: &str) -> String {
        csv.lines().nth(1).expect("a data line").to_string()
    }

    /// A minimal RFC-4180 reader used as an independent oracle: it decodes what a
    /// spreadsheet would actually see, so an assertion about "which cell holds
    /// what" cannot be satisfied by a string that merely looks right.
    fn parse_record(csv: &str, record_index: usize) -> Vec<String> {
        let mut records: Vec<Vec<String>> = vec![];
        let mut fields: Vec<String> = vec![];
        let mut field = String::new();
        let mut in_quotes = false;
        let mut chars = csv.chars().peekable();

        while let Some(c) = chars.next() {
            match c {
                '"' if in_quotes && chars.peek() == Some(&'"') => {
                    chars.next();
                    field.push('"');
                }
                '"' => in_quotes = !in_quotes,
                ',' if !in_quotes => fields.push(std::mem::take(&mut field)),
                '\n' if !in_quotes => {
                    fields.push(std::mem::take(&mut field));
                    records.push(std::mem::take(&mut fields));
                }
                other => field.push(other),
            }
        }
        if !field.is_empty() || !fields.is_empty() {
            fields.push(field);
            records.push(fields);
        }
        records
            .get(record_index)
            .unwrap_or_else(|| panic!("no record at index {record_index}"))
            .clone()
    }

    #[test]
    fn header_carries_the_version_pin_and_timing_provenance() {
        let csv = render_export_csv(&[row(|_| {})], false);
        let header = csv.lines().next().unwrap();
        assert_eq!(
            header,
            "session_id,participant_id,session_status,questionnaire_version,started_at,completed_at,question_id,value,reaction_time_us,presented_at,answered_at,timing_provenance"
        );
    }

    #[test]
    fn spss_header_carries_them_too_within_the_8_char_limit() {
        let csv = render_export_csv(&[row(|_| {})], true);
        let header = csv.lines().next().unwrap();
        assert!(
            header.contains("q_ver"),
            "SPSS header drops the version pin"
        );
        assert!(
            header.contains("t_prov"),
            "SPSS header drops the provenance"
        );
        for name in header.split(',') {
            assert!(name.len() <= 8, "SPSS name over 8 chars: {name}");
        }
    }

    #[test]
    fn a_pinned_row_renders_the_semver_and_the_provenance_blob() {
        let csv = render_export_csv(&[row(|_| {})], false);
        let line = data_line(&csv);
        let cells: Vec<&str> = line.split(',').collect();
        assert_eq!(cells[3], "1.4.2");
        assert!(
            data_line(&csv).contains("onsetMethod"),
            "provenance blob missing from the row"
        );
    }

    #[test]
    fn an_unpinned_row_renders_an_empty_cell_not_version_zero() {
        // "no version recorded" must be distinguishable from "version 0.0.0".
        let csv = render_export_csv(
            &[row(|r| {
                r.questionnaire_version_major = None;
                r.questionnaire_version_minor = None;
                r.questionnaire_version_patch = None;
            })],
            false,
        );
        let line = data_line(&csv);
        let cells: Vec<&str> = line.split(',').collect();
        assert_eq!(cells[3], "");
        assert!(!csv.contains("0.0.0"));
    }

    #[test]
    fn a_partially_pinned_row_does_not_fabricate_the_missing_component() {
        let csv = render_export_csv(&[row(|r| r.questionnaire_version_patch = None)], false);
        let line = data_line(&csv);
        let cells: Vec<&str> = line.split(',').collect();
        assert_eq!(cells[3], "");
    }

    #[test]
    fn a_participant_id_with_a_comma_does_not_shift_the_columns() {
        // The bug: participant_id was interpolated raw, so `a,b` split into two
        // cells and every column after it was off by one.
        let csv = render_export_csv(&[row(|r| r.participant_id = Some("a,b".into()))], false);
        let line = data_line(&csv);
        assert!(
            line.contains("\"a,b\""),
            "participant_id not quoted: {line}"
        );

        // The row still has exactly 12 fields, and the version is still in slot 3.
        let record = parse_record(&csv, 1);
        assert_eq!(record.len(), 12, "column count shifted: {record:?}");
        assert_eq!(record[1], "a,b");
        assert_eq!(record[3], "1.4.2");
    }

    #[test]
    fn a_participant_id_with_a_quote_is_escaped() {
        let csv = render_export_csv(&[row(|r| r.participant_id = Some("a\"b".into()))], false);
        assert!(data_line(&csv).contains("\"a\"\"b\""));
    }

    #[test]
    fn a_lone_carriage_return_in_a_field_does_not_split_the_row() {
        let csv = render_export_csv(&[row(|r| r.question_id = "q\r1".into())], false);
        assert!(csv.contains("\"q\r1\""), "bare CR left unquoted");
    }

    #[test]
    fn no_client_supplied_field_can_emit_a_live_formula() {
        let csv = render_export_csv(
            &[row(|r| {
                r.participant_id = Some("=cmd|'/c calc'!A1".into());
                r.question_id = "@SUM(1+1)".into();
                r.value = serde_json::json!("=1+1");
            })],
            false,
        );

        let record = parse_record(&csv, 1);
        for cell in &record {
            assert!(
                !cell.starts_with(['=', '@']),
                "live formula landed in a cell: {cell}"
            );
        }
        assert_eq!(record[1], "'=cmd|'/c calc'!A1");
        assert_eq!(record[6], "'@SUM(1+1)");
        assert_eq!(record[7], "'=1+1");
    }

    #[test]
    fn a_negative_reaction_time_is_not_mangled() {
        let csv = render_export_csv(&[row(|r| r.reaction_time_us = Some(-14))], false);
        let line = data_line(&csv);
        let cells: Vec<&str> = line.split(',').collect();
        assert_eq!(cells[8], "-14");
    }
}
