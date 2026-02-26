use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
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
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct QuestionnaireByCode {
    pub id: Uuid,
    pub name: String,
    pub definition: serde_json::Value,
    pub is_active: bool,
    pub start_date: Option<chrono::NaiveDate>,
    pub end_date: Option<chrono::NaiveDate>,
    pub project: serde_json::Value,
    pub variables: serde_json::Value,
    pub global_scripts: serde_json::Value,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateQuestionnaireRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub description: Option<String>,
    pub content: Option<serde_json::Value>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateQuestionnaireRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub content: Option<serde_json::Value>,
    pub status: Option<String>,
    pub settings: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
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

#[derive(Debug, Deserialize)]
pub struct QuestionnaireCodePath {
    pub code: String,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/questionnaires/by-code/:code
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
            ) AS global_scripts
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
pub async fn list_questionnaires(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(project_id): Path<Uuid>,
    Query(q): Query<QuestionnaireListQuery>,
) -> Result<Json<Vec<Questionnaire>>, ApiError> {
    // Verify access to the project
    verify_project_access(&state, user.user_id, project_id).await?;

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    let questionnaires = if let Some(ref status) = q.status {
        sqlx::query_as::<_, Questionnaire>(
            r#"
            SELECT id, project_id, name, description, version, content, status,
                   settings, created_by, created_at, updated_at, published_at
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
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query_as::<_, Questionnaire>(
            r#"
            SELECT id, project_id, name, description, version, content, status,
                   settings, created_by, created_at, updated_at, published_at
            FROM questionnaire_definitions
            WHERE project_id = $1 AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(project_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?
    };

    Ok(Json(questionnaires))
}

/// POST /api/projects/:id/questionnaires
pub async fn create_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateQuestionnaireRequest>,
) -> Result<(axum::http::StatusCode, Json<Questionnaire>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    // Verify write access
    verify_project_write_access(&state, user.user_id, project_id).await?;

    let content = body.content.unwrap_or_else(|| serde_json::json!({}));
    let settings = body.settings.unwrap_or_else(|| serde_json::json!({}));

    let q = sqlx::query_as::<_, Questionnaire>(
        r#"
        INSERT INTO questionnaire_definitions
            (project_id, name, description, content, settings, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, project_id, name, description, version, content, status,
                  settings, created_by, created_at, updated_at, published_at
        "#,
    )
    .bind(project_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&content)
    .bind(&settings)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(q)))
}

/// GET /api/projects/:id/questionnaires/:qid
pub async fn get_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<ProjectQuestionnairePath>,
) -> Result<Json<Questionnaire>, ApiError> {
    verify_project_access(&state, user.user_id, path.id).await?;

    let q = sqlx::query_as::<_, Questionnaire>(
        r#"
        SELECT id, project_id, name, description, version, content, status,
               settings, created_by, created_at, updated_at, published_at
        FROM questionnaire_definitions
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(path.qid)
    .bind(path.id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    Ok(Json(q))
}

/// PATCH /api/projects/:id/questionnaires/:qid
pub async fn update_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<ProjectQuestionnairePath>,
    Json(body): Json<UpdateQuestionnaireRequest>,
) -> Result<Json<Questionnaire>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    verify_project_write_access(&state, user.user_id, path.id).await?;

    // Handle publish action
    if body.status.as_deref() == Some("published") {
        let q = sqlx::query_as::<_, Questionnaire>(
            r#"
            UPDATE questionnaire_definitions
            SET status = 'published', published_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
            RETURNING id, project_id, name, description, version, content, status,
                      settings, created_by, created_at, updated_at, published_at
            "#,
        )
        .bind(path.qid)
        .bind(path.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

        return Ok(Json(q));
    }

    // Build dynamic update
    let mut parts: Vec<String> = Vec::new();
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
    }
    if body.status.is_some() {
        parts.push(format!("status = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.settings.is_some() {
        parts.push(format!("settings = ${bind_idx}"));
    }

    if parts.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }
    parts.push("updated_at = NOW()".into());

    let sql = format!(
        r#"UPDATE questionnaire_definitions SET {}
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        RETURNING id, project_id, name, description, version, content, status,
                  settings, created_by, created_at, updated_at, published_at"#,
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
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    Ok(Json(q))
}

/// POST /api/projects/:id/questionnaires/:qid/publish
pub async fn publish_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<ProjectQuestionnairePath>,
) -> Result<Json<Questionnaire>, ApiError> {
    verify_project_write_access(&state, user.user_id, path.id).await?;

    let questionnaire = sqlx::query_as::<_, Questionnaire>(
        r#"
        UPDATE questionnaire_definitions
        SET status = 'published', published_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
        RETURNING id, project_id, name, description, version, content, status,
                  settings, created_by, created_at, updated_at, published_at
        "#,
    )
    .bind(path.qid)
    .bind(path.id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    Ok(Json(questionnaire))
}

/// DELETE /api/projects/:id/questionnaires/:qid  (soft delete)
pub async fn delete_questionnaire(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<ProjectQuestionnairePath>,
) -> Result<Json<serde_json::Value>, ApiError> {
    verify_project_write_access(&state, user.user_id, path.id).await?;

    let result = sqlx::query(
        "UPDATE questionnaire_definitions SET deleted_at = NOW() WHERE id = $1 AND project_id = $2",
    )
    .bind(path.qid)
    .bind(path.id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Questionnaire not found".into()));
    }

    Ok(Json(
        serde_json::json!({ "message": "Questionnaire deleted" }),
    ))
}

// ── Helpers ──────────────────────────────────────────────────────────

async fn verify_project_access(
    state: &AppState,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = $1 AND om.user_id = $2 AND om.status = 'active'
              AND p.deleted_at IS NULL
        )
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden("No access to this project".into()));
    }
    Ok(())
}

async fn verify_project_write_access(
    state: &AppState,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<(), ApiError> {
    // Check project member with editor+ role, or org admin+
    let has_write = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM project_members
            WHERE project_id = $1 AND user_id = $2 AND role IN ('owner', 'admin', 'editor')
        ) OR EXISTS(
            SELECT 1 FROM projects p
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE p.id = $1 AND om.user_id = $2 AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
        )
        "#,
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;

    if !has_write {
        return Err(ApiError::Forbidden(
            "No write access to this project".into(),
        ));
    }
    Ok(())
}
