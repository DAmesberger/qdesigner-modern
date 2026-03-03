use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::auth::OptionalUser;
use crate::state::AppState;

// ── Models ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Session {
    pub id: Uuid,
    pub questionnaire_id: Uuid,
    pub participant_id: Option<String>,
    pub status: String,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_activity_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: serde_json::Value,
    pub browser_info: Option<serde_json::Value>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub questionnaire_id: Uuid,
    pub participant_id: Option<String>,
    pub browser_info: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionRequest {
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ResponseRecord {
    pub id: Uuid,
    pub session_id: Uuid,
    pub question_id: String,
    pub value: serde_json::Value,
    pub reaction_time_us: Option<i64>,
    pub presented_at: Option<chrono::DateTime<chrono::Utc>>,
    pub answered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: serde_json::Value,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct SubmitResponseRequest {
    pub question_id: String,
    pub value: serde_json::Value,
    /// Microsecond-precision reaction time (BIGINT).
    pub reaction_time_us: Option<i64>,
    pub presented_at: Option<chrono::DateTime<chrono::Utc>>,
    pub answered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum SubmitResponsesPayload {
    Single(SubmitResponseRequest),
    Batch {
        responses: Vec<SubmitResponseRequest>,
    },
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct InteractionEventRecord {
    pub id: Uuid,
    pub session_id: Uuid,
    pub event_type: String,
    pub question_id: Option<String>,
    pub timestamp_us: i64,
    pub metadata: Option<serde_json::Value>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SessionVariableRecord {
    pub id: Uuid,
    pub session_id: Uuid,
    pub variable_name: String,
    pub variable_value: Option<serde_json::Value>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct ResponseListQuery {
    pub question_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SessionVariableRequest {
    pub name: String,
    pub value: Value,
}

#[derive(Debug, Deserialize)]
pub struct InteractionEventRequest {
    #[serde(default, alias = "questionId")]
    pub question_id: Option<String>,
    #[serde(alias = "eventType")]
    pub event_type: String,
    #[serde(default, alias = "timestampUs")]
    pub timestamp_us: Option<i64>,
    #[serde(default)]
    pub timestamp: Option<f64>,
    #[serde(default, alias = "eventData")]
    pub event_data: Option<Value>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct SessionListQuery {
    pub questionnaire_id: Option<Uuid>,
    pub participant_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SessionAggregateQuery {
    pub questionnaire_id: Uuid,
    pub source: Option<String>,
    pub key: String,
    pub participant_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SessionCompareQuery {
    pub questionnaire_id: Uuid,
    pub source: Option<String>,
    pub key: String,
    pub left_participant_id: String,
    pub right_participant_id: String,
}

#[derive(Debug, Serialize)]
pub struct NumericStatsSummary {
    pub sample_count: usize,
    pub mean: Option<f64>,
    pub median: Option<f64>,
    pub std_dev: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub p10: Option<f64>,
    pub p25: Option<f64>,
    pub p50: Option<f64>,
    pub p75: Option<f64>,
    pub p90: Option<f64>,
    pub p95: Option<f64>,
    pub p99: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct SessionAggregateResponse {
    pub questionnaire_id: Uuid,
    pub source: String,
    pub key: String,
    pub participant_count: usize,
    pub stats: NumericStatsSummary,
}

#[derive(Debug, Serialize)]
pub struct ParticipantStats {
    pub participant_id: String,
    pub stats: NumericStatsSummary,
}

#[derive(Debug, Serialize)]
pub struct ComparisonDelta {
    pub mean_delta: Option<f64>,
    pub median_delta: Option<f64>,
    pub z_score: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct SessionCompareResponse {
    pub questionnaire_id: Uuid,
    pub source: String,
    pub key: String,
    pub left: ParticipantStats,
    pub right: ParticipantStats,
    pub delta: ComparisonDelta,
}

#[derive(Debug, Deserialize)]
pub struct DashboardQuery {
    pub organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CrossProjectAnalyticsQuery {
    pub questionnaire_ids: String,
    pub metrics: Option<String>,
    pub source: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CrossProjectAnalyticsResponse {
    pub questionnaires: Vec<QuestionnaireAnalytics>,
    pub aggregate: AggregateOverview,
    pub cross_comparisons: Option<Vec<CrossComparison>>,
}

#[derive(Debug, Serialize)]
pub struct QuestionnaireAnalytics {
    pub questionnaire_id: Uuid,
    pub name: String,
    pub response_count: i64,
    pub completed_sessions: i64,
    pub completion_rate: f64,
    pub timing_stats: Option<NumericStatsSummary>,
    pub variable_stats: Option<NumericStatsSummary>,
}

#[derive(Debug, Serialize)]
pub struct AggregateOverview {
    pub total_responses: i64,
    pub total_completed_sessions: i64,
    pub overall_completion_rate: f64,
    pub overall_timing_stats: Option<NumericStatsSummary>,
    pub overall_variable_stats: Option<NumericStatsSummary>,
}

#[derive(Debug, Serialize)]
pub struct CrossComparison {
    pub questionnaire_a: Uuid,
    pub questionnaire_b: Uuid,
    pub mean_delta: Option<f64>,
    pub median_delta: Option<f64>,
    pub correlation: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct DashboardSummary {
    pub questionnaires: Vec<QuestionnaireSummary>,
    pub recent_activity: Vec<ActivityRecord>,
    pub stats: DashboardStats,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct QuestionnaireSummary {
    pub id: Uuid,
    pub name: String,
    pub project_id: Uuid,
    pub status: String,
    pub total_responses: i64,
    pub completed_sessions: i64,
    pub avg_completion_time_ms: Option<f64>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ActivityRecord {
    pub session_id: Uuid,
    pub participant_id: Option<String>,
    pub questionnaire_name: String,
    pub status: String,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DashboardStats {
    pub total_questionnaires: i64,
    pub total_responses: i64,
    pub active_questionnaires: i64,
    pub avg_completion_rate: f64,
}

#[derive(Debug, Clone, Copy)]
enum AggregateSource {
    Variable,
    Response,
}

// ── Handlers ─────────────────────────────────────────────────────────

/// POST /api/sessions — create a new session (can be anonymous).
pub async fn create_session(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Json(body): Json<CreateSessionRequest>,
) -> Result<(axum::http::StatusCode, Json<Session>), ApiError> {
    // Verify the questionnaire exists and is published (or user is authenticated and has access).
    let q_status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(body.questionnaire_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    if q_status != "published" && user.is_none() {
        return Err(ApiError::Forbidden("Questionnaire is not published".into()));
    }

    let participant_id = body
        .participant_id
        .or_else(|| user.as_ref().map(|u| u.user_id.to_string()));

    let session = sqlx::query_as::<_, Session>(
        r#"
        INSERT INTO sessions (questionnaire_id, participant_id, status, started_at,
                              browser_info, metadata)
        VALUES ($1, $2, 'active', NOW(), $3, $4)
        RETURNING id, questionnaire_id, participant_id, status, started_at,
                  completed_at, last_activity_at, metadata, browser_info, created_at
        "#,
    )
    .bind(body.questionnaire_id)
    .bind(&participant_id)
    .bind(&body.browser_info)
    .bind(body.metadata.unwrap_or_else(|| serde_json::json!({})))
    .fetch_one(&state.pool)
    .await?;

    Ok((axum::http::StatusCode::CREATED, Json(session)))
}

/// GET /api/sessions
pub async fn list_sessions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SessionListQuery>,
) -> Result<Json<Vec<Session>>, ApiError> {
    // Require questionnaire_id so we can verify access
    let questionnaire_id = query.questionnaire_id.ok_or_else(|| {
        ApiError::BadRequest("questionnaire_id query parameter is required".into())
    })?;

    // Verify the user has access to this questionnaire's project org
    verify_questionnaire_access(&state, user.user_id, questionnaire_id).await?;

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
               completed_at, last_activity_at, metadata, browser_info, created_at
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

    let sessions = db_query.fetch_all(&state.pool).await?;
    Ok(Json(sessions))
}

/// GET /api/sessions/aggregate
pub async fn aggregate_sessions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SessionAggregateQuery>,
) -> Result<Json<SessionAggregateResponse>, ApiError> {
    verify_questionnaire_access(&state, user.user_id, query.questionnaire_id).await?;
    let source = parse_aggregate_source(query.source.as_deref())?;
    let key = query.key.trim();

    if key.is_empty() {
        return Err(ApiError::BadRequest(
            "Aggregation key is required (variable name or question id)".into(),
        ));
    }

    let samples = load_numeric_samples(
        &state,
        source,
        query.questionnaire_id,
        key,
        query.participant_id.as_deref(),
    )
    .await?;

    let participant_count = samples
        .iter()
        .filter_map(|sample| sample.participant_id.as_ref().cloned())
        .collect::<HashSet<String>>()
        .len();
    let values: Vec<f64> = samples.iter().map(|sample| sample.value).collect();

    Ok(Json(SessionAggregateResponse {
        questionnaire_id: query.questionnaire_id,
        source: source.as_str().to_string(),
        key: key.to_string(),
        participant_count,
        stats: compute_numeric_stats(&values),
    }))
}

/// GET /api/sessions/compare
pub async fn compare_sessions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<SessionCompareQuery>,
) -> Result<Json<SessionCompareResponse>, ApiError> {
    verify_questionnaire_access(&state, user.user_id, query.questionnaire_id).await?;
    let source = parse_aggregate_source(query.source.as_deref())?;
    let key = query.key.trim();
    let left_participant_id = query.left_participant_id.trim();
    let right_participant_id = query.right_participant_id.trim();

    if key.is_empty() {
        return Err(ApiError::BadRequest(
            "Comparison key is required (variable name or question id)".into(),
        ));
    }

    if left_participant_id.is_empty() || right_participant_id.is_empty() {
        return Err(ApiError::BadRequest(
            "Both left_participant_id and right_participant_id are required".into(),
        ));
    }

    let left_samples = load_numeric_samples(
        &state,
        source,
        query.questionnaire_id,
        key,
        Some(left_participant_id),
    )
    .await?;
    let right_samples = load_numeric_samples(
        &state,
        source,
        query.questionnaire_id,
        key,
        Some(right_participant_id),
    )
    .await?;

    let left_values: Vec<f64> = left_samples.iter().map(|sample| sample.value).collect();
    let right_values: Vec<f64> = right_samples.iter().map(|sample| sample.value).collect();

    let left_stats = compute_numeric_stats(&left_values);
    let right_stats = compute_numeric_stats(&right_values);

    let mean_delta = match (left_stats.mean, right_stats.mean) {
        (Some(left), Some(right)) => Some(left - right),
        _ => None,
    };
    let median_delta = match (left_stats.median, right_stats.median) {
        (Some(left), Some(right)) => Some(left - right),
        _ => None,
    };
    let z_score = match (left_stats.mean, right_stats.mean, right_stats.std_dev) {
        (Some(left_mean), Some(right_mean), Some(right_std_dev)) if right_std_dev > 0.0 => {
            Some((left_mean - right_mean) / right_std_dev)
        }
        _ => None,
    };

    Ok(Json(SessionCompareResponse {
        questionnaire_id: query.questionnaire_id,
        source: source.as_str().to_string(),
        key: key.to_string(),
        left: ParticipantStats {
            participant_id: left_participant_id.to_string(),
            stats: left_stats,
        },
        right: ParticipantStats {
            participant_id: right_participant_id.to_string(),
            stats: right_stats,
        },
        delta: ComparisonDelta {
            mean_delta,
            median_delta,
            z_score,
        },
    }))
}

/// GET /api/sessions/dashboard
pub async fn dashboard_summary(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(query): Query<DashboardQuery>,
) -> Result<Json<DashboardSummary>, ApiError> {
    // Verify the user is a member of the organization
    let is_member = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM organization_members
            WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
        )
        "#,
    )
    .bind(query.organization_id)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden(
            "No access to this organization".into(),
        ));
    }

    // Get questionnaire summaries with response counts
    let questionnaires = sqlx::query_as::<_, QuestionnaireSummary>(
        r#"
        SELECT
            q.id,
            q.name,
            q.project_id,
            q.status,
            COUNT(DISTINCT r.id)::bigint AS total_responses,
            COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END)::bigint AS completed_sessions,
            AVG(
                CASE WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL
                     THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0
                END
            ) AS avg_completion_time_ms
        FROM questionnaire_definitions q
        JOIN projects p ON p.id = q.project_id
        LEFT JOIN sessions s ON s.questionnaire_id = q.id
        LEFT JOIN responses r ON r.session_id = s.id
        WHERE p.organization_id = $1
          AND p.deleted_at IS NULL
          AND q.deleted_at IS NULL
        GROUP BY q.id, q.name, q.project_id, q.status
        ORDER BY q.updated_at DESC
        "#,
    )
    .bind(query.organization_id)
    .fetch_all(&state.pool)
    .await?;

    // Get recent activity (last 20 sessions)
    let recent_activity = sqlx::query_as::<_, ActivityRecord>(
        r#"
        SELECT
            s.id AS session_id,
            s.participant_id,
            q.name AS questionnaire_name,
            s.status,
            s.started_at,
            s.completed_at
        FROM sessions s
        JOIN questionnaire_definitions q ON q.id = s.questionnaire_id
        JOIN projects p ON p.id = q.project_id
        WHERE p.organization_id = $1
          AND p.deleted_at IS NULL
          AND q.deleted_at IS NULL
        ORDER BY s.created_at DESC
        LIMIT 20
        "#,
    )
    .bind(query.organization_id)
    .fetch_all(&state.pool)
    .await?;

    // Compute aggregate stats
    let total_questionnaires = questionnaires.len() as i64;
    let total_responses: i64 = questionnaires.iter().map(|q| q.total_responses).sum();
    let active_questionnaires = questionnaires
        .iter()
        .filter(|q| q.status == "published")
        .count() as i64;

    // Compute average completion rate across questionnaires that have sessions
    let completion_rates: Vec<f64> = questionnaires
        .iter()
        .filter_map(|q| {
            let total_sessions = q.total_responses.max(q.completed_sessions);
            if total_sessions > 0 {
                Some(q.completed_sessions as f64 / total_sessions as f64)
            } else {
                None
            }
        })
        .collect();

    let avg_completion_rate = if completion_rates.is_empty() {
        0.0
    } else {
        completion_rates.iter().sum::<f64>() / completion_rates.len() as f64
    };

    Ok(Json(DashboardSummary {
        questionnaires,
        recent_activity,
        stats: DashboardStats {
            total_questionnaires,
            total_responses,
            active_questionnaires,
            avg_completion_rate,
        },
    }))
}

/// GET /api/organizations/{org_id}/analytics
pub async fn cross_project_analytics(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(org_id): Path<Uuid>,
    Query(query): Query<CrossProjectAnalyticsQuery>,
) -> Result<Json<CrossProjectAnalyticsResponse>, ApiError> {
    // Verify org membership
    let is_member = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM organization_members
            WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
        )
        "#,
    )
    .bind(org_id)
    .bind(user.user_id)
    .fetch_one(&state.pool)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden(
            "No access to this organization".into(),
        ));
    }

    // Parse questionnaire IDs
    let questionnaire_ids: Vec<Uuid> = query
        .questionnaire_ids
        .split(',')
        .filter_map(|s| Uuid::parse_str(s.trim()).ok())
        .collect();

    if questionnaire_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one valid questionnaire_id is required".into(),
        ));
    }

    // Parse requested metrics (unused for filtering but could gate computation)
    let _requested_metrics: HashSet<String> = query
        .metrics
        .as_deref()
        .unwrap_or("mean,median,correlation")
        .split(',')
        .map(|s| s.trim().to_lowercase())
        .collect();

    let source = parse_aggregate_source(query.source.as_deref())?;
    let key = query.key.clone().unwrap_or_default();

    // Verify all questionnaires belong to the org
    let valid_ids = sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT q.id
        FROM questionnaire_definitions q
        JOIN projects p ON p.id = q.project_id
        WHERE p.organization_id = $1
          AND p.deleted_at IS NULL
          AND q.deleted_at IS NULL
          AND q.id = ANY($2)
        "#,
    )
    .bind(org_id)
    .bind(&questionnaire_ids)
    .fetch_all(&state.pool)
    .await?;

    if valid_ids.is_empty() {
        return Err(ApiError::NotFound(
            "No matching questionnaires found in this organization".into(),
        ));
    }

    let valid_set: HashSet<Uuid> = valid_ids.into_iter().collect();

    // Gather per-questionnaire stats
    let mut per_questionnaire: Vec<QuestionnaireAnalytics> = Vec::new();
    let mut all_timing_values: Vec<f64> = Vec::new();
    let mut all_variable_values: Vec<f64> = Vec::new();
    let mut total_responses: i64 = 0;
    let mut total_completed: i64 = 0;

    // Per-questionnaire variable means for cross-comparison
    let mut variable_means: Vec<(Uuid, f64, Vec<f64>)> = Vec::new();

    for &qid in &questionnaire_ids {
        if !valid_set.contains(&qid) {
            continue;
        }

        // Get questionnaire info + counts
        let summary = sqlx::query_as::<_, QuestionnaireSummary>(
            r#"
            SELECT
                q.id,
                q.name,
                q.project_id,
                q.status,
                COUNT(DISTINCT r.id)::bigint AS total_responses,
                COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END)::bigint AS completed_sessions,
                AVG(
                    CASE WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL
                         THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0
                    END
                ) AS avg_completion_time_ms
            FROM questionnaire_definitions q
            LEFT JOIN sessions s ON s.questionnaire_id = q.id
            LEFT JOIN responses r ON r.session_id = s.id
            WHERE q.id = $1 AND q.deleted_at IS NULL
            GROUP BY q.id, q.name, q.project_id, q.status
            "#,
        )
        .bind(qid)
        .fetch_optional(&state.pool)
        .await?;

        let summary = match summary {
            Some(s) => s,
            None => continue,
        };

        // Gather timing values
        let timing_rows = sqlx::query_scalar::<_, f64>(
            r#"
            SELECT EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0
            FROM sessions s
            WHERE s.questionnaire_id = $1
              AND s.completed_at IS NOT NULL
              AND s.started_at IS NOT NULL
            "#,
        )
        .bind(qid)
        .fetch_all(&state.pool)
        .await?;

        let timing_stats = if timing_rows.is_empty() {
            None
        } else {
            all_timing_values.extend(&timing_rows);
            Some(compute_numeric_stats(&timing_rows))
        };

        // Gather variable stats if key is provided
        let variable_stats = if !key.is_empty() {
            let samples =
                load_numeric_samples(&state, source, qid, &key, None).await?;
            let values: Vec<f64> = samples.iter().map(|s| s.value).collect();
            if !values.is_empty() {
                let stats = compute_numeric_stats(&values);
                if let Some(mean) = stats.mean {
                    variable_means.push((qid, mean, values.clone()));
                }
                all_variable_values.extend(&values);
                Some(stats)
            } else {
                None
            }
        } else {
            None
        };

        let total_sessions = summary.total_responses.max(summary.completed_sessions).max(1);
        let completion_rate = summary.completed_sessions as f64 / total_sessions as f64;

        total_responses += summary.total_responses;
        total_completed += summary.completed_sessions;

        per_questionnaire.push(QuestionnaireAnalytics {
            questionnaire_id: qid,
            name: summary.name,
            response_count: summary.total_responses,
            completed_sessions: summary.completed_sessions,
            completion_rate,
            timing_stats,
            variable_stats,
        });
    }

    // Overall stats
    let overall_total = total_responses.max(total_completed).max(1);
    let overall_completion_rate = total_completed as f64 / overall_total as f64;

    let overall_timing_stats = if all_timing_values.is_empty() {
        None
    } else {
        Some(compute_numeric_stats(&all_timing_values))
    };

    let overall_variable_stats = if all_variable_values.is_empty() {
        None
    } else {
        Some(compute_numeric_stats(&all_variable_values))
    };

    // Cross-comparisons: pairwise mean/median delta + Pearson correlation
    let cross_comparisons = if variable_means.len() >= 2 {
        let mut comparisons = Vec::new();
        for i in 0..variable_means.len() {
            for j in (i + 1)..variable_means.len() {
                let (id_a, mean_a, ref vals_a) = variable_means[i];
                let (id_b, mean_b, ref vals_b) = variable_means[j];

                let median_a = compute_numeric_stats(vals_a).median;
                let median_b = compute_numeric_stats(vals_b).median;

                let correlation = pearson_correlation(vals_a, vals_b);

                comparisons.push(CrossComparison {
                    questionnaire_a: id_a,
                    questionnaire_b: id_b,
                    mean_delta: Some(mean_a - mean_b),
                    median_delta: match (median_a, median_b) {
                        (Some(a), Some(b)) => Some(a - b),
                        _ => None,
                    },
                    correlation,
                });
            }
        }
        Some(comparisons)
    } else {
        None
    };

    Ok(Json(CrossProjectAnalyticsResponse {
        questionnaires: per_questionnaire,
        aggregate: AggregateOverview {
            total_responses,
            total_completed_sessions: total_completed,
            overall_completion_rate,
            overall_timing_stats,
            overall_variable_stats,
        },
        cross_comparisons,
    }))
}

/// GET /api/sessions/:id
pub async fn get_session(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Session>, ApiError> {
    let session = sqlx::query_as::<_, Session>(
        r#"
        SELECT id, questionnaire_id, participant_id, status, started_at,
               completed_at, last_activity_at, metadata, browser_info, created_at
        FROM sessions WHERE id = $1
        "#,
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    // Verify the user has access to this session's questionnaire
    verify_questionnaire_access(&state, user.user_id, session.questionnaire_id).await?;

    Ok(Json(session))
}

/// GET /api/sessions/:id/responses
pub async fn get_responses(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(session_id): Path<Uuid>,
    Query(query): Query<ResponseListQuery>,
) -> Result<Json<Vec<ResponseRecord>>, ApiError> {
    ensure_session_access(&state, user.user_id, session_id).await?;

    let limit = query.limit.unwrap_or(500).clamp(1, 5000);
    let offset = query.offset.unwrap_or(0).max(0);

    let responses = if let Some(ref question_id) = query.question_id {
        sqlx::query_as::<_, ResponseRecord>(
            r#"
            SELECT id, session_id, question_id, value, reaction_time_us,
                   presented_at, answered_at, metadata, created_at
            FROM responses
            WHERE session_id = $1 AND question_id = $2
            ORDER BY created_at ASC
            LIMIT $3 OFFSET $4
            "#,
        )
        .bind(session_id)
        .bind(question_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query_as::<_, ResponseRecord>(
            r#"
            SELECT id, session_id, question_id, value, reaction_time_us,
                   presented_at, answered_at, metadata, created_at
            FROM responses
            WHERE session_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(session_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.pool)
        .await?
    };

    Ok(Json(responses))
}

/// GET /api/sessions/:id/events
pub async fn get_events(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Vec<InteractionEventRecord>>, ApiError> {
    ensure_session_access(&state, user.user_id, session_id).await?;

    let events = sqlx::query_as::<_, InteractionEventRecord>(
        r#"
        SELECT id, session_id, event_type, question_id, timestamp_us, metadata, created_at
        FROM interaction_events
        WHERE session_id = $1
        ORDER BY timestamp_us ASC
        "#,
    )
    .bind(session_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(events))
}

/// GET /api/sessions/:id/variables
pub async fn get_variables(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Vec<SessionVariableRecord>>, ApiError> {
    ensure_session_access(&state, user.user_id, session_id).await?;

    let variables = sqlx::query_as::<_, SessionVariableRecord>(
        r#"
        SELECT id, session_id, variable_name, variable_value, updated_at
        FROM session_variables
        WHERE session_id = $1
        ORDER BY variable_name ASC
        "#,
    )
    .bind(session_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(variables))
}

/// PATCH /api/sessions/:id
pub async fn update_session(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Path(session_id): Path<Uuid>,
    Json(body): Json<UpdateSessionRequest>,
) -> Result<Json<Session>, ApiError> {
    // Verify session ownership: either the participant or an org member
    ensure_session_participant_or_member(&state, user.as_ref(), session_id).await?;
    let mut parts: Vec<String> = vec!["last_activity_at = NOW()".into()];
    let mut bind_idx = 2u32;
    let normalized_status = body
        .status
        .as_deref()
        .map(normalize_session_status)
        .transpose()?;

    if normalized_status.is_some() {
        parts.push(format!("status = ${bind_idx}"));
        bind_idx += 1;

        // If completing, set completed_at
        if normalized_status.as_deref() == Some("completed") {
            parts.push("completed_at = NOW()".into());
        }
    }
    if body.metadata.is_some() {
        parts.push(format!("metadata = ${bind_idx}"));
    }

    let sql = format!(
        r#"UPDATE sessions SET {}
        WHERE id = $1
        RETURNING id, questionnaire_id, participant_id, status, started_at,
                  completed_at, last_activity_at, metadata, browser_info, created_at"#,
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
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    Ok(Json(session))
}

/// POST /api/sessions/:id/responses
pub async fn submit_response(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Path(session_id): Path<Uuid>,
    Json(payload): Json<SubmitResponsesPayload>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    // Session must be active and the caller must be the participant or an org member
    ensure_session_active(&state, session_id).await?;
    ensure_session_participant_or_member(&state, user.as_ref(), session_id).await?;

    let responses = match payload {
        SubmitResponsesPayload::Single(response) => vec![response],
        SubmitResponsesPayload::Batch { responses } => responses,
    };

    if responses.is_empty() {
        return Err(ApiError::BadRequest("No responses provided".into()));
    }

    for response in responses.iter() {
        insert_response(&state, session_id, response).await?;
    }

    // Update last_activity_at on the session
    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "count": responses.len() })),
    ))
}

/// POST /api/sessions/:id/events
pub async fn submit_events(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Path(session_id): Path<Uuid>,
    Json(events): Json<Vec<InteractionEventRequest>>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    ensure_session_exists(&state, session_id).await?;
    ensure_session_participant_or_member(&state, user.as_ref(), session_id).await?;

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

        sqlx::query(
            r#"
            INSERT INTO interaction_events (session_id, event_type, question_id, timestamp_us, metadata)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(session_id)
        .bind(&event.event_type)
        .bind(&event.question_id)
        .bind(timestamp_us)
        .bind(metadata)
        .execute(&state.pool)
        .await?;
    }

    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "count": events.len() })),
    ))
}

