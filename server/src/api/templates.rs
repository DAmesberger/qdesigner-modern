use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct QuestionTemplate {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub created_by: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub question_type: String,
    pub question_config: serde_json::Value,
    pub is_shared: Option<bool>,
    pub usage_count: Option<i32>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTemplateRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub description: Option<String>,
    #[validate(length(max = 100))]
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    #[validate(length(min = 1, max = 50))]
    pub question_type: String,
    pub question_config: serde_json::Value,
    pub is_shared: Option<bool>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateTemplateRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub description: Option<String>,
    #[validate(length(max = 100))]
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub question_config: Option<serde_json::Value>,
    pub is_shared: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct TemplateListQuery {
    pub category: Option<String>,
    pub search: Option<String>,
    #[serde(rename = "type")]
    pub question_type: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ── Path extractors ──────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct OrgTemplatePath {
    pub id: Uuid,  // organization_id
    pub tid: Uuid, // template_id
}

// ── Handlers ─────────────────────────────────────────────────────────

/// GET /api/organizations/{id}/templates
pub async fn list_templates(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Query(q): Query<TemplateListQuery>,
) -> Result<Json<Vec<QuestionTemplate>>, ApiError> {
    access::verify_org_membership(&state.pool, user.user_id, org_id).await?;

    let limit = q.limit.unwrap_or(50).min(100);
    let offset = q.offset.unwrap_or(0);

    // Build query dynamically based on filters
    // Templates visible to user: shared templates in org, or own templates
    let templates = sqlx::query_as::<_, QuestionTemplate>(
        r#"
        SELECT id, organization_id, created_by, name, description, category,
               tags, question_type, question_config, is_shared, usage_count,
               created_at, updated_at
        FROM question_templates
        WHERE organization_id = $1
          AND (is_shared = true OR created_by = $2)
          AND ($3::text IS NULL OR category = $3)
          AND ($4::text IS NULL OR question_type = $4)
          AND ($5::text IS NULL OR (
              name ILIKE '%' || $5 || '%'
              OR description ILIKE '%' || $5 || '%'
              OR $5 = ANY(tags)
          ))
        ORDER BY usage_count DESC, updated_at DESC
        LIMIT $6 OFFSET $7
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .bind(&q.category)
    .bind(&q.question_type)
    .bind(&q.search)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(templates))
}

/// POST /api/organizations/{id}/templates
pub async fn create_template(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Json(body): Json<CreateTemplateRequest>,
) -> Result<(axum::http::StatusCode, Json<QuestionTemplate>), ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    access::verify_org_membership(&state.pool, user.user_id, org_id).await?;

    let is_shared = body.is_shared.unwrap_or(false);
    let tags = body.tags.unwrap_or_default();

    let template = sqlx::query_as::<_, QuestionTemplate>(
        r#"
        INSERT INTO question_templates
            (organization_id, created_by, name, description, category, tags,
             question_type, question_config, is_shared)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, organization_id, created_by, name, description, category,
                  tags, question_type, question_config, is_shared, usage_count,
                  created_at, updated_at
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.category)
    .bind(&tags)
    .bind(&body.question_type)
    .bind(&body.question_config)
    .bind(is_shared)
    .fetch_one(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(template)))
}

