use super::models::*;
use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::state::AppState;

/// GET /api/questionnaires/:id/condition-counts
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/condition-counts",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Assigned condition counts", body = [ConditionCount]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn condition_counts(
    user: AuthenticatedUser,
    tx: Tx,
    Path(questionnaire_id): Path<Uuid>,
) -> Result<Json<Vec<ConditionCount>>, ApiError> {
    let mut tx = tx.tx().await?;
    // Verify access via the questionnaire's project
    access::verify_questionnaire_access(&mut **tx, user.user_id, questionnaire_id).await?;

    let counts = sqlx::query_as::<_, ConditionCount>(
        r#"
        SELECT metadata->>'assignedCondition' AS condition_name, COUNT(*)::bigint AS count
        FROM sessions
        WHERE questionnaire_id = $1
          AND metadata->>'assignedCondition' IS NOT NULL
        GROUP BY metadata->>'assignedCondition'
        ORDER BY count DESC
        "#,
    )
    .bind(questionnaire_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(counts))
}

// ── Quota Status Endpoint ────────────────────────────────────────

/// GET /api/questionnaires/{id}/quota-status
///
/// Returns the current completion counts for quota management.
/// The client evaluates quota conditions against these counts.
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/quota-status",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id")
    ),
    responses(
        (status = 200, description = "Quota completion counts", body = QuotaStatusResponse),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn quota_status(
    State(state): State<AppState>,
    Path(questionnaire_id): Path<Uuid>,
) -> Result<Json<QuotaStatusResponse>, ApiError> {
    // Load questionnaire settings to get quota definitions
    let settings_row = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT COALESCE(content->'settings', '{}'::jsonb) FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(questionnaire_id)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

    // Count completed sessions via the SECURITY DEFINER aggregate (00027).
    // The bare app pool has no RLS GUC set here, so a direct COUNT under
    // `qdesigner_app` would be hidden by the 00021 dual-path SELECT policy
    // and always return 0 (the pre-00027 always-inert-quota bug). The
    // owner-definer function bypasses RLS and returns an aggregate only.
    let total_completed = sqlx::query_scalar::<_, i64>("SELECT public.fillout_completed_count($1)")
        .bind(questionnaire_id)
        .fetch_one(&state.pool)
        .await?;

    // Extract quota groups from settings
    let quota_groups = settings_row
        .get("quotas")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut quotas = Vec::new();

    for group in &quota_groups {
        let group_quotas = group
            .get("quotas")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for q in &group_quotas {
            let quota_id = q
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = q
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let target = q.get("target").and_then(|v| v.as_i64()).unwrap_or(0);
            let enabled = q.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);

            if !enabled || quota_id.is_empty() {
                continue;
            }

            // Evaluate this quota's own condition against completed sessions,
            // in lockstep with the client grammar (QuotaService.evaluateQuotaCondition).
            // A catch-all / unparseable condition falls back to the total
            // completed count (mirrors the client's allow-by-default). A
            // 'false' / '0' condition matches no one. Real comparisons run
            // through the SECURITY DEFINER per-condition counter.
            let condition = q.get("condition").and_then(|v| v.as_str()).unwrap_or("");
            let current = match parse_quota_condition(condition) {
                QuotaCond::All => total_completed,
                QuotaCond::Never => 0,
                QuotaCond::Cmp {
                    var_name,
                    op,
                    value,
                } => {
                    sqlx::query_scalar::<_, i64>(
                        "SELECT public.fillout_quota_condition_count($1, $2, $3, $4)",
                    )
                    .bind(questionnaire_id)
                    .bind(&var_name)
                    .bind(&op)
                    .bind(&value)
                    .fetch_one(&state.pool)
                    .await?
                }
                QuotaCond::Unparseable => {
                    tracing::warn!(
                        quota_id = %quota_id,
                        condition = %condition,
                        "quota_status: unparseable quota condition; falling back to total completed count"
                    );
                    total_completed
                }
            };

            quotas.push(QuotaStatusItem {
                quota_id,
                name,
                target,
                current,
                is_full: current >= target,
            });
        }
    }

    Ok(Json(QuotaStatusResponse {
        quotas,
        total_completed,
    }))
}