/// POST /api/sessions/:id/variables
pub async fn upsert_variable(
    State(state): State<AppState>,
    OptionalUser(user): OptionalUser,
    Path(session_id): Path<Uuid>,
    Json(body): Json<SessionVariableRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), ApiError> {
    ensure_session_exists(&state, session_id).await?;
    ensure_session_participant_or_member(&state, user.as_ref(), session_id).await?;

    sqlx::query(
        r#"
        INSERT INTO session_variables (session_id, variable_name, variable_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, variable_name)
        DO UPDATE SET variable_value = EXCLUDED.variable_value, updated_at = NOW()
        "#,
    )
    .bind(session_id)
    .bind(&body.name)
    .bind(&body.value)
    .execute(&state.pool)
    .await?;

    sqlx::query("UPDATE sessions SET last_activity_at = NOW() WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({ "success": true })),
    ))
}

#[derive(Debug, sqlx::FromRow)]
struct NumericValueRow {
    participant_id: Option<String>,
    value: Value,
}

#[derive(Debug)]
struct NumericSample {
    participant_id: Option<String>,
    value: f64,
}

impl AggregateSource {
    fn as_str(self) -> &'static str {
        match self {
            AggregateSource::Variable => "variable",
            AggregateSource::Response => "response",
        }
    }
}

