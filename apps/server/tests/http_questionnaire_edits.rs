use axum::http::StatusCode;
use serde_json::{json, Value};

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

fn definition() -> Value {
    json!({
        "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
        "format": "qdesigner.questionnaire", "formatVersion": "1.0.0",
        "questionnaire": {"name": "Stable edit study", "version": "1.0.0"},
        "assets": {}, "variables": {}, "questions": {
            "a": {"type": "text-display", "display": {"content": "A"}},
            "b": {"type": "text-display", "display": {"content": "B"}},
            "c": {"type": "text-display", "display": {"content": "C"}}
        },
        "structure": {"pages": [
            {"id": "intro", "name": "Introduction", "blocks": [{"id": "main", "type": "standard", "questionIds": ["a", "b"]}]},
            {"id": "followup", "name": "Followup", "blocks": [{"id": "last", "type": "standard", "questionIds": ["c"]}]}
        ]},
        "flow": [], "rules": [], "settings": {"showProgressBar": true}, "translations": {}, "extensions": {}
    })
}

#[tokio::test]
async fn stable_id_batch_changes_content_order_and_references_in_one_revision() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let (status, created) = json_request(
        &app,
        "POST",
        &uri,
        Some(&owner.token),
        Some(&json!({
            "definition": definition().to_string(), "commit": true, "idempotencyKey": "create"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    let id = created["questionnaireId"].as_str().unwrap();
    let edits = json!([
        {"op": "replace", "path": "/questions/@a/display/content", "value": "A revised"},
        {"op": "add", "path": "/questions/@d", "value": {"type": "text-display", "display": {"content": "D"}}},
        {"op": "add", "path": "/pages/@intro/blocks/@main/questions/@d", "value": "d", "before": "b"},
        {"op": "move", "from": "/pages/@followup", "path": "/pages/@followup", "before": "intro"},
        {"op": "move", "from": "/pages/@intro/blocks/@main/questions/@b", "path": "/pages/@followup/blocks/@last/questions/@b", "before": "c"},
        {"op": "remove", "path": "/pages/@followup/blocks/@last/questions/@c"},
        {"op": "remove", "path": "/questions/@c"}
    ]);
    let mut input =
        json!({"edits": edits, "questionnaireId": id, "expectedRevision": 1, "commit": false});
    let (status, preview) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK, "stable edit preview: {preview:?}");
    assert_eq!(preview["valid"], true);
    assert_eq!(preview["committed"], false);
    assert_eq!(preview["beforeDigest"], created["digest"]);
    assert_ne!(preview["digest"], created["digest"]);
    let definition_uri = format!(
        "/api/projects/{}/questionnaires/{id}/definition",
        tenant.project_id
    );
    let (_, unchanged) = json_request(&app, "GET", &definition_uri, Some(&owner.token), None).await;
    assert_eq!(unchanged["digest"], created["digest"]);
    assert_eq!(unchanged["revision"], 1);
    input["commit"] = json!(true);
    input["idempotencyKey"] = json!("apply-batch");
    let (status, applied) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK, "stable edit commit: {applied:?}");
    assert_eq!(applied["revision"], 2);
    assert_eq!(applied["digest"], preview["digest"]);
    assert_eq!(applied["beforeDigest"], created["digest"]);
    assert_eq!(applied["diff"], preview["diff"]);
    let changes = applied["diff"]["entries"]
        .as_array()
        .expect("semantic diff");
    assert!(!changes.is_empty());
    assert!(changes.iter().any(|c| c["kind"] == "orderChanged"));
    assert!(changes.iter().any(|c| c["kind"] == "referencesChanged"));
    assert!(changes
        .iter()
        .all(|c| !c["summary"].as_str().unwrap().is_empty()));
    assert_eq!(applied["diff"]["truncated"], false);
    let document: Value = serde_json::from_str(applied["canonical"].as_str().unwrap()).unwrap();
    assert_eq!(
        document["questions"]["a"]["display"]["content"],
        "A revised"
    );
    assert!(document["questions"].get("c").is_none());
    assert!(document["questions"].get("d").is_some());
    assert_eq!(document["structure"]["pages"][0]["id"], "followup");
    assert_eq!(
        document["structure"]["pages"][0]["blocks"][0]["questionIds"],
        json!(["b"])
    );
    assert_eq!(
        document["structure"]["pages"][1]["blocks"][0]["questionIds"],
        json!(["a", "d"])
    );
    let (_, after) = json_request(&app, "GET", &definition_uri, Some(&owner.token), None).await;
    assert_eq!(after["canonical"], applied["canonical"]);
    let (status, retry) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(retry, applied);
    let (_, snapshots) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(snapshots.as_array().unwrap().len(), 1);
    let (_, timeline) = json_request(
        &app,
        "GET",
        &format!(
            "/api/organizations/{}/audit?action=questionnaire.definition_edited",
            tenant.org_id
        ),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(timeline["events"].as_array().unwrap().len(), 1);
    input["edits"][0]["value"] = json!("A different command cannot reuse this receipt");
    let (status, conflict) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(conflict["diagnostics"][0]["code"], "IDEMPOTENCY_CONFLICT");
}

#[tokio::test]
async fn invalid_batches_roll_back_every_edit_and_do_not_consume_the_retry_key() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let (_, created) = json_request(
        &app,
        "POST",
        &uri,
        Some(&owner.token),
        Some(&json!({
            "definition": definition().to_string(), "commit": true, "idempotencyKey": "create"
        })),
    )
    .await;
    let id = created["questionnaireId"].as_str().unwrap();
    for (invalid_edit, code) in [
        (
            json!({"op": "remove", "path": "/questions/@b"}),
            "QDEF_REFERENCE_NOT_FOUND",
        ),
        (
            json!({"op": "replace", "path": "/pages/@intro/blocks/@main/questions", "value": ["a", "a", "b"]}),
            "QDEF_DUPLICATE_REFERENCE",
        ),
        (
            json!({"op": "remove", "path": "/questions/@missing"}),
            "EDIT_TARGET_NOT_FOUND",
        ),
        (
            json!({"op": "replace", "path": "/pages/0/name", "value": "Position is not identity"}),
            "EDIT_PATH_INVALID",
        ),
        (
            json!({"op": "add", "path": "/questions/@a", "value": {"type": "text-display", "display": {"content": "Duplicate"}}}),
            "EDIT_ALREADY_EXISTS",
        ),
        (
            json!({"op": "replace", "path": "/pages/@intro/id", "value": "renamed"}),
            "EDIT_ID_MISMATCH",
        ),
        (
            json!({"op": "replace", "path": "/pages/@intro/@id", "value": "renamed"}),
            "EDIT_PATH_INVALID",
        ),
        (
            json!({"op": "move", "from": "/pages/@intro", "path": "/pages/@intro/blocks/@intro"}),
            "EDIT_CONFLICT",
        ),
        (
            json!({"op": "move", "from": "/pages/@intro", "path": "/pages/@intro", "before": "missing"}),
            "EDIT_BEFORE_NOT_FOUND",
        ),
        (
            json!({"op": "add", "path": "/questions/@a/config", "value": {"onEnter": "alert('unsafe')"}}),
            "UNSAFE_EXECUTABLE",
        ),
        (
            json!({"op": "add", "path": "/questions/@a/onEnter", "value": "alert('unsafe')"}),
            "UNSAFE_EXECUTABLE",
        ),
    ] {
        let input = json!({"edits": [
            {"op": "replace", "path": "/questions/@a/display/content", "value": "This first edit must also roll back"}, invalid_edit
        ], "questionnaireId": id, "expectedRevision": 1, "commit": true, "idempotencyKey": "retry-failed-batch"});
        let (status, rejected) =
            json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{code}: {rejected:?}"
        );
        assert_eq!(rejected["committed"], false);
        assert!(
            rejected["diagnostics"]
                .as_array()
                .unwrap()
                .iter()
                .any(|d| d["code"] == code),
            "{code}: {rejected:?}"
        );
        let (_, after) = json_request(
            &app,
            "GET",
            &format!(
                "/api/projects/{}/questionnaires/{id}/definition",
                tenant.project_id
            ),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(
            after["digest"], created["digest"],
            "{code} changed the draft"
        );
        assert_eq!(after["revision"], 1);
    }
    let (_, snapshots) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert!(snapshots.as_array().unwrap().is_empty());
    let mut valid = json!({"edits": [{"op": "replace", "path": "/questions/@a/display/content", "value": "Recovered"}],
        "questionnaireId": id, "expectedRevision": 1, "commit": true, "idempotencyKey": "retry-failed-batch"});
    let (first, second) = tokio::join!(
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&valid)),
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&valid)),
    );
    assert_eq!(first.0, StatusCode::OK, "{:?}", first.1);
    assert_eq!(first, second);
    assert_eq!(first.1["revision"], 2);
    valid["idempotencyKey"] = json!("new-stale-key");
    let (status, stale) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&valid)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(stale["revision"], 2);
    assert_eq!(stale["diagnostics"][0]["code"], "REVISION_CONFLICT");
    let (_, snapshots) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(snapshots.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn registry_identifiers_remain_data_in_edits_and_raw_duplicate_keys_are_rejected() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let (_, created) = json_request(
        &app,
        "POST",
        &uri,
        Some(&owner.token),
        Some(&json!({
            "definition": definition().to_string(), "commit": true, "idempotencyKey": "create"
        })),
    )
    .await;
    let id = created["questionnaireId"].as_str().unwrap();
    let mut questions = definition()["questions"].clone();
    questions["script"] =
        json!({"type": "text-display", "display": {"content": "The word script is an identifier"}});
    let (status, preview) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&json!({
        "edits": [{"op": "replace", "path": "/questions", "value": questions}], "questionnaireId": id, "expectedRevision": 1, "commit": false
    }))).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "An inert registry identifier is not a hook: {preview:?}"
    );
    assert_eq!(preview["valid"], true);

    let raw = format!(
        r#"{{"edits":[{{"op":"replace","path":"/questions/@a/display","value":{{"content":"<script>alert(1)</script>","content":"Hidden duplicate"}}}}],"questionnaireId":"{id}","expectedRevision":1,"commit":true,"idempotencyKey":"duplicates"}}"#
    );
    let request = common::json_req("POST", &uri, Some(&owner.token), Some(&json!({})))
        .map(|_| axum::body::Body::from(raw));
    let (status, rejected) = common::send(&app, request).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected:?}");
    assert_eq!(rejected["diagnostics"][0]["code"], "QDEF_DUPLICATE_KEY");
    let (_, after) = json_request(
        &app,
        "GET",
        &format!(
            "/api/projects/{}/questionnaires/{id}/definition",
            tenant.project_id
        ),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(after["digest"], created["digest"]);
    assert_eq!(after["revision"], 1);
}

