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
    ordered_value_pairs: Vec<OrderedValuePair>,
    item_references: Vec<ItemReferences>,
    effective_reaction_response: bool,
}

#[derive(Deserialize)]
struct OrderedValuePair {
    path: String,
    lower: String,
    upper: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItemReferences {
    path: String,
    field: String,
    collection: String,
    key: String,
    #[serde(default)]
    fallback_collections: Vec<String>,
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
        for (collection_path, collection) in matching_values(question, &rule.path) {
            let Some(items) = collection.as_array() else {
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
                            collection_path.trim_start_matches('/')
                        ),
                        format!("The identifier '{key}' occurs more than once in this collection."),
                        Some("Give each item a unique stable identifier."),
                    );
                    diagnostic.related_paths.push(format!(
                        "{path}/{}/{first}/{field}",
                        collection_path.trim_start_matches('/')
                    ));
                    diagnostics.push(diagnostic);
                }
            }
        }
    }
    for rule in &validator.rules.ordered_value_pairs {
        for (owner_path, owner) in matching_values(question, &rule.path) {
            let (Some(lower), Some(upper)) = (
                owner.get(&rule.lower).and_then(Value::as_f64),
                owner.get(&rule.upper).and_then(Value::as_f64),
            ) else {
                continue;
            };
            if lower > upper {
                let mut diagnostic = error(
                    "QDEF_CONFIG_INVALID",
                    format!("{path}{owner_path}/{}", pointer_segment(&rule.upper)),
                    "The upper bound is below the lower bound.",
                    Some("Choose an upper bound greater than or equal to the lower bound."),
                );
                diagnostic.related_paths.push(format!(
                    "{path}{owner_path}/{}",
                    pointer_segment(&rule.lower)
                ));
                diagnostics.push(diagnostic);
            }
        }
    }
    for rule in &validator.rules.item_references {
        for (owner_path, owner) in matching_values(question, &rule.path) {
            let Some(references) = owner.get(&rule.field).and_then(Value::as_array) else {
                continue;
            };
            let primary_path = format!("{owner_path}/{}", rule.collection);
            let collection = question
                .pointer(&primary_path)
                .map(|value| (primary_path.clone(), value))
                .or_else(|| {
                    rule.fallback_collections.iter().find_map(|candidate| {
                        question
                            .pointer(candidate)
                            .map(|value| (candidate.clone(), value))
                    })
                });
            for (index, reference) in references.iter().enumerate() {
                let Some(reference) = reference.as_str() else {
                    continue;
                };
                let exists = collection
                    .as_ref()
                    .and_then(|(_, value)| value.as_array())
                    .is_some_and(|items| {
                        items.iter().any(|item| {
                            item.get(&rule.key).and_then(Value::as_str) == Some(reference)
                        })
                    });
                if !exists {
                    let mut diagnostic = error("QDEF_CONFIG_INVALID", format!("{path}{owner_path}/{}/{index}", pointer_segment(&rule.field)), format!("The identifier '{reference}' does not name an item in the configured collection."), Some("Select an existing item identifier."));
                    diagnostic.related_paths.push(format!(
                        "{path}{}",
                        collection
                            .as_ref()
                            .map_or(primary_path.as_str(), |(path, _)| path.as_str())
                    ));
                    diagnostics.push(diagnostic);
                }
            }
        }
    }
    if validator.rules.effective_reaction_response {
        validate_effective_reaction_response(question, &path, &mut diagnostics);
    }
    diagnostics
}

/// Mirror the reaction normalizer's source selection without rewriting authored
/// values. Correctness and response options can originate in different objects.
fn validate_effective_reaction_response(
    question: &Value,
    path: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) {
    let root = if question.get("config").is_some_and(Value::is_object) {
        "/config"
    } else {
        "/display"
    };
    let mut sources = vec![
        format!("{root}/response"),
        "/responseType".into(),
        "/response".into(),
    ];
    if question.pointer(&format!("{root}/task")).is_none() {
        sources.push(format!("{root}/study/response"));
    }
    let field = |name: &str| {
        sources.iter().find_map(|source| {
            let field_path = format!("{source}/{name}");
            question
                .pointer(&field_path)
                .map(|value| (field_path, value))
        })
    };
    let Some((correct_path, correct_ids)) = field("correctOptionIds") else {
        return;
    };
    let Some(correct_ids) = correct_ids.as_array() else {
        return;
    };
    let response_set = field("responseSet");
    for (index, id) in correct_ids.iter().enumerate() {
        let Some(id) = id.as_str() else {
            continue;
        };
        let exists = response_set
            .as_ref()
            .and_then(|(_, set)| set.get("options"))
            .and_then(Value::as_array)
            .is_some_and(|options| {
                options
                    .iter()
                    .any(|option| option.get("id").and_then(Value::as_str) == Some(id))
            });
        if !exists {
            let mut diagnostic = error(
                "QDEF_CONFIG_INVALID",
                format!("{path}{correct_path}/{index}"),
                format!(
                    "The identifier '{id}' does not name an option in the effective ResponseSet."
                ),
                Some("Select an option from the ResponseSet used by this question."),
            );
            if let Some((set_path, _)) = &response_set {
                diagnostic
                    .related_paths
                    .push(format!("{path}{set_path}/options"));
            }
            diagnostics.push(diagnostic);
        }
    }
}

/// Resolve declared JSON-pointer paths. A wildcard visits array members only;
/// arbitrary Config objects are never recursively interpreted as rule owners.
fn matching_values<'a>(root: &'a Value, pattern: &str) -> Vec<(String, &'a Value)> {
    let mut matches = vec![(String::new(), root)];
    for segment in pattern.trim_start_matches('/').split('/') {
        matches = matches
            .into_iter()
            .flat_map(|(path, value)| {
                if segment == "*" {
                    value
                        .as_array()
                        .into_iter()
                        .flatten()
                        .enumerate()
                        .map(|(index, value)| (format!("{path}/{index}"), value))
                        .collect::<Vec<_>>()
                } else {
                    value
                        .pointer(&format!("/{segment}"))
                        .map(|value| (format!("{path}/{segment}"), value))
                        .into_iter()
                        .collect()
                }
            })
            .collect();
    }
    matches
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