fn parse_aggregate_source(source: Option<&str>) -> Result<AggregateSource, ApiError> {
    let normalized = source.unwrap_or("variable").trim().to_ascii_lowercase();

    match normalized.as_str() {
        "variable" => Ok(AggregateSource::Variable),
        "response" => Ok(AggregateSource::Response),
        _ => Err(ApiError::BadRequest(format!(
            "Invalid source '{normalized}'. Expected 'variable' or 'response'"
        ))),
    }
}

async fn load_numeric_samples(
    state: &AppState,
    source: AggregateSource,
    questionnaire_id: Uuid,
    key: &str,
    participant_id: Option<&str>,
) -> Result<Vec<NumericSample>, ApiError> {
    let mut where_parts: Vec<String> = vec!["s.questionnaire_id = $1".to_string()];
    let bind_idx = 3u32;

    if participant_id.is_some() {
        where_parts.push(format!("s.participant_id = ${bind_idx}"));
    }

    let base_sql = match source {
        AggregateSource::Variable => {
            r#"
            SELECT s.participant_id, sv.variable_value AS value
            FROM session_variables sv
            INNER JOIN sessions s ON s.id = sv.session_id
            "#
        }
        AggregateSource::Response => {
            r#"
            SELECT s.participant_id, r.value AS value
            FROM responses r
            INNER JOIN sessions s ON s.id = r.session_id
            "#
        }
    };

    let key_filter = match source {
        AggregateSource::Variable => "sv.variable_name = $2",
        AggregateSource::Response => "r.question_id = $2",
    };

    where_parts.push(key_filter.to_string());

    let sql = format!(
        "{} WHERE {} ORDER BY s.created_at ASC",
        base_sql,
        where_parts.join(" AND ")
    );

    let mut query = sqlx::query_as::<_, NumericValueRow>(&sql)
        .bind(questionnaire_id)
        .bind(key);

    if let Some(participant_id) = participant_id {
        query = query.bind(participant_id);
    }

    let rows = query.fetch_all(&state.pool).await?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            json_value_to_f64(&row.value).map(|value| NumericSample {
                participant_id: row.participant_id,
                value,
            })
        })
        .collect())
}

