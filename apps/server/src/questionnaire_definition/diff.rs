//! Bounded explanations over semantic identifiers, independent of edit syntax.
use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use super::{edits::stable_segment, pointer_segment};

const MAX_ENTRIES: usize = 100;
const MAX_BYTES: usize = 16_384;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SemanticDiff {
    pub entries: Vec<SemanticChange>,
    pub total_changes: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SemanticChange {
    pub kind: SemanticChangeKind,
    pub path: String,
    pub summary: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum SemanticChangeKind {
    Added,
    Removed,
    Changed,
    OrderChanged,
    ReferencesChanged,
}

struct Builder {
    result: SemanticDiff,
    bytes: usize,
}

impl Builder {
    fn push(&mut self, kind: SemanticChangeKind, path: &str, summary: String) {
        self.result.total_changes += 1;
        let change = SemanticChange {
            kind,
            path: path.to_owned(),
            summary: clip(&summary, 400),
        };
        // Include the array separator; the builder reserves space for the
        // enclosing fields and the largest possible totalChanges count.
        let bytes = serde_json::to_vec(&change).map_or(MAX_BYTES + 1, |bytes| bytes.len() + 1);
        if self.result.entries.len() < MAX_ENTRIES && self.bytes + bytes <= MAX_BYTES {
            self.bytes += bytes;
            self.result.entries.push(change);
        } else {
            self.result.truncated = true;
        }
    }

    fn walk(&mut self, before: Option<&Value>, after: Option<&Value>, path: &str) {
        if before == after {
            return;
        }
        match (before, after) {
            (None, Some(value)) => self.push(
                SemanticChangeKind::Added,
                path,
                format!("Added {path}: {}.", preview(value)),
            ),
            (Some(value), None) => self.push(
                SemanticChangeKind::Removed,
                path,
                format!("Removed {path}: {}.", preview(value)),
            ),
            (Some(Value::Object(left)), Some(Value::Object(right))) => {
                let keys: BTreeSet<_> = left.keys().chain(right.keys()).collect();
                for key in keys {
                    let child = if path == "/structure" && key == "pages" {
                        "/pages".into()
                    } else if matches!(path, "/questions" | "/variables" | "/assets") {
                        format!("{path}/{}", stable_segment(key))
                    } else if key == "questionIds" {
                        format!("{path}/questions")
                    } else {
                        format!("{path}/{}", pointer_segment(key))
                    };
                    self.walk(left.get(key), right.get(key), &child);
                }
            }
            (Some(Value::Array(left)), Some(Value::Array(right))) => {
                let Some(left_ids) = identifiers(left) else {
                    self.changed(before, after, path);
                    return;
                };
                let Some(right_ids) = identifiers(right) else {
                    self.changed(before, after, path);
                    return;
                };
                let references = path.ends_with("/questions");
                if left_ids != right_ids {
                    let left_members: BTreeSet<_> = left_ids.iter().collect();
                    let right_members: BTreeSet<_> = right_ids.iter().collect();
                    let membership_changed = references && left_members != right_members;
                    self.push(
                        if membership_changed {
                            SemanticChangeKind::ReferencesChanged
                        } else {
                            SemanticChangeKind::OrderChanged
                        },
                        path,
                        format!(
                            "{} at {path} changed from {} to {}.",
                            if membership_changed {
                                "Question references"
                            } else {
                                "Order"
                            },
                            preview(&serde_json::json!(left_ids)),
                            preview(&serde_json::json!(right_ids))
                        ),
                    );
                }
                let left_map: BTreeMap<_, _> = left_ids.into_iter().zip(left).collect();
                let right_map: BTreeMap<_, _> = right_ids.into_iter().zip(right).collect();
                let ids: BTreeSet<_> = left_map.keys().chain(right_map.keys()).collect();
                for id in ids {
                    self.walk(
                        left_map.get(id).copied(),
                        right_map.get(id).copied(),
                        &format!("{path}/{}", stable_segment(id)),
                    );
                }
            }
            _ => self.changed(before, after, path),
        }
    }

    fn changed(&mut self, before: Option<&Value>, after: Option<&Value>, path: &str) {
        self.push(
            SemanticChangeKind::Changed,
            path,
            format!(
                "Changed {path} from {} to {}.",
                before.map_or_else(|| "absent".into(), preview),
                after.map_or_else(|| "absent".into(), preview)
            ),
        );
    }
}

fn identifiers(values: &[Value]) -> Option<Vec<&str>> {
    let ids = values
        .iter()
        .map(|value| {
            value
                .as_str()
                .or_else(|| value.get("id").and_then(Value::as_str))
        })
        .collect::<Option<Vec<_>>>()?;
    (ids.iter().collect::<BTreeSet<_>>().len() == ids.len()).then_some(ids)
}

fn clip(text: &str, limit: usize) -> String {
    let mut chars = text.chars();
    let mut clipped: String = chars.by_ref().take(limit).collect();
    if chars.next().is_some() {
        clipped.push('…');
    }
    clipped
}

fn preview(value: &Value) -> String {
    clip(&value.to_string(), 128)
}

pub(super) fn between(before: &Value, after: &Value) -> SemanticDiff {
    let mut builder = Builder {
        result: SemanticDiff {
            entries: Vec::new(),
            total_changes: 0,
            truncated: false,
        },
        bytes: 128,
    };
    builder.walk(Some(before), Some(after), "");
    builder.result
}
