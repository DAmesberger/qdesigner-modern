use axum::http::StatusCode;

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

fn text_definition() -> serde_json::Value {
    serde_json::json!({
        "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
        "format": "qdesigner.questionnaire", "formatVersion": "1.0.0",
        "questionnaire": {"name": "Imported study", "version": "1.0.0"},
        "assets": {}, "variables": {}, "questions": {
            "welcome": {"type": "text-display", "required": false, "display": {"content": "Welcome."}}
        },
        "structure": {"pages": [{"id": "intro", "blocks": [
            {"id": "copy", "type": "standard", "questionIds": ["welcome"]}
        ]}]},
        "flow": [], "rules": [], "settings": {}, "translations": {}, "extensions": {}
    })
}

#[tokio::test]
async fn import_requires_project_write_permission_and_rejects_unsafe_commits_without_writes() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let viewer = register_user(&app).await;
    let outsider = register_user(&app).await;
    let (status, membership) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{}/members", tenant.project_id),
        Some(&owner.token),
        Some(&serde_json::json!({"email": viewer.email, "role": "viewer"})),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "viewer membership: {membership:?}"
    );
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let list_uri = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let (_, before) = json_request(&app, "GET", &list_uri, Some(&owner.token), None).await;
    let input = serde_json::json!({"definition": text_definition().to_string(), "commit": true, "idempotencyKey": "write-permission"});
    for (token, expected) in [
        (None, StatusCode::UNAUTHORIZED),
        (Some(viewer.token.as_str()), StatusCode::FORBIDDEN),
        (Some(outsider.token.as_str()), StatusCode::FORBIDDEN),
    ] {
        let (status, _) = json_request(&app, "POST", &uri, token, Some(&input)).await;
        assert_eq!(status, expected);
    }

    let mut unsafe_definition = text_definition();
    unsafe_definition["settings"]["global_scripts"] =
        serde_json::json!(["globalThis.fetch('/api/private')"]);
    let unsafe_input = serde_json::json!({"definition": unsafe_definition.to_string(), "commit": true, "idempotencyKey": "write-permission"});
    let (status, result) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&unsafe_input)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(result["committed"], false);
    assert!(result["canonical"].is_null());
    assert!(result["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == "UNSAFE_EXECUTABLE" && d["path"] == "/settings/global_scripts"));
    let (_, after) = json_request(&app, "GET", &list_uri, Some(&owner.token), None).await;
    assert_eq!(after, before);
    let (_, timeline) = json_request(
        &app,
        "GET",
        &format!(
            "/api/organizations/{}/audit?action=questionnaire.definition_imported",
            tenant.org_id
        ),
        Some(&owner.token),
        None,
    )
    .await;
    assert!(timeline["events"].as_array().unwrap().is_empty());
    let (status, result) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "rejected input must not reserve the key: {result:?}"
    );
    assert_eq!(result["committed"], true);
}

#[tokio::test]
async fn an_import_key_requires_the_same_canonical_definition_and_keeps_its_original_receipt() {
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
    let input = serde_json::json!({"definition": text_definition().to_string(), "commit": true, "idempotencyKey": "immutable-receipt"});
    let (_, first) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(first["committed"], true);
    let mut changed = text_definition();
    changed["questionnaire"]["name"] = serde_json::json!("Different import");
    let changed_input = serde_json::json!({"definition": changed.to_string(), "commit": true, "idempotencyKey": "immutable-receipt"});
    let (status, conflict) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&changed_input)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(conflict["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == "IDEMPOTENCY_CONFLICT"));
    let questionnaire_uri = format!(
        "/api/projects/{}/questionnaires/{}",
        tenant.project_id,
        first["questionnaireId"].as_str().unwrap()
    );
    let (status, updated) = json_request(
        &app,
        "PATCH",
        &questionnaire_uri,
        Some(&owner.token),
        Some(&serde_json::json!({"name": "Edited after import"})),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{updated:?}");
    let equivalent = serde_json::json!({"definition": serde_json::to_string_pretty(&text_definition()).unwrap(), "commit": true, "idempotencyKey": "immutable-receipt"});
    let (status, replay) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&equivalent)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(replay, first);
    let (_, after_retry) =
        json_request(&app, "GET", &questionnaire_uri, Some(&owner.token), None).await;
    assert_eq!(
        after_retry, updated,
        "Retry must return its receipt without overwriting later edits"
    );
    let (_, listed) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{}/questionnaires", tenant.project_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert!(!listed
        .as_array()
        .unwrap()
        .iter()
        .any(|q| q["name"] == "Different import"));
}

