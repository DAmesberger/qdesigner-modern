//! Server-side seeding of a Yjs `Doc` from the `questionnaire_definitions.content`
//! JSON projection.
//!
//! This mirrors the client `YjsSchema.ts` `questionnaireToYDoc` layout **exactly**
//! so that a browser reading the server-seeded document via `yDocToQuestionnaire`
//! observes an identical structure:
//!
//! ```text
//!   Y.Map    "meta"       — scalar fields + `settings` (plain JSON value)
//!   Y.Array  "pages"      — each element a Y.Map { id, name, blocks: Y.Array<Y.Map>, layout?, conditions?, script? }
//!   Y.Map    "questions"  — keyed by question id, each value a Y.Map of the question's fields
//!   Y.Array  "variables"  — each element a Y.Map of the variable's fields
//!   Y.Array  "flow"       — each element a Y.Map of the flow rule's fields
//! ```
//!
//! The distinction that matters for CRDT correctness: structural containers the
//! client builds with `new Y.Map()` / `new Y.Array()` (pages, page maps, block
//! arrays, block maps, the questions map, each question map, variables, flow)
//! must be genuine nested shared types (`MapPrelim` / `ArrayPrelim`); leaf values
//! set with `ymap.set(key, plainValue)` are opaque `Any` JSON. Getting this
//! nesting wrong yields an empty/garbled designer on the client.
//!
//! All JSON numbers are encoded as `Any::Number` (f64) — never `BigInt` — to match
//! how the browser (which has only one number type) writes them, so the client
//! decodes them as plain numbers.

use std::sync::Arc;

use serde_json::Value;
use yrs::{Any, Array, ArrayPrelim, Doc, In, Map, MapPrelim, Transact};

/// Convert an arbitrary JSON value to a yrs `Any`, forcing every number to
/// `Any::Number` (f64) so the JS client decodes it as a plain number.
fn json_to_any(value: &Value) -> Any {
    match value {
        Value::Null => Any::Null,
        Value::Bool(b) => Any::Bool(*b),
        Value::Number(n) => Any::Number(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => Any::String(Arc::from(s.as_str())),
        Value::Array(arr) => Any::Array(arr.iter().map(json_to_any).collect()),
        Value::Object(obj) => Any::Map(Arc::new(
            obj.iter()
                .map(|(k, v)| (k.clone(), json_to_any(v)))
                .collect(),
        )),
    }
}

/// A leaf JSON value as a shared-type input.
fn any_in(value: &Value) -> In {
    In::Any(json_to_any(value))
}

/// A string leaf as a shared-type input (mirrors `ymap.set(key, string)`).
fn str_in(value: &str) -> In {
    In::Any(Any::String(Arc::from(value)))
}

/// Read a string field, defaulting to `""` (mirrors the `?? ''` fallbacks).
fn str_field(obj: &Value, key: &str) -> String {
    obj.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// Mirror of `blockToYMap`: a block as a nested `Y.Map`.
fn block_to_prelim(block: &Value) -> MapPrelim {
    let mut entries: Vec<(String, In)> = vec![
        ("id".to_string(), str_in(&str_field(block, "id"))),
        ("pageId".to_string(), str_in(&str_field(block, "pageId"))),
        ("name".to_string(), str_in(&str_field(block, "name"))),
        (
            "type".to_string(),
            str_in(
                block
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("standard"),
            ),
        ),
    ];

    // `questions`: Y.Array<string> of question ids.
    let question_ids: Vec<In> = block
        .get("questions")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().map(any_in).collect())
        .unwrap_or_default();
    entries.push((
        "questions".to_string(),
        In::Array(ArrayPrelim::from(question_ids)),
    ));

    // Optional fields — set only when present (mirrors the `if (block.x)` guards).
    for key in ["randomization", "loop", "conditions", "condition"] {
        if let Some(v) = block.get(key) {
            if !v.is_null() {
                entries.push((key.to_string(), any_in(v)));
            }
        }
    }

    MapPrelim::from_iter(entries)
}

/// Mirror of `pageToYMap`: a page as a nested `Y.Map`.
fn page_to_prelim(page: &Value) -> MapPrelim {
    let mut entries: Vec<(String, In)> = vec![
        ("id".to_string(), str_in(&str_field(page, "id"))),
        ("name".to_string(), str_in(&str_field(page, "name"))),
    ];

    let blocks: Vec<In> = page
        .get("blocks")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().map(|b| In::Map(block_to_prelim(b))).collect())
        .unwrap_or_default();
    entries.push(("blocks".to_string(), In::Array(ArrayPrelim::from(blocks))));

    for key in ["layout", "conditions", "script"] {
        if let Some(v) = page.get(key) {
            if !v.is_null() {
                entries.push((key.to_string(), any_in(v)));
            }
        }
    }

    MapPrelim::from_iter(entries)
}