fn json_value_to_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(raw) => raw.parse::<f64>().ok(),
        Value::Bool(flag) => Some(if *flag { 1.0 } else { 0.0 }),
        Value::Object(object) => object.get("value").and_then(json_value_to_f64),
        _ => None,
    }
}

fn compute_numeric_stats(values: &[f64]) -> NumericStatsSummary {
    if values.is_empty() {
        return NumericStatsSummary {
            sample_count: 0,
            mean: None,
            median: None,
            std_dev: None,
            min: None,
            max: None,
            p10: None,
            p25: None,
            p50: None,
            p75: None,
            p90: None,
            p95: None,
            p99: None,
        };
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.total_cmp(right));

    let count = sorted.len();
    let sum: f64 = sorted.iter().sum();
    let mean = sum / count as f64;
    let variance = sorted
        .iter()
        .map(|value| {
            let diff = value - mean;
            diff * diff
        })
        .sum::<f64>()
        / count as f64;
    let std_dev = variance.sqrt();
    let min = sorted.first().copied();
    let max = sorted.last().copied();

    NumericStatsSummary {
        sample_count: count,
        mean: Some(mean),
        median: percentile(&sorted, 50.0),
        std_dev: Some(std_dev),
        min,
        max,
        p10: percentile(&sorted, 10.0),
        p25: percentile(&sorted, 25.0),
        p50: percentile(&sorted, 50.0),
        p75: percentile(&sorted, 75.0),
        p90: percentile(&sorted, 90.0),
        p95: percentile(&sorted, 95.0),
        p99: percentile(&sorted, 99.0),
    }
}

