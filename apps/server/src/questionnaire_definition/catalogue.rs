//! Declarative module metadata and Config validity shared with the designer.
use std::{collections::BTreeMap, sync::LazyLock};

use serde::Deserialize;
use serde_json::Value;

use super::{error, pointer_segment, DefinitionDiagnostic};

struct ModuleValidator {
    schema: jsonschema::Validator,
    effective_config_schema: Option<jsonschema::Validator>,
    rules: ModuleRules,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ModuleRules {
    ordered_bounds: Vec<OrderedBounds>,
    unique_item_keys: Vec<UniqueItemKeys>,
    date_values: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderedBounds {
    lower: Vec<String>,
    upper: Vec<String>,
    lower_default: Option<f64>,
    upper_default: Option<f64>,
    #[serde(default)]
    date: bool,
}

#[derive(Deserialize)]
struct UniqueItemKeys {
    path: String,
    key: String,
}

static VALIDATORS: LazyLock<BTreeMap<String, ModuleValidator>> = LazyLock::new(|| {
    let catalogue: Value = serde_json::from_str(include_str!(
        "../../../../packages/questionnaire-core/src/module-catalogue.json"
    ))
    .expect("Bundled module catalogue must be valid JSON");
    catalogue["modules"]
        .as_object()
        .expect("Bundled catalogue has a module registry")
        .iter()
        .map(|(kind, metadata)| {
            let mut schema = metadata["questionSchema"].clone();
            schema["$defs"] = catalogue["$defs"].clone();
            let validator = jsonschema::validator_for(&schema)
                .expect("Bundled module Config schema must compile");
            let rules = serde_json::from_value(metadata.clone())
                .expect("Bundled module semantic rules must be valid");
            (
                kind.clone(),
                ModuleValidator {
                    schema: validator,
                    effective_config_schema: metadata.get("effectiveConfigSchema").map(|schema| {
                        jsonschema::validator_for(schema)
                            .expect("Bundled effective Config schema must compile")
                    }),
                    rules,
                },
            )
        })
        .collect()
});

pub(super) fn validate(kind: &str, id: &str, question: &Value) -> Vec<DefinitionDiagnostic> {
    let path = format!("/questions/{}", pointer_segment(id));
    let Some(validator) = VALIDATORS.get(kind) else {
        return vec![error(
            "QDEF_QUESTION_TYPE_UNSUPPORTED",
            format!("{path}/type"),
            format!("Question type '{kind}' has no portable module definition."),
            Some("Use a module supported by this installation's shared catalogue."),
        )];
    };
    let mut diagnostics: Vec<_> = validator
        .schema
        .iter_errors(question)
        .map(|failure| {
            error(
                "QDEF_CONFIG_INVALID",
                format!("{path}{}", failure.instance_path()),
                failure.to_string(),
                Some("Repair this field according to the module's Config schema."),
            )
        })
        .collect();
    if let Some(schema) = &validator.effective_config_schema {
        // The hybrid runtime starts with display and lets explicit config win.
        // Analytics retains a root dataSource fallback when neither contains one.
        let mut effective = question
            .get("display")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(config) = question.get("config").and_then(Value::as_object) {
            effective.extend(config.clone());
        }
        if !effective.contains_key("dataSource") {
            if let Some(source) = question.get("dataSource") {
                effective.insert("dataSource".into(), source.clone());
            }
        }
        let effective = Value::Object(effective);
        for failure in schema.iter_errors(&effective) {
            let field_path = failure.instance_path().to_string();
            let first_field = field_path.split('/').nth(1).unwrap_or("");
            let owner = if question
                .get("config")
                .and_then(|v| v.get(first_field))
                .is_some()
            {
                "/config"
            } else if question
                .get("display")
                .and_then(|v| v.get(first_field))
                .is_some()
            {
                "/display"
            } else if first_field == "dataSource" && question.get("dataSource").is_some() {
                ""
            } else if question.get("config").is_some() {
                "/config"
            } else {
                "/display"
            };
            diagnostics.push(error(
                "QDEF_CONFIG_INVALID",
                format!("{path}{owner}{field_path}"),
                failure.to_string(),
                Some("Complete the module configuration required by the selected mode."),
            ));
        }
    }
    for bounds in &validator.rules.ordered_bounds {
        if let (Some((lower_path, lower)), Some((upper_path, upper))) = (
            first_bound(question, &bounds.lower, bounds.date)
                .or(bounds.lower_default.map(|value| ("", value))),
            first_bound(question, &bounds.upper, bounds.date)
                .or(bounds.upper_default.map(|value| ("", value))),
        ) {
            if lower > upper {
                let mut diagnostic = error(
                    "QDEF_CONFIG_INVALID",
                    format!(
                        "{path}{}",
                        if upper_path.is_empty() {
                            lower_path
                        } else {
                            upper_path
                        }
                    ),
                    format!("The upper bound {upper} is below the lower bound {lower}."),
                    Some("Choose an upper bound greater than or equal to the lower bound."),
                );
                if !lower_path.is_empty() && !upper_path.is_empty() {
                    diagnostic.related_paths.push(format!("{path}{lower_path}"));
                }
                diagnostics.push(diagnostic);
            }
        }
    }
    for field in &validator.rules.date_values {
        let values: Vec<(String, &Value)> = if let Some(collection) = field.strip_suffix("/*") {
            question
                .pointer(collection)
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .enumerate()
                .map(|(index, value)| (format!("{collection}/{index}"), value))
                .collect()
        } else {
            question
                .pointer(field)
                .into_iter()
                .map(|value| (field.clone(), value))
                .collect()
        };
        for (field, value) in values {
            if value
                .as_str()
                .is_some_and(|value| parse_date(value).is_none())
            {
                diagnostics.push(error(
                    "QDEF_CONFIG_INVALID",
                    format!("{path}{field}"),
                    "This value is not a valid ISO date or date-time.",
                    Some("Use a real calendar date (YYYY-MM-DD) or an ISO date-time."),
                ));
            }
        }
    }
    for rule in &validator.rules.unique_item_keys {
        let Some(items) = question.pointer(&rule.path).and_then(Value::as_array) else {
            continue;
        };
        let mut seen = BTreeMap::new();
        for (index, item) in items.iter().enumerate() {
            let Some(key) = item.get(&rule.key).and_then(Value::as_str) else {
                continue;
            };
            if let Some(first) = seen.insert(key, index) {
                let field = pointer_segment(&rule.key);
                let mut diagnostic = error(
                    "QDEF_CONFIG_INVALID",
                    format!(
                        "{path}/{}/{index}/{field}",
                        rule.path.trim_start_matches('/')
                    ),
                    format!("The identifier '{key}' occurs more than once in this collection."),
                    Some("Give each item a unique stable identifier."),
                );
                diagnostic.related_paths.push(format!(
                    "{path}/{}/{first}/{field}",
                    rule.path.trim_start_matches('/')
                ));
                diagnostics.push(diagnostic);
            }
        }
    }
    diagnostics
}

fn first_bound<'a>(question: &Value, paths: &'a [String], date: bool) -> Option<(&'a str, f64)> {
    paths.iter().find_map(|path| {
        question
            .pointer(path)
            .and_then(|value| {
                if date {
                    value.as_str().and_then(parse_date)
                } else {
                    value.as_f64()
                }
            })
            .map(|value| (path.as_str(), value))
    })
}

fn parse_date(value: &str) -> Option<f64> {
    use chrono::{DateTime, NaiveDate, NaiveDateTime};
    if let Ok(date) = DateTime::parse_from_rfc3339(value) {
        return Some(date.timestamp_millis() as f64);
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"] {
        if let Ok(date) = NaiveDateTime::parse_from_str(value, format) {
            return Some(date.and_utc().timestamp_millis() as f64);
        }
    }
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .ok()
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .map(|date| date.and_utc().timestamp_millis() as f64)
}
