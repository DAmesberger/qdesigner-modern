use super::models::*;
use axum::Json;
use uuid::Uuid;

use crate::api::access;
use crate::auth::models::AuthenticatedUser;
use crate::error::ApiError;
use crate::middleware::tx::Tx;

/// A single filter comparison value, typed to the column it targets so the
/// generated SQL binds the right Postgres type instead of always sending
/// text. Sending everything as text made a `reaction_time_us > 'abc'`
/// comparison fail deep in Postgres as a 500; parsing here turns a bad value
/// into a 422 (`ApiError::Validation`) before the query ever runs.
#[derive(Debug)]
enum FilterParam {
    Text(String),
    BigInt(i64),
    Timestamp(chrono::DateTime<chrono::Utc>),
}

/// The Postgres type a filter field compares against, chosen from the field
/// allowlist. Drives how the incoming JSON value is parsed and bound.
#[derive(Clone, Copy)]
enum FilterFieldType {
    Text,
    BigInt,
    Timestamp,
}

/// Parse one raw comparison value into a typed [`FilterParam`], returning a
/// 422 `Validation` error (not a 500) when the value does not fit the field's
/// type — e.g. a non-numeric `reaction_time_us` or a non-RFC3339 timestamp.
fn parse_filter_param(
    kind: FilterFieldType,
    raw: &str,
    field: &str,
) -> Result<FilterParam, ApiError> {
    match kind {
        FilterFieldType::Text => Ok(FilterParam::Text(raw.to_string())),
        FilterFieldType::BigInt => raw.trim().parse::<i64>().map(FilterParam::BigInt).map_err(|_| {
            ApiError::Validation(format!(
                "Field '{field}' expects an integer value, got '{raw}'"
            ))
        }),
        FilterFieldType::Timestamp => chrono::DateTime::parse_from_rfc3339(raw.trim())
            .map(|dt| FilterParam::Timestamp(dt.with_timezone(&chrono::Utc)))
            .map_err(|_| {
                ApiError::Validation(format!(
                    "Field '{field}' expects an RFC3339 timestamp, got '{raw}'"
                ))
            }),
    }
}

