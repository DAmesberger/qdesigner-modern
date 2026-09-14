//! Reference and type integrity of the portable behavioral model.
use super::{error, pointer_segment, DefinitionDiagnostic};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or_default()
}
fn text(value: &Value) -> &str {
    value.as_str().unwrap_or_default()
}
fn issue(
    out: &mut Vec<DefinitionDiagnostic>,
    code: &str,
    path: impl Into<String>,
    message: impl Into<String>,
) {
    out.push(error(code, path, message, None));
}
fn reference(out: &mut Vec<DefinitionDiagnostic>, path: impl Into<String>, id: &str, valid: bool) {
    if !valid {
        issue(
            out,
            "QDEF_REFERENCE_NOT_FOUND",
            path,
            format!("Reference '{id}' does not resolve in this declaration's scope."),
        );
    }
}
fn unique(items: &[Value], key: &str, path: &str, out: &mut Vec<DefinitionDiagnostic>) {
    let mut seen = BTreeSet::new();
    for (index, item) in items.iter().enumerate() {
        let id = text(&item[key]);
        if id.is_empty() || !seen.insert(id) {
            issue(
                out,
                "QDEF_DUPLICATE_ID",
                format!("{path}/{index}/{key}"),
                format!("Identity '{id}' must be nonempty and unique."),
            );
        }
    }
}

