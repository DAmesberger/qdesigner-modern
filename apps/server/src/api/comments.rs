use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::state::AppState;

// ── Types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct CommentResponse {
    pub id: Uuid,
    pub questionnaire_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub author_id: Uuid,
    pub anchor_type: String,
    pub anchor_id: Option<String>,
    pub body: String,
    pub resolved: bool,
    pub resolved_by: Option<Uuid>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateCommentRequest {
    pub parent_id: Option<Uuid>,
    pub anchor_type: String,
    pub anchor_id: Option<String>,
    pub body: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateCommentRequest {
    pub body: Option<String>,
    pub resolved: Option<bool>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ListCommentsQuery {
    pub anchor_type: Option<String>,
    pub anchor_id: Option<String>,
    pub resolved: Option<bool>,
}

// ── Handlers ──────────────────────────────────────────────────────────────

/// POST /api/questionnaires/{qid}/comments
#[utoipa::path(
    post,
    path = "/api/questionnaires/{id}/comments",
    request_body = CreateCommentRequest,
    params(
        ("id" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Comment created", body = CommentResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["comments"]
)]
pub async fn create_comment(
    State(state): State<AppState>,
    Path(questionnaire_id): Path<Uuid>,
    user: AuthenticatedUser,
    Json(body): Json<CreateCommentRequest>,
) -> Result<Json<CommentResponse>, ApiError> {
    access::verify_questionnaire_access(&state.pool, user.user_id, questionnaire_id).await?;

    let comment = sqlx::query_as::<_, CommentResponse>(
        r#"
        INSERT INTO questionnaire_comments
            (questionnaire_id, parent_id, author_id, anchor_type, anchor_id, body)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, questionnaire_id, parent_id, author_id, anchor_type, anchor_id,
                  body, resolved, resolved_by, resolved_at, created_at, updated_at
        "#,
    )
    .bind(questionnaire_id)
    .bind(body.parent_id)
    .bind(user.user_id)
    .bind(&body.anchor_type)
    .bind(&body.anchor_id)
    .bind(&body.body)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(comment))
}

/// GET /api/questionnaires/{qid}/comments
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/comments",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        ListCommentsQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Comments for a questionnaire", body = [CommentResponse]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["comments"]
)]
pub async fn list_comments(
    State(state): State<AppState>,
    Path(questionnaire_id): Path<Uuid>,
    user: AuthenticatedUser,
    Query(query): Query<ListCommentsQuery>,
) -> Result<Json<Vec<CommentResponse>>, ApiError> {
    access::verify_questionnaire_access(&state.pool, user.user_id, questionnaire_id).await?;

    let comments = sqlx::query_as::<_, CommentResponse>(
        r#"
        SELECT id, questionnaire_id, parent_id, author_id, anchor_type, anchor_id,
               body, resolved, resolved_by, resolved_at, created_at, updated_at
        FROM questionnaire_comments
        WHERE questionnaire_id = $1
          AND ($2::text IS NULL OR anchor_type = $2)
          AND ($3::text IS NULL OR anchor_id = $3)
          AND ($4::bool IS NULL OR resolved = $4)
        ORDER BY created_at ASC
        "#,
    )
    .bind(questionnaire_id)
    .bind(&query.anchor_type)
    .bind(&query.anchor_id)
    .bind(query.resolved)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(comments))
}

/// PATCH /api/questionnaires/{qid}/comments/{cid}
#[utoipa::path(
    patch,
    path = "/api/questionnaires/{id}/comments/{cid}",
    request_body = UpdateCommentRequest,
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        ("cid" = Uuid, Path, description = "Comment id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Updated comment", body = CommentResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Comment not found or unauthorized", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["comments"]
)]
pub async fn update_comment(
    State(state): State<AppState>,
    Path((questionnaire_id, comment_id)): Path<(Uuid, Uuid)>,
    user: AuthenticatedUser,
    Json(body): Json<UpdateCommentRequest>,
) -> Result<Json<CommentResponse>, ApiError> {
    access::verify_questionnaire_access(&state.pool, user.user_id, questionnaire_id).await?;

    let resolved_by: Option<Uuid> = if body.resolved == Some(true) {
        Some(user.user_id)
    } else {
        None
    };

    let resolved_at: Option<DateTime<Utc>> = if body.resolved == Some(true) {
        Some(Utc::now())
    } else {
        None
    };

    let comment = sqlx::query_as::<_, CommentResponse>(
        r#"
        UPDATE questionnaire_comments
        SET body = COALESCE($4, body),
            resolved = COALESCE($5, resolved),
            resolved_by = CASE
                WHEN $5 = true THEN $6
                WHEN $5 = false THEN NULL
                ELSE resolved_by
            END,
            resolved_at = CASE
                WHEN $5 = true THEN $7
                WHEN $5 = false THEN NULL
                ELSE resolved_at
            END,
            updated_at = NOW()
        WHERE id = $1 AND questionnaire_id = $2
          AND (author_id = $3 OR $5 IS NOT NULL)
        RETURNING id, questionnaire_id, parent_id, author_id, anchor_type, anchor_id,
                  body, resolved, resolved_by, resolved_at, created_at, updated_at
        "#,
    )
    .bind(comment_id)
    .bind(questionnaire_id)
    .bind(user.user_id)
    .bind(&body.body)
    .bind(body.resolved)
    .bind(resolved_by)
    .bind(resolved_at)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Comment not found or unauthorized".to_string()))?;

    Ok(Json(comment))
}

/// DELETE /api/questionnaires/{qid}/comments/{cid}
#[utoipa::path(
    delete,
    path = "/api/questionnaires/{id}/comments/{cid}",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        ("cid" = Uuid, Path, description = "Comment id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Comment deleted", body = crate::openapi::DeletedResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Comment not found or unauthorized", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["comments"]
)]
pub async fn delete_comment(
    State(state): State<AppState>,
    Path((questionnaire_id, comment_id)): Path<(Uuid, Uuid)>,
    user: AuthenticatedUser,
) -> Result<Json<serde_json::Value>, ApiError> {
    access::verify_questionnaire_access(&state.pool, user.user_id, questionnaire_id).await?;

    let result = sqlx::query(
        r#"
        DELETE FROM questionnaire_comments
        WHERE id = $1 AND questionnaire_id = $2 AND author_id = $3
        "#,
    )
    .bind(comment_id)
    .bind(questionnaire_id)
    .bind(user.user_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound(
            "Comment not found or unauthorized".to_string(),
        ));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}