#[tokio::test]
async fn concurrent_import_retries_share_one_receipt_and_one_attributed_audit_event() {
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
    let input = serde_json::json!({"definition": text_definition().to_string(), "commit": true, "idempotencyKey": "concurrent-import"});
    let (first, second) = tokio::join!(
        json_request(&app, "POST", &uri, Some(&user.token), Some(&input)),
        json_request(&app, "POST", &uri, Some(&user.token), Some(&input)),
    );
    assert_eq!(first.0, StatusCode::OK, "first import: {:?}", first.1);
    assert_eq!(second.0, StatusCode::OK, "second import: {:?}", second.1);
    assert_eq!(first.1, second.1);
    assert_eq!(first.1["committed"], true);
    let (_, timeline) = json_request(
        &app,
        "GET",
        &format!(
            "/api/organizations/{}/audit?action=questionnaire.definition_imported",
            tenant.org_id
        ),
        Some(&user.token),
        None,
    )
    .await;
    let events = timeline["events"].as_array().expect("audit timeline");
    assert_eq!(events.len(), 1, "retries append exactly one audit event");
    assert_eq!(events[0]["actor_user_id"], user.id.to_string());
    assert_eq!(events[0]["resource_id"], first.1["questionnaireId"]);
    assert_eq!(events[0]["metadata"]["afterDigest"], first.1["digest"]);
    assert_eq!(events[0]["metadata"]["revision"], first.1["revision"]);
}

