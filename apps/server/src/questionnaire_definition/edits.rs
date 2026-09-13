//! Stable-identifier edits over the portable model, applied on an isolated copy.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use super::{error, pointer_segment, DefinitionDiagnostic};

pub(super) const MAX_EDITS: usize = 128;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "op", rename_all = "lowercase", deny_unknown_fields)]
pub enum StableDefinitionEdit {
    Add {
        path: String,
        value: Value,
        before: Option<String>,
    },
    Replace {
        path: String,
        value: Value,
    },
    Remove {
        path: String,
    },
    Move {
        from: String,
        path: String,
        before: Option<String>,
    },
}

impl StableDefinitionEdit {
    pub(super) fn path(&self) -> &str {
        match self {
            Self::Add { path, .. }
            | Self::Replace { path, .. }
            | Self::Remove { path }
            | Self::Move { path, .. } => path,
        }
    }
}

/// A decoded path retains identifiers; indexes are resolved only while operating
/// on the isolated document and never become part of the public edit contract.
fn segments(path: &str) -> Result<Vec<String>, &'static str> {
    if !path.starts_with('/') || path == "/" {
        return Err("Use an absolute path to a definition field or stable identifier.");
    }
    let mut result = Vec::new();
    for segment in path[1..].split('/') {
        let mut decoded = String::new();
        let mut chars = segment.chars();
        while let Some(character) = chars.next() {
            if character == '~' {
                decoded.push(match chars.next() {
                    Some('0') => '~',
                    Some('1') => '/',
                    _ => return Err("Escape '~' as '~0' and '/' as '~1' in path segments."),
                });
            } else {
                decoded.push(character);
            }
        }
        if decoded.is_empty() || decoded == "@" {
            return Err("Path segments and stable identifiers must be nonempty.");
        }
        result.push(decoded);
    }
    if matches!(
        result.first().map(String::as_str),
        Some("questions" | "variables" | "assets")
    ) && result.get(1).is_some_and(|id| !id.starts_with('@'))
    {
        return Err("Address registry members with @ followed by their stable identifier.");
    }
    if result[0] == "pages" {
        result.insert(0, "structure".into());
    }
    Ok(result)
}

pub(super) fn validate_paths(edits: &[StableDefinitionEdit]) -> Vec<DefinitionDiagnostic> {
    let mut diagnostics = Vec::new();
    if edits.is_empty() || edits.len() > MAX_EDITS {
        diagnostics.push(error(
            "EDIT_BATCH_INVALID",
            "/edits",
            format!("A batch must contain between 1 and {MAX_EDITS} edits."),
            None,
        ));
    }
    for (index, edit) in edits.iter().enumerate() {
        for (field, path) in [
            ("path", Some(edit.path())),
            (
                "from",
                match edit {
                    StableDefinitionEdit::Move { from, .. } => Some(from.as_str()),
                    _ => None,
                },
            ),
        ] {
            if let Some(path) = path {
                if let Err(message) = segments(path) {
                    diagnostics.push(error(
                        "EDIT_PATH_INVALID",
                        format!("/edits/{index}/{field}"),
                        message,
                        Some("Use stable paths such as /pages/@intro/blocks/@main/questions/@age."),
                    ));
                }
            }
        }
    }
    diagnostics
}

fn stable_id(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value.get("id").and_then(Value::as_str))
}

fn object_key(
    object: &serde_json::Map<String, Value>,
    segment: &str,
    parent: &[String],
) -> Result<String, EditFailure> {
    if let Some(id) = segment.strip_prefix('@') {
        if parent.len() == 1 && matches!(parent[0].as_str(), "questions" | "variables" | "assets") {
            return Ok(id.into());
        }
        return Err(EditFailure::Path(
            "Use @ only for collection members, not object fields.",
        ));
    }
    // The public block path says 'questions'; QDef stores an ordered reference list.
    if segment == "questions"
        && object.contains_key("questionIds")
        && !object.contains_key("questions")
    {
        Ok("questionIds".into())
    } else {
        Ok(segment.into())
    }
}