fn percentile(sorted: &[f64], percentile: f64) -> Option<f64> {
    if sorted.is_empty() {
        return None;
    }

    if sorted.len() == 1 {
        return sorted.first().copied();
    }

    let clamped = percentile.clamp(0.0, 100.0);
    let rank = (clamped / 100.0) * (sorted.len() - 1) as f64;
    let lower_index = rank.floor() as usize;
    let upper_index = rank.ceil() as usize;
    let weight = rank - lower_index as f64;

    let lower = sorted.get(lower_index).copied()?;
    let upper = sorted.get(upper_index).copied()?;

    Some(lower + (upper - lower) * weight)
}

fn normalize_session_status(status: &str) -> Result<String, ApiError> {
    let normalized = match status {
        "not_started" | "in_progress" | "paused" | "active" => "active",
        "completed" => "completed",
        "abandoned" => "abandoned",
        "expired" => "expired",
        _ => {
            return Err(ApiError::BadRequest(format!(
                "Invalid session status: {status}"
            )))
        }
    };

    Ok(normalized.to_string())
}

async fn ensure_session_active(state: &AppState, session_id: Uuid) -> Result<(), ApiError> {
    let status = sqlx::query_scalar::<_, String>("SELECT status FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if status != "active" {
        return Err(ApiError::BadRequest("Session is not active".into()));
    }

    Ok(())
}

