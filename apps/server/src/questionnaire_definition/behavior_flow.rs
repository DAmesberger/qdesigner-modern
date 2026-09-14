//! Page placement and forced transition cycles, using runtime rule precedence.
use super::{error, DefinitionDiagnostic};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or_default()
}

pub(super) fn position_index(pages: &[Value]) -> BTreeMap<&str, usize> {
    let mut positions = BTreeMap::new();
    for (index, page) in pages.iter().enumerate() {
        for reference in array(&page["questionIds"]).iter().chain(
            array(&page["blocks"])
                .iter()
                .flat_map(|block| array(&block["questionIds"])),
        ) {
            if let Some(id) = reference.as_str() {
                positions.entry(id).or_insert(index);
            }
        }
    }
    // Page IDs take precedence over identically named question IDs at runtime.
    for (index, page) in pages.iter().enumerate() {
        if let Some(id) = page["id"].as_str() {
            positions.insert(id, index);
        }
    }
    positions
}

pub(super) fn validate(value: &Value, out: &mut Vec<DefinitionDiagnostic>) {
    let pages = array(&value["structure"]["pages"]);
    let flow = array(&value["flow"]);
    let positions = position_index(pages);
    let mut global: Option<usize> = None;
    let mut scoped: Vec<Option<usize>> = vec![None; pages.len()];
    for (index, rule) in flow.iter().enumerate() {
        if rule["condition"].as_str().unwrap_or_default().trim() == "false" {
            continue;
        }
        let selected = match rule["source"].as_str().filter(|s| !s.is_empty()) {
            None => &mut global,
            Some(source) => match positions.get(source) {
                Some(page) => &mut scoped[*page],
                None => continue,
            },
        };
        let priority = rule["priority"].as_f64().unwrap_or(0.0);
        if selected.is_none_or(|prior| priority > flow[prior]["priority"].as_f64().unwrap_or(0.0)) {
            *selected = Some(index);
        }
    }
    let mut edges: Vec<Option<(usize, String)>> = vec![None; pages.len()];
    for (page_index, edge) in edges.iter_mut().enumerate() {
        if let Some(index) = scoped[page_index].or(global) {
            let rule = &flow[index];
            let condition = rule["condition"].as_str().unwrap_or_default().trim();
            // Only the highest-precedence candidate can prove a forced edge.
            if !condition.is_empty() && condition != "true" {
                continue;
            }
            let kind = rule["type"].as_str().unwrap_or_default();
            if kind == "terminate"
                || (kind == "loop" && rule["iterations"].as_u64().is_some_and(|n| n > 0))
            {
                continue;
            }
            if let Some(target) = rule["target"].as_str().and_then(|id| positions.get(id)) {
                *edge = Some((*target, format!("/flow/{index}/target")));
            }
        } else if page_index + 1 < pages.len() {
            *edge = Some((page_index + 1, format!("/structure/pages/{page_index}")));
        }
    }
    let mut complete = BTreeSet::new();
    let mut cycles = BTreeMap::new();
    for start in 0..pages.len() {
        let mut path = Vec::new();
        let mut positions = BTreeMap::new();
        let mut current = start;
        while !complete.contains(&current) {
            if let Some(&offset) = positions.get(&current) {
                let related: Vec<String> = path[offset..]
                    .iter()
                    .filter_map(|index: &usize| {
                        edges[*index].as_ref().map(|(_, path)| path.clone())
                    })
                    .collect();
                for path in &related {
                    if path.starts_with("/flow/") {
                        cycles.insert(path.clone(), related.clone());
                    }
                }
                break;
            }
            positions.insert(current, path.len());
            path.push(current);
            let Some((next, _)) = &edges[current] else {
                break;
            };
            current = *next;
        }
        complete.extend(path);
    }
    for (path, related_paths) in cycles {
        let mut diagnostic=error("QDEF_FLOW_CYCLE",&path,"This unconditional transition creates a cycle with no bounded loop or conditional exit.",Some("Use a bounded loop or an explicit exit condition."));
        diagnostic.related_paths = related_paths
            .into_iter()
            .filter(|related| related != &path)
            .collect();
        out.push(diagnostic);
    }
}
