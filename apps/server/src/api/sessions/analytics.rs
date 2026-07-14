use super::models::*;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use redis::AsyncCommands;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
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
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<SessionAggregateQuery>,
) -> Result<Json<SessionAggregateResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Questionnaire(query.questionnaire_id),
        Permission::SessionRead,
    )
    .await?;
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
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<SessionCompareQuery>,
) -> Result<Json<SessionCompareResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Questionnaire(query.questionnaire_id),
        Permission::SessionRead,
    )
    .await?;
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
            COUNT(DISTINCT s.id)::bigint AS total_sessions,
            COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END)::bigint AS completed_sessions,
            AVG(
                CASE WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL
                     THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0
                END
            )::float8 AS avg_completion_time_ms,
            q.created_at,
            q.updated_at
        FROM questionnaire_definitions q
        JOIN projects p ON p.id = q.project_id
        LEFT JOIN sessions s ON s.questionnaire_id = q.id
        LEFT JOIN responses r ON r.session_id = s.id
        WHERE p.organization_id = $1
          AND p.deleted_at IS NULL
          AND q.deleted_at IS NULL
        GROUP BY q.id, q.name, q.project_id, q.status, q.created_at, q.updated_at
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

    // Average completion rate across questionnaires that have sessions. The
    // denominator is sessions STARTED — `total_responses` counts response rows,
    // which is a wholly different quantity (ten completed runs of a ten-question
    // questionnaire produce ~100 response rows, and dividing by those reported a
    // 100%-complete study as ~10% complete).
    let completion_rates: Vec<f64> = questionnaires
        .iter()
        .filter(|q| q.total_sessions > 0)
        .map(|q| completion_rate(q.completed_sessions, q.total_sessions))
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
    State(state): State<AppState>,
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

    // Granular gate (E-RBAC-3): pass-through for system roles, denies custom
    // roles without session:read.
    state
        .rbac
        .require_permission(&mut **tx, user.user_id, org_id, Permission::SessionRead)
        .await?;

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
    let mut total_sessions: i64 = 0;
    let mut total_completed: i64 = 0;

    // Arms that produced a numeric mean, in request order: (id, mean, median).
    // The samples themselves stay in `samples_map` — the cross-comparison loop
    // needs them WITH their participant ids, not as bare values.
    let mut variable_arms: Vec<(Uuid, f64, Option<f64>)> = Vec::new();

    // Set-based gather: three batched queries over all requested questionnaires
    // instead of the previous per-questionnaire query fan-out. The assembly loop
    // below iterates `questionnaire_ids` in the caller's original order and
    // reads from these maps, preserving the skip-on-missing-summary semantics.

    // (1) Summaries + counts, keyed by questionnaire id.
    let summary_map: HashMap<Uuid, QuestionnaireSummary> =
        sqlx::query_as::<_, QuestionnaireSummary>(
            r#"
            SELECT
                q.id,
                q.name,
                q.project_id,
                q.status,
                COUNT(DISTINCT r.id)::bigint AS total_responses,
                COUNT(DISTINCT s.id)::bigint AS total_sessions,
                COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END)::bigint AS completed_sessions,
                AVG(
                    CASE WHEN s.completed_at IS NOT NULL AND s.started_at IS NOT NULL
                         THEN EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0
                    END
                )::float8 AS avg_completion_time_ms,
                q.created_at,
                q.updated_at
            FROM questionnaire_definitions q
            LEFT JOIN sessions s ON s.questionnaire_id = q.id
            LEFT JOIN responses r ON r.session_id = s.id
            WHERE q.id = ANY($1) AND q.deleted_at IS NULL
            GROUP BY q.id, q.name, q.project_id, q.status, q.created_at, q.updated_at
            "#,
        )
        .bind(&questionnaire_ids)
        .fetch_all(&mut **tx)
        .await?
        .into_iter()
        .map(|summary| (summary.id, summary))
        .collect();

    // (2) Completion durations (ms), grouped by questionnaire id.
    let mut timing_map: HashMap<Uuid, Vec<f64>> = HashMap::new();
    for (qid, ms) in sqlx::query_as::<_, (Uuid, f64)>(
        r#"
        SELECT
            s.questionnaire_id,
            (EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) * 1000.0)::float8
        FROM sessions s
        WHERE s.questionnaire_id = ANY($1)
          AND s.completed_at IS NOT NULL
          AND s.started_at IS NOT NULL
        "#,
    )
    .bind(&questionnaire_ids)
    .fetch_all(&mut **tx)
    .await?
    {
        timing_map.entry(qid).or_default().push(ms);
    }

    // (3) Numeric samples for the aggregation key, grouped by questionnaire id
    // (only when a key was supplied — matches the prior per-qid guard).
    let samples_map: HashMap<Uuid, Vec<NumericSample>> = if key.is_empty() {
        HashMap::new()
    } else {
        load_numeric_samples_batch(&mut **tx, source, &questionnaire_ids, &key).await?
    };

    for &qid in &questionnaire_ids {
        if !valid_set.contains(&qid) {
            continue;
        }

        // Preserve skip-on-missing-summary: a questionnaire with no summary row
        // (deleted between the validity check and now, etc.) is skipped.
        let summary = match summary_map.get(&qid) {
            Some(summary) => summary,
            None => continue,
        };

        // Gather timing values
        let timing_stats = match timing_map.get(&qid) {
            Some(timing_rows) if !timing_rows.is_empty() => {
                all_timing_values.extend(timing_rows);
                Some(compute_numeric_stats(timing_rows))
            }
            _ => None,
        };

        // Gather variable stats if key is provided
        let variable_stats = if !key.is_empty() {
            let values: Vec<f64> = samples_map
                .get(&qid)
                .map(|samples| samples.iter().map(|s| s.value).collect())
                .unwrap_or_default();
            if !values.is_empty() {
                let stats = compute_numeric_stats(&values);
                if let Some(mean) = stats.mean {
                    variable_arms.push((qid, mean, stats.median));
                }
                all_variable_values.extend(&values);
                Some(stats)
            } else {
                None
            }
        } else {
            None
        };

        total_responses += summary.total_responses;
        total_sessions += summary.total_sessions;
        total_completed += summary.completed_sessions;

        per_questionnaire.push(QuestionnaireAnalytics {
            questionnaire_id: qid,
            name: summary.name.clone(),
            response_count: summary.total_responses,
            total_sessions: summary.total_sessions,
            completed_sessions: summary.completed_sessions,
            completion_rate: completion_rate(summary.completed_sessions, summary.total_sessions),
            timing_stats,
            variable_stats,
        });
    }

    // Overall stats. Denominator is sessions started, summed across the arms.
    let overall_completion_rate = completion_rate(total_completed, total_sessions);

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

    // Cross-comparisons: pairwise mean/median delta (arm-level — a between-groups
    // difference needs no pairing) + a Pearson r over participants observed in
    // BOTH arms. The correlation MUST be paired by participant: correlating the
    // i-th session of A with the i-th session of B pairs two chronologically
    // unrelated people and measures nothing.
    let cross_comparisons = if variable_arms.len() >= 2 {
        let no_samples: Vec<NumericSample> = Vec::new();
        let mut comparisons = Vec::new();
        for i in 0..variable_arms.len() {
            for j in (i + 1)..variable_arms.len() {
                let (id_a, mean_a, median_a) = variable_arms[i];
                let (id_b, mean_b, median_b) = variable_arms[j];

                let pairs = pair_samples_by_participant(
                    samples_map.get(&id_a).unwrap_or(&no_samples),
                    samples_map.get(&id_b).unwrap_or(&no_samples),
                );

                comparisons.push(CrossComparison {
                    questionnaire_a: id_a,
                    questionnaire_b: id_b,
                    mean_delta: Some(mean_a - mean_b),
                    median_delta: match (median_a, median_b) {
                        (Some(a), Some(b)) => Some(a - b),
                        _ => None,
                    },
                    paired_n: pairs.len() as i64,
                    correlation: paired_pearson_correlation(&pairs),
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
            total_sessions,
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

// ── Server-computed variables (server-computed-variable / E-FEEDBACK-3) ──

/// Hard cap on server-variable declarations evaluated per request (bounds the
/// anonymous fan-out; mirrors the TS `MAX_SERVER_VARIABLES`).
const MAX_SERVER_VARS: usize = 50;

/// Redis / in-memory result-cache TTL, in seconds. Also the server-side
/// auto-recalculate cadence: aggregates are recomputed at most once per window
/// per (questionnaire, version).
const SRV_VARS_TTL_SECS: i64 = 300;

/// Process-local fallback cache used when Redis is absent. Maps the cache key to
/// `(expires_at_unix, response_json)`.
static SRV_VARS_MEM: OnceLock<Mutex<HashMap<String, (i64, String)>>> = OnceLock::new();

fn srvvars_mem_cache() -> &'static Mutex<HashMap<String, (i64, String)>> {
    SRV_VARS_MEM.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn srvvars_cache_get(state: &AppState, key: &str) -> Option<ServerVariablesResponse> {
    if let Some(client) = &state.redis {
        if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
            let cached: redis::RedisResult<Option<String>> = conn.get(key).await;
            if let Ok(Some(json)) = cached {
                if let Ok(resp) = serde_json::from_str::<ServerVariablesResponse>(&json) {
                    return Some(resp);
                }
            }
        }
    }
    let now = chrono::Utc::now().timestamp();
    let guard = srvvars_mem_cache().lock().await;
    if let Some((expires, json)) = guard.get(key) {
        if *expires > now {
            if let Ok(resp) = serde_json::from_str::<ServerVariablesResponse>(json) {
                return Some(resp);
            }
        }
    }
    None
}

async fn srvvars_cache_set(state: &AppState, key: &str, resp: &ServerVariablesResponse) {
    let Ok(json) = serde_json::to_string(resp) else {
        return;
    };
    if let Some(client) = &state.redis {
        if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
            let _: redis::RedisResult<()> = conn.set_ex(key, &json, SRV_VARS_TTL_SECS as u64).await;
        }
    }
    let expires = chrono::Utc::now().timestamp() + SRV_VARS_TTL_SECS;
    let mut guard = srvvars_mem_cache().lock().await;
    guard.insert(key.to_string(), (expires, json));
}

/// Parse a `major.minor.patch` triplet. Returns `None` on any malformed input.
fn parse_semver_triplet(s: &str) -> Option<(i32, i32, i32)> {
    let mut parts = s.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

/// GET /api/questionnaires/{id}/server-variables
///
/// Anonymous-safe batch of SERVER-COMPUTED VARIABLE aggregates
/// (server-computed-variable / E-FEEDBACK-3). Structured like
/// [`public_cohort_stats`]: a published-questionnaire gate (unpublished/missing
/// → 404 without existence probing), then a resolve of the definition JSONB
/// (the latest published registry, or a pinned `questionnaire_snapshots` row
/// when `?version=` is supplied), then — for each `server` declaration on
/// `content.variables` (capped at 50) — one `fillout_dataset_stats` call over
/// COMPLETED sessions via the SECURITY DEFINER function.
///
/// THIS is the authorization model: the anonymous client sends zero filter data;
/// only the designer-published declarations are ever evaluated. The MIN_COHORT_N
/// floor applies per entry (n < 5 → count reported, stats withheld). Results are
/// cached (Redis, in-memory fallback) keyed `srvvars:{qid}:{version}` for
/// `SRV_VARS_TTL_SECS`, which also paces the auto-recalculation.
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/server-variables",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id"),
        ServerVariablesQuery
    ),
    responses(
        (status = 200, description = "Server-computed variable aggregates (stats null below the n<5 floor)", body = ServerVariablesResponse),
        (status = 400, description = "Malformed version", body = crate::openapi::ErrorEnvelope),
        (status = 404, description = "Questionnaire not found or not published", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn public_server_variables(
    State(state): State<AppState>,
    Path(questionnaire_id): Path<Uuid>,
    Query(query): Query<ServerVariablesQuery>,
) -> Result<Json<ServerVariablesResponse>, ApiError> {
    // Optional pinned-version selector.
    let requested_version = match query.version.as_deref().map(str::trim) {
        Some(v) if !v.is_empty() => Some(parse_semver_triplet(v).ok_or_else(|| {
            ApiError::BadRequest("Invalid version (expected major.minor.patch)".into())
        })?),
        _ => None,
    };

    // Published-questionnaire gate + latest registry content/version. Missing OR
    // non-published both surface as 404 so an unpublished id can't be probed.
    let (status, def_major, def_minor, def_patch, registry_content) =
        sqlx::query_as::<_, (String, i32, i32, i32, serde_json::Value)>(
            "SELECT status, version_major, version_minor, version_patch, content \
             FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(questionnaire_id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;

    if status != "published" {
        return Err(ApiError::NotFound("Questionnaire not found".into()));
    }

    // The version the aggregates are scoped/pinned to (requested pin, else latest).
    let (v_major, v_minor, v_patch) =
        requested_version.unwrap_or((def_major, def_minor, def_patch));
    let version_str = format!("{v_major}.{v_minor}.{v_patch}");

    // Cache: one ≤50-declaration fan-out per TTL per (questionnaire, version).
    let cache_key = format!("srvvars:{questionnaire_id}:{version_str}");
    if let Some(cached) = srvvars_cache_get(&state, &cache_key).await {
        return Ok(Json(cached));
    }

    // Resolve the definition content to extract declarations from. A pinned
    // request reads the snapshot; a pruned snapshot falls back to the latest
    // registry declarations (flagged) rather than 404ing.
    let mut fallback_registry = false;
    let content = if let Some((rmaj, rmin, rpat)) = requested_version {
        let snapshot = sqlx::query_scalar::<_, serde_json::Value>(
            "SELECT content FROM questionnaire_snapshots \
             WHERE questionnaire_id = $1 AND version_major = $2 \
               AND version_minor = $3 AND version_patch = $4 \
             ORDER BY created_at DESC LIMIT 1",
        )
        .bind(questionnaire_id)
        .bind(rmaj)
        .bind(rmin)
        .bind(rpat)
        .fetch_optional(&state.pool)
        .await?;
        match snapshot {
            Some(content) => content,
            None => {
                fallback_registry = true;
                registry_content
            }
        }
    } else {
        registry_content
    };

    // Extract the server-computed declarations from content.variables (array).
    let declarations = content
        .get("variables")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut variables: Vec<ServerVariableEntry> = Vec::new();
    for decl in declarations {
        if variables.len() >= MAX_SERVER_VARS {
            break;
        }
        let Some(server) = decl.get("server").filter(|s| s.is_object()) else {
            continue;
        };
        let name = match decl.get("name").and_then(|v| v.as_str()) {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => continue,
        };
        let id = decl
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or(&name)
            .to_string();
        let key = match server.get("key").and_then(|v| v.as_str()) {
            Some(k) if !k.trim().is_empty() => k.trim().to_string(),
            _ => continue,
        };
        // Source selects the aggregate function: 'trials' → fillout_trial_stats,
        // otherwise the response/variable branches of fillout_dataset_stats.
        let source = match server.get("source").and_then(|v| v.as_str()) {
            Some("response") => "response",
            Some("trials") => "trials",
            _ => "variable",
        };

        let dataset = server.get("dataset").filter(|d| d.is_object());
        let dataset_id = dataset
            .and_then(|d| d.get("id"))
            .and_then(|v| v.as_str())
            .map(str::to_string);

        // Build the server-side filter payload. The version components are
        // ALWAYS server-injected (the client never sends them); versionScope
        // defaults to 'sameMajor' (the DatasetFilter default).
        let mut filter = serde_json::Map::new();
        let version_scope = dataset
            .and_then(|d| d.get("versionScope"))
            .and_then(|v| v.as_str())
            .unwrap_or("sameMajor");
        filter.insert("versionScope".into(), version_scope.into());
        filter.insert("versionMajor".into(), v_major.into());
        filter.insert("versionMinor".into(), v_minor.into());
        filter.insert("versionPatch".into(), v_patch.into());
        if let Some(d) = dataset {
            for field in ["completedAfter", "completedBefore"] {
                if let Some(val) = d.get(field).filter(|v| v.is_string()) {
                    filter.insert(field.into(), val.clone());
                }
            }
            if let Some(where_clauses) = d.get("where").filter(|w| w.is_array()) {
                filter.insert("where".into(), where_clauses.clone());
            }
        }
        let filter = serde_json::Value::Object(filter);

        // Trial-source declarations aggregate the per-trial `trials` table
        // (ADR 0028): `key` is the reaction question id, `metric` selects the
        // aggregated column, and invalidated trials are excluded by default.
        let row = if source == "trials" {
            let metric = match server.get("metric").and_then(|v| v.as_str()) {
                Some("accuracy") => "accuracy",
                _ => "rt",
            };
            let include_invalidated = server
                .get("includeInvalidated")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            sqlx::query_as::<_, DatasetStatsRow>(
                "SELECT n, mean, std_dev, min, max, p10, p25, median, p75, p90, p95, p99 \
                 FROM public.fillout_trial_stats($1, $2, $3, $4, $5)",
            )
            .bind(questionnaire_id)
            .bind(&key)
            .bind(metric)
            .bind(include_invalidated)
            .bind(&filter)
            .fetch_one(&state.pool)
            .await?
        } else {
            sqlx::query_as::<_, DatasetStatsRow>(
                "SELECT n, mean, std_dev, min, max, p10, p25, median, p75, p90, p95, p99 \
                 FROM public.fillout_dataset_stats($1, $2, $3, $4)",
            )
            .bind(questionnaire_id)
            .bind(source)
            .bind(&key)
            .bind(&filter)
            .fetch_one(&state.pool)
            .await?
        };

        // Explicit per-declaration disclosure floor (ADR 0028): the declaration's
        // `minN` (integer >= 1) replaces the former platform-hardcoded n>=5. When
        // absent (pre-0028 data that escaped the content migration) fall back to
        // the legacy floor. The count is ALWAYS reported; stats are withheld below.
        let min_n = server
            .get("minN")
            .and_then(|v| v.as_i64())
            .filter(|n| *n >= 1)
            .unwrap_or(MIN_COHORT_N);

        let sample_count = row.n.max(0) as usize;
        let stats = if row.n < min_n {
            // Below the disclosure floor: count only, every stat withheld.
            None
        } else {
            Some(NumericStatsSummary {
                sample_count,
                mean: row.mean,
                median: row.median,
                std_dev: row.std_dev,
                min: row.min,
                max: row.max,
                p10: row.p10,
                p25: row.p25,
                p50: row.median,
                p75: row.p75,
                p90: row.p90,
                p95: row.p95,
                p99: row.p99,
            })
        };

        variables.push(ServerVariableEntry {
            id,
            name,
            source: source.to_string(),
            key,
            dataset_id,
            decl_hash: decl_hash(server),
            sample_count,
            stats,
        });
    }

    let response = ServerVariablesResponse {
        questionnaire_id,
        version: version_str,
        computed_at: chrono::Utc::now(),
        fallback_registry,
        variables,
    };

    srvvars_cache_set(&state, &cache_key, &response).await;

    Ok(Json(response))
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
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Query(query): Query<TimeSeriesQuery>,
) -> Result<Json<Vec<TimeSeriesBucket>>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Questionnaire(query.questionnaire_id),
        Permission::SessionRead,
    )
    .await?;

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