/// GET /api/organizations/{id}/templates/{tid}
pub async fn get_template(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<OrgTemplatePath>,
) -> Result<Json<QuestionTemplate>, ApiError> {
    access::verify_org_membership(&state.pool, user.user_id, path.id).await?;

    let template = sqlx::query_as::<_, QuestionTemplate>(
        r#"
        SELECT id, organization_id, created_by, name, description, category,
               tags, question_type, question_config, is_shared, usage_count,
               created_at, updated_at
        FROM question_templates
        WHERE id = $1 AND organization_id = $2
          AND (is_shared = true OR created_by = $3)
        "#,
    )
    .bind(path.tid)
    .bind(path.id)
    .bind(user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Template not found".into()))?;

    // Increment usage count
    let _ = sqlx::query(
        "UPDATE question_templates SET usage_count = usage_count + 1 WHERE id = $1",
    )
    .bind(path.tid)
    .execute(&state.pool)
    .await;

    Ok(Json(template))
}

/// PATCH /api/organizations/{id}/templates/{tid}
pub async fn update_template(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<OrgTemplatePath>,
    Json(body): Json<UpdateTemplateRequest>,
) -> Result<Json<QuestionTemplate>, ApiError> {
    body.validate()
        .map_err(|e| ApiError::Validation(e.to_string()))?;

    access::verify_org_membership(&state.pool, user.user_id, path.id).await?;

    // Only the creator or org admins can update
    verify_template_write_access(&state, user.user_id, path.id, path.tid).await?;

    let mut parts: Vec<String> = Vec::new();
    let mut bind_idx = 3u32; // $1 = tid, $2 = org_id

    if body.name.is_some() {
        parts.push(format!("name = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.description.is_some() {
        parts.push(format!("description = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.category.is_some() {
        parts.push(format!("category = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.tags.is_some() {
        parts.push(format!("tags = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.question_config.is_some() {
        parts.push(format!("question_config = ${bind_idx}"));
        bind_idx += 1;
    }
    if body.is_shared.is_some() {
        parts.push(format!("is_shared = ${bind_idx}"));
    }

    if parts.is_empty() {
        return Err(ApiError::BadRequest("No fields to update".into()));
    }
    parts.push("updated_at = NOW()".into());

    let sql = format!(
        r#"UPDATE question_templates SET {}
        WHERE id = $1 AND organization_id = $2
        RETURNING id, organization_id, created_by, name, description, category,
                  tags, question_type, question_config, is_shared, usage_count,
                  created_at, updated_at"#,
        parts.join(", ")
    );

    let mut query = sqlx::query_as::<_, QuestionTemplate>(&sql)
        .bind(path.tid)
        .bind(path.id);

    if let Some(ref v) = body.name {
        query = query.bind(v);
    }
    if let Some(ref v) = body.description {
        query = query.bind(v);
    }
    if let Some(ref v) = body.category {
        query = query.bind(v);
    }
    if let Some(ref v) = body.tags {
        query = query.bind(v);
    }
    if let Some(ref v) = body.question_config {
        query = query.bind(v);
    }
    if let Some(ref v) = body.is_shared {
        query = query.bind(v);
    }

    let template = query
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Template not found".into()))?;

    Ok(Json(template))
}

/// DELETE /api/organizations/{id}/templates/{tid}
pub async fn delete_template(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(path): Path<OrgTemplatePath>,
) -> Result<Json<serde_json::Value>, ApiError> {
    access::verify_org_membership(&state.pool, user.user_id, path.id).await?;
    verify_template_write_access(&state, user.user_id, path.id, path.tid).await?;

    let result = sqlx::query(
        "DELETE FROM question_templates WHERE id = $1 AND organization_id = $2",
    )
    .bind(path.tid)
    .bind(path.id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Template not found".into()));
    }

    Ok(Json(serde_json::json!({ "message": "Template deleted" })))
}

// ── Helpers ──────────────────────────────────────────────────────────

async fn verify_template_write_access(
    state: &AppState,
    user_id: Uuid,
    org_id: Uuid,
    template_id: Uuid,
) -> Result<(), ApiError> {
    // Creator can always edit, org admins/owners can edit any template
    let has_write = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM question_templates
            WHERE id = $1 AND organization_id = $2 AND created_by = $3
        ) OR EXISTS(
            SELECT 1 FROM organization_members
            WHERE organization_id = $2 AND user_id = $3 AND status = 'active'
              AND role IN ('owner', 'admin')
        )
        "#,
    )
    .bind(template_id)
    .bind(org_id)
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;

    if !has_write {
        return Err(ApiError::Forbidden(
            "No write access to this template".into(),
        ));
    }
    Ok(())
}