/// Mirror of `questionToYMap` / `variableToYMap` / `flowToYMap`: a flat object
/// as a `Y.Map` whose entries are the object's fields stored as plain JSON.
fn object_to_prelim(obj: &Value) -> MapPrelim {
    let entries: Vec<(String, In)> = obj
        .as_object()
        .map(|map| map.iter().map(|(k, v)| (k.clone(), any_in(v))).collect())
        .unwrap_or_default();
    MapPrelim::from_iter(entries)
}

/// Seed an (empty) `Doc` from a `content` JSON projection, matching the client
/// `questionnaireToYDoc` layout so the two representations are interchangeable.
pub fn seed_doc_from_content(doc: &Doc, content: &Value) {
    // Root shared types must be obtained before opening the write transaction —
    // `get_or_insert_*` takes an implicit lock that would conflict with a held txn.
    let meta = doc.get_or_insert_map("meta");
    let pages = doc.get_or_insert_array("pages");
    let questions = doc.get_or_insert_map("questions");
    let variables = doc.get_or_insert_array("variables");
    let flow = doc.get_or_insert_array("flow");

    let mut txn = doc.transact_mut();

    // ── meta ────────────────────────────────────────────────────────────────
    meta.insert(&mut txn, "id", str_in(&str_field(content, "id")));
    meta.insert(&mut txn, "name", str_in(&str_field(content, "name")));
    meta.insert(
        &mut txn,
        "description",
        str_in(&str_field(content, "description")),
    );
    meta.insert(
        &mut txn,
        "version",
        str_in(
            content
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or("1.0.0"),
        ),
    );
    for (key, default) in [
        ("versionMajor", 1.0),
        ("versionMinor", 0.0),
        ("versionPatch", 0.0),
    ] {
        let n = content.get(key).and_then(Value::as_f64).unwrap_or(default);
        meta.insert(&mut txn, key, In::Any(Any::Number(n)));
    }
    meta.insert(
        &mut txn,
        "organizationId",
        str_in(&str_field(content, "organizationId")),
    );
    meta.insert(
        &mut txn,
        "projectId",
        str_in(&str_field(content, "projectId")),
    );
    meta.insert(&mut txn, "created", str_in(&str_field(content, "created")));
    meta.insert(
        &mut txn,
        "modified",
        str_in(&str_field(content, "modified")),
    );
    if let Some(settings) = content.get("settings") {
        if !settings.is_null() {
            meta.insert(&mut txn, "settings", any_in(settings));
        }
    }

    // ── pages (ordered) ───────────────────────────────────────────────────────
    if let Some(arr) = content.get("pages").and_then(Value::as_array) {
        for page in arr {
            pages.push_back(&mut txn, In::Map(page_to_prelim(page)));
        }
    }

    // ── questions (keyed by id) ────────────────────────────────────────────────
    if let Some(arr) = content.get("questions").and_then(Value::as_array) {
        for question in arr {
            let id = str_field(question, "id");
            if !id.is_empty() {
                questions.insert(&mut txn, id, In::Map(object_to_prelim(question)));
            }
        }
    }

    // ── variables (ordered) ────────────────────────────────────────────────────
    if let Some(arr) = content.get("variables").and_then(Value::as_array) {
        for variable in arr {
            variables.push_back(&mut txn, In::Map(object_to_prelim(variable)));
        }
    }

    // ── flow (ordered) ─────────────────────────────────────────────────────────
    if let Some(arr) = content.get("flow").and_then(Value::as_array) {
        for rule in arr {
            flow.push_back(&mut txn, In::Map(object_to_prelim(rule)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use yrs::updates::decoder::Decode;
    use yrs::{Out, ReadTxn};

    fn sample_content() -> Value {
        serde_json::json!({
            "id": "q1",
            "name": "Sample",
            "description": "",
            "version": "2.1.0",
            "versionMajor": 2,
            "versionMinor": 1,
            "versionPatch": 0,
            "settings": { "showProgressBar": true, "allowBackNavigation": false },
            "pages": [
                {
                    "id": "page_a",
                    "name": "Page 1",
                    "blocks": [
                        {
                            "id": "block_a",
                            "pageId": "page_a",
                            "name": "Block 1",
                            "type": "standard",
                            "questions": ["qq1", "qq2"]
                        }
                    ]
                }
            ],
            "questions": [
                { "id": "qq1", "text": "First", "type": "text-input", "order": 0 },
                { "id": "qq2", "text": "Second", "type": "single-choice", "order": 1 }
            ],
            "variables": [ { "id": "v1", "name": "score" } ],
            "flow": []
        })
    }

    #[test]
    fn seeds_pages_blocks_and_keyed_questions() {
        let doc = Doc::new();
        seed_doc_from_content(&doc, &sample_content());

        let txn = doc.transact();

        // pages -> one page -> its blocks -> block.questions is a Y.Array of ids
        let pages = txn.get_array("pages").expect("pages array");
        assert_eq!(pages.len(&txn), 1, "exactly one page (no duplication)");

        let page0 = match pages.get(&txn, 0) {
            Some(Out::YMap(m)) => m,
            other => panic!("page 0 must be a Y.Map, got {other:?}"),
        };
        assert_eq!(
            page0.get(&txn, "id").map(|v| v.to_string(&txn)),
            Some("page_a".to_string())
        );

        let blocks = match page0.get(&txn, "blocks") {
            Some(Out::YArray(a)) => a,
            other => panic!("blocks must be a Y.Array, got {other:?}"),
        };
        assert_eq!(blocks.len(&txn), 1);
        let block0 = match blocks.get(&txn, 0) {
            Some(Out::YMap(m)) => m,
            other => panic!("block 0 must be a Y.Map, got {other:?}"),
        };
        let block_qs = match block0.get(&txn, "questions") {
            Some(Out::YArray(a)) => a,
            other => panic!("block.questions must be a Y.Array, got {other:?}"),
        };
        assert_eq!(block_qs.len(&txn), 2, "two question ids preserved in order");

        // questions map is keyed by id
        let questions = txn.get_map("questions").expect("questions map");
        assert_eq!(questions.len(&txn), 2);
        assert!(matches!(questions.get(&txn, "qq1"), Some(Out::YMap(_))));
        assert!(matches!(questions.get(&txn, "qq2"), Some(Out::YMap(_))));

        // meta scalars
        let meta = txn.get_map("meta").expect("meta map");
        assert_eq!(
            meta.get(&txn, "name").map(|v| v.to_string(&txn)),
            Some("Sample".to_string())
        );
    }

    #[test]
    fn reencoding_the_seed_is_stable_and_nonempty() {
        let doc = Doc::new();
        seed_doc_from_content(&doc, &sample_content());
        let state = {
            let txn = doc.transact();
            txn.encode_state_as_update_v1(&yrs::StateVector::default())
        };
        assert!(
            !state.is_empty(),
            "seeded state encodes to a non-empty update"
        );

        // Applying the encoded state to a fresh doc reproduces the same page count
        // (idempotent round-trip — the property the corruption fix depends on).
        let doc2 = Doc::new();
        {
            let mut txn = doc2.transact_mut();
            let update = yrs::Update::decode_v1(&state).expect("decode");
            txn.apply_update(update).expect("apply");
        }
        let txn = doc2.transact();
        let pages = txn.get_array("pages").expect("pages array");
        assert_eq!(pages.len(&txn), 1);
    }
}
