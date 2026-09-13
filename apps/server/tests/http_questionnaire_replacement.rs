use axum::http::StatusCode;
use serde_json::json;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

fn definition(name: &str) -> serde_json::Value {
    json!({
        "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
        "format": "qdesigner.questionnaire", "formatVersion": "1.0.0",
        "questionnaire": {"name": name, "description": "Original description", "version": "1.0.0", "defaultLocale": "en"},
        "assets": {}, "variables": {},
        "questions": {"welcome": {"type": "text-display", "required": false, "display": {"content": "Original welcome"}}},
        "structure": {"pages": [{"id": "intro", "blocks": [{"id": "copy", "type": "standard", "questionIds": ["welcome"]}]}]},
        "flow": [], "rules": [], "settings": {"showProgressBar": true}, "translations": {}, "extensions": {}
    })
}

#[tokio::test]
async fn replacing_the_expected_revision_preserves_the_complete_prior_snapshot() {
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
    let original = definition("Before replacement");
    let (status, created) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&json!({
        "definition": original.to_string(), "commit": true, "idempotencyKey": "create-before-replace"
    }))).await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    let id = created["questionnaireId"].as_str().unwrap();
    let questionnaire_uri = format!("/api/projects/{}/questionnaires/{id}", tenant.project_id);
    let (_, before) = json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;

    let mut replacement = definition("After replacement");
    replacement["questionnaire"]["version"] = json!("2.3.4");
    replacement["questionnaire"]["defaultLocale"] = json!("fr");
    replacement["questions"]["welcome"]["display"]["content"] = json!("Updated welcome");
    replacement["settings"]["showProgressBar"] = json!(false);
    let input = json!({"definition": replacement.to_string(), "commit": true,
        "questionnaireId": id, "expectedRevision": 1, "idempotencyKey": "replace-once"});
    let (status, replaced) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK, "{replaced:?}");
    assert_eq!(replaced["committed"], true);
    assert_eq!(replaced["questionnaireId"], id);
    assert_eq!(replaced["revision"], 2);
    assert_eq!(replaced["beforeDigest"], created["digest"]);
    assert_ne!(replaced["digest"], created["digest"]);

    let (status, versions) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let snapshots = versions.as_array().unwrap();
    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0]["version"], 1);
    assert_eq!(snapshots[0]["title"], before["name"]);
    assert_eq!(snapshots[0]["content"], before["content"]);
    assert_eq!(snapshots[0]["settings"], before["settings"]);
    assert_eq!(snapshots[0]["created_by"], owner.id.to_string());

    let (_, after) = json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;
    assert_eq!(after["name"], "After replacement");
    assert_eq!(after["status"], "draft");
    assert_eq!(after["version"], 2);
    assert_eq!(after["version_major"], 2);
    assert_eq!(after["version_minor"], 3);
    assert_eq!(after["version_patch"], 4);
    assert_eq!(after["settings"]["language"], "fr");
    assert_eq!(after["settings"]["showProgressBar"], false);
    let (_, exported) = json_request(
        &app,
        "GET",
        &format!("{questionnaire_uri}/definition"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(exported["canonical"], replaced["canonical"]);
    assert_eq!(exported["digest"], replaced["digest"]);

    // The retry resolves its original receipt before checking the now-advanced
    // revision. A different request must still respect that revision.
    let (status, replay) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(replay, replaced);
    let mut stale = input.clone();
    stale["idempotencyKey"] = json!("stale-replacement");
    let (status, conflict) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&stale)).await;
    assert_eq!(status, StatusCode::CONFLICT, "{conflict:?}");
    assert_eq!(conflict["revision"], 2);
    assert_eq!(conflict["committed"], false);
    assert!(conflict["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == "REVISION_CONFLICT"));

    let mut preview = input.clone();
    preview["commit"] = json!(false);
    preview["expectedRevision"] = json!(2);
    preview.as_object_mut().unwrap().remove("idempotencyKey");
    let (status, inspected) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&preview)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(inspected["valid"], true);
    assert_eq!(inspected["committed"], false);
    assert_eq!(inspected["beforeDigest"], replaced["digest"]);
    let (_, after_retries) =
        json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;
    let (_, after_versions) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(after_retries, after);
    assert_eq!(after_versions, versions);

    for epoch in [None, Some(0)] {
        let mut stale_save = json!({"name": before["name"], "content": before["content"], "settings": before["settings"]});
        if let Some(epoch) = epoch {
            stale_save["expected_collaboration_epoch"] = json!(epoch);
        }
        let (status, failure) = json_request(
            &app,
            "PATCH",
            &questionnaire_uri,
            Some(&owner.token),
            Some(&stale_save),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::CONFLICT,
            "A stale designer save was accepted: {failure:?}"
        );
    }
    let (_, unchanged) =
        json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;
    assert_eq!(unchanged, after);
    assert_eq!(unchanged["collaboration_epoch"], 1);
    let (status, saved) = json_request(
        &app,
        "PATCH",
        &questionnaire_uri,
        Some(&owner.token),
        Some(&json!({
            "expected_collaboration_epoch": 1, "name": "Edited after replacement"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved:?}");
    assert_eq!(saved["version"], 3);
    assert_eq!(saved["collaboration_epoch"], 1);
}

#[tokio::test]
async fn competing_replacements_have_one_winner_and_retries_preserve_its_receipt() {
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
    let (status, created) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&json!({
        "definition": definition("Race original").to_string(), "commit": true, "idempotencyKey": "create"
    }))).await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    let id = created["questionnaireId"].as_str().unwrap();
    let left = json!({"definition": definition("Left replacement").to_string(), "questionnaireId": id,
        "expectedRevision": 1, "commit": true, "idempotencyKey": "left"});
    let right = json!({"definition": definition("Right replacement").to_string(), "questionnaireId": id,
        "expectedRevision": 1, "commit": true, "idempotencyKey": "right"});
    let (a, b) = tokio::join!(
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&left)),
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&right)),
    );
    let ((won_status, won), (lost_status, lost), winner, mut loser) = if a.0 == StatusCode::OK {
        (a, b, left, right)
    } else {
        (b, a, right, left)
    };
    assert_eq!(won_status, StatusCode::OK, "{won:?}");
    assert_eq!(lost_status, StatusCode::CONFLICT, "{lost:?}");
    assert_eq!(lost["revision"], 2);
    assert_eq!(lost["diagnostics"][0]["code"], "REVISION_CONFLICT");
    let (a, b) = tokio::join!(
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&winner)),
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&winner)),
    );
    assert_eq!(a, (StatusCode::OK, won.clone()));
    assert_eq!(b, (StatusCode::OK, won.clone()));
    let (_, versions) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(versions.as_array().unwrap().len(), 1);
    let audit_uri = format!(
        "/api/organizations/{}/audit?action=questionnaire.definition_replaced",
        tenant.org_id
    );
    let (_, timeline) = json_request(&app, "GET", &audit_uri, Some(&owner.token), None).await;
    let events = timeline["events"].as_array().unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["resource_id"], id);
    assert_eq!(events[0]["actor_user_id"], owner.id.to_string());
    assert_eq!(events[0]["metadata"]["beforeDigest"], created["digest"]);
    assert_eq!(events[0]["metadata"]["afterDigest"], won["digest"]);
    assert_eq!(events[0]["metadata"]["collaborationEpoch"], 1);
    loser["expectedRevision"] = json!(2);
    let (status, next) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&loser)).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "The rejected request did not consume its key: {next:?}"
    );
    assert_eq!(next["revision"], 3);
    let (status, original_receipt) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&winner)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        original_receipt, won,
        "retry reports the original outcome after later replacements"
    );
}

