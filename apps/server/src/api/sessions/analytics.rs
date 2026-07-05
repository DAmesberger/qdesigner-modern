use super::models::*;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use std::collections::HashSet;
use uuid::Uuid;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::state::AppState;

/// GET /api/sessions/aggregate
#[utoipa::path(
    get,
    path = "/api/sessions/aggregate",
    params(SessionAggregateQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Aggregate numeric session data", body = SessionAggregateResponse),
        (status = 400, description = "Invalid aggregate request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn aggregate_sessions(
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<SessionAggregateQuery>,
) -> Result<Json<SessionAggregateResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    access::verify_questionnaire_access(&mut **tx, user.user_id, query.questionnaire_id).await?;
    let source = parse_aggregate_source(query.source.as_deref())?;
    let key = query.key.trim();

    if key.is_empty() {
        return Err(ApiError::BadRequest(
            "Aggregation key is required (variable name or question id)".into(),
        ));
    }

    let samples = load_numeric_samples(
        &mut **tx,
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
#[utoipa::path(
    get,
    path = "/api/sessions/compare",
    params(SessionCompareQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Compare participant session data", body = SessionCompareResponse),
        (status = 400, description = "Invalid comparison request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn compare_sessions(
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<SessionCompareQuery>,
) -> Result<Json<SessionCompareResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    access::verify_questionnaire_access(&mut **tx, user.user_id, query.questionnaire_id).await?;
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
        &mut **tx,
        source,
        query.questionnaire_id,
        key,
        Some(left_participant_id),
    )
    .await?;
    let right_samples = load_numeric_samples(
        &mut **tx,
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
#[utoipa::path(
    get,
    path = "/api/sessions/dashboard",
    params(DashboardQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Organization dashboard summary", body = DashboardSummary),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn dashboard_summary(
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<DashboardQuery>,
) -> Result<Json<DashboardSummary>, ApiError> {
    let mut tx = tx.tx().await?;
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
    .fetch_one(&mut **tx)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden("No access to this organization".into()));
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
            )::float8 AS avg_completion_time_ms
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
    .fetch_all(&mut **tx)
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
    .fetch_all(&mut **tx)
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
#[utoipa::path(
    get,
    path = "/api/organizations/{org_id}/analytics",
    params(
        ("org_id" = Uuid, Path, description = "Organization id"),
        CrossProjectAnalyticsQuery
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Cross-project analytics", body = CrossProjectAnalyticsResponse),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "No matching questionnaires found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn cross_project_analytics(
    user: AuthenticatedUser,
    tx: Tx,
    Path(org_id): Path<Uuid>,
    Query(query): Query<CrossProjectAnalyticsQuery>,
) -> Result<Json<CrossProjectAnalyticsResponse>, ApiError> {
    let mut tx = tx.tx().await?;
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
    .fetch_one(&mut **tx)
    .await?;

    if !is_member {
        return Err(ApiError::Forbidden("No access to this organization".into()));
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
    .fetch_all(&mut **tx)
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
                )::float8 AS avg_completion_time_ms
            FROM questionnaire_definitions q
            LEFT JOIN sessions s ON s.questionnaire_id = q.id
            LEFT JOIN responses r ON r.session_id = s.id
            WHERE q.id = $1 AND q.deleted_at IS NULL
            GROUP BY q.id, q.name, q.project_id, q.status
            "#,
        )
        .bind(qid)
        .fetch_optional(&mut **tx)
        .await?;

        let summary = match summary {
            Some(s) => s,
            None => continue,
        };

        // Gather timing values
        let timing_rows = sqlx::query_scalar::<_, f64>(
            r#"
            SELECT (EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0)::float8
            FROM sessions s
            WHERE s.questionnaire_id = $1
              AND s.completed_at IS NOT NULL
              AND s.started_at IS NOT NULL
            "#,
        )
        .bind(qid)
        .fetch_all(&mut **tx)
        .await?;

        let timing_stats = if timing_rows.is_empty() {
            None
        } else {
            all_timing_values.extend(&timing_rows);
            Some(compute_numeric_stats(&timing_rows))
        };

        // Gather variable stats if key is provided
        let variable_stats = if !key.is_empty() {
            let samples = load_numeric_samples(&mut **tx, source, qid, &key, None).await?;
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

        let total_sessions = summary
            .total_responses
            .max(summary.completed_sessions)
            .max(1);
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

/// GET /api/questionnaires/{id}/cohort-stats
///
/// Public, aggregate-only cohort statistics for a PUBLISHED questionnaire.
/// This is the anonymous-safe cohort feedback path (F060): the
/// statistical-feedback module's `cohort` / `participant-vs-cohort` modes call
/// it from the fillout runtime, where the caller is an anonymous participant
/// who can never reach the `AuthenticatedUser`-gated `/api/sessions/aggregate`.
///
/// Only aggregates cross the wire — the underlying `fillout_cohort_stats`
/// SECURITY DEFINER function computes moments/percentiles over COMPLETED
/// sessions and never returns a per-session value. A min-N floor is applied
/// here: when `n < 5` the response reports the count with ALL stats null,
/// blocking small-cohort deanonymization. Unpublished / missing questionnaire
/// → 404.
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/cohort-stats",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        CohortStatsQuery
    ),
    responses(
        (status = 200, description = "Aggregate-only cohort stats (null stats when n < 5)", body = SessionAggregateResponse),
        (status = 400, description = "Invalid request", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Questionnaire not found or not published", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn public_cohort_stats(
    State(state): State<AppState>,
    Path(questionnaire_id): Path<Uuid>,
    Query(query): Query<CohortStatsQuery>,
) -> Result<Json<SessionAggregateResponse>, ApiError> {
    let source = parse_aggregate_source(query.source.as_deref())?;
    let key = query.key.trim();
    if key.is_empty() {
        return Err(ApiError::BadRequest(
            "Aggregation key is required (variable name or question id)".into(),
        ));
    }

    // Published-questionnaire gate (mirrors sync_session): the cohort feedback
    // path is public, so only a published questionnaire exposes aggregates.
    // Missing OR non-published both surface as 404 so an unpublished id can't
    // be probed for existence.
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(questionnaire_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    if status != "published" {
        return Err(ApiError::NotFound("Questionnaire not found".into()));
    }

    // Aggregate over COMPLETED sessions via the SECURITY DEFINER function. The
    // bare app pool has no RLS GUC set here, so a direct read under
    // `qdesigner_app` would be hidden by the 00021 dual-path SELECT policy.
    // The owner-definer function bypasses RLS and returns aggregates only.
    let row = sqlx::query_as::<_, CohortStatsRow>(
        "SELECT n, mean, std_dev, min, max, median, p90, p95, p99 \
         FROM public.fillout_cohort_stats($1, $2, $3)",
    )
    .bind(questionnaire_id)
    .bind(source.as_str())
    .bind(key)
    .fetch_one(&state.pool)
    .await?;

    let n = row.n.max(0) as usize;
    let stats = if row.n < MIN_COHORT_N {
        // Below the anonymity floor: report the count, withhold every stat.
        NumericStatsSummary {
            sample_count: n,
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
        }
    } else {
        // The SQL function only returns median/p90/p95/p99 (the percentiles the
        // client consumes); p10/p25/p75 are intentionally left null.
        NumericStatsSummary {
            sample_count: n,
            mean: row.mean,
            median: row.median,
            std_dev: row.std_dev,
            min: row.min,
            max: row.max,
            p10: None,
            p25: None,
            p50: row.median,
            p75: None,
            p90: row.p90,
            p95: row.p95,
            p99: row.p99,
        }
    };

    Ok(Json(SessionAggregateResponse {
        questionnaire_id,
        source: source.as_str().to_string(),
        key: key.to_string(),
        participant_count: n,
        stats,
    }))
}

// ── Sync Endpoint ────────────────────────────────────────────────

/// GET /api/sessions/timeseries
#[utoipa::path(
    get,
    path = "/api/sessions/timeseries",
    params(TimeSeriesQuery),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Time-series session buckets", body = [TimeSeriesBucket]),
        (status = 400, description = "Invalid interval", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn timeseries(
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<TimeSeriesQuery>,
) -> Result<Json<Vec<TimeSeriesBucket>>, ApiError> {
    let mut tx = tx.tx().await?;
    access::verify_questionnaire_access(&mut **tx, user.user_id, query.questionnaire_id).await?;

    let interval = match query.interval.as_deref().unwrap_or("day") {
        "hour" => "hour",
        "day" => "day",
        "week" => "week",
        other => {
            return Err(ApiError::BadRequest(format!(
                "Invalid interval '{other}'. Expected 'hour', 'day', or 'week'"
            )));
        }
    };

    let sql = format!(
        r#"
        SELECT
            date_trunc('{interval}', s.started_at) AS timestamp,
            COUNT(*)::bigint AS sessions_started,
            COUNT(CASE WHEN s.status = 'completed' THEN 1 END)::bigint AS sessions_completed,
            AVG(
                CASE WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL
                     THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0
                END
            )::float8 AS avg_completion_ms
        FROM sessions s
        WHERE s.questionnaire_id = $1
          AND s.started_at IS NOT NULL
        GROUP BY date_trunc('{interval}', s.started_at)
        ORDER BY timestamp ASC
        "#
    );

    let buckets = sqlx::query_as::<_, TimeSeriesBucket>(&sql)
        .bind(query.questionnaire_id)
        .fetch_all(&mut **tx)
        .await?;

    Ok(Json(buckets))
}