async fn ensure_session_exists(state: &AppState, session_id: Uuid) -> Result<(), ApiError> {
    let exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1)")
            .bind(session_id)
            .fetch_one(&state.pool)
            .await?;

    if !exists {
        return Err(ApiError::NotFound("Session not found".into()));
    }

    Ok(())
}

async fn insert_response(
    state: &AppState,
    session_id: Uuid,
    response: &SubmitResponseRequest,
) -> Result<ResponseRecord, ApiError> {
    let metadata = response
        .metadata
        .clone()
        .unwrap_or_else(|| serde_json::json!({}));

    let inserted = sqlx::query_as::<_, ResponseRecord>(
        r#"
        INSERT INTO responses (session_id, question_id, value, reaction_time_us,
                               presented_at, answered_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, session_id, question_id, value, reaction_time_us,
                  presented_at, answered_at, metadata, created_at
        "#,
    )
    .bind(session_id)
    .bind(&response.question_id)
    .bind(&response.value)
    .bind(response.reaction_time_us)
    .bind(response.presented_at)
    .bind(response.answered_at)
    .bind(metadata)
    .fetch_one(&state.pool)
    .await?;

    Ok(inserted)
}

fn pearson_correlation(x: &[f64], y: &[f64]) -> Option<f64> {
    let n = x.len().min(y.len());
    if n < 2 {
        return None;
    }

    let mean_x = x[..n].iter().sum::<f64>() / n as f64;
    let mean_y = y[..n].iter().sum::<f64>() / n as f64;

    let mut cov = 0.0;
    let mut var_x = 0.0;
    let mut var_y = 0.0;

    for i in 0..n {
        let dx = x[i] - mean_x;
        let dy = y[i] - mean_y;
        cov += dx * dy;
        var_x += dx * dx;
        var_y += dy * dy;
    }

    let denom = (var_x * var_y).sqrt();
    if denom == 0.0 {
        return None;
    }

    Some(cov / denom)
}

/// Verify the authenticated user has access to a questionnaire through its project's org.
async fn verify_questionnaire_access(
    state: &AppState,
    user_id: Uuid,
    questionnaire_id: Uuid,
) -> Result<(), ApiError> {
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM questionnaire_definitions qd
            JOIN projects p ON p.id = qd.project_id
            JOIN organization_members om ON om.organization_id = p.organization_id
            WHERE qd.id = $1 AND om.user_id = $2 AND om.status = 'active'
              AND qd.deleted_at IS NULL AND p.deleted_at IS NULL
        )
        "#,
    )
    .bind(questionnaire_id)
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;

    if !has_access {
        return Err(ApiError::Forbidden(
            "No access to this questionnaire".into(),
        ));
    }
    Ok(())
}

