//! The shared native variable projection for HTTP saves and Definition changes.
use crate::error::ApiError;
use serde_json::Value;
use uuid::Uuid;

fn extract_questionnaire_variable_definitions(content: &Value) -> Vec<(String, Value)> {
    let Some(variables) = content.get("variables") else {
        return Vec::new();
    };

    match variables {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                let Value::Object(object) = item else {
                    return None;
                };

                let name = object
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| object.get("id").and_then(Value::as_str))
                    .map(str::trim)
                    .filter(|name| !name.is_empty())?;

                Some((name.to_string(), item.clone()))
            })
            .collect(),
        Value::Object(entries) => entries
            .iter()
            .map(|(fallback_name, definition)| {
                let mut normalized = definition.clone();
                let name = definition
                    .get("name")
                    .and_then(Value::as_str)
                    .or_else(|| definition.get("id").and_then(Value::as_str))
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .unwrap_or(fallback_name);

                if let Value::Object(object) = &mut normalized {
                    object
                        .entry("name".to_string())
                        .or_insert_with(|| Value::String(name.to_string()));
                }

                (name.to_string(), normalized)
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn normalize_variable_declared_type(definition: &Value) -> String {
    definition
        .get("type")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("json")
        .to_ascii_lowercase()
}

fn normalize_variable_source_kind(definition: &Value) -> &'static str {
    if definition.get("formula").is_some() {
        "script"
    } else {
        definition
            .get("source")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| match value.to_ascii_lowercase().as_str() {
                "script" | "computed" => "script",
                "response" => "response",
                "manual" | "declared" => "declared",
                _ => "declared",
            })
            .unwrap_or("declared")
    }
}

fn normalize_variable_storage(declared_type: &str) -> (&'static str, &'static str) {
    match declared_type {
        "number" | "integer" | "float" | "double" | "reaction_time" | "stimulus_onset" => {
            ("scalar", "numeric")
        }
        "string" | "text" => ("scalar", "text"),
        "boolean" | "bool" => ("scalar", "boolean"),
        "date" | "time" | "datetime" | "timestamp" => ("scalar", "timestamp"),
        _ => ("raw", "none"),
    }
}

/// Reconcile the questionnaire_variable_definitions rows for one (q, version)
/// pair: delete-then-insert. Takes the caller's per-request connection so the
/// DELETE/INSERT pair commits together with whatever else the handler does;
/// before P5 this helper opened its own sub-transaction off `state.pool`,
/// which was unnecessary once handlers themselves run inside a tx.
pub(crate) async fn reconcile_variable_projection(
    conn: &mut sqlx::PgConnection,
    questionnaire_id: Uuid,
    version: [i32; 3],
    content: &Value,
) -> Result<(), ApiError> {
    let definitions = extract_questionnaire_variable_definitions(content);

    sqlx::query(
        r#"
        DELETE FROM questionnaire_variable_definitions
        WHERE questionnaire_id = $1
          AND version_major = $2
          AND version_minor = $3
          AND version_patch = $4
        "#,
    )
    .bind(questionnaire_id)
    .bind(version[0])
    .bind(version[1])
    .bind(version[2])
    .execute(&mut *conn)
    .await?;

    for (name, definition) in definitions {
        let declared_type = normalize_variable_declared_type(&definition);
        let source_kind = normalize_variable_source_kind(&definition);
        let (storage_class, index_strategy) = normalize_variable_storage(&declared_type);

        sqlx::query(
            r#"
            INSERT INTO questionnaire_variable_definitions (
                questionnaire_id,
                version_major,
                version_minor,
                version_patch,
                variable_name,
                declared_type,
                source_kind,
                storage_class,
                index_strategy,
                definition
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#,
        )
        .bind(questionnaire_id)
        .bind(version[0])
        .bind(version[1])
        .bind(version[2])
        .bind(name)
        .bind(declared_type)
        .bind(source_kind)
        .bind(storage_class)
        .bind(index_strategy)
        .bind(definition)
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}