fn array_index(values: &[Value], segment: &str) -> Result<usize, EditFailure> {
    let id = segment.strip_prefix('@').ok_or(EditFailure::Path(
        "Array positions are not edit identifiers. Use @ followed by a stable identifier.",
    ))?;
    values
        .iter()
        .position(|value| stable_id(value) == Some(id))
        .ok_or(EditFailure::Missing)
}

#[derive(Debug)]
enum EditFailure {
    Path(&'static str),
    Missing,
    Exists,
    Identity,
    Before,
    Conflict,
}

fn parent_mut<'a>(mut value: &'a mut Value, path: &[String]) -> Result<&'a mut Value, EditFailure> {
    for (index, segment) in path.iter().enumerate() {
        value = match value {
            Value::Object(object) => {
                let key = object_key(object, segment, &path[..index])?;
                object.get_mut(&key).ok_or(EditFailure::Missing)?
            }
            Value::Array(values) => {
                let index = array_index(values, segment)?;
                &mut values[index]
            }
            _ => {
                return Err(EditFailure::Path(
                    "The parent path must resolve to an object or a collection.",
                ))
            }
        };
    }
    Ok(value)
}

fn split_target(path: &[String]) -> Result<(&String, &[String]), EditFailure> {
    let (last, parent) = path.split_last().ok_or(EditFailure::Missing)?;
    if last == "id" && parent.last().is_some_and(|part| part.starts_with('@')) {
        return Err(EditFailure::Identity);
    }
    Ok((last, parent))
}

fn remove(document: &mut Value, path: &[String]) -> Result<Value, EditFailure> {
    let (last, parent) = split_target(path)?;
    match parent_mut(document, parent)? {
        Value::Object(object) => {
            let key = object_key(object, last, parent)?;
            object.remove(&key).ok_or(EditFailure::Missing)
        }
        Value::Array(values) => {
            let index = array_index(values, last)?;
            Ok(values.remove(index))
        }
        _ => Err(EditFailure::Missing),
    }
}

fn write(
    document: &mut Value,
    path: &[String],
    value: Value,
    before: Option<&str>,
    replace: bool,
) -> Result<(), EditFailure> {
    let (last, parent) = split_target(path)?;
    match parent_mut(document, parent)? {
        Value::Object(object) => {
            if before.is_some() {
                return Err(EditFailure::Path(
                    "Only ordered collections accept a before identifier.",
                ));
            }
            let key = object_key(object, last, parent)?;
            if replace && !object.contains_key(&key) {
                return Err(EditFailure::Missing);
            }
            if !replace && object.contains_key(&key) {
                return Err(EditFailure::Exists);
            }
            object.insert(key, value);
        }
        Value::Array(values) => {
            let id = last.strip_prefix('@').ok_or(EditFailure::Path(
                "Array positions are not edit identifiers. Use @ followed by a stable identifier.",
            ))?;
            if stable_id(&value) != Some(id) {
                return Err(EditFailure::Identity);
            }
            let existing = values.iter().position(|value| stable_id(value) == Some(id));
            if replace {
                let index = existing.ok_or(EditFailure::Missing)?;
                values[index] = value;
            } else {
                if existing.is_some() {
                    return Err(EditFailure::Exists);
                }
                let index = match before {
                    None => values.len(),
                    Some(before) => values
                        .iter()
                        .position(|value| stable_id(value) == Some(before))
                        .ok_or(EditFailure::Before)?,
                };
                values.insert(index, value);
            }
        }
        _ => return Err(EditFailure::Missing),
    }
    Ok(())
}