pub(super) fn validate(value: &Value, out: &mut Vec<DefinitionDiagnostic>) {
    let Some(variables) = value["variables"].as_object() else {
        return;
    };
    let Some(questions) = value["questions"].as_object() else {
        return;
    };
    let pages = array(&value["structure"]["pages"]);
    let page_ids: BTreeSet<_> = pages.iter().map(|p| text(&p["id"])).collect();
    let positions = super::behavior_flow::position_index(pages);
    let resolve_position = |id: &str| positions.contains_key(id);
    super::behavior_flow::validate(value, out);
    let mut names = BTreeMap::new();
    for (id, var) in variables {
        let name = var["name"].as_str().unwrap_or(id);
        if name != id && variables.contains_key(name) {
            issue(
                out,
                "QDEF_DUPLICATE_ID",
                format!("/variables/{}/name", pointer_segment(id)),
                format!(
                    "Variable name '{name}' conflicts with another variable's registry identity."
                ),
            );
        }
        if let Some(previous) = names.insert(name, id.as_str()) {
            issue(
                out,
                "QDEF_DUPLICATE_ID",
                format!("/variables/{}/name", pointer_segment(id)),
                format!("Variable name '{name}' is already used by '{previous}'."),
            );
        }
    }
    let catalogue = super::variable_catalogue::build(value, out);
    let resolve_variable = |name: &str| catalogue.get(name);
    let mut dependencies: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    for (id, var) in variables {
        let path = format!("/variables/{}", pointer_segment(id));
        if let Some(default) = var.get("defaultValue").filter(|v| !v.is_null()) {
            let valid = match text(&var["type"]) {
                "number" | "reaction_time" | "stimulus_onset" | "time" => default.is_number(),
                "string" => default.is_string(),
                "date" => default.as_str().is_some_and(|date| {
                    chrono::DateTime::parse_from_rfc3339(date).is_ok()
                        || chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok()
                }),
                "boolean" => default.is_boolean(),
                "array" => default.is_array(),
                "object" => default.is_object(),
                _ => false,
            };
            if !valid {
                issue(
                    out,
                    "QDEF_TYPE_MISMATCH",
                    format!("{path}/defaultValue"),
                    "Default value does not match the declared variable type.",
                );
            }
        }
        for (index, dep) in array(&var["dependencies"]).iter().enumerate() {
            let dep = text(dep);
            let at = format!("{path}/dependencies/{index}");
            reference(out, &at, dep, resolve_variable(dep).is_some());
            let resolved = if variables.contains_key(dep) {
                dep
            } else {
                names.get(dep).copied().unwrap_or(dep)
            };
            dependencies
                .entry(id.clone())
                .or_default()
                .push((resolved.to_owned(), at));
        }
        if let Some(formula) = var["formula"].as_str() {
            for symbol in super::formula_references::symbols(formula) {
                let resolved = if variables.contains_key(&symbol) {
                    Some(symbol.as_str())
                } else {
                    names.get(symbol.as_str()).copied()
                };
                if let Some(resolved) = resolved {
                    dependencies
                        .entry(id.clone())
                        .or_default()
                        .push((resolved.to_owned(), format!("{path}/formula")));
                }
            }
        }
        if let Some(server) = var.get("server") {
            let expected = if server.get("stat").is_some() {
                "number"
            } else {
                "object"
            };
            if text(&var["type"]) != expected {
                issue(
                    out,
                    "QDEF_TYPE_MISMATCH",
                    format!("{path}/type"),
                    format!("This server declaration materializes a {expected}."),
                );
            }
            let key = text(&server["key"]);
            match text(&server["source"]) {
                "variable" => reference(
                    out,
                    format!("{path}/server/key"),
                    key,
                    resolve_variable(key).is_some(),
                ),
                "response" => reference(
                    out,
                    format!("{path}/server/key"),
                    key,
                    questions.contains_key(key),
                ),
                "trials" => {
                    reference(
                        out,
                        format!("{path}/server/key"),
                        key,
                        questions.contains_key(key),
                    );
                    if questions.get(key).is_some_and(|q| {
                        !["reaction-time", "reaction-experiment", "webgl"]
                            .contains(&text(&q["type"]))
                    }) {
                        issue(
                            out,
                            "QDEF_TYPE_MISMATCH",
                            format!("{path}/server/key"),
                            "Trial aggregation requires a reaction question.",
                        );
                    }
                }
                _ => {}
            }
            for (index, clause) in array(&server["dataset"]["where"]).iter().enumerate() {
                let key = text(&clause["var"]);
                reference(
                    out,
                    format!("{path}/server/dataset/where/{index}/var"),
                    key,
                    resolve_variable(key).is_some(),
                );
            }
        }
    }
    cycles(&dependencies, out);
    for (pi, page) in pages.iter().enumerate() {
        let mut page_references = BTreeSet::new();
        for (qi, id) in array(&page["questionIds"]).iter().enumerate() {
            if !page_references.insert(text(id)) {
                issue(
                    out,
                    "QDEF_DUPLICATE_REFERENCE",
                    format!("/structure/pages/{pi}/questionIds/{qi}"),
                    "A direct page reference must occur at most once.",
                );
            }
            reference(
                out,
                format!("/structure/pages/{pi}/questionIds/{qi}"),
                text(id),
                questions.contains_key(text(id)),
            );
        }
        for (bi, block) in array(&page["blocks"]).iter().enumerate() {
            let path = format!("/structure/pages/{pi}/blocks/{bi}");
            let ids: BTreeSet<_> = array(&block["questionIds"]).iter().map(text).collect();
            if let Some(positions) = block["randomization"]["fixedPositions"].as_object() {
                let mut used = BTreeSet::new();
                for (id, position) in positions {
                    let at = format!(
                        "{path}/randomization/fixedPositions/{}",
                        pointer_segment(id)
                    );
                    reference(out, &at, id, ids.contains(id.as_str()));
                    if let Some(index) = position.as_u64().filter(|index| *index < ids.len() as u64)
                    {
                        if !used.insert(index) {
                            issue(
                                out,
                                "QDEF_DUPLICATE_POSITION",
                                at,
                                "Two questions cannot occupy the same fixed position.",
                            );
                        }
                    } else {
                        issue(
                            out,
                            "QDEF_BEHAVIOR_INVALID",
                            at,
                            "A fixed position must be an integer index within this block.",
                        );
                    }
                }
            }
            if let Some(loop_config) = block.get("loop") {
                let required_source = match text(&loop_config["source"]["type"]) {
                    "answer" => Some("questionId"),
                    "variable" => Some("variableId"),
                    _ => None,
                };
                if let Some(field) = required_source {
                    if loop_config["source"][field]
                        .as_str()
                        .is_none_or(|id| id.is_empty())
                    {
                        issue(
                            out,
                            "QDEF_REFERENCE_NOT_FOUND",
                            format!("{path}/loop/source/{field}"),
                            "This loop source requires a target.",
                        );
                    }
                }
                if let Some(id) = loop_config["source"]["questionId"].as_str() {
                    reference(
                        out,
                        format!("{path}/loop/source/questionId"),
                        id,
                        questions.contains_key(id),
                    );
                }
                if let Some(id) = loop_config["source"]["variableId"].as_str() {
                    reference(
                        out,
                        format!("{path}/loop/source/variableId"),
                        id,
                        resolve_variable(id).is_some(),
                    );
                }
            }
            if let Some(adaptive) = block.get("adaptive") {
                unique(
                    array(&adaptive["items"]),
                    "id",
                    &format!("{path}/adaptive/items"),
                    out,
                );
                for (index, item) in array(&adaptive["items"]).iter().enumerate() {
                    let id = text(&item["id"]);
                    reference(
                        out,
                        format!("{path}/adaptive/items/{index}/id"),
                        id,
                        ids.contains(id),
                    );
                }
                for (index, item) in array(&adaptive["scoring"]).iter().enumerate() {
                    let id = text(&item["questionId"]);
                    reference(
                        out,
                        format!("{path}/adaptive/scoring/{index}/questionId"),
                        id,
                        ids.contains(id),
                    );
                }
                if let Some(name) = adaptive["thetaReportVariable"].as_str() {
                    if resolve_variable(name).is_some_and(|v| text(&v["type"]) != "number") {
                        issue(
                            out,
                            "QDEF_TYPE_MISMATCH",
                            format!("{path}/adaptive/thetaReportVariable"),
                            "An existing adaptive output variable must be numeric.",
                        );
                    }
                }
            }
        }
    }
    unique(array(&value["flow"]), "id", "/flow", out);
    for (index, rule) in array(&value["flow"]).iter().enumerate() {
        for field in ["source", "target"] {
            if let Some(id) = rule[field]
                .as_str()
                .filter(|id| field != "source" || !id.is_empty())
            {
                reference(
                    out,
                    format!("/flow/{index}/{field}"),
                    id,
                    resolve_position(id),
                );
            }
        }
        if ["skip", "branch", "loop"].contains(&text(&rule["type"])) && rule.get("target").is_none()
        {
            issue(
                out,
                "QDEF_REFERENCE_NOT_FOUND",
                format!("/flow/{index}/target"),
                "This flow control requires a target.",
            );
        }
    }
    let mut carry_dependencies = BTreeMap::new();
    for (id, q) in questions {
        if let Some(source) = q["carryForward"]["sourceQuestionId"].as_str() {
            let path = format!(
                "/questions/{}/carryForward/sourceQuestionId",
                pointer_segment(id)
            );
            reference(out, &path, source, questions.contains_key(source));
            carry_dependencies.insert(id.clone(), vec![(source.to_owned(), path)]);
        }
    }
    cycles(&carry_dependencies, out);
    let settings = &value["settings"];
    let scales = array(&settings["scoring"]["scales"]);
    unique(scales, "id", "/settings/scoring/scales", out);
    let scale_ids: BTreeSet<_> = scales.iter().map(|s| text(&s["id"])).collect();
    for (index, scale) in scales.iter().enumerate() {
        let path = format!("/settings/scoring/scales/{index}");
        for field in ["itemIds", "reverseScoredItemIds"] {
            let mut seen = BTreeSet::new();
            for (item_index, id) in array(&scale[field]).iter().enumerate() {
                if !seen.insert(text(id)) {
                    issue(
                        out,
                        "QDEF_DUPLICATE_REFERENCE",
                        format!("{path}/{field}/{item_index}"),
                        "A scoring item must occur at most once in this list.",
                    );
                }
            }
        }
        let ids: BTreeSet<_> = array(&scale["itemIds"]).iter().map(text).collect();
        for (i, id) in array(&scale["itemIds"]).iter().enumerate() {
            reference(
                out,
                format!("{path}/itemIds/{i}"),
                text(id),
                questions.contains_key(text(id)),
            );
        }
        for (i, id) in array(&scale["reverseScoredItemIds"]).iter().enumerate() {
            reference(
                out,
                format!("{path}/reverseScoredItemIds/{i}"),
                text(id),
                ids.contains(text(id)),
            );
        }
        if scale["itemMin"]
            .as_f64()
            .zip(scale["itemMax"].as_f64())
            .is_some_and(|(min, max)| min > max)
        {
            issue(
                out,
                "QDEF_BEHAVIOR_INVALID",
                format!("{path}/itemMax"),
                "Item maximum must be at least the minimum.",
            );
        }
    }
    unique(
        array(&settings["report"]["widgets"]),
        "id",
        "/settings/report/widgets",
        out,
    );
    for (index, widget) in array(&settings["report"]["widgets"]).iter().enumerate() {
        let path = format!("/settings/report/widgets/{index}");
        if ["interpretive-text", "completion-meta"].contains(&text(&widget["type"])) {
            continue;
        }
        let key = text(&widget["binding"]["key"]);
        let valid = if text(&widget["type"]) == "reaction-cohort-box" {
            if questions.get(key).is_some_and(|q| {
                !["reaction-time", "reaction-experiment", "webgl"].contains(&text(&q["type"]))
            }) {
                issue(
                    out,
                    "QDEF_TYPE_MISMATCH",
                    format!("{path}/binding/key"),
                    "A reaction report requires a question that produces reaction trials.",
                );
            }
            questions.contains_key(key)
        } else if text(&widget["binding"]["source"]) == "score" {
            scale_ids.contains(key)
        } else {
            resolve_variable(key).is_some()
        };
        reference(out, format!("{path}/binding/key"), key, valid);
        if let Some(name) = widget["comparison"]["serverVariable"].as_str() {
            let variable = resolve_variable(name);
            reference(
                out,
                format!("{path}/comparison/serverVariable"),
                name,
                variable.is_some(),
            );
            if variable.is_some_and(|v| text(&v["type"]) != "object" || v.get("server").is_none()) {
                issue(
                    out,
                    "QDEF_TYPE_MISMATCH",
                    format!("{path}/comparison/serverVariable"),
                    "A cohort comparison requires an object-typed server variable.",
                );
            }
        }
    }
    for (index, screener) in array(&settings["screeners"]).iter().enumerate() {
        let id = text(&screener["pageId"]);
        reference(
            out,
            format!("/settings/screeners/{index}/pageId"),
            id,
            page_ids.contains(id),
        );
        unique(
            array(&screener["rules"]),
            "id",
            &format!("/settings/screeners/{index}/rules"),
            out,
        );
    }
    if let Some(locales) = value["translations"].as_object() {
        for (locale, bundle) in locales {
            for (field, registry) in [
                ("questions", bundle["questions"].as_object()),
                ("pages", bundle["pages"].as_object()),
            ] {
                if let Some(registry) = registry {
                    for id in registry.keys() {
                        reference(
                            out,
                            format!(
                                "/translations/{}/{}/{}",
                                pointer_segment(locale),
                                field,
                                pointer_segment(id)
                            ),
                            id,
                            if field == "questions" {
                                questions.contains_key(id)
                            } else {
                                page_ids.contains(id.as_str())
                            },
                        );
                    }
                }
            }
        }
    }
}

fn cycles(edges: &BTreeMap<String, Vec<(String, String)>>, out: &mut Vec<DefinitionDiagnostic>) {
    let mut done = BTreeSet::new();
    for node in edges.keys() {
        if done.contains(node) {
            continue;
        }
        let mut active = BTreeSet::from([node]);
        let mut stack = vec![(node, 0)];
        while let Some((current, index)) = stack.last_mut() {
            let Some((next, path)) = edges.get(*current).and_then(|items| items.get(*index)) else {
                let (finished, _) = stack.pop().unwrap();
                active.remove(finished);
                done.insert(finished);
                continue;
            };
            *index += 1;
            if active.contains(next) {
                issue(
                    out,
                    "QDEF_DEPENDENCY_CYCLE",
                    path.clone(),
                    format!("Dependency on '{next}' closes a cycle."),
                );
            } else if !done.contains(next) {
                active.insert(next);
                stack.push((next, 0));
            }
        }
    }
}