#[tokio::test]
async fn escaped_identifiers_and_large_diffs_preserve_every_committed_change() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let mut source = definition();
    source["questions"]["part/~@one"] =
        json!({"type": "text-display", "display": {"content": "Original escaped identifier"}});
    for i in 0..110 {
        source["questions"][format!("extra-{i}")] =
            json!({"type": "text-display", "display": {"content": "Original"}});
    }
    let (status, created) = json_request(
        &app,
        "POST",
        &uri,
        Some(&owner.token),
        Some(&json!({
            "definition": source.to_string(), "commit": true, "idempotencyKey": "create"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    let id = created["questionnaireId"].as_str().unwrap();
    let mut edits = vec![
        json!({"op": "replace", "path": "/questions/@part~1~0@one/display/content", "value": "Escaped identity preserved"}),
    ];
    for i in 0..110 {
        edits.push(json!({"op": "replace", "path": format!("/questions/@extra-{i}/display/content"), "value": "A large but valid replacement. ".repeat(100)}));
    }
    let input = json!({"edits": edits, "questionnaireId": id, "expectedRevision": 1, "commit": true, "idempotencyKey": "large-diff"});
    let (status, applied) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK, "{applied:?}");
    assert_eq!(applied["revision"], 2);
    assert_eq!(applied["diff"]["totalChanges"], 111);
    assert_eq!(applied["diff"]["truncated"], true);
    assert!(applied["diff"]["entries"].as_array().unwrap().len() <= 100);
    assert!(serde_json::to_vec(&applied["diff"]).unwrap().len() <= 16_384);
    let (_, after) = json_request(
        &app,
        "GET",
        &format!(
            "/api/projects/{}/questionnaires/{id}/definition",
            tenant.project_id
        ),
        Some(&owner.token),
        None,
    )
    .await;
    let canonical: Value = serde_json::from_str(after["canonical"].as_str().unwrap()).unwrap();
    assert_eq!(
        canonical["questions"]["part/~@one"]["display"]["content"],
        "Escaped identity preserved"
    );
    assert_eq!(
        canonical["questions"]["extra-109"]["display"]["content"],
        "A large but valid replacement. ".repeat(100)
    );
    assert_eq!(after["digest"], applied["digest"]);
    let (_, retry) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(retry, applied);
}

#[tokio::test]
async fn edits_require_one_bounded_change_and_a_target_revision_before_any_write() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let (_, before) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{}/questionnaires", tenant.project_id),
        Some(&owner.token),
        None,
    )
    .await;
    let edit = json!({"op": "replace", "path": "/questionnaire/name", "value": "Changed"});
    for (mut input, code) in [
        (json!({}), "QDEF_CHANGE_REQUIRED"),
        (
            json!({"definition": definition().to_string(), "edits": [edit.clone()]}),
            "QDEF_CHANGE_REQUIRED",
        ),
        (json!({"edits": []}), "EDIT_BATCH_INVALID"),
        (
            json!({"edits": vec![edit.clone(); 129]}),
            "EDIT_BATCH_INVALID",
        ),
        (json!({"edits": [edit]}), "EXPECTED_REVISION_REQUIRED"),
    ] {
        input["commit"] = json!(true);
        input["idempotencyKey"] = json!("invalid-request");
        let (status, result) =
            json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{code}: {result:?}"
        );
        assert_eq!(result["diagnostics"][0]["code"], code);
        assert_eq!(result["committed"], false);
    }
    let (_, drafts) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{}/questionnaires", tenant.project_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(
        drafts, before,
        "Rejected edit requests leave the initial project drafts unchanged"
    );
}

#[tokio::test]
async fn importing_repeated_references_requires_unambiguous_ids_within_each_block() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let mut source = definition();
    source["structure"]["pages"][0]["blocks"][0]["questionIds"] = json!(["a", "a", "b"]);
    let mut input = json!({"definition": source.to_string(), "commit": true, "idempotencyKey": "unambiguous-references"});
    let (status, rejected) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected:?}");
    assert_eq!(
        rejected["diagnostics"][0]["code"],
        "QDEF_DUPLICATE_REFERENCE"
    );
    assert_eq!(rejected["committed"], false);
    source["structure"]["pages"][0]["blocks"][0]["questionIds"] = json!(["a", "b"]);
    source["structure"]["pages"][1]["blocks"][0]["questionIds"] = json!(["a", "c"]);
    input["definition"] = json!(source.to_string());
    let (status, created) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "Cross-block references remain valid: {created:?}"
    );
    assert_eq!(created["revision"], 1);
    let canonical: Value = serde_json::from_str(created["canonical"].as_str().unwrap()).unwrap();
    assert_eq!(
        canonical["structure"]["pages"][1]["blocks"][0]["questionIds"],
        json!(["a", "c"])
    );
}