#[tokio::test]
async fn a_name_collision_returns_repairable_diagnostics_without_consuming_the_import_key() {
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
    let input = serde_json::json!({"definition": text_definition().to_string(), "commit": true, "idempotencyKey": "first-import"});
    let (status, _) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&input)).await;
    assert_eq!(status, StatusCode::OK);
    let mut collision = input.clone();
    collision["idempotencyKey"] = serde_json::json!("second-import");
    let (status, rejected) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&collision)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(rejected["committed"], false);
    assert!(rejected["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["code"] == "QDEF_NAME_CONFLICT" && d["path"] == "/questionnaire/name"));
    let mut renamed = text_definition();
    renamed["questionnaire"]["name"] = serde_json::json!("Imported copy");
    collision["definition"] = serde_json::json!(renamed.to_string());
    let (status, created) =
        json_request(&app, "POST", &uri, Some(&owner.token), Some(&collision)).await;
    assert_eq!(status, StatusCode::OK, "{created:?}");
    assert_eq!(created["committed"], true);
}

#[tokio::test]
async fn audit_failure_rolls_back_the_draft_and_receipt_so_the_same_request_can_retry() {
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
        "/api/organizations/{}/audit?action=questionnaire.definition_imported",
        tenant.org_id
    );
    let input = serde_json::json!({"definition": text_definition().to_string(), "commit": true, "idempotencyKey": "retry-after-audit-failure"});
    let (_, before) = json_request(&app, "GET", &list_uri, Some(&user.token), None).await;

    // Inject a repository failure scoped to this synthetic actor. Other tests'
    // audits remain unaffected. Assertions observe the production HTTP interfaces.
    let pool = common::fixture_pool().await.expect("test database");
    let hook = format!("qdef_audit_failure_{}", uuid::Uuid::new_v4().simple());
    sqlx::query(&format!(
        "CREATE FUNCTION public.{hook}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
         IF NEW.actor_user_id = '{}'::uuid AND NEW.action = 'questionnaire.definition_imported'
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
        assert_eq!(after, before, "failed import leaves no draft");
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
    let (_, timeline) = json_request(&app, "GET", &audit_uri, Some(&user.token), None).await;
    assert_eq!(timeline["events"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn a_text_definition_creates_one_draft_across_retries_and_exports_identically() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let project = tenant.project_id;
    let definition = serde_json::json!({
        "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
        "format": "qdesigner.questionnaire", "formatVersion": "1.0.0",
        "questionnaire": {"name": "Imported study", "description": "Portable copy", "version": "2.3.4", "defaultLocale": "de"},
        "assets": {}, "variables": {}, "questions": {
            "welcome": {"type": "text-display", "required": false, "display": {"content": "Welcome."}}
        },
        "structure": {"pages": [{"id": "intro", "blocks": [
            {"id": "copy", "type": "standard", "questionIds": ["welcome"]}
        ]}]},
        "flow": [], "rules": [], "settings": {"showProgressBar": true},
        "translations": {}, "extensions": {}
    }).to_string();
    let (_, inspected) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project}/questionnaire-definitions/dry-run"),
        Some(&user.token),
        Some(&serde_json::json!({"definition": definition})),
    )
    .await;
    assert_eq!(inspected["valid"], true, "inspect: {inspected:?}");

    let input = serde_json::json!({"definition": definition, "commit": true, "idempotencyKey": "import-text-once"});
    let mut first = None;
    for _ in 0..2 {
        let (status, result) = json_request(
            &app,
            "POST",
            &format!("/api/projects/{project}/questionnaire-definitions/apply"),
            Some(&user.token),
            Some(&input),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "import: {result:?}");
        assert_eq!(result["committed"], true);
        assert_eq!(result["valid"], true);
        assert_eq!(result["revision"], 1);
        assert_eq!(result["canonical"], inspected["canonical"]);
        assert_eq!(result["digest"], inspected["digest"]);
        if let Some(expected) = &first {
            assert_eq!(&result, expected);
        } else {
            first = Some(result);
        }
    }
    let result = first.unwrap();
    let id = result["questionnaireId"]
        .as_str()
        .expect("committed identity");
    let uri = format!("/api/projects/{project}/questionnaires/{id}");
    let (status, stored) = json_request(&app, "GET", &uri, Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(stored["status"], "draft");
    assert_eq!(stored["version_major"], 2);
    assert_eq!(stored["version_minor"], 3);
    assert_eq!(stored["version_patch"], 4);
    assert_eq!(stored["settings"]["language"], "de");
    let (status, exported) = json_request(
        &app,
        "GET",
        &format!("{uri}/definition"),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "read imported definition: {exported:?}"
    );
    assert_eq!(exported["canonical"], inspected["canonical"]);
    assert_eq!(exported["digest"], inspected["digest"]);
    let (_, listed) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{project}/questionnaires"),
        Some(&user.token),
        None,
    )
    .await;
    let imported = listed
        .as_array()
        .expect("questionnaire list")
        .iter()
        .filter(|q| q["name"] == "Imported study")
        .count();
    assert_eq!(imported, 1, "retry must not create another Questionnaire");
}

#[tokio::test]
async fn authorized_export_and_dry_run_round_trip_without_writing_questionnaire_state() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable (set REQUIRE_DB=1 to hard-fail)");
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let project_id = tenant.project_id;
    let questionnaire_id = tenant.questionnaire_id;
    let questionnaire_uri = format!("/api/projects/{project_id}/questionnaires/{questionnaire_id}");

    let text_content = serde_json::json!({
        "questions": [{
            "id": "welcome",
            "type": "text-display",
            "order": 0,
            "required": false,
            "display": { "content": "Welcome." }
        }],
        "pages": [{
            "id": "intro",
            "name": "Introduction",
            "blocks": [{
                "id": "copy",
                "pageId": "intro",
                "type": "standard",
                "questions": ["welcome"]
            }]
        }]
    });
    let settings = serde_json::json!({
        "allowBackNavigation": false,
        "showProgressBar": true
    });
    let (status, updated) = json_request(
        &app,
        "PATCH",
        &questionnaire_uri,
        Some(&user.token),
        Some(&serde_json::json!({ "content": text_content, "settings": settings })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "seed text Questionnaire: {updated:?}"
    );

    let (status, before) =
        json_request(&app, "GET", &questionnaire_uri, Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK, "read before dry run: {before:?}");

    let (status, exported) = json_request(
        &app,
        "GET",
        &format!("{questionnaire_uri}/definition"),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "definition export: {exported:?}");
    let canonical = exported["canonical"].as_str().expect("canonical string");
    serde_json::from_str::<serde_json::Value>(canonical).expect("exported canonical JSON");

    let outsider = register_user(&app).await;
    let (status, denied) = json_request(
        &app,
        "GET",
        &format!("{questionnaire_uri}/definition"),
        Some(&outsider.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "outsider export: {denied:?}");
    let (status, denied) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaire-definitions/dry-run"),
        Some(&outsider.token),
        Some(&serde_json::json!({ "definition": canonical })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "outsider dry run: {denied:?}"
    );

    let (status, inspected) = json_request(
        &app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaire-definitions/dry-run"),
        Some(&user.token),
        Some(&serde_json::json!({ "definition": canonical })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "definition dry run: {inspected:?}");
    assert_eq!(inspected["valid"], true);
    assert_eq!(inspected["committed"], false);
    assert_eq!(inspected["canonical"], exported["canonical"]);
    assert_eq!(inspected["digest"], exported["digest"]);

    let (status, after) =
        json_request(&app, "GET", &questionnaire_uri, Some(&user.token), None).await;
    assert_eq!(status, StatusCode::OK, "read after dry run: {after:?}");
    assert_eq!(after, before, "dry run must not mutate Questionnaire state");
}
