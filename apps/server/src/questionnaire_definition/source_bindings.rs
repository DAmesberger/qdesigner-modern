//! Portable names for installation-specific feedback sources. Local target IDs
//! remain native configuration and are never adopted from a portable document.
use super::{error, pointer_segment, DefinitionDiagnostic};
use serde_json::Value;

const FIELDS: [(&str, &str); 3] = [
    ("questionnaireId", "questionnaireBinding"),
    ("participantId", "participantBinding"),
    ("comparisonParticipantId", "comparisonParticipantBinding"),
];

fn is_template(field: &str, value: &str) -> bool {
    field != "questionnaireId" && value.contains("{{") && value.contains("}}")
}

pub(super) fn export_question(
    id: &str,
    question: &mut Value,
    questionnaire_id: Option<uuid::Uuid>,
) {
    if question["type"] != "statistical-feedback" {
        return;
    }
    for location in ["/config/dataSource", "/display/dataSource", "/dataSource"] {
        let Some(source) = question
            .pointer_mut(location)
            .and_then(Value::as_object_mut)
        else {
            continue;
        };
        for (field, binding) in FIELDS {
            let value = source.get(field).and_then(Value::as_str);
            let needs_binding =
                value.is_some_and(|value| !value.is_empty() && !is_template(field, value));
            if needs_binding {
                let name = if field == "questionnaireId"
                    && value.is_some_and(|value| {
                        questionnaire_id.is_some_and(|id| id.to_string() == value)
                    }) {
                    "self".to_owned()
                } else {
                    format!(
                        "{id}:{}:{field}",
                        location.trim_matches('/').replace('/', ":")
                    )
                };
                source
                    .entry(binding.to_owned())
                    .or_insert_with(|| Value::String(name));
            }
            if source.contains_key(binding) {
                source.remove(field);
            }
        }
    }
}

pub(super) fn inspect_portable(value: &Value, diagnostics: &mut Vec<DefinitionDiagnostic>) {
    let Some(questions) = value["questions"].as_object() else {
        return;
    };
    for (id, question) in questions {
        if question["type"] != "statistical-feedback" {
            continue;
        }
        for location in ["/config/dataSource", "/display/dataSource", "/dataSource"] {
            let Some(source) = question.pointer(location).and_then(Value::as_object) else {
                continue;
            };
            for (field, _) in FIELDS {
                if source
                    .get(field)
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.is_empty() && !is_template(field, value))
                {
                    diagnostics.push(error("QDEF_INSTALLATION_STATE",format!("/questions/{}{location}/{field}",pointer_segment(id)),"Fixed feedback source identities belong to the installation, not to QDef.",Some("Export a named source binding and map it to an authorized local source after import.")));
                }
            }
        }
    }
}

pub(super) fn execution_diagnostics(content: &Value) -> Vec<DefinitionDiagnostic> {
    let mut diagnostics = Vec::new();
    let questions: Vec<(String, &Value)> = match &content["questions"] {
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, q)| (i.to_string(), q))
            .collect(),
        Value::Object(items) => items
            .iter()
            .map(|(id, q)| (pointer_segment(id), q))
            .collect(),
        _ => Vec::new(),
    };
    for (id, question) in questions {
        if question["type"] != "statistical-feedback" {
            continue;
        }
        if let Some((mode, location, source)) = effective_source(question) {
            for (field, binding) in FIELDS {
                if !active_field(mode, field) {
                    continue;
                }
                if let Some(name) = source.get(binding).and_then(Value::as_str) {
                    if !source
                        .get(field)
                        .and_then(Value::as_str)
                        .is_some_and(|target| !target.trim().is_empty())
                    {
                        diagnostics.push(error("QDEF_SOURCE_BINDING_REQUIRED",format!("/questions/{id}{location}/{binding}"),format!("Source binding '{name}' has no local target."),Some("Choose an authorized local source in the feedback designer before publishing or running this questionnaire.")));
                    }
                }
            }
        }
    }
    diagnostics
}

