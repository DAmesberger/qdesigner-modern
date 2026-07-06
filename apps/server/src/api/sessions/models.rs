//! Session DTOs, row structs, and shared helper functions.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
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
    pub questionnaire_version_major: Option<i32>,
    pub questionnaire_version_minor: Option<i32>,
    pub questionnaire_version_patch: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateSessionRequest {
    pub questionnaire_id: Uuid,
    pub participant_id: Option<String>,
    pub browser_info: Option<serde_json::Value>,
    pub metadata: Option<serde_json::Value>,
    pub version_major: Option<i32>,
    pub version_minor: Option<i32>,
    pub version_patch: Option<i32>,
    /// Client-generated browser fingerprint hash used for create-time
    /// duplicate-participation detection. Optional; when omitted we fall
    /// back to `metadata->>'fingerprint'` for backward compatibility.
    pub fingerprint: Option<String>,
}

/// Response for `POST /api/sessions`. Flattens the created [`Session`] and
/// adds `duplicate` — true when a prior COMPLETED session for the same
/// questionnaire shares the caller-provided fingerprint. The session is
/// created regardless; the client decides whether to warn or block per the
/// questionnaire's fraud-prevention settings (repeat participation may be
/// allowed, so the server does not hard-block here).
#[derive(Debug, Serialize, ToSchema)]
pub struct CreateSessionResponse {
    #[serde(flatten)]
    pub session: Session,
    pub duplicate: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateSessionRequest {
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
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
    pub client_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SubmitResponseRequest {
    #[serde(alias = "questionId")]
    pub question_id: String,
    pub value: serde_json::Value,
    /// Microsecond-precision reaction time (BIGINT).
    #[serde(alias = "reactionTimeUs")]
    pub reaction_time_us: Option<i64>,
    #[serde(alias = "presentedAt")]
    pub presented_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(alias = "answeredAt")]
    pub answered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum SubmitResponsesPayload {
    Single(SubmitResponseRequest),
    Batch {
        responses: Vec<SubmitResponseRequest>,
    },
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct InteractionEventRecord {
    pub id: Uuid,
    pub session_id: Uuid,
    pub event_type: String,
    pub question_id: Option<String>,
    pub timestamp_us: i64,
    pub metadata: Option<serde_json::Value>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub client_id: Option<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct SessionVariableRecord {
    // session_variables has a composite primary key (session_id, variable_name)
    // and NO surrogate `id` column — the row is keyed by these two fields.
    pub session_id: Uuid,
    pub variable_name: String,
    pub variable_value: Option<serde_json::Value>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct ResponseListQuery {
    pub question_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SessionVariableRequest {
    pub name: String,
    pub value: Value,
    #[serde(default, alias = "valueType")]
    pub value_type: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
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
#[derive(Debug, Deserialize, IntoParams)]
pub struct SessionListQuery {
    pub questionnaire_id: Option<Uuid>,
    pub participant_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct SessionAggregateQuery {
    pub questionnaire_id: Uuid,
    pub source: Option<String>,
    pub key: String,
    pub participant_id: Option<String>,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct SessionCompareQuery {
    pub questionnaire_id: Uuid,
    pub source: Option<String>,
    pub key: String,
    pub left_participant_id: String,
    pub right_participant_id: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
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

#[derive(Debug, Serialize, ToSchema)]
pub struct SessionAggregateResponse {
    pub questionnaire_id: Uuid,
    pub source: String,
    pub key: String,
    pub participant_count: usize,
    pub stats: NumericStatsSummary,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ParticipantStats {
    pub participant_id: String,
    pub stats: NumericStatsSummary,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ComparisonDelta {
    pub mean_delta: Option<f64>,
    pub median_delta: Option<f64>,
    pub z_score: Option<f64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SessionCompareResponse {
    pub questionnaire_id: Uuid,
    pub source: String,
    pub key: String,
    pub left: ParticipantStats,
    pub right: ParticipantStats,
    pub delta: ComparisonDelta,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct DashboardQuery {
    pub organization_id: Uuid,
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct CrossProjectAnalyticsQuery {
    pub questionnaire_ids: String,
    pub metrics: Option<String>,
    pub source: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CrossProjectAnalyticsResponse {
    pub questionnaires: Vec<QuestionnaireAnalytics>,
    pub aggregate: AggregateOverview,
    pub cross_comparisons: Option<Vec<CrossComparison>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct QuestionnaireAnalytics {
    pub questionnaire_id: Uuid,
    pub name: String,
    pub response_count: i64,
    pub completed_sessions: i64,
    pub completion_rate: f64,
    pub timing_stats: Option<NumericStatsSummary>,
    pub variable_stats: Option<NumericStatsSummary>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AggregateOverview {
    pub total_responses: i64,
    pub total_completed_sessions: i64,
    pub overall_completion_rate: f64,
    pub overall_timing_stats: Option<NumericStatsSummary>,
    pub overall_variable_stats: Option<NumericStatsSummary>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CrossComparison {
    pub questionnaire_a: Uuid,
    pub questionnaire_b: Uuid,
    pub mean_delta: Option<f64>,
    pub median_delta: Option<f64>,
    pub correlation: Option<f64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DashboardSummary {
    pub questionnaires: Vec<QuestionnaireSummary>,
    pub recent_activity: Vec<ActivityRecord>,
    pub stats: DashboardStats,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct QuestionnaireSummary {
    pub id: Uuid,
    pub name: String,
    pub project_id: Uuid,
    pub status: String,
    pub total_responses: i64,
    pub completed_sessions: i64,
    pub avg_completion_time_ms: Option<f64>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ActivityRecord {
    pub session_id: Uuid,
    pub participant_id: Option<String>,
    pub questionnaire_name: String,
    pub status: String,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct DashboardStats {
    pub total_questionnaires: i64,
    pub total_responses: i64,
    pub active_questionnaires: i64,
    pub avg_completion_rate: f64,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum AggregateSource {
    Variable,
    Response,
}

// ── Fraud prevention ────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
pub struct CheckDuplicateRequest {
    pub questionnaire_id: Uuid,
    pub fingerprint: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CheckDuplicateResponse {
    pub is_duplicate: bool,
    pub previous_completions: i64,
}

// ── Handlers ─────────────────────────────────────────────────────────

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct ResponseValueRow {
    participant_id: Option<String>,
    value: Value,
}

#[derive(Debug)]
pub(crate) struct NumericSample {
    pub(crate) participant_id: Option<String>,
    pub(crate) value: f64,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct VariableProjectionRow {
    participant_id: Option<String>,
    numeric_value: Option<f64>,
    raw_value: Option<Value>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct SessionVariableContext {
    questionnaire_id: Uuid,
    questionnaire_version_major: Option<i32>,
    questionnaire_version_minor: Option<i32>,
    questionnaire_version_patch: Option<i32>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct VariableDefinitionRow {
    variable_name: String,
    declared_type: String,
    source_kind: String,
}

#[derive(Debug, Clone)]
pub(crate) struct VariableDefinitionMetadata {
    declared_type: String,
    source_kind: String,
}

#[derive(Debug)]
pub(crate) struct NormalizedVariableValue {
    raw_value: Value,
    value_type: String,
    source_kind: String,
    numeric_value: Option<f64>,
    text_value: Option<String>,
    boolean_value: Option<bool>,
    timestamp_value: Option<chrono::DateTime<chrono::Utc>>,
}

impl AggregateSource {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            AggregateSource::Variable => "variable",
            AggregateSource::Response => "response",
        }
    }
}

pub(crate) fn parse_aggregate_source(source: Option<&str>) -> Result<AggregateSource, ApiError> {
    let normalized = source.unwrap_or("variable").trim().to_ascii_lowercase();

    match normalized.as_str() {
        "variable" => Ok(AggregateSource::Variable),
        "response" => Ok(AggregateSource::Response),
        _ => Err(ApiError::BadRequest(format!(
            "Invalid source '{normalized}'. Expected 'variable' or 'response'"
        ))),
    }
}

pub(crate) fn normalize_variable_name(name: &str) -> Result<String, ApiError> {
    let normalized = name.trim();
    if normalized.is_empty() {
        return Err(ApiError::BadRequest(
            "Variable name must not be empty".into(),
        ));
    }

    Ok(normalized.to_string())
}

pub(crate) async fn fetch_session_variable_context<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    session_id: Uuid,
) -> Result<SessionVariableContext, ApiError> {
    sqlx::query_as::<_, SessionVariableContext>(
        r#"
        SELECT
            questionnaire_id,
            questionnaire_version_major,
            questionnaire_version_minor,
            questionnaire_version_patch
        FROM sessions
        WHERE id = $1
        "#,
    )
    .bind(session_id)
    .fetch_optional(executor)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))
}

pub(crate) async fn load_variable_definition_map<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    context: &SessionVariableContext,
    names: &[String],
) -> Result<HashMap<String, VariableDefinitionMetadata>, ApiError> {
    let (Some(version_major), Some(version_minor), Some(version_patch)) = (
        context.questionnaire_version_major,
        context.questionnaire_version_minor,
        context.questionnaire_version_patch,
    ) else {
        return Ok(HashMap::new());
    };

    let unique_names: Vec<String> = names
        .iter()
        .filter_map(|name| {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    if unique_names.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = sqlx::query_as::<_, VariableDefinitionRow>(
        r#"
        SELECT variable_name, declared_type, source_kind
        FROM questionnaire_variable_definitions
        WHERE questionnaire_id = $1
          AND version_major = $2
          AND version_minor = $3
          AND version_patch = $4
          AND variable_name = ANY($5)
        "#,
    )
    .bind(context.questionnaire_id)
    .bind(version_major)
    .bind(version_minor)
    .bind(version_patch)
    .bind(&unique_names)
    .fetch_all(executor)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.variable_name,
                VariableDefinitionMetadata {
                    declared_type: row.declared_type,
                    source_kind: row.source_kind,
                },
            )
        })
        .collect())
}

pub(crate) fn normalize_index_value_type(
    explicit_type: Option<&str>,
    declared_type: Option<&str>,
    value: &Value,
) -> String {
    let raw_type = explicit_type
        .or(declared_type)
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(|raw| raw.to_ascii_lowercase());

    match raw_type.as_deref() {
        Some("number" | "integer" | "float" | "double" | "reaction_time" | "stimulus_onset") => {
            "number".into()
        }
        Some("boolean" | "bool") => "boolean".into(),
        Some("date" | "time" | "datetime" | "timestamp") => {
            if json_value_to_timestamp(value).is_some() {
                "timestamp".into()
            } else {
                "string".into()
            }
        }
        Some("json" | "object" | "array") => "json".into(),
        Some("null") => "null".into(),
        Some("string" | "text") => "string".into(),
        Some(_) | None => match value {
            Value::Number(_) => "number".into(),
            Value::Bool(_) => "boolean".into(),
            Value::Null => "null".into(),
            Value::String(raw) => {
                if json_value_to_timestamp(value).is_some()
                    && (raw.contains('-') || raw.contains('T') || raw.contains(':'))
                {
                    "timestamp".into()
                } else {
                    "string".into()
                }
            }
            Value::Array(_) | Value::Object(_) => "json".into(),
        },
    }
}

pub(crate) fn normalize_variable_source_kind(source: Option<&str>) -> String {
    source
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(|raw| {
            let normalized = raw.to_ascii_lowercase();
            match normalized.as_str() {
                "script" | "computed" => "script".to_string(),
                "response" => "response".to_string(),
                "manual" | "declared" => "declared".to_string(),
                _ => normalized,
            }
        })
        .unwrap_or_else(|| "script".to_string())
}

pub(crate) fn json_value_to_text(value: &Value) -> Option<String> {
    match value {
        Value::String(raw) => Some(raw.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Null => None,
        _ => Some(value.to_string()),
    }
}

pub(crate) fn json_value_to_bool(value: &Value) -> Option<bool> {
    match value {
        Value::Bool(flag) => Some(*flag),
        Value::String(raw) => match raw.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" | "y" => Some(true),
            "false" | "0" | "no" | "n" => Some(false),
            _ => None,
        },
        Value::Number(number) => number
            .as_i64()
            .map(|value| value != 0)
            .or_else(|| number.as_u64().map(|value| value != 0)),
        Value::Object(object) => object.get("value").and_then(json_value_to_bool),
        _ => None,
    }
}

pub(crate) fn json_value_to_timestamp(value: &Value) -> Option<chrono::DateTime<chrono::Utc>> {
    match value {
        Value::String(raw) => chrono::DateTime::parse_from_rfc3339(raw)
            .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
            .ok()
            .or_else(|| {
                chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d")
                    .ok()
                    .and_then(|date| date.and_hms_opt(0, 0, 0))
                    .map(|naive| naive.and_utc())
            })
            .or_else(|| {
                chrono::NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S")
                    .ok()
                    .map(|naive| naive.and_utc())
            }),
        Value::Number(number) => number.as_i64().and_then(|raw| {
            let (seconds, nanos) = if raw.abs() >= 1_000_000_000_000 {
                (raw / 1000, ((raw % 1000) * 1_000_000) as u32)
            } else {
                (raw, 0)
            };
            chrono::DateTime::<chrono::Utc>::from_timestamp(seconds, nanos)
        }),
        Value::Object(object) => object.get("value").and_then(json_value_to_timestamp),
        _ => None,
    }
}

pub(crate) fn normalize_variable_value(
    value: Option<Value>,
    explicit_value_type: Option<&str>,
    explicit_source: Option<&str>,
    definition: Option<&VariableDefinitionMetadata>,
) -> NormalizedVariableValue {
    let payload = value.unwrap_or(Value::Null);
    let mut raw_value = payload.clone();
    let mut payload_value_type = explicit_value_type
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(ToOwned::to_owned);
    let mut payload_source = explicit_source
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(ToOwned::to_owned);

    if let Value::Object(object) = &payload {
        if let Some(inner_value) = object.get("value") {
            raw_value = inner_value.clone();
        }

        if payload_value_type.is_none() {
            payload_value_type = object
                .get("valueType")
                .or_else(|| object.get("type"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|raw| !raw.is_empty())
                .map(ToOwned::to_owned);
        }

        if payload_source.is_none() {
            payload_source = object
                .get("source")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|raw| !raw.is_empty())
                .map(ToOwned::to_owned);
        }
    }

    let value_type = normalize_index_value_type(
        payload_value_type.as_deref(),
        definition.map(|item| item.declared_type.as_str()),
        &raw_value,
    );
    let source_kind = normalize_variable_source_kind(
        payload_source
            .as_deref()
            .or_else(|| definition.map(|item| item.source_kind.as_str())),
    );

    let numeric_value = if value_type == "number" {
        json_value_to_f64(&raw_value)
    } else {
        None
    };
    let boolean_value = if value_type == "boolean" {
        json_value_to_bool(&raw_value)
    } else {
        None
    };
    let timestamp_value = if value_type == "timestamp" {
        json_value_to_timestamp(&raw_value)
    } else {
        None
    };
    let text_value = if value_type == "string" {
        json_value_to_text(&raw_value)
    } else {
        None
    };

    NormalizedVariableValue {
        raw_value,
        value_type,
        source_kind,
        numeric_value,
        text_value,
        boolean_value,
        timestamp_value,
    }
}

pub(crate) async fn persist_session_variable(
    conn: &mut sqlx::PgConnection,
    session_id: Uuid,
    context: &SessionVariableContext,
    variable_name: &str,
    normalized: NormalizedVariableValue,
) -> Result<(), ApiError> {
    sqlx::query!(
        r#"
        INSERT INTO session_variables (session_id, variable_name, variable_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, variable_name)
        DO UPDATE SET variable_value = EXCLUDED.variable_value, updated_at = NOW()
        "#,
        session_id,
        variable_name,
        &normalized.raw_value,
    )
    .execute(&mut *conn)
    .await?;

    sqlx::query!(
        r#"
        INSERT INTO session_variable_index (
            session_id,
            questionnaire_id,
            questionnaire_version_major,
            questionnaire_version_minor,
            questionnaire_version_patch,
            variable_name,
            value_type,
            source_kind,
            numeric_value,
            text_value,
            boolean_value,
            timestamp_value,
            raw_value
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (session_id, variable_name)
        DO UPDATE SET
            questionnaire_id = EXCLUDED.questionnaire_id,
            questionnaire_version_major = EXCLUDED.questionnaire_version_major,
            questionnaire_version_minor = EXCLUDED.questionnaire_version_minor,
            questionnaire_version_patch = EXCLUDED.questionnaire_version_patch,
            value_type = EXCLUDED.value_type,
            source_kind = EXCLUDED.source_kind,
            numeric_value = EXCLUDED.numeric_value,
            text_value = EXCLUDED.text_value,
            boolean_value = EXCLUDED.boolean_value,
            timestamp_value = EXCLUDED.timestamp_value,
            raw_value = EXCLUDED.raw_value,
            updated_at = NOW()
        "#,
        session_id,
        context.questionnaire_id,
        context.questionnaire_version_major,
        context.questionnaire_version_minor,
        context.questionnaire_version_patch,
        variable_name,
        normalized.value_type,
        normalized.source_kind,
        normalized.numeric_value,
        normalized.text_value,
        normalized.boolean_value,
        normalized.timestamp_value,
        normalized.raw_value,
    )
    .execute(&mut *conn)
    .await?;

    Ok(())
}

pub(crate) async fn refresh_session_variable_projection(
    conn: &mut sqlx::PgConnection,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let context = fetch_session_variable_context(&mut *conn, session_id).await?;
    let rows = sqlx::query_as::<_, SessionVariableRecord>(
        r#"
        SELECT session_id, variable_name, variable_value, created_at, updated_at
        FROM session_variables
        WHERE session_id = $1
        ORDER BY variable_name ASC
        "#,
    )
    .bind(session_id)
    .fetch_all(&mut *conn)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    let variable_names: Vec<String> = rows.iter().map(|row| row.variable_name.clone()).collect();
    let definition_map =
        load_variable_definition_map(&mut *conn, &context, &variable_names).await?;

    for row in rows {
        let variable_name = normalize_variable_name(&row.variable_name)?;
        let normalized = normalize_variable_value(
            row.variable_value,
            None,
            None,
            definition_map.get(&variable_name),
        );

        persist_session_variable(&mut *conn, session_id, &context, &variable_name, normalized)
            .await?;
    }

    Ok(())
}

pub(crate) async fn load_numeric_samples<'e>(
    executor: impl sqlx::PgExecutor<'e>,
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

    match source {
        AggregateSource::Variable => {
            where_parts.push(
                "(svi.variable_name IS NOT NULL OR sv.variable_name IS NOT NULL)".to_string(),
            );

            let sql = format!(
                r#"
                SELECT
                    s.participant_id,
                    svi.numeric_value,
                    COALESCE(svi.raw_value, sv.variable_value) AS raw_value
                FROM sessions s
                LEFT JOIN session_variable_index svi
                    ON svi.session_id = s.id
                   AND svi.variable_name = $2
                LEFT JOIN session_variables sv
                    ON sv.session_id = s.id
                   AND sv.variable_name = $2
                WHERE {}
                ORDER BY s.created_at ASC
                "#,
                where_parts.join(" AND ")
            );

            let mut query = sqlx::query_as::<_, VariableProjectionRow>(&sql)
                .bind(questionnaire_id)
                .bind(key);

            if let Some(participant_id) = participant_id {
                query = query.bind(participant_id);
            }

            let rows = query.fetch_all(executor).await?;

            Ok(rows
                .into_iter()
                .filter_map(|row| {
                    row.numeric_value
                        .or_else(|| row.raw_value.as_ref().and_then(json_value_to_f64))
                        .map(|value| NumericSample {
                            participant_id: row.participant_id,
                            value,
                        })
                })
                .collect())
        }
        AggregateSource::Response => {
            where_parts.push("r.question_id = $2".to_string());

            let sql = format!(
                r#"
                SELECT s.participant_id, r.value
                FROM responses r
                INNER JOIN sessions s ON s.id = r.session_id
                WHERE {}
                ORDER BY s.created_at ASC
                "#,
                where_parts.join(" AND ")
            );

            let mut query = sqlx::query_as::<_, ResponseValueRow>(&sql)
                .bind(questionnaire_id)
                .bind(key);

            if let Some(participant_id) = participant_id {
                query = query.bind(participant_id);
            }

            let rows = query.fetch_all(executor).await?;

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
    }
}

pub(crate) fn json_value_to_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(raw) => raw.parse::<f64>().ok(),
        Value::Bool(flag) => Some(if *flag { 1.0 } else { 0.0 }),
        Value::Object(object) => object.get("value").and_then(json_value_to_f64),
        _ => None,
    }
}

pub(crate) fn compute_numeric_stats(values: &[f64]) -> NumericStatsSummary {
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

pub(crate) fn percentile(sorted: &[f64], percentile: f64) -> Option<f64> {
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

pub(crate) fn normalize_session_status(status: &str) -> Result<String, ApiError> {
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

pub(crate) async fn ensure_session_active<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let status = sqlx::query_scalar!(
        r#"SELECT status as "status!" FROM sessions WHERE id = $1"#,
        session_id
    )
    .fetch_optional(executor)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    if status != "active" {
        return Err(ApiError::BadRequest("Session is not active".into()));
    }

    Ok(())
}

pub(crate) async fn ensure_session_exists<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM sessions WHERE id = $1) as "exists!""#,
        session_id
    )
    .fetch_one(executor)
    .await?;

    if !exists {
        return Err(ApiError::NotFound("Session not found".into()));
    }

    Ok(())
}

pub(crate) async fn insert_response<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    session_id: Uuid,
    response: &SubmitResponseRequest,
) -> Result<ResponseRecord, ApiError> {
    let metadata = response
        .metadata
        .clone()
        .unwrap_or_else(|| serde_json::json!({}));

    let inserted = sqlx::query_as!(
        ResponseRecord,
        r#"
        INSERT INTO responses (session_id, question_id, value, reaction_time_us,
                               presented_at, answered_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, session_id, question_id, value, reaction_time_us,
                  presented_at, answered_at, metadata as "metadata!", created_at, client_id
        "#,
        session_id,
        &response.question_id,
        &response.value,
        response.reaction_time_us,
        response.presented_at,
        response.answered_at,
        metadata,
    )
    .fetch_one(executor)
    .await?;

    Ok(inserted)
}

pub(crate) fn pearson_correlation(x: &[f64], y: &[f64]) -> Option<f64> {
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

/// Verify the authenticated user has access to a session's questionnaire.
/// Takes `&mut PgConnection` so the two queries (lookup + access check)
/// run on the same connection — necessary because `impl PgExecutor` is
/// consumed by the first call.
pub(crate) async fn ensure_session_access(
    conn: &mut sqlx::PgConnection,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<(), ApiError> {
    let questionnaire_id =
        sqlx::query_scalar::<_, Uuid>("SELECT questionnaire_id FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_optional(&mut *conn)
            .await?
            .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    access::verify_questionnaire_access(&mut *conn, user_id, questionnaire_id).await
}

/// For participant-facing endpoints (submit response, events, variables, update session):
/// The session must belong to a published questionnaire. Access is allowed if:
/// 1. The session's questionnaire is published (anonymous participants can interact), OR
/// 2. The caller is an authenticated org member of the questionnaire's project.
///
/// This permits anonymous questionnaire fill-out while preventing arbitrary
/// unauthenticated access to unpublished questionnaire sessions.
pub(crate) async fn ensure_session_participant_or_member(
    conn: &mut sqlx::PgConnection,
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
    .fetch_optional(&mut *conn)
    .await?
    .ok_or_else(|| ApiError::NotFound("Session not found".into()))?;

    let (questionnaire_id, q_status) = row;

    // Published questionnaires allow anonymous participant interaction
    if q_status == "published" {
        return Ok(());
    }

    // For unpublished questionnaires, require authenticated org member
    match user {
        Some(u) => {
            access::verify_questionnaire_access(&mut *conn, u.user_id, questionnaire_id).await
        }
        None => Err(ApiError::Forbidden(
            "Authentication required for unpublished questionnaires".into(),
        )),
    }
}

pub(crate) fn merge_event_metadata(metadata: Option<Value>, event_data: Option<Value>) -> Value {
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

// ── Condition Counts ─────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct ConditionCount {
    pub condition_name: Option<String>,
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct QuotaStatusItem {
    pub quota_id: String,
    pub name: String,
    pub target: i64,
    pub current: i64,
    pub is_full: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct QuotaStatusResponse {
    pub quotas: Vec<QuotaStatusItem>,
    pub total_completed: i64,
}

/// A parsed quota `condition`. Kept in lockstep with the client parser
/// `QuotaService.evaluateQuotaCondition` so a cell the client believes is
/// full is counted identically by the server.
#[derive(Debug, PartialEq)]
pub(crate) enum QuotaCond {
    /// Empty / `true` / `1` — matches every completed session (catch-all).
    All,
    /// `false` / `0` — matches no session.
    Never,
    /// `var op value`, e.g. `gender == male` or `age > 18`.
    Cmp {
        var_name: String,
        op: String,
        value: String,
    },
    /// Non-empty but not a recognised grammar — caller falls back to the
    /// total completed count (mirrors the client's allow-by-default).
    Unparseable,
}

/// Parse a quota `condition` using the same grammar as the client
/// (`QuotaService.evaluateQuotaCondition`):
/// - trim; empty / `true` / `1` → catch-all; `false` / `0` → never;
/// - `^[A-Za-z_][A-Za-z0-9_]*\s*(==|!=|>=|<=|>|<)\s*.+$`, with surrounding
///   double-quotes stripped from the comparison value.
///
/// No `regex` crate is available in this workspace, so the operator scan is
/// hand-rolled: two-char operators are matched before single-char ones at
/// each position so `>=`/`<=` win over `>`/`<`.
pub(crate) fn parse_quota_condition(condition: &str) -> QuotaCond {
    let trimmed = condition.trim();
    if trimmed.is_empty() || trimmed == "true" || trimmed == "1" {
        return QuotaCond::All;
    }
    if trimmed == "false" || trimmed == "0" {
        return QuotaCond::Never;
    }

    // Locate the first comparison operator, preferring two-char forms.
    let bytes = trimmed.as_bytes();
    let mut split: Option<(usize, &'static str)> = None;
    let mut i = 0;
    while i < bytes.len() {
        match trimmed.get(i..i + 2) {
            Some("==") => {
                split = Some((i, "=="));
                break;
            }
            Some("!=") => {
                split = Some((i, "!="));
                break;
            }
            Some(">=") => {
                split = Some((i, ">="));
                break;
            }
            Some("<=") => {
                split = Some((i, "<="));
                break;
            }
            _ => {}
        }
        match &bytes[i] {
            b'>' => {
                split = Some((i, ">"));
                break;
            }
            b'<' => {
                split = Some((i, "<"));
                break;
            }
            _ => {}
        }
        i += 1;
    }

    let Some((pos, op)) = split else {
        return QuotaCond::Unparseable;
    };

    let var_name = trimmed[..pos].trim();
    let raw_value = trimmed[pos + op.len()..].trim();

    // Variable name must be a valid identifier ([A-Za-z_][A-Za-z0-9_]*).
    let valid_ident = {
        let mut chars = var_name.chars();
        match chars.next() {
            Some(c) if c.is_ascii_alphabetic() || c == '_' => {
                chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
            }
            _ => false,
        }
    };
    if !valid_ident || raw_value.is_empty() {
        return QuotaCond::Unparseable;
    }

    // Strip surrounding double quotes (client only strips `"`).
    let value = if raw_value.len() >= 2 && raw_value.starts_with('"') && raw_value.ends_with('"') {
        &raw_value[1..raw_value.len() - 1]
    } else {
        raw_value
    };

    QuotaCond::Cmp {
        var_name: var_name.to_string(),
        op: op.to_string(),
        value: value.to_string(),
    }
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct CohortStatsQuery {
    /// Aggregate source: 'variable' (default) or 'response'.
    pub source: Option<String>,
    /// Variable name (source='variable') or question id (source='response').
    pub key: String,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct CohortStatsRow {
    pub(crate) n: i64,
    pub(crate) mean: Option<f64>,
    pub(crate) std_dev: Option<f64>,
    pub(crate) min: Option<f64>,
    pub(crate) max: Option<f64>,
    pub(crate) median: Option<f64>,
    pub(crate) p90: Option<f64>,
    pub(crate) p95: Option<f64>,
    pub(crate) p99: Option<f64>,
}

/// Minimum cohort size before aggregates are published. Below this floor the
/// response carries the count with null stats so a small cohort can't be used
/// to deanonymize an individual participant's value.
pub(crate) const MIN_COHORT_N: i64 = 5;

// ── Server-computed variables (server-computed-variable / E-FEEDBACK-3) ──

/// Query params for `GET /api/questionnaires/{id}/server-variables`. The client
/// never sends filters — only an optional `version` selecting a pinned snapshot.
#[derive(Debug, Deserialize, IntoParams)]
pub struct ServerVariablesQuery {
    /// Optional `major.minor.patch` selecting a pinned questionnaire snapshot.
    /// Absent → the latest published registry definition.
    pub version: Option<String>,
}

/// One computed server-variable aggregate in the `/server-variables` response.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ServerVariableEntry {
    /// Variable id from the definition.
    pub id: String,
    /// Variable name (the mathjs symbol consumers resolve).
    pub name: String,
    /// `variable` or `response` (from the declaration's `server.source`).
    pub source: String,
    /// Session variable name or question id being aggregated.
    pub key: String,
    /// Declared dataset-filter id, when the declaration carries one.
    pub dataset_id: Option<String>,
    /// Stable content hash of the `server` declaration (matches the TS
    /// `declHash`), so the client can cross-check its local declaration and
    /// safely reuse a cached row cross-version when byte-identical.
    pub decl_hash: String,
    /// Cohort size (populated even below the anonymity floor).
    pub sample_count: usize,
    /// Full stats, or `None` when withheld below the MIN_COHORT_N floor.
    pub stats: Option<NumericStatsSummary>,
}

/// Response body for `GET /api/questionnaires/{id}/server-variables`.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ServerVariablesResponse {
    pub questionnaire_id: Uuid,
    /// The `major.minor.patch` the aggregates were computed against.
    pub version: String,
    /// Server clock at aggregation time.
    pub computed_at: chrono::DateTime<chrono::Utc>,
    /// True when a `?version=` snapshot was requested but had been pruned, so the
    /// latest registry declarations were evaluated instead.
    pub fallback_registry: bool,
    pub variables: Vec<ServerVariableEntry>,
}

/// Row returned by `public.fillout_dataset_stats` (full quartiles).
#[derive(Debug, sqlx::FromRow)]
pub(crate) struct DatasetStatsRow {
    pub(crate) n: i64,
    pub(crate) mean: Option<f64>,
    pub(crate) std_dev: Option<f64>,
    pub(crate) min: Option<f64>,
    pub(crate) max: Option<f64>,
    pub(crate) p10: Option<f64>,
    pub(crate) p25: Option<f64>,
    pub(crate) median: Option<f64>,
    pub(crate) p75: Option<f64>,
    pub(crate) p90: Option<f64>,
    pub(crate) p95: Option<f64>,
    pub(crate) p99: Option<f64>,
}

/// Canonical, whitespace-free JSON with recursively sorted object keys. Mirrors
/// the TS `canonicalize` in `@qdesigner/questionnaire-core/serverVariables` so a
/// declaration hashes identically on both sides. Arrays keep their order (order
/// is semantic for `where[]`).
fn canonical_json(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|k| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap_or_default(),
                        canonical_json(&map[k])
                    )
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        serde_json::Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(canonical_json).collect();
            format!("[{}]", parts.join(","))
        }
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

/// cyrb53 over the canonical JSON of a `server` declaration. Byte-for-byte port
/// of the TS `declHash`/`cyrb53` — iterates UTF-16 code units (JS `charCodeAt`),
/// wraps at u32, and emits a zero-padded 14-hex-digit (53-bit) string.
pub(crate) fn decl_hash(def: &serde_json::Value) -> String {
    let s = canonical_json(def);
    let mut h1: u32 = 0xdead_beef;
    let mut h2: u32 = 0x41c6_ce57;
    for ch in s.encode_utf16() {
        let c = ch as u32;
        h1 = (h1 ^ c).wrapping_mul(2_654_435_761);
        h2 = (h2 ^ c).wrapping_mul(1_597_334_677);
    }
    h1 = (h1 ^ (h1 >> 16)).wrapping_mul(2_246_822_507);
    h1 ^= (h2 ^ (h2 >> 13)).wrapping_mul(3_266_489_909);
    h2 = (h2 ^ (h2 >> 16)).wrapping_mul(2_246_822_507);
    h2 ^= (h1 ^ (h1 >> 13)).wrapping_mul(3_266_489_909);
    let n: u64 = 4_294_967_296_u64 * ((h2 & 0x1F_FFFF) as u64) + (h1 as u64);
    format!("{n:014x}")
}

/// Session-creation fields carried by the sync payload so a session that was
/// created while OFFLINE (exists only on the client) can be materialized on the
/// server at sync time. Optional: online sessions already exist and omit this.
#[derive(Debug, Deserialize, ToSchema)]
pub struct SyncSessionInit {
    #[serde(alias = "questionnaireId")]
    pub questionnaire_id: Uuid,
    #[serde(default, alias = "participantId")]
    pub participant_id: Option<String>,
    #[serde(default, alias = "versionMajor")]
    pub version_major: Option<i32>,
    #[serde(default, alias = "versionMinor")]
    pub version_minor: Option<i32>,
    #[serde(default, alias = "versionPatch")]
    pub version_patch: Option<i32>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, alias = "browserInfo")]
    pub browser_info: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SyncPayload {
    pub responses: Vec<SyncResponseItem>,
    pub events: Vec<SyncEventItem>,
    pub variables: Vec<SyncVariableItem>,
    pub status: Option<String>,
    /// Present when the session may not yet exist on the server (offline-created).
    #[serde(default)]
    pub session: Option<SyncSessionInit>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SyncResponseItem {
    #[serde(alias = "clientId")]
    pub client_id: Uuid,
    #[serde(alias = "questionId")]
    pub question_id: String,
    pub value: serde_json::Value,
    #[serde(alias = "reactionTimeUs")]
    pub reaction_time_us: Option<i64>,
    #[serde(alias = "presentedAt")]
    pub presented_at: Option<String>,
    #[serde(alias = "answeredAt")]
    pub answered_at: Option<String>,
    pub metadata: Option<serde_json::Value>,
    /// Per-response timing-provenance blob (contract C-PROVENANCE). Sent
    /// snake_case as `timing_provenance`; `timingProvenance` accepted as an
    /// alias. Optional so older clients that omit it still deserialize.
    #[serde(default, alias = "timingProvenance")]
    pub timing_provenance: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SyncEventItem {
    #[serde(alias = "clientId")]
    pub client_id: Uuid,
    #[serde(alias = "eventType")]
    pub event_type: String,
    #[serde(alias = "questionId")]
    pub question_id: Option<String>,
    #[serde(alias = "timestampUs")]
    pub timestamp_us: i64,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SyncVariableItem {
    #[serde(alias = "variableName")]
    pub variable_name: String,
    #[serde(alias = "variableValue")]
    pub variable_value: Option<serde_json::Value>,
    #[serde(default, alias = "valueType")]
    pub value_type: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SyncResult {
    pub responses_synced: i32,
    pub events_synced: i32,
    pub variables_synced: i32,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct FilterRule {
    pub field: String,
    pub operator: String,
    pub value: serde_json::Value,
    /// Second value for 'between' operator
    pub value2: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct FilterGroup {
    pub logic: String,
    pub rules: Vec<FilterRule>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct FilterRequest {
    pub questionnaire_id: Uuid,
    pub groups: Vec<FilterGroup>,
    pub logic: Option<String>,
    /// Which data source to aggregate: "variable" (default) or "response"
    pub source: Option<String>,
    /// Variable name or question id to aggregate
    pub key: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FilteredSessionRow {
    pub id: Uuid,
    pub participant_id: Option<String>,
    pub status: String,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct FilterResponse {
    pub sessions: Vec<FilteredSessionRow>,
    pub total: i64,
    pub stats: Option<NumericStatsSummary>,
}

/// POST /api/sessions/filter
///
/// Accepts a structured filter query and returns matching sessions
/// with optional aggregated statistics on a key field.
/// Filter keys (metadata.X / variable.X) are interpolated into a SQL string
/// literal. PostgreSQL `''` escape would also work, but a strict identifier
/// allowlist is defense-in-depth: it rules out future regressions if anyone
/// adds a field type that uses the key in a non-literal context.
pub(crate) fn is_safe_filter_key(key: &str) -> bool {
    if key.is_empty() || key.len() > 128 {
        return false;
    }
    let mut chars = key.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[derive(Debug, Deserialize, IntoParams)]
pub struct TimeSeriesQuery {
    pub questionnaire_id: Uuid,
    pub interval: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow, ToSchema)]
pub struct TimeSeriesBucket {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub sessions_started: i64,
    pub sessions_completed: i64,
    pub avg_completion_ms: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::{
        compute_numeric_stats, decl_hash, is_safe_filter_key, json_value_to_f64,
        parse_aggregate_source,
    };
    use serde_json::json;

    #[test]
    fn decl_hash_matches_ts_reference() {
        // Reference values captured from the TS `declHash` in
        // `@qdesigner/questionnaire-core/serverVariables`. Key order is
        // irrelevant (canonicalization sorts), proving cross-side agreement.
        assert_eq!(
            decl_hash(&json!({ "stat": "mean", "key": "k", "source": "variable" })),
            "019cd5bc5cfdb6"
        );
        assert_eq!(
            decl_hash(&json!({
                "source": "response",
                "key": "q1",
                "dataset": {
                    "id": "d1",
                    "versionScope": "sameMajor",
                    "where": [
                        { "var": "sex", "op": "eq", "value": "f" },
                        { "var": "age", "op": "gte", "value": 18 }
                    ]
                }
            })),
            "09dd82d0befea9"
        );
    }

    #[test]
    fn safe_filter_keys_pass() {
        assert!(is_safe_filter_key("score"));
        assert!(is_safe_filter_key("user_id"));
        assert!(is_safe_filter_key("_private"));
        assert!(is_safe_filter_key("a1"));
    }

    #[test]
    fn unsafe_filter_keys_rejected() {
        assert!(!is_safe_filter_key(""));
        assert!(!is_safe_filter_key("1leading_digit"));
        assert!(!is_safe_filter_key("with space"));
        assert!(!is_safe_filter_key("quote'inside"));
        assert!(!is_safe_filter_key("semi;colon"));
        assert!(!is_safe_filter_key("dash-name"));
        assert!(!is_safe_filter_key("dot.name"));
        assert!(!is_safe_filter_key("union/**/select"));
        // 129 chars — over length cap
        assert!(!is_safe_filter_key(&"a".repeat(129)));
    }

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
