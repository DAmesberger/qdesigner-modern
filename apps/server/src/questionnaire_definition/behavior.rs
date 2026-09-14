//! Portable behavioral declarations and their stable references.
use std::sync::LazyLock;

use serde_json::Value;

use super::{error, DefinitionDiagnostic};

static SCHEMA: LazyLock<jsonschema::Validator> = LazyLock::new(|| {
    let schema: Value = serde_json::from_str(include_str!(
        "../../../../packages/questionnaire-core/src/behavior-schema.json"
    ))
    .expect("Bundled behavioral schema must be valid JSON");
    jsonschema::validator_for(&schema).expect("Bundled behavioral schema must compile")
});

pub(super) fn validate(value: &Value) -> Vec<DefinitionDiagnostic> {
    let mut diagnostics: Vec<_> = SCHEMA
        .iter_errors(value)
        .map(|failure| {
            error(
                "QDEF_BEHAVIOR_INVALID",
                failure.instance_path().to_string(),
                failure.to_string(),
                Some("Repair this declaration according to the portable behavioral schema."),
            )
        })
        .collect();
    if diagnostics.is_empty() {
        super::behavior_references::validate(value, &mut diagnostics);
    }
    diagnostics
}

pub(super) fn select_fields(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
) -> std::collections::BTreeMap<String, Value> {
    fields
        .iter()
        .filter_map(|key| {
            object
                .get(*key)
                .map(|value| ((*key).to_owned(), value.clone()))
        })
        .collect()
}

pub(super) fn stored_variables(
    value: Option<&Value>,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> std::collections::BTreeMap<String, Value> {
    let mut result = std::collections::BTreeMap::new();
    match value {
        None => {}
        Some(Value::Array(items)) => {
            for (index, item) in items.iter().enumerate() {
                let Some(mut object) = item.as_object().cloned() else {
                    diagnostics.push(error(
                        "QDEF_BEHAVIOR_INVALID",
                        format!("/content/variables/{index}"),
                        "Variable declaration must be an object.",
                        None,
                    ));
                    continue;
                };
                let Some(Value::String(id)) = object.remove("id") else {
                    diagnostics.push(error(
                        "QDEF_ID_EMPTY",
                        format!("/content/variables/{index}/id"),
                        "Variable declaration requires a stable id.",
                        None,
                    ));
                    continue;
                };
                object
                    .entry("name".to_owned())
                    .or_insert_with(|| Value::String(id.clone()));
                if result.insert(id.clone(), Value::Object(object)).is_some() {
                    diagnostics.push(error(
                        "QDEF_DUPLICATE_ID",
                        format!("/content/variables/{index}/id"),
                        format!("Variable id '{id}' is duplicated."),
                        None,
                    ));
                }
            }
        }
        Some(_) => diagnostics.push(error(
            "QDEF_BEHAVIOR_INVALID",
            "/content/variables",
            "Native variable declarations must be an array.",
            None,
        )),
    }
    result
}

pub(super) fn stored_flow(
    value: Option<&Value>,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> Vec<Value> {
    match value {
        None => Vec::new(),
        Some(Value::Array(items)) => items.clone(),
        Some(_) => {
            diagnostics.push(error(
                "QDEF_BEHAVIOR_INVALID",
                "/content/flow",
                "Flow declarations must be an array.",
                None,
            ));
            Vec::new()
        }
    }
}

pub(super) fn stored_extensions(
    value: Option<&Value>,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> std::collections::BTreeMap<String, Value> {
    match value {
        None => Default::default(),
        Some(Value::Object(object)) => object.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        Some(_) => {
            diagnostics.push(error(
                "QDEF_BEHAVIOR_INVALID",
                "/content/extensions",
                "Extensions must be a namespaced registry.",
                None,
            ));
            Default::default()
        }
    }
}

pub(super) fn stored_translations(
    settings: &mut Value,
    content: &serde_json::Map<String, Value>,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> std::collections::BTreeMap<String, Value> {
    // The designer's live settings copy has the same precedence as getTranslations().
    let value = settings
        .as_object_mut()
        .and_then(|object| object.remove("translations"));
    match value.as_ref().or_else(|| content.get("translations")) {
        None => Default::default(),
        Some(Value::Object(object)) => object.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        Some(_) => {
            diagnostics.push(error(
                "QDEF_BEHAVIOR_INVALID",
                "/translations",
                "Translations must be a locale registry.",
                None,
            ));
            Default::default()
        }
    }
}

pub(super) fn remove_installation_state(settings: &mut Value) {
    if let Some(object) = settings.as_object_mut() {
        object.remove("versionHistory");
        if let Some(distribution) = object
            .get_mut("distribution")
            .and_then(Value::as_object_mut)
        {
            distribution.remove("passwordProtection");
        }
        if let Some(groups) = object.get_mut("quotas").and_then(Value::as_array_mut) {
            for group in groups {
                for field in ["quotas", "cells"] {
                    if let Some(entries) = group.get_mut(field).and_then(Value::as_array_mut) {
                        for entry in entries {
                            if let Some(entry) = entry.as_object_mut() {
                                entry.remove("current");
                            }
                        }
                    }
                }
            }
        }
    }
}

/// The variable registry key is also its default runtime name. This is the
/// only inserted variable default; authored names and values remain unchanged.
pub(super) fn normalize(value: &mut Value) {
    if let Some(variables) = value.get_mut("variables").and_then(Value::as_object_mut) {
        for (id, declaration) in variables {
            if let Some(object) = declaration.as_object_mut() {
                object
                    .entry("name".to_owned())
                    .or_insert_with(|| Value::String(id.clone()));
            }
        }
    }
}

pub(super) fn execution_diagnostics(content: &Value) -> Vec<DefinitionDiagnostic> {
    let Some(extensions) = content.get("extensions") else {
        return Vec::new();
    };
    let mut diagnostics = Vec::new();
    if let Some(registry) = extensions.as_object() {
        for (name, extension) in registry {
            if extension.get("required").and_then(Value::as_bool) == Some(true) {
                diagnostics.push(error("QDEF_REQUIRED_EXTENSION", format!("/extensions/{}/required",super::pointer_segment(name)), format!("Required extension '{name}' has no installed execution support."), Some("Install support for this extension before executing or publishing the questionnaire.")));
            }
        }
    }
    if diagnostics.is_empty() {
        let value = serde_json::json!({"extensions":extensions});
        diagnostics.extend(SCHEMA.iter_errors(&value).map(|failure| {
            error(
                "QDEF_EXTENSION_INVALID",
                failure.instance_path().to_string(),
                failure.to_string(),
                None,
            )
        }));
    }
    diagnostics
}