#[tokio::test]
async fn replacement_requires_target_project_write_access_and_an_editable_revision() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let viewer = register_user(&app).await;
    let outsider = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let (status, membership) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{}/members", tenant.project_id),
        Some(&owner.token),
        Some(&json!({"email": viewer.email, "role": "viewer"})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{membership:?}");
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let (status, created) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&json!({
        "definition": definition("Protected draft").to_string(), "commit": true, "idempotencyKey": "create"
    }))).await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    let id = created["questionnaireId"].as_str().unwrap();
    let questionnaire_uri = format!("/api/projects/{}/questionnaires/{id}", tenant.project_id);
    let (_, before) = json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;
    let input = json!({"definition": definition("Unauthorized replacement").to_string(), "questionnaireId": id,
        "expectedRevision": 1, "commit": true, "idempotencyKey": "replace"});
    for token in [&viewer.token, &outsider.token] {
        let (status, failure) = json_request(&app, "POST", &uri, Some(token), Some(&input)).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{failure:?}");
    }
    for expected in [json!(null), json!(0)] {
        let mut invalid = input.clone();
        invalid["expectedRevision"] = expected;
        let (status, failure) =
            json_request(&app, "POST", &uri, Some(&owner.token), Some(&invalid)).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{failure:?}");
        assert_eq!(
            failure["diagnostics"][0]["code"],
            "EXPECTED_REVISION_REQUIRED"
        );
    }
    let elsewhere = provision_tenant(&app, &owner.token).await;
    let (status, failure) = json_request(
        &app,
        "POST",
        &format!(
            "/api/projects/{}/questionnaire-definitions/apply",
            elsewhere.project_id
        ),
        Some(&owner.token),
        Some(&input),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{failure:?}");
    let (_, after) = json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;
    assert_eq!(after, before);
    let (status, published) = json_request(
        &app,
        "POST",
        &format!("{questionnaire_uri}/publish"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{published:?}");
    let (status, rejected) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::CONFLICT, "{rejected:?}");
    assert_eq!(rejected["diagnostics"][0]["code"], "QDEF_TARGET_NOT_DRAFT");
}

#[tokio::test]
async fn replacement_audit_failure_rolls_back_definition_snapshot_generation_and_receipt() {
    use futures_util::FutureExt;
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let list_uri = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let audit_uri = format!(
        "/api/organizations/{}/audit?action=questionnaire.definition_replaced",
        tenant.org_id
    );
    let (status, created) = json_request(&app, "POST", &uri, Some(&user.token), Some(&json!({
        "definition": definition("Before failed replacement").to_string(), "commit": true, "idempotencyKey": "create"
    }))).await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    let id = created["questionnaireId"].as_str().unwrap();
    let questionnaire_uri = format!("/api/projects/{}/questionnaires/{id}", tenant.project_id);
    let (_, native) = json_request(&app, "GET", &questionnaire_uri, Some(&user.token), None).await;
    let mut content = native["content"].clone();
    content["variables"] =
        json!([{"id": "score", "name": "score", "type": "number", "formula": "1"}]);
    let (status, saved) = json_request(
        &app,
        "PATCH",
        &questionnaire_uri,
        Some(&user.token),
        Some(&json!({"content": content})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved:?}");
    let before_projections = stored_variable_projections(id).await;
    assert_eq!(before_projections.len(), 1);
    let versions_uri = format!("/api/questionnaires/{id}/versions");
    let (_, before_versions) =
        json_request(&app, "GET", &versions_uri, Some(&user.token), None).await;
    let input = json!({"definition": definition("After failed replacement").to_string(), "questionnaireId": id,
        "expectedRevision": 2, "commit": true, "idempotencyKey": "retry-after-audit-failure"});
    let (_, before) = json_request(&app, "GET", &list_uri, Some(&user.token), None).await;

    // Inject a repository failure scoped to this synthetic actor. Other tests'
    // audits remain unaffected. Assertions observe the production HTTP interfaces.
    let pool = common::fixture_pool().await.expect("test database");
    let hook = format!("qdef_audit_failure_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(&format!(
        "CREATE FUNCTION public.{hook}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
         IF NEW.actor_user_id = '{}'::uuid AND NEW.action = 'questionnaire.definition_replaced'
         THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$",
        user.id
    ))
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(&format!("CREATE TRIGGER {hook} BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.{hook}()"))
        .execute(&pool).await.unwrap();
    let outcome = std::panic::AssertUnwindSafe(async {
        let (status, _) = json_request(&app, "POST", &uri, Some(&user.token), Some(&input)).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        let (_, after) = json_request(&app, "GET", &list_uri, Some(&user.token), None).await;
        assert_eq!(
            after, before,
            "failed replacement leaves definition and generation unchanged"
        );
        let (_, versions) = json_request(&app, "GET", &versions_uri, Some(&user.token), None).await;
        assert_eq!(
            versions, before_versions,
            "failed replacement leaves no snapshot"
        );
        assert_eq!(
            stored_variable_projections(id).await,
            before_projections,
            "failed replacement restores the prior variable projection"
        );
        let (_, timeline) = json_request(&app, "GET", &audit_uri, Some(&user.token), None).await;
        assert!(timeline["events"].as_array().unwrap().is_empty());
    })
    .catch_unwind()
    .await;
    sqlx::query(&format!("DROP TRIGGER {hook} ON public.audit_events"))
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(&format!("DROP FUNCTION public.{hook}()"))
        .execute(&pool)
        .await
        .unwrap();
    if let Err(panic) = outcome {
        std::panic::resume_unwind(panic);
    }

    let (status, retried) = json_request(&app, "POST", &uri, Some(&user.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK, "retry: {retried:?}");
    assert_eq!(retried["committed"], true);
    assert_eq!(retried["revision"], 3);
    assert!(stored_variable_projections(id).await.is_empty());
    let (_, timeline) = json_request(&app, "GET", &audit_uri, Some(&user.token), None).await;
    assert_eq!(timeline["events"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn a_native_draft_outside_export_capabilities_can_be_replaced_without_losing_its_snapshot() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let create_uri = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let (status, before) = json_request(&app, "POST", &create_uri, Some(&owner.token), Some(&json!({
        "name": "Existing native form", "description": "Preserve all historical behavior",
        "content": {"pages": [{"id": "page", "blocks": [{"id": "block", "type": "standard", "questions": ["choice"]}]}],
            "questions": [{"id": "choice", "type": "multiple-choice", "required": true,
                "display": {"prompt": "Choose an answer"}, "config": {"options": [{"id": "yes", "label": "Yes", "value": "yes"}]}}], "variables": [{"id": "score", "name": "score", "type": "number", "formula": "1"}], "flow": []},
        "settings": {"showProgressBar": true, "language": "de"}
    }))).await;
    assert_eq!(status, StatusCode::CREATED, "{before:?}");
    let id = before["id"].as_str().unwrap();
    let historical_projections = stored_variable_projections(id).await;
    assert_eq!(historical_projections.len(), 1);
    let (status, before) = json_request(
        &app,
        "POST",
        &format!("{create_uri}/{id}/bump-version"),
        Some(&owner.token),
        Some(&json!({"bump_type": "minor"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{before:?}");
    assert_eq!(stored_variable_projections(id).await.len(), 2);
    let mut incoming = definition("New portable draft");
    incoming["questionnaire"]["version"] = json!("1.1.0");
    let input = json!({"definition": incoming.to_string(), "questionnaireId": id,
        "expectedRevision": before["version"], "commit": true, "idempotencyKey": "replace-native"});
    let (status, replaced) = json_request(
        &app,
        "POST",
        &format!(
            "/api/projects/{}/questionnaire-definitions/apply",
            tenant.project_id
        ),
        Some(&owner.token),
        Some(&input),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "The prior definition need not be exportable to snapshot it: {replaced:?}"
    );
    assert_eq!(replaced["revision"], 3);
    assert_eq!(
        stored_variable_projections(id).await,
        historical_projections,
        "Remove only destination-version projections; preserve historical versions"
    );
    let (_, versions) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{id}/versions"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(versions.as_array().unwrap().len(), 2);
    assert_eq!(versions[0]["content"], before["content"]);
    assert_eq!(versions[0]["settings"], before["settings"]);
    assert_eq!(versions[0]["title"], before["name"]);
    assert_eq!(versions[0]["description"], before["description"]);
    let (status, after) = json_request(
        &app,
        "GET",
        &format!("{create_uri}/{id}/definition"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(after["digest"], replaced["digest"]);
}

// HTTP writes are verified against their durable projection, including identities
// and timestamps, so both stale rows and destructive historical rewrites fail.
async fn stored_variable_projections(id: &str) -> Vec<serde_json::Value> {
    let pool = common::fixture_pool().await.expect("test database");
    sqlx::query_scalar("SELECT to_jsonb(v) FROM questionnaire_variable_definitions v WHERE questionnaire_id=$1 ORDER BY version_major,version_minor,version_patch,variable_name")
        .bind(uuid::Uuid::parse_str(id).unwrap()).fetch_all(&pool).await.unwrap()
}