pub(super) fn apply(
    document: &Value,
    edits: &[StableDefinitionEdit],
) -> Result<Value, Vec<DefinitionDiagnostic>> {
    let mut next = document.clone();
    for (index, edit) in edits.iter().enumerate() {
        let path = segments(edit.path()).map_err(|message| {
            vec![error(
                "EDIT_PATH_INVALID",
                format!("/edits/{index}/path"),
                message,
                None,
            )]
        })?;
        let applied = match edit {
            StableDefinitionEdit::Add { value, before, .. } => {
                write(&mut next, &path, value.clone(), before.as_deref(), false)
            }
            StableDefinitionEdit::Replace { value, .. } => {
                write(&mut next, &path, value.clone(), None, true)
            }
            StableDefinitionEdit::Remove { .. } => remove(&mut next, &path).map(|_| ()),
            StableDefinitionEdit::Move { from, before, .. } => {
                let from = segments(from).map_err(|message| {
                    vec![error(
                        "EDIT_PATH_INVALID",
                        format!("/edits/{index}/from"),
                        message,
                        None,
                    )]
                })?;
                if path.len() > from.len() && path.starts_with(&from) {
                    Err(EditFailure::Conflict)
                } else if from.last().is_some_and(|s| s.starts_with('@'))
                    && from.last() != path.last()
                {
                    Err(EditFailure::Identity)
                } else {
                    remove(&mut next, &from)
                        .and_then(|value| write(&mut next, &path, value, before.as_deref(), false))
                }
            }
        };
        if let Err(failure) = applied {
            let (code, message) = match failure {
                EditFailure::Path(message) => ("EDIT_PATH_INVALID", message),
                EditFailure::Missing => ("EDIT_TARGET_NOT_FOUND", "An edit target or its parent no longer exists."),
                EditFailure::Exists => ("EDIT_ALREADY_EXISTS", "An add or move would overwrite an existing element."),
                EditFailure::Identity => ("EDIT_ID_MISMATCH", "An edit cannot rename an element's stable identifier."),
                EditFailure::Before => ("EDIT_BEFORE_NOT_FOUND", "The requested before identifier is not a sibling in the destination collection."),
                EditFailure::Conflict => ("EDIT_CONFLICT", "An element cannot be moved into its own descendant."),
            };
            let mut diagnostic = error(
                code,
                format!("/edits/{index}"),
                message,
                Some("Reload the current definition and address its stable identifiers."),
            );
            diagnostic.related_paths.push(edit.path().to_owned());
            return Err(vec![diagnostic]);
        }
    }
    Ok(next)
}

pub(super) fn stable_segment(id: &str) -> String {
    format!("@{}", pointer_segment(id))
}

/// Evaluate values in their destination's semantic context, so registry IDs
/// remain data while hook fields still receive the common executable rejection.
pub(super) fn inspect_safety(raw: &Value) -> Vec<DefinitionDiagnostic> {
    let mut diagnostics = Vec::new();
    let Some(batch) = raw.as_array() else {
        super::safety::inspect(raw, "/edits", &mut diagnostics);
        return diagnostics;
    };
    for (index, edit) in batch.iter().enumerate() {
        let Some(object) = edit.as_object() else {
            continue;
        };
        let mut metadata = object.clone();
        for key in ["value", "path", "from", "before"] {
            metadata.remove(key);
        }
        super::safety::inspect(
            &Value::Object(metadata),
            &format!("/edits/{index}"),
            &mut diagnostics,
        );
        let Some(value) = object.get("value") else {
            continue;
        };
        let Some(path) = object
            .get("path")
            .and_then(Value::as_str)
            .and_then(|path| segments(path).ok())
        else {
            super::safety::inspect(value, &format!("/edits/{index}/value"), &mut diagnostics);
            continue;
        };
        let path: Vec<String> = path
            .iter()
            .map(|part| part.strip_prefix('@').unwrap_or(part).to_owned())
            .collect();
        let (key, parents) = path.split_last().expect("validated path has a target");
        let parent = parents
            .iter()
            .map(|part| format!("/{}", pointer_segment(part)))
            .collect::<String>();
        let target = format!("{parent}/{}", pointer_segment(key));
        let wrapper = Value::Object(serde_json::Map::from_iter([(key.clone(), value.clone())]));
        let mut findings = Vec::new();
        super::safety::inspect(&wrapper, &parent, &mut findings);
        for mut finding in findings {
            finding.related_paths.push(finding.path.clone());
            finding.path = format!(
                "/edits/{index}/value{}",
                finding.path.strip_prefix(&target).unwrap_or("")
            );
            diagnostics.push(finding);
        }
    }
    diagnostics
}