#[utoipa::path(
    post,
    path = "/api/sessions/filter",
    request_body = FilterRequest,
    security(
        ("bearerAuth" = [])
    ),
    responses(
        (status = 200, description = "Filtered sessions", body = FilterResponse),
        (status = 400, description = "Invalid filter request", body = crate::openapi::ErrorEnvelope),
        (status = 403, description = "Access denied", body = crate::openapi::ErrorEnvelope)
    ),
    tags = ["analytics"]
)]
pub async fn filter_sessions(
    user: AuthenticatedUser,
    tx: Tx,
    Json(body): Json<FilterRequest>,
) -> Result<Json<FilterResponse>, ApiError> {
    let mut tx = tx.tx().await?;
    access::verify_questionnaire_access(&mut **tx, user.user_id, body.questionnaire_id).await?;

    let top_logic = body.logic.as_deref().unwrap_or("AND");
    if top_logic != "AND" && top_logic != "OR" {
        return Err(ApiError::BadRequest(format!(
            "Invalid top-level logic '{top_logic}'. Expected 'AND' or 'OR'"
        )));
    }

    // Build dynamic WHERE clauses from the filter groups
    let mut params: Vec<FilterParam> = Vec::new(); // collect typed params for bind
    let mut param_idx = 2u32; // $1 is questionnaire_id
    let mut group_clauses: Vec<String> = Vec::new();

    for group in &body.groups {
        let group_logic = match group.logic.as_str() {
            "AND" | "OR" => group.logic.as_str(),
            other => {
                return Err(ApiError::BadRequest(format!(
                    "Invalid group logic '{other}'. Expected 'AND' or 'OR'"
                )));
            }
        };

        let mut rule_clauses: Vec<String> = Vec::new();

        for rule in &group.rules {
            let (field_expr, field_type) = match rule.field.as_str() {
                "status" => ("s.status".to_string(), FilterFieldType::Text),
                "participant_id" => ("s.participant_id".to_string(), FilterFieldType::Text),
                "started_at" => ("s.started_at".to_string(), FilterFieldType::Timestamp),
                "completed_at" => ("s.completed_at".to_string(), FilterFieldType::Timestamp),
                "reaction_time_us" => ("r.reaction_time_us".to_string(), FilterFieldType::BigInt),
                // Support metadata JSON field access with metadata.xxx
                f if f.starts_with("metadata.") => {
                    let json_key = &f["metadata.".len()..];
                    if !is_safe_filter_key(json_key) {
                        return Err(ApiError::BadRequest(format!(
                            "Invalid metadata key '{json_key}'. Expected [A-Za-z_][A-Za-z0-9_]*."
                        )));
                    }
                    (format!("s.metadata->>'{json_key}'"), FilterFieldType::Text)
                }
                // Support variable names with variable.xxx
                f if f.starts_with("variable.") => {
                    let var_name = &f["variable.".len()..];
                    if !is_safe_filter_key(var_name) {
                        return Err(ApiError::BadRequest(format!(
                            "Invalid variable name '{var_name}'. Expected [A-Za-z_][A-Za-z0-9_]*."
                        )));
                    }
                    (
                        format!(
                            "(SELECT sv.variable_value::text FROM session_variables sv WHERE sv.session_id = s.id AND sv.variable_name = '{var_name}')"
                        ),
                        FilterFieldType::Text,
                    )
                }
                other => {
                    return Err(ApiError::BadRequest(format!(
                        "Unsupported filter field: '{other}'. Supported: status, participant_id, started_at, completed_at, reaction_time_us, metadata.*, variable.*"
                    )));
                }
            };

            let value_str = match &rule.value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                other => other.to_string(),
            };

            // Operators that take a single value on the right-hand side share
            // one param-push path; only their SQL token differs. `between` and
            // `in` take multiple values and stay separate.
            let clause = match rule.operator.as_str() {
                "between" => {
                    let value2_str = match &rule.value2 {
                        Some(serde_json::Value::String(s)) => s.clone(),
                        Some(serde_json::Value::Number(n)) => n.to_string(),
                        Some(other) => other.to_string(),
                        None => {
                            return Err(ApiError::BadRequest(
                                "'between' operator requires value2".into(),
                            ));
                        }
                    };
                    params.push(parse_filter_param(field_type, &value_str, &rule.field)?);
                    params.push(parse_filter_param(field_type, &value2_str, &rule.field)?);
                    let c = format!("{field_expr} BETWEEN ${} AND ${}", param_idx, param_idx + 1);
                    param_idx += 2;
                    c
                }
                "in" => {
                    // Expect comma-separated values in the value string
                    let in_values: Vec<&str> = value_str
                        .split(',')
                        .map(|v| v.trim())
                        .filter(|v| !v.is_empty())
                        .collect();
                    if in_values.is_empty() {
                        return Err(ApiError::BadRequest(
                            "'in' operator requires at least one value".into(),
                        ));
                    }
                    let mut placeholders: Vec<String> = Vec::with_capacity(in_values.len());
                    for v in in_values {
                        params.push(parse_filter_param(field_type, v, &rule.field)?);
                        placeholders.push(format!("${param_idx}"));
                        param_idx += 1;
                    }
                    format!("{field_expr} IN ({})", placeholders.join(", "))
                }
                op => {
                    let token = match op {
                        "eq" => "=",
                        "neq" => "!=",
                        "gt" => ">",
                        "lt" => "<",
                        "gte" => ">=",
                        "lte" => "<=",
                        other => {
                            return Err(ApiError::BadRequest(format!(
                                "Unsupported operator: '{other}'"
                            )));
                        }
                    };
                    params.push(parse_filter_param(field_type, &value_str, &rule.field)?);
                    let c = format!("{field_expr} {token} ${param_idx}");
                    param_idx += 1;
                    c
                }
            };

            rule_clauses.push(clause);
        }

        if !rule_clauses.is_empty() {
            group_clauses.push(format!(
                "({})",
                rule_clauses.join(&format!(" {group_logic} "))
            ));
        }
    }

    let filter_where = if group_clauses.is_empty() {
        String::new()
    } else {
        format!(" AND ({})", group_clauses.join(&format!(" {top_logic} ")))
    };

    // Need LEFT JOIN on responses if reaction_time_us field is used
    let needs_response_join = body
        .groups
        .iter()
        .any(|g| g.rules.iter().any(|r| r.field == "reaction_time_us"));

    let response_join = if needs_response_join {
        "LEFT JOIN responses r ON r.session_id = s.id"
    } else {
        ""
    };

    let limit = body.limit.unwrap_or(100).clamp(1, 1000);
    let offset = body.offset.unwrap_or(0).max(0);

    // Count total matching sessions
    let count_sql = format!(
        "SELECT COUNT(DISTINCT s.id)::bigint FROM sessions s {response_join} WHERE s.questionnaire_id = $1{filter_where}"
    );

    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(body.questionnaire_id);
    for p in &params {
        count_query = match p {
            FilterParam::Text(s) => count_query.bind(s),
            FilterParam::BigInt(n) => count_query.bind(n),
            FilterParam::Timestamp(t) => count_query.bind(t),
        };
    }
    let total = count_query.fetch_one(&mut **tx).await?;

    // Fetch matching sessions
    let select_sql = format!(
        r#"
        SELECT DISTINCT ON (s.id) s.id, s.participant_id, s.status, s.started_at, s.completed_at, s.metadata
        FROM sessions s {response_join}
        WHERE s.questionnaire_id = $1{filter_where}
        ORDER BY s.id, s.created_at DESC
        LIMIT {limit} OFFSET {offset}
        "#
    );

    let mut select_query = sqlx::query_as::<
        _,
        (
            Uuid,
            Option<String>,
            String,
            Option<chrono::DateTime<chrono::Utc>>,
            Option<chrono::DateTime<chrono::Utc>>,
            serde_json::Value,
        ),
    >(&select_sql)
    .bind(body.questionnaire_id);
    for p in &params {
        select_query = match p {
            FilterParam::Text(s) => select_query.bind(s),
            FilterParam::BigInt(n) => select_query.bind(n),
            FilterParam::Timestamp(t) => select_query.bind(t),
        };
    }
    let rows = select_query.fetch_all(&mut **tx).await?;

    let sessions: Vec<FilteredSessionRow> = rows
        .into_iter()
        .map(
            |(id, participant_id, status, started_at, completed_at, metadata)| FilteredSessionRow {
                id,
                participant_id,
                status,
                started_at,
                completed_at,
                metadata,
            },
        )
        .collect();

    // Optionally compute aggregate stats on a key
    let stats = if let Some(ref key) = body.key {
        if !key.is_empty() {
            let source = parse_aggregate_source(body.source.as_deref())?;
            let session_ids: Vec<Uuid> = sessions.iter().map(|s| s.id).collect();

            if !session_ids.is_empty() {
                let values = match source {
                    AggregateSource::Variable => {
                        sqlx::query_scalar::<_, serde_json::Value>(
                            r#"
                            SELECT sv.variable_value
                            FROM session_variables sv
                            WHERE sv.session_id = ANY($1) AND sv.variable_name = $2
                            "#,
                        )
                        .bind(&session_ids)
                        .bind(key)
                        .fetch_all(&mut **tx)
                        .await?
                    }
                    AggregateSource::Response => {
                        sqlx::query_scalar::<_, serde_json::Value>(
                            r#"
                            SELECT r.value
                            FROM responses r
                            WHERE r.session_id = ANY($1) AND r.question_id = $2
                            "#,
                        )
                        .bind(&session_ids)
                        .bind(key)
                        .fetch_all(&mut **tx)
                        .await?
                    }
                };

                let numeric: Vec<f64> = values.iter().filter_map(json_value_to_f64).collect();

                if numeric.is_empty() {
                    None
                } else {
                    Some(compute_numeric_stats(&numeric))
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(Json(FilterResponse {
        sessions,
        total,
        stats,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    // A non-numeric value on a BigInt field (e.g. `reaction_time_us`) must be
    // rejected as a 422 Validation error *before* the query runs, rather than
    // being bound as text and surfacing as a Postgres 500 (F084).
    #[test]
    fn non_numeric_reaction_time_is_422() {
        let err = parse_filter_param(FilterFieldType::BigInt, "not-a-number", "reaction_time_us")
            .expect_err("non-numeric reaction_time_us must be rejected");
        assert!(matches!(err, ApiError::Validation(_)));
        assert_eq!(
            err.into_response().status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[test]
    fn numeric_reaction_time_parses_to_bigint() {
        let param = parse_filter_param(FilterFieldType::BigInt, " 1500 ", "reaction_time_us")
            .expect("numeric reaction_time_us must parse");
        assert!(matches!(param, FilterParam::BigInt(1500)));
    }

    #[test]
    fn bad_timestamp_is_422() {
        let err = parse_filter_param(FilterFieldType::Timestamp, "yesterday", "started_at")
            .expect_err("non-RFC3339 timestamp must be rejected");
        assert!(matches!(err, ApiError::Validation(_)));
        assert_eq!(
            err.into_response().status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[test]
    fn rfc3339_timestamp_parses() {
        let param = parse_filter_param(
            FilterFieldType::Timestamp,
            "2024-01-02T03:04:05Z",
            "started_at",
        )
        .expect("RFC3339 timestamp must parse");
        assert!(matches!(param, FilterParam::Timestamp(_)));
    }

    #[test]
    fn text_field_passes_through() {
        let param = parse_filter_param(FilterFieldType::Text, "completed", "status")
            .expect("text always parses");
        assert!(matches!(param, FilterParam::Text(s) if s == "completed"));
    }
}

// ── Time-Series ─────────────────────────────────────────────────
