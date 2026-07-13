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
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::{Permission, ProjectRole};
use crate::state::AppState;

/// Resolve the owning project for a questionnaire via a plain query.
///
/// `questionnaire_definitions` is RLS-exempt (ADR 0012), so this lookup is
/// RLS-independent — it always resolves regardless of the caller's row
/// visibility. Comments/series then authorize at `Scope::Project` (ADR 0034).
/// Returns `NotFound` when the questionnaire is absent/soft-deleted, matching
/// the existing 404 contract.
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
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".to_string()))
}

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
    tx: Tx,
    Json(body): Json<CreateCommentRequest>,
) -> Result<Json<CommentResponse>, ApiError> {
    let mut tx = tx.tx().await?;

    let project_id = questionnaire_project_id(&mut **tx, questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

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
    .fetch_one(&mut **tx)
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
    tx: Tx,
    Query(query): Query<ListCommentsQuery>,
) -> Result<Json<Vec<CommentResponse>>, ApiError> {
    let mut tx = tx.tx().await?;

    let project_id = questionnaire_project_id(&mut **tx, questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

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
    .fetch_all(&mut **tx)
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
    tx: Tx,
    Json(body): Json<UpdateCommentRequest>,
) -> Result<Json<CommentResponse>, ApiError> {
    let mut tx = tx.tx().await?;

    let project_id = questionnaire_project_id(&mut **tx, questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

    // ADR 0034 bug fix: split the body concern from the resolve concern.
    // Load the target comment so a body edit can be gated on authorship
    // independently of a resolve change. A `resolved` value no longer buys a
    // caller the right to rewrite another author's body.
    let author_id: Uuid = sqlx::query_scalar(
        "SELECT author_id FROM questionnaire_comments WHERE id = $1 AND questionnaire_id = $2",
    )
    .bind(comment_id)
    .bind(questionnaire_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| ApiError::NotFound("Comment not found or unauthorized".to_string()))?;

    // A body change requires authorship; reject loudly rather than silently
    // no-op'ing the body so a non-author's combined body+resolve PATCH fails.
    // A resolve-only change needs only project read (already granted above).
    if body.body.is_some() && author_id != user.user_id {
        return Err(ApiError::Forbidden(
            "Only the author can edit a comment's body".to_string(),
        ));
    }

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
        SET body = COALESCE($3, body),
            resolved = COALESCE($4, resolved),
            resolved_by = CASE
                WHEN $4 = true THEN $5
                WHEN $4 = false THEN NULL
                ELSE resolved_by
            END,
            resolved_at = CASE
                WHEN $4 = true THEN $6
                WHEN $4 = false THEN NULL
                ELSE resolved_at
            END,
            updated_at = NOW()
        WHERE id = $1 AND questionnaire_id = $2
        RETURNING id, questionnaire_id, parent_id, author_id, anchor_type, anchor_id,
                  body, resolved, resolved_by, resolved_at, created_at, updated_at
        "#,
    )
    .bind(comment_id)
    .bind(questionnaire_id)
    .bind(&body.body)
    .bind(body.resolved)
    .bind(resolved_by)
    .bind(resolved_at)
    .fetch_optional(&mut **tx)
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
    tx: Tx,
) -> Result<Json<serde_json::Value>, ApiError> {
    let mut tx = tx.tx().await?;

    let project_id = questionnaire_project_id(&mut **tx, questionnaire_id).await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Project(project_id),
        Permission::ProjectRead,
    )
    .await?;

    // ADR 0034: the author OR a project admin (moderation) may delete. Reuse
    // the tiered project gate for the admin check — a plain non-author member
    // matches neither branch and gets the 404 below, as before.
    let is_project_admin =
        access::verify_project_access(&mut **tx, user.user_id, project_id, ProjectRole::Admin)
            .await
            .is_ok();

    let result = sqlx::query(
        r#"
        DELETE FROM questionnaire_comments
        WHERE id = $1 AND questionnaire_id = $2 AND (author_id = $3 OR $4)
        "#,
    )
    .bind(comment_id)
    .bind(questionnaire_id)
    .bind(user.user_id)
    .bind(is_project_admin)
    .execute(&mut **tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound(
            "Comment not found or unauthorized".to_string(),
        ));
    }

    Ok(Json(serde_json::json!({ "deleted": true })))
}