pub(super) async fn authorize_targets(
    state: &crate::state::AppState,
    connection: &mut sqlx::PgConnection,
    actor: uuid::Uuid,
    content: &Value,
) -> Result<(), crate::error::ApiError> {
    use crate::{
        authz::{authorize, Scope},
        error::ApiError,
        rbac::models::Permission,
    };
    let Some(questions) = content["questions"].as_array() else {
        return Ok(());
    };
    let mut authorized = std::collections::BTreeSet::new();
    for question in questions {
        if question["type"] != "statistical-feedback" {
            continue;
        }
        let Some((mode, _, source)) = effective_source(question) else {
            continue;
        };
        if !active_field(mode, "questionnaireId") {
            continue;
        }
        let Some(id) = source
            .get("questionnaireId")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        let id = uuid::Uuid::parse_str(id).map_err(|_| {
            ApiError::Validation(
                "QDEF_SOURCE_BINDING_INVALID: Choose an existing local source questionnaire."
                    .into(),
            )
        })?;
        if !authorized.insert(id) {
            continue;
        }
        let project_id: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT project_id FROM questionnaire_definitions WHERE id=$1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&mut *connection)
        .await?;
        let project_id = project_id.ok_or_else(|| {
            ApiError::Validation(
                "QDEF_SOURCE_BINDING_INVALID: The selected source questionnaire is unavailable."
                    .into(),
            )
        })?;
        authorize(
            &mut *connection,
            &state.rbac,
            actor,
            Scope::Project(project_id),
            Permission::QuestionnaireRead,
        )
        .await?;
        authorize(
            &mut *connection,
            &state.rbac,
            actor,
            Scope::Project(project_id),
            Permission::ResponseRead,
        )
        .await?;
    }
    Ok(())
}

pub(super) type LocalTargets = std::collections::BTreeMap<(String, String), String>;

pub(super) fn local_targets(content: &Value, questionnaire_id: uuid::Uuid) -> LocalTargets {
    let mut targets = LocalTargets::new();
    for question in content["questions"].as_array().into_iter().flatten() {
        let id = question["id"].as_str().unwrap_or_default();
        let mut portable = question.clone();
        export_question(id, &mut portable, Some(questionnaire_id));
        for location in ["/config/dataSource", "/display/dataSource", "/dataSource"] {
            for (field, binding) in FIELDS {
                if let (Some(name), Some(target)) = (
                    portable.pointer(location).and_then(|s| s[binding].as_str()),
                    question.pointer(location).and_then(|s| s[field].as_str()),
                ) {
                    targets
                        .entry((field.to_owned(), name.to_owned()))
                        .or_insert_with(|| target.to_owned());
                }
            }
        }
    }
    targets
}

pub(super) fn restore_targets(
    content: &mut Value,
    questionnaire_id: uuid::Uuid,
    prior: Option<&LocalTargets>,
) {
    for question in content["questions"].as_array_mut().into_iter().flatten() {
        if question["type"] != "statistical-feedback" {
            continue;
        }
        for location in ["/config/dataSource", "/display/dataSource", "/dataSource"] {
            let Some(source) = question
                .pointer_mut(location)
                .and_then(Value::as_object_mut)
            else {
                continue;
            };
            for (field, binding) in FIELDS {
                let Some(name) = source.get(binding).and_then(Value::as_str) else {
                    continue;
                };
                let target = if field == "questionnaireId" && name == "self" {
                    Some(questionnaire_id.to_string())
                } else {
                    prior
                        .and_then(|map| map.get(&(field.to_owned(), name.to_owned())))
                        .cloned()
                };
                if let Some(target) = target {
                    source.insert(field.to_owned(), Value::String(target));
                }
            }
        }
    }
}

fn effective_source(
    question: &Value,
) -> Option<(&str, &'static str, &serde_json::Map<String, Value>)> {
    if question["type"] != "statistical-feedback" {
        return None;
    }
    let mode = question
        .pointer("/config/sourceMode")
        .or_else(|| question.pointer("/display/sourceMode"))
        .and_then(Value::as_str)
        .unwrap_or("current-session");
    for location in ["/config/dataSource", "/display/dataSource", "/dataSource"] {
        if let Some(source) = question.pointer(location) {
            return source.as_object().map(|source| (mode, location, source));
        }
    }
    None
}

fn active_field(mode: &str, field: &str) -> bool {
    match field {
        "questionnaireId" => [
            "cohort",
            "participant-vs-cohort",
            "participant-vs-participant",
        ]
        .contains(&mode),
        "participantId" => ["participant-vs-cohort", "participant-vs-participant"].contains(&mode),
        "comparisonParticipantId" => mode == "participant-vs-participant",
        _ => false,
    }
}
