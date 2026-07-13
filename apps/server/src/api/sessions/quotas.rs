use super::models::*;
use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use crate::auth::models::AuthenticatedUser;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::middleware::tx::Tx;
use crate::rbac::models::Permission;
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
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(questionnaire_id): Path<Uuid>,
) -> Result<Json<Vec<ConditionCount>>, ApiError> {
    let mut tx = tx.tx().await?;
    // Verify access via the questionnaire's project
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Questionnaire(questionnaire_id),
        Permission::SessionRead,
    )
    .await?;

    // E-FLOW-6: prefer the authoritative `assigned_condition` column persisted
    // at create time; fall back to the legacy `metadata->>'assignedCondition'`
    // slot for sessions created before 00031 (client-side assignment).
    let counts = sqlx::query_as::<_, ConditionCount>(
        r#"
        SELECT COALESCE(assigned_condition, metadata->>'assignedCondition') AS condition_name,
               COUNT(*)::bigint AS count
        FROM sessions
        WHERE questionnaire_id = $1
          AND COALESCE(assigned_condition, metadata->>'assignedCondition') IS NOT NULL
        GROUP BY COALESCE(assigned_condition, metadata->>'assignedCondition')
        ORDER BY count DESC
        "#,
    )
    .bind(questionnaire_id)
    .fetch_all(&mut **tx)
    .await?;

    Ok(Json(counts))
}

/// GET /api/questionnaires/:id/arm-counts
///
/// Live per-arm allocation counts straight from the `arm_counts` ledger
/// (E-FLOW-6, dovetails with the analytics per-arm readout / P8-T4). This is
/// the authoritative assignment tally maintained atomically at create time —
/// distinct from `condition-counts`, which derives from session rows.
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/arm-counts",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id")
    ),
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Live per-arm allocation counts", body = [ArmCount]),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn arm_counts(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    tx: Tx,
    Path(questionnaire_id): Path<Uuid>,
) -> Result<Json<Vec<ArmCount>>, ApiError> {
    let mut tx = tx.tx().await?;
    authorize(
        &mut tx,
        &state.rbac,
        user.user_id,
        Scope::Questionnaire(questionnaire_id),
        Permission::SessionRead,
    )
    .await?;

    let counts = sqlx::query_as::<_, ArmCount>(
        r#"
        SELECT condition_name, assigned_count
        FROM arm_counts
        WHERE questionnaire_id = $1
        ORDER BY condition_name ASC
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

// ── Interlocking Quota Cells Endpoint (E-FLOW-7) ─────────────────────

/// GET /api/questionnaires/{id}/quota-cells
///
/// Returns live per-cell occupancy for interlocking cross-quota cells. The
/// client computes the participant's cell key from live in-survey variables
/// and blocks only when THAT cell is full (independent-cell semantics), rather
/// than when any sibling cell is full.
///
/// Anonymous, like `quota_status`. `quota_cells` carries no RLS policy and is
/// aggregate-only (no per-session rows), so a plain SELECT under the app role
/// is safe — no SECURITY DEFINER needed for the read. A cell only appears once
/// it has received its first claim; a not-yet-claimed cell is absent (occupancy
/// 0), which the client treats as "room available".
#[utoipa::path(
    get,
    path = "/api/questionnaires/{id}/quota-cells",
    params(
        ("id" = Uuid, Path, description = "Questionnaire id")
    ),
    responses(
        (status = 200, description = "Live per-cell quota occupancy", body = QuotaCellsResponse),
        (status = 404, description = "Questionnaire not found", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn quota_cells(
    State(state): State<AppState>,
    Path(questionnaire_id): Path<Uuid>,
) -> Result<Json<QuotaCellsResponse>, ApiError> {
    let cells = sqlx::query_as::<_, QuotaCellStatus>(
        r#"
        SELECT cell_key,
               target,
               current,
               (target > 0 AND current >= target) AS is_full
        FROM quota_cells
        WHERE questionnaire_id = $1
        ORDER BY cell_key ASC
        "#,
    )
    .bind(questionnaire_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(QuotaCellsResponse { cells }))
}
