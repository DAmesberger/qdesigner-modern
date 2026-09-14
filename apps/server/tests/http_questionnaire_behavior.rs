use axum::http::StatusCode;
use serde_json::{json, Value};

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

#[path = "fixtures/behavior_cases.rs"]
mod behavior_cases;

#[tokio::test]
async fn preserved_score_objects_support_filtered_and_dotted_server_aggregates() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let collection = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let mut declarations = [
        ("root", "score.wellbeing", json!({})),
        ("filtered", "score.wellbeing", json!({"where":[{"var":"score.wellbeing","op":"gte","value":15}]})),
        ("field", "score.wellbeing.value", json!({})),
        ("normed", "score.wellbeing.tScore", json!({})),
        ("timingFiltered", "elapsed", json!({"where":[{"var":"elapsed","op":"gte","value":1500}]})),
    ].into_iter().map(|(name,key,dataset)| json!({"id":name,"name":name,"type":"object","scope":"global","server":{"source":"variable","key":key,"minN":1,"dataset":dataset}})).collect::<Vec<_>>();
    declarations.push(json!({"id":"elapsed","name":"elapsed","type":"time","scope":"global"}));
    let (status, created) = json_request(&app,"POST",&collection,Some(&owner.token),Some(&json!({"name":"Score aggregate study","content":{"pages":[],"questions":[],"flow":[],"variables":declarations}}))).await;
    assert_eq!(status, StatusCode::CREATED, "{created:?}");
    let qid = created["id"].as_str().unwrap();
    let (status, published) = json_request(
        &app,
        "POST",
        &format!("{collection}/{qid}/publish"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{published:?}");
    let mut session_ids = Vec::new();
    for value in [10, 20] {
        let (status, session) = json_request(
            &app,
            "POST",
            "/api/sessions",
            None,
            Some(&json!({"questionnaire_id":qid})),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "{session:?}");
        let sid = session["id"].as_str().unwrap();
        session_ids.push(sid.to_owned());
        let score = json!({"value":value,"tScore":value+40,"itemsAnswered":2,"itemsExpected":2});
        for _ in 0..2 {
            let (status,synced)=json_request(&app,"POST",&format!("/api/sessions/{sid}/sync"),None,Some(&json!({"variables":[{"variable_name":"score.wellbeing","variable_value":score},{"variable_name":"elapsed","variable_value":value*100}],"responses":[],"events":[],"status":"completed"}))).await;
            assert_eq!(status, StatusCode::OK, "{synced:?}");
        }
        let (_, stored) = json_request(
            &app,
            "GET",
            &format!("/api/sessions/{sid}/variables"),
            Some(&owner.token),
            None,
        )
        .await;
        let rows = stored.as_array().unwrap();
        assert_eq!(
            rows.len(),
            2,
            "Derived index fields must not become extra participant values"
        );
        assert_eq!(
            rows.iter()
                .find(|v| v["variable_name"] == "score.wellbeing")
                .unwrap()["variable_value"],
            score
        );
        assert_eq!(
            rows.iter()
                .find(|v| v["variable_name"] == "elapsed")
                .unwrap()["variable_value"],
            value * 100
        );
    }
    let (status, result) = json_request(
        &app,
        "GET",
        &format!("/api/questionnaires/{qid}/server-variables"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{result:?}");
    for (name, count, mean) in [
        ("root", 2, 15.0),
        ("filtered", 1, 20.0),
        ("field", 2, 15.0),
        ("normed", 2, 55.0),
        ("timingFiltered", 1, 2000.0),
    ] {
        let output = result["variables"]
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["name"] == name)
            .unwrap();
        assert_eq!(output["sample_count"], count, "{name}: {output:?}");
        assert_eq!(output["stats"]["mean"], mean, "{name}: {output:?}");
    }
    // A correction removes tScore; stale derived rows must not keep contributing.
    let sid = &session_ids[0];
    let (status, synced) = json_request(&app,"POST",&format!("/api/sessions/{sid}/sync"),None,Some(&json!({"variables":[{"variable_name":"score.wellbeing","variable_value":{"value":5}}],"responses":[],"events":[]}))).await;
    assert_eq!(status, StatusCode::OK, "{synced:?}");
    // Researcher aggregates read current projections. Participant snapshots have
    // the documented five-minute recalculation cadence and can still be cached.
    for (key, count, mean) in [
        ("score.wellbeing", 2, 12.5),
        ("score.wellbeing.value", 2, 12.5),
        ("score.wellbeing.tScore", 1, 60.0),
    ] {
        let (status, output) = json_request(
            &app,
            "GET",
            &format!("/api/sessions/aggregate?questionnaire_id={qid}&source=variable&key={key}"),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{output:?}");
        assert_eq!(output["stats"]["sample_count"], count, "{key}: {output:?}");
        assert_eq!(output["stats"]["mean"], mean, "{key}: {output:?}");
    }
    // Root/field syncs may overlap. An exact participant variable must retain
    // precedence over a derived index field regardless of commit order.
    let sync_uri = format!("/api/sessions/{sid}/sync");
    let root_update = json!({"variables":[{"variable_name":"score.wellbeing","variable_value":{"value":3}}],"responses":[],"events":[]});
    let field_update = json!({"variables":[{"variable_name":"score.wellbeing.value","variable_value":99}],"responses":[],"events":[]});
    let (root_result, field_result) = tokio::join!(
        json_request(&app, "POST", &sync_uri, None, Some(&root_update)),
        json_request(&app, "POST", &sync_uri, None, Some(&field_update))
    );
    assert_eq!(root_result.0, StatusCode::OK, "{:?}", root_result.1);
    assert_eq!(field_result.0, StatusCode::OK, "{:?}", field_result.1);
    let (_,output)=json_request(&app,"GET",&format!("/api/sessions/aggregate?questionnaire_id={qid}&source=variable&key=score.wellbeing.value"),Some(&owner.token),None).await;
    assert_eq!(output["stats"]["mean"], 59.5, "{output:?}");
}

#[tokio::test]
async fn self_binding_cannot_publish_with_another_authorized_questionnaire_as_its_target() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let collection = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let (status, created) = json_request(&app, "POST", &collection, Some(&owner.token), Some(&json!({
        "name":"Misbound self draft", "content":{"pages":[],"variables":[],"flow":[],"questions":[{
            "id":"feedback", "type":"statistical-feedback", "config":{"sourceMode":"cohort","dataSource":{
                "questionnaireBinding":"self", "questionnaireId":tenant.questionnaire_id, "source":"response", "key":"score"
            }}
        }]}
    }))).await;
    assert_eq!(status, StatusCode::CREATED, "{created:?}");
    let uri = format!("{collection}/{}", created["id"].as_str().unwrap());
    let (status, rejected) = json_request(
        &app,
        "POST",
        &format!("{uri}/publish"),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected:?}");
    assert!(
        rejected
            .to_string()
            .contains("QDEF_SOURCE_BINDING_CONFLICT"),
        "{rejected:?}"
    );
    let (_, after) = json_request(&app, "GET", &uri, Some(&owner.token), None).await;
    assert_eq!(created, after);
}

#[tokio::test]
async fn behavioral_import_projects_variables_and_reexports_without_semantic_drift() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let pool = state.pool.clone();
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    for (case_index, (name, document)) in behavior_cases::cases().into_iter().enumerate() {
        let uri = format!(
            "/api/projects/{}/questionnaire-definitions/apply",
            tenant.project_id
        );
        let (status, imported) = json_request(
        &app,
        "POST",
        &uri,
        Some(&owner.token),
        Some(&json!({
            "definition": document.to_string(), "commit": true, "idempotencyKey": format!("behavior-import-{case_index}")
        })),
    )
    .await;
        assert_eq!(status, StatusCode::OK, "{name}: {imported:?}");
        let id = imported["questionnaireId"].as_str().unwrap();
        let (status, exported) = json_request(
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
        assert_eq!(status, StatusCode::OK, "{exported:?}");
        assert_eq!(exported["canonical"], imported["canonical"]);
        assert_eq!(exported["digest"], imported["digest"]);
        let canonical: Value =
            serde_json::from_str(exported["canonical"].as_str().unwrap()).unwrap();
        assert_eq!(canonical, document);
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM questionnaire_variable_definitions WHERE questionnaire_id = $1",
        )
        .bind(uuid::Uuid::parse_str(id).unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            count,
            document["variables"].as_object().unwrap().len() as i64
        );
    }
}

#[tokio::test]
async fn required_unknown_extensions_block_both_native_publication_routes() {
    for method in ["POST", "PATCH"] {
        let Some(state) = build_test_state().await else {
            return;
        };
        let app = test_app(state);
        let owner = register_user(&app).await;
        let tenant = provision_tenant(&app, &owner.token).await;
        let collection = format!("/api/projects/{}/questionnaires", tenant.project_id);
        let (status, created)=json_request(&app,"POST",&collection,Some(&owner.token),Some(&json!({
            "name":"Required extension draft", "content":{"questions":[],"pages":[],"variables":[],"flow":[],"extensions":{"org.example.unsupported":{"required":true,"data":{}}}}
        }))).await;
        assert_eq!(status, StatusCode::CREATED, "{created:?}");
        let uri = format!("{collection}/{}", created["id"].as_str().unwrap());
        let publish_uri = if method == "POST" {
            format!("{uri}/publish")
        } else {
            uri.clone()
        };
        let publish_body = json!({"status":"published"});
        let (status, rejected) = json_request(
            &app,
            method,
            &publish_uri,
            Some(&owner.token),
            if method == "PATCH" {
                Some(&publish_body)
            } else {
                None
            },
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{method}: {rejected:?}"
        );
        assert!(
            rejected.to_string().contains("QDEF_REQUIRED_EXTENSION"),
            "{rejected:?}"
        );
        let (status, after) = json_request(&app, "GET", &uri, Some(&owner.token), None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            after, created,
            "Rejected publication must leave the draft and revision unchanged"
        );
    }
}

#[tokio::test]
async fn imported_cohort_binding_stays_editable_until_mapped_then_reexports_identically() {
    for foreign in [false, true] {
        let Some(state) = build_test_state().await else {
            return;
        };
        let app = test_app(state);
        let owner = register_user(&app).await;
        let tenant = provision_tenant(&app, &owner.token).await;
        let mut document: Value =
            serde_json::from_str(include_str!("fixtures/qdef-behavior.json")).unwrap();
        document["questionnaire"]["name"] = json!("Bound cohort study");
        document["questions"]["followup"] = json!({"type":"statistical-feedback","required":false,"config":{"sourceMode":"cohort","dataSource":{"questionnaireBinding":"reference-cohort","source":"response","key":"score"}}});
        document["translations"]["de"]["questions"]
            .as_object_mut()
            .unwrap()
            .remove("followup");
        let apply = format!(
            "/api/projects/{}/questionnaire-definitions/apply",
            tenant.project_id
        );
        let (status,imported)=json_request(&app,"POST",&apply,Some(&owner.token),Some(&json!({"definition":document.to_string(),"commit":true,"idempotencyKey":"binding-import"}))).await;
        assert_eq!(status, StatusCode::OK, "{imported:?}");
        let uri = format!(
            "/api/projects/{}/questionnaires/{}",
            tenant.project_id,
            imported["questionnaireId"].as_str().unwrap()
        );
        let (status, rejected) = json_request(
            &app,
            "POST",
            &format!("{uri}/publish"),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected:?}");
        assert!(
            rejected
                .to_string()
                .contains("QDEF_SOURCE_BINDING_REQUIRED"),
            "{rejected:?}"
        );
        let (_, mut native) = json_request(&app, "GET", &uri, Some(&owner.token), None).await;
        let feedback = native["content"]["questions"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|q| q["id"] == "followup")
            .unwrap();
        let target = if foreign {
            let outsider = register_user(&app).await;
            provision_tenant(&app, &outsider.token)
                .await
                .questionnaire_id
        } else {
            tenant.questionnaire_id
        };
        feedback["config"]["dataSource"]["questionnaireId"] = json!(target);
        let (status,saved)=json_request(&app,"PATCH",&uri,Some(&owner.token),Some(&json!({"content":native["content"],"expected_collaboration_epoch":native["collaboration_epoch"]}))).await;
        assert_eq!(status, StatusCode::OK, "{saved:?}");
        let (status, exported) = json_request(
            &app,
            "GET",
            &format!("{uri}/definition"),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{exported:?}");
        assert_eq!(exported["canonical"], imported["canonical"]);
        let (status, edited)=json_request(&app,"POST",&apply,Some(&owner.token),Some(&json!({
            "edits":[{"op":"replace","path":"/questionnaire/description","value":"Edited description"}],
            "questionnaireId":imported["questionnaireId"],"expectedRevision":saved["version"],"commit":true,"idempotencyKey":"bound-edit"
        }))).await;
        assert_eq!(status, StatusCode::OK, "{edited:?}");
        let (_, after_edit) = json_request(&app, "GET", &uri, Some(&owner.token), None).await;
        let source = after_edit["content"]["questions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|q| q["id"] == "followup")
            .unwrap();
        assert_eq!(
            source["config"]["dataSource"]["questionnaireId"],
            json!(target),
            "A portable edit must retain the existing local binding"
        );
        let (status, published) = json_request(
            &app,
            "POST",
            &format!("{uri}/publish"),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(
            status,
            if foreign {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::OK
            },
            "{published:?}"
        );
    }
}

#[tokio::test]
async fn self_cohort_bindings_resolve_to_each_imported_questionnaire_identity() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let mut document: Value =
        serde_json::from_str(include_str!("fixtures/qdef-behavior.json")).unwrap();
    document["questions"]["followup"] = json!({"type":"statistical-feedback","required":false,"config":{"sourceMode":"cohort","dataSource":{"questionnaireBinding":"self","source":"response","key":"score"}}});
    let apply = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let mut previous_id = Value::Null;
    for index in 0..2 {
        document["questionnaire"]["name"] = json!(format!("Self cohort {index}"));
        let (status,imported)=json_request(&app,"POST",&apply,Some(&owner.token),Some(&json!({"definition":document.to_string(),"commit":true,"idempotencyKey":format!("self-binding-{index}")}))).await;
        assert_eq!(status, StatusCode::OK, "{imported:?}");
        assert_ne!(imported["questionnaireId"], previous_id);
        previous_id = imported["questionnaireId"].clone();
        let uri = format!(
            "/api/projects/{}/questionnaires/{}",
            tenant.project_id,
            imported["questionnaireId"].as_str().unwrap()
        );
        let (_, native) = json_request(&app, "GET", &uri, Some(&owner.token), None).await;
        let feedback = native["content"]["questions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|q| q["id"] == "followup")
            .unwrap();
        assert_eq!(
            feedback["config"]["dataSource"]["questionnaireId"],
            imported["questionnaireId"]
        );
        let (status, exported) = json_request(
            &app,
            "GET",
            &format!("{uri}/definition"),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{exported:?}");
        assert_eq!(exported["canonical"], imported["canonical"]);
    }
}

#[tokio::test]
async fn synced_variable_values_preserve_score_objects_and_payload_metadata_keys() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let (status, published) = json_request(
        &app,
        "POST",
        &format!(
            "/api/projects/{}/questionnaires/{}/publish",
            tenant.project_id, tenant.questionnaire_id
        ),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{published:?}");
    let (status, session) = json_request(
        &app,
        "POST",
        "/api/sessions",
        None,
        Some(&json!({"questionnaire_id":tenant.questionnaire_id})),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "{session:?}");
    let sid = session["id"].as_str().unwrap();
    let values = json!({
        "score.wellbeing":{"value":4,"z":1,"tScore":60,"itemsAnswered":2,"itemsExpected":2},
        "payload":{"value":5,"type":"number","source":"authored data","valueType":"object"},
        "empty":null,"count":4,"enabled":true,"items":[1,{"value":2}]
    });
    let variables: Vec<Value> = values
        .as_object()
        .unwrap()
        .iter()
        .map(|(name, value)| json!({"variable_name":name,"variable_value":value}))
        .collect();
    // Retrying the same sync and rebuilding indices must not peel another layer
    // from structured values or interpret their data keys as protocol metadata.
    for _ in 0..2 {
        let (status, synced) = json_request(
            &app,
            "POST",
            &format!("/api/sessions/{sid}/sync"),
            None,
            Some(&json!({"variables":variables,"responses":[],"events":[]})),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{synced:?}");
        let (status, stored) = json_request(
            &app,
            "GET",
            &format!("/api/sessions/{sid}/variables"),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{stored:?}");
        for (name, value) in values.as_object().unwrap() {
            let row = stored
                .as_array()
                .unwrap()
                .iter()
                .find(|row| row["variable_name"] == *name)
                .unwrap();
            assert_eq!(
                &row["variable_value"], value,
                "Variable {name} changed during ingestion"
            );
        }
    }
}