/// Verify the authenticated user has access to a session's questionnaire.
async fn ensure_session_access(
    state: &AppState,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let questionnaire_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT questionnaire_id FROM sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    verify_questionnaire_access(state, user_id, questionnaire_id).await
}

/// For participant-facing endpoints (submit response, events, variables, update session):
/// The session must belong to a published questionnaire. Access is allowed if:
/// 1. The session's questionnaire is published (anonymous participants can interact), OR
/// 2. The caller is an authenticated org member of the questionnaire's project.
///
/// This permits anonymous questionnaire fill-out while preventing arbitrary
/// unauthenticated access to unpublished questionnaire sessions.
async fn ensure_session_participant_or_member(
    state: &AppState,
    user: Option<&AuthenticatedUser>,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let row = sqlx::query_as::<_, (Uuid, String)>(
        r#"
        SELECT qd.id, qd.status
        FROM sessions s
        JOIN questionnaire_definitions qd ON qd.id = s.questionnaire_id
        WHERE s.id = $1 AND qd.deleted_at IS NULL
        "#,
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    let (questionnaire_id, q_status) = row;

    // Published questionnaires allow anonymous participant interaction
    if q_status == "published" {
        return Ok(());
    }

    // For unpublished questionnaires, require authenticated org member
    match user {
        Some(u) => verify_questionnaire_access(state, u.user_id, questionnaire_id).await,
        None => Err(ApiError::Forbidden(
            "Authentication required for unpublished questionnaires".into(),
        )),
    }
}

fn merge_event_metadata(metadata: Option<Value>, event_data: Option<Value>) -> Value {
    match (metadata, event_data) {
        (Some(Value::Object(mut metadata_map)), Some(Value::Object(event_data_map))) => {
            metadata_map.insert("event_data".to_string(), Value::Object(event_data_map));
            Value::Object(metadata_map)
        }
        (Some(existing), Some(event_data)) => {
            serde_json::json!({
                "metadata": existing,
                "event_data": event_data,
            })
        }
        (Some(existing), None) => existing,
        (None, Some(event_data)) => serde_json::json!({ "event_data": event_data }),
        (None, None) => serde_json::json!({}),
    }
}

#[cfg(test)]
mod tests {
    use super::{compute_numeric_stats, json_value_to_f64, parse_aggregate_source};
    use serde_json::json;

    #[test]
    fn parses_numeric_json_values() {
        assert_eq!(json_value_to_f64(&json!(42)), Some(42.0));
        assert_eq!(json_value_to_f64(&json!("3.14")), Some(3.14));
        assert_eq!(json_value_to_f64(&json!(true)), Some(1.0));
        assert_eq!(json_value_to_f64(&json!({ "value": "5.5" })), Some(5.5));
        assert_eq!(json_value_to_f64(&json!({ "other": 1 })), None);
    }

    #[test]
    fn computes_summary_statistics_with_percentiles() {
        let stats = compute_numeric_stats(&[10.0, 20.0, 30.0, 40.0, 50.0]);

        assert_eq!(stats.sample_count, 5);
        assert_eq!(stats.mean, Some(30.0));
        assert_eq!(stats.median, Some(30.0));
        assert_eq!(stats.p10, Some(14.0));
        assert_eq!(stats.p90, Some(46.0));
        assert_eq!(stats.min, Some(10.0));
        assert_eq!(stats.max, Some(50.0));
    }

    #[test]
    fn parses_aggregate_source_with_default() {
        let variable = parse_aggregate_source(None).expect("default source should parse");
        let response = parse_aggregate_source(Some("response")).expect("response should parse");

        assert_eq!(variable.as_str(), "variable");
        assert_eq!(response.as_str(), "response");
        assert!(parse_aggregate_source(Some("invalid")).is_err());
    }
}
