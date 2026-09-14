use qdesigner_server::error::ApiError;
use qdesigner_server::questionnaire_definition::{
    ApplyInput, ApplyResult, DefinitionAccess, DefinitionCapability, PreparedDefinitionChange,
    QuestionnaireDefinition, StoredQuestionnaire,
};
use serde_json::json;
use uuid::Uuid;

#[path = "fixtures/behavior_cases.rs"]
mod behavior_cases;

#[tokio::test]
async fn behavioral_variants_normalize_idempotently_without_losing_fields() {
    for (name, document) in behavior_cases::cases() {
        let first = inspect(document.clone()).await;
        assert!(first.valid, "{name}: {:?}", first.diagnostics);
        let canonical: serde_json::Value =
            serde_json::from_str(first.canonical.as_ref().unwrap()).unwrap();
        assert_eq!(canonical, document, "{name}");
        let second = inspect(canonical).await;
        assert_eq!(first.canonical, second.canonical, "{name}");
        assert_eq!(first.digest, second.digest, "{name}");
    }
}

#[derive(Default)]
struct FakeAccess {
    stored: Option<StoredQuestionnaire>,
    authorized: Vec<DefinitionCapability>,
}

impl DefinitionAccess for FakeAccess {
    async fn apply_prepared(
        &mut self,
        _input: PreparedDefinitionChange,
    ) -> Result<ApplyResult, ApiError> {
        panic!("Validation-only contract must not reach persistence");
    }
    async fn authorize(
        &mut self,
        _project_id: Uuid,
        capability: DefinitionCapability,
    ) -> Result<(), ApiError> {
        self.authorized.push(capability);
        Ok(())
    }

    async fn load(
        &mut self,
        _project_id: Uuid,
        _questionnaire_id: Uuid,
    ) -> Result<Option<StoredQuestionnaire>, ApiError> {
        Ok(self.stored.clone())
    }
}

fn fixture() -> serde_json::Value {
    serde_json::from_str(include_str!("fixtures/qdef-behavior.json")).unwrap()
}
async fn inspect(value: serde_json::Value) -> ApplyResult {
    QuestionnaireDefinition::new(FakeAccess::default())
        .apply(ApplyInput {
            project_id: Uuid::new_v4(),
            definition: Some(value.to_string()),
            edits: None,
            commit: false,
            idempotency_key: None,
            questionnaire_id: None,
            expected_revision: None,
        })
        .await
        .unwrap()
}
#[tokio::test]
async fn complete_behavior_is_portable_and_normalization_is_idempotent() {
    let input = fixture();
    let first = inspect(input.clone()).await;
    assert!(first.valid, "{:?}", first.diagnostics);
    let canonical: serde_json::Value =
        serde_json::from_str(first.canonical.as_ref().unwrap()).unwrap();
    assert_eq!(canonical, input);
    let second = inspect(canonical).await;
    assert!(second.valid, "{:?}", second.diagnostics);
    assert_eq!(first.canonical, second.canonical);
    assert_eq!(first.digest, second.digest);
}

#[tokio::test]
async fn broken_behavioral_references_and_types_have_stable_paths() {
    for (path, replacement, expected) in [
        (
            "/variables/eligible/dependencies/0",
            json!("missing"),
            "/variables/eligible/dependencies/0",
        ),
        (
            "/variables/age/defaultValue",
            json!("twenty"),
            "/variables/age/defaultValue",
        ),
        (
            "/variables/cohort/type",
            json!("number"),
            "/variables/cohort/type",
        ),
        (
            "/variables/rt/server/key",
            json!("followup"),
            "/variables/rt/server/key",
        ),
        ("/flow/0/target", json!("missing"), "/flow/0/target"),
        ("/flow/0/source", json!("missing"), "/flow/0/source"),
        (
            "/settings/scoring/scales/0/itemIds/0",
            json!("missing"),
            "/settings/scoring/scales/0/itemIds/0",
        ),
        (
            "/settings/scoring/scales/0/itemMax",
            json!(0),
            "/settings/scoring/scales/0/itemMax",
        ),
        (
            "/settings/report/widgets/0/comparison/serverVariable",
            json!("age"),
            "/settings/report/widgets/0/comparison/serverVariable",
        ),
        (
            "/questions/followup/carryForward/sourceQuestionId",
            json!("missing"),
            "/questions/followup/carryForward/sourceQuestionId",
        ),
        (
            "/structure/pages/0/blocks/4/adaptive/items/0/id",
            json!("followup"),
            "/structure/pages/0/blocks/4/adaptive/items/0/id",
        ),
        (
            "/settings/screeners/0/pageId",
            json!("missing"),
            "/settings/screeners/0/pageId",
        ),
    ] {
        let mut input = fixture();
        *input.pointer_mut(path).unwrap() = replacement;
        let result = inspect(input).await;
        assert!(!result.valid, "accepted invalid declaration at {path}");
        assert!(
            result.diagnostics.iter().any(|d| d.path == expected),
            "{expected}: {:?}",
            result.diagnostics
        );
    }
    let mut input = fixture();
    input["variables"]["age"]["dependencies"] = json!(["eligible"]);
    let result = inspect(input).await;
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_DEPENDENCY_CYCLE"),
        "{:?}",
        result.diagnostics
    );
}

#[tokio::test]
async fn formula_dependencies_cannot_hide_cycles_by_omitting_dependency_metadata() {
    for (left, right) in [("b + 1", "a + 1"), ("right + 1", "left + 1")] {
        let mut input = fixture();
        input["variables"]["a"] =
            json!({"name":"left", "type":"number", "scope":"global", "formula":left});
        input["variables"]["b"] =
            json!({"name":"right", "type":"number", "scope":"global", "formula":right});
        let result = inspect(input).await;
        assert!(!result.valid, "Formula cycle was accepted");
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "QDEF_DEPENDENCY_CYCLE" && d.path.ends_with("/formula")),
            "{:?}",
            result.diagnostics
        );
    }
}

#[tokio::test]
async fn formula_literals_properties_and_function_names_do_not_create_dependencies() {
    for formula in ["CONCAT('b', \"b\")", "cohort.b + 1", "b(1)", "1e3", "1 # b"] {
        let mut input = fixture();
        input["variables"]["a"] =
            json!({"name":"a", "type":"number", "scope":"global", "formula":formula});
        input["variables"]["b"] =
            json!({"name":"b", "type":"number", "scope":"global", "formula":"a + 1"});
        input["variables"]["e3"] =
            json!({"name":"e3", "type":"number", "scope":"global", "formula":"a + 1"});
        let result = inspect(input).await;
        assert!(result.valid, "{formula}: {:?}", result.diagnostics);
    }
}

#[tokio::test]
async fn formula_constants_and_operators_do_not_read_same_named_variables() {
    for token in ["true", "false", "null", "undefined", "NaN", "Infinity"] {
        let mut input = fixture();
        input["variables"][token] =
            json!({"name":token,"type":"boolean","scope":"global","formula":token});
        let result = inspect(input).await;
        assert!(result.valid, "{token}: {:?}", result.diagnostics);
    }
    let mut input = fixture();
    input["variables"]["not"] =
        json!({"name":"not","type":"boolean","scope":"global","formula":"not false"});
    let result = inspect(input).await;
    assert!(result.valid, "{:?}", result.diagnostics);
}

#[tokio::test]
async fn formula_parser_variants_keep_symbolic_reads_distinct_from_declarations() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../packages/questionnaire-core/fixtures/formula-dependency-cases.json"
    ))
    .unwrap();
    for case in cases.as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let formula = case["formula"].as_str().unwrap();
        let cyclic = case["cyclic"].as_bool().unwrap();
        let mut input = fixture();
        input["variables"]["computed"] =
            json!({"name":"computed","type":"number","scope":"global","formula":formula});
        input["variables"][name] =
            json!({"name":name,"type":"number","scope":"global","formula":"computed + 1"});
        let result = inspect(input).await;
        assert_eq!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "QDEF_DEPENDENCY_CYCLE"),
            cyclic,
            "{formula}: {:?}",
            result.diagnostics
        );
    }
}

#[tokio::test]
async fn variable_aliases_cannot_shadow_another_registry_identity() {
    let mut input = fixture();
    input["variables"]["a"] =
        json!({"name":"b","type":"number","scope":"global","formula":"b + 1"});
    input["variables"]["b"] = json!({"name":"c","type":"number","scope":"global","defaultValue":1});
    let result = inspect(input).await;
    assert!(!result.valid);
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_DUPLICATE_ID" && d.path == "/variables/a/name"),
        "{:?}",
        result.diagnostics
    );
}

#[tokio::test]
async fn encoded_signed_urls_are_installation_credentials_even_inside_passive_markup() {
    for content in [
        "https://storage.example.org/asset?%58-Amz-Signature=secret",
        "https://storage.example.org/asset?%73ig=secret",
        "<a href=\"https://storage.example.org/asset?&#115;ig=secret\">Download</a>",
    ] {
        let mut input = fixture();
        input["questionnaire"]["description"] = json!(content);
        let result = inspect(input).await;
        assert!(!result.valid, "Accepted {content}");
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "QDEF_INSTALLATION_STATE"
                    && d.path == "/questionnaire/description"),
            "{:?}",
            result.diagnostics
        );
    }
}

#[tokio::test]
async fn portable_input_rejects_installation_state_and_unknown_required_extensions() {
    for (path, value) in [
        (
            "/settings/versionHistory",
            json!([{ "version":"2.3.4", "at":"2026-09-14", "note":"internal audit" }]),
        ),
        (
            "/settings/distribution/passwordProtection",
            json!("installation-secret"),
        ),
        ("/settings/quotas/0/quotas/0/current", json!(7)),
        ("/settings/quotas/0/cells/0/current", json!(8)),
        ("/variables/cohort/value", json!({"n":42,"mean":3.5})),
        ("/extensions/org.example.study/required", json!(true)),
    ] {
        let mut input = fixture();
        let (parent, key) = path.rsplit_once('/').unwrap();
        input.pointer_mut(parent).unwrap()[key] = value;
        let result = inspect(input).await;
        assert!(
            !result.valid,
            "accepted installation/required-extension field: {path}"
        );
    }
    let mut input = fixture();
    input["questions"]["followup"]["media"] = json!([{"type":"image","url":"https://assets.example.org/a.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc"}]);
    let result = inspect(input).await;
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_INSTALLATION_STATE"
                && d.path == "/questions/followup/media/0/url"),
        "{:?}",
        result.diagnostics
    );
}

#[tokio::test]
async fn omitted_variable_names_normalize_to_registry_keys_once() {
    let mut input = fixture();
    input["variables"]["age"]
        .as_object_mut()
        .unwrap()
        .remove("name");
    let first = inspect(input).await;
    assert!(first.valid, "{:?}", first.diagnostics);
    let canonical: serde_json::Value =
        serde_json::from_str(first.canonical.as_ref().unwrap()).unwrap();
    assert_eq!(canonical["variables"]["age"]["name"], "age");
    let second = inspect(canonical).await;
    assert_eq!(first.canonical, second.canonical);
}

#[tokio::test]
async fn exporting_external_cohort_configuration_uses_a_portable_named_binding() {
    for self_source in [false, true] {
        let project_id = Uuid::new_v4();
        let questionnaire_id = Uuid::new_v4();
        let source_id = if self_source {
            questionnaire_id
        } else {
            Uuid::new_v4()
        }
        .to_string();
        let stored = StoredQuestionnaire {
            name: "Binding study".into(),
            description: None,
            revision: 1,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            content: json!({"questions":[{"id":"feedback","type":"statistical-feedback","required":false,"config":{"sourceMode":"cohort","dataSource":{"questionnaireId":source_id,"source":"response","key":"score","participantId":"{{participantId}}"}}}],"pages":[{"id":"page","blocks":[{"id":"block","type":"standard","questions":["feedback"]}]}],"variables":[],"flow":[]}),
            settings: json!({"allowBackNavigation":false,"showProgressBar":true}),
        };
        let artifact = QuestionnaireDefinition::new(FakeAccess {
            stored: Some(stored),
            ..Default::default()
        })
        .read(qdesigner_server::questionnaire_definition::ReadInput {
            project_id,
            questionnaire_id,
        })
        .await
        .unwrap();
        assert!(
            !artifact.canonical.contains(&source_id),
            "Export leaked an installation questionnaire identity"
        );
        let document: serde_json::Value = serde_json::from_str(&artifact.canonical).unwrap();
        let source = &document["questions"]["feedback"]["config"]["dataSource"];
        assert!(source["questionnaireBinding"]
            .as_str()
            .is_some_and(|name| !name.is_empty()));
        if self_source {
            assert_eq!(source["questionnaireBinding"], "self");
        }
        assert_eq!(source["participantId"], "{{participantId}}");
        assert!(source.get("questionnaireId").is_none());
        let inspected = inspect(document).await;
        assert!(inspected.valid, "{:?}", inspected.diagnostics);
        assert_eq!(
            inspected.canonical.as_deref(),
            Some(artifact.canonical.as_str())
        );
    }
}

#[tokio::test]
async fn exporting_conflicting_local_bindings_cannot_silently_change_their_targets() {
    for reserved_self in [false, true] {
        let project_id = Uuid::new_v4();
        let questionnaire_id = Uuid::new_v4();
        let target = Uuid::new_v4();
        let binding = if reserved_self { "self" } else { "baseline" };
        let questions = json!([
            {"id":"first","type":"statistical-feedback","config":{"sourceMode":"cohort","dataSource":{"questionnaireBinding":binding,"questionnaireId":target,"source":"response","key":"score"}}},
            {"id":"second","type":"statistical-feedback","config":{"sourceMode":"cohort","dataSource":{"questionnaireBinding":binding,"questionnaireId":Uuid::new_v4(),"source":"response","key":"score"}}}
        ]);
        let stored = StoredQuestionnaire {
            name: "Conflicting bindings".into(),
            description: None,
            revision: 1,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            content: json!({"questions":questions,"pages":[{"id":"p","blocks":[{"id":"b","type":"standard","questions":["first","second"]}]}],"variables":[],"flow":[]}),
            settings: json!({"allowBackNavigation":false,"showProgressBar":true}),
        };
        let result = QuestionnaireDefinition::new(FakeAccess {
            stored: Some(stored),
            ..Default::default()
        })
        .read(qdesigner_server::questionnaire_definition::ReadInput {
            project_id,
            questionnaire_id,
        })
        .await;
        let error =
            result.expect_err("Ambiguous local mappings must not collapse to one portable source");
        let qdesigner_server::questionnaire_definition::DefinitionReadFailure::Invalid(error) =
            error
        else {
            panic!("Expected definition diagnostics");
        };
        assert!(
            error
                .diagnostics
                .iter()
                .any(|d| d.code == "QDEF_SOURCE_BINDING_CONFLICT"),
            "{error:?}"
        );
    }
}

#[tokio::test]
async fn loop_and_adaptive_output_names_are_declarations_not_missing_references() {
    let mut input = fixture();
    input["structure"]["pages"][0]["blocks"][3]["loop"]["variable"] = json!("legacy-roster-name");
    input["structure"]["pages"][0]["blocks"][3]["loop"]["loopVariableName"] =
        json!("iterationLabel");
    input["structure"]["pages"][0]["blocks"][4]["adaptive"]["thetaReportVariable"] =
        json!("abilityEstimate");
    let result = inspect(input.clone()).await;
    assert!(result.valid, "{:?}", result.diagnostics);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(result.canonical.as_ref().unwrap()).unwrap(),
        input
    );
}

#[tokio::test]
async fn scoring_references_cannot_count_the_same_item_twice() {
    for field in ["itemIds", "reverseScoredItemIds"] {
        let mut input = fixture();
        input["settings"]["scoring"]["scales"][0][field] = json!(["score", "score"]);
        let result = inspect(input).await;
        assert!(!result.valid, "Repeated {field} changes score weighting");
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "QDEF_DUPLICATE_REFERENCE"
                    && d.path == format!("/settings/scoring/scales/0/{field}/1")),
            "{:?}",
            result.diagnostics
        );
    }
}

#[tokio::test]
async fn report_text_and_completion_metadata_do_not_require_a_variable_binding() {
    let mut input = fixture();
    for kind in ["interpretive-text", "completion-meta"] {
        input["settings"]["report"]["widgets"]
            .as_array_mut()
            .unwrap()
            .push(json!({
                "id":kind,"type":kind,"position":{"x":0,"y":2,"w":6,"h":2},
                "binding":{"source":"variable","key":""},"text":"Participant report"
            }));
    }
    let result = inspect(input.clone()).await;
    assert!(result.valid, "{:?}", result.diagnostics);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(result.canonical.as_ref().unwrap()).unwrap(),
        input
    );
}

#[tokio::test]
async fn direct_page_references_remain_ordered_and_normalize_without_a_synthetic_block() {
    let mut input = fixture();
    input["questions"]["direct-only"] = json!({"type":"text-input"});
    input["structure"]["pages"][1] =
        json!({"id":"end","questionIds":["followup","score","direct-only"]});
    let first = inspect(input).await;
    assert!(first.valid, "{:?}", first.diagnostics);
    assert!(!first
        .diagnostics
        .iter()
        .any(|d| d.code == "QDEF_QUESTION_UNREFERENCED"));
    let canonical: serde_json::Value =
        serde_json::from_str(first.canonical.as_ref().unwrap()).unwrap();
    assert_eq!(
        canonical["structure"]["pages"][1]["questionIds"],
        json!(["followup", "score", "direct-only"])
    );
    assert_eq!(canonical["structure"]["pages"][1]["blocks"], json!([]));
    assert_eq!(inspect(canonical).await.canonical, first.canonical);
}

#[tokio::test]
async fn forced_flow_cycles_are_diagnosed_without_rejecting_bounded_or_conditional_exits() {
    let mut input = fixture();
    input["flow"] =
        json!([{"id":"back","type":"skip","source":"end","target":"start","condition":"true"}]);
    let result = inspect(input.clone()).await;
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_FLOW_CYCLE" && d.path == "/flow/0/target"),
        "{:?}",
        result.diagnostics
    );
    input["flow"][0]["type"] = json!("loop");
    input["flow"][0]["iterations"] = json!(2);
    let bounded = inspect(input.clone()).await;
    assert!(bounded.valid, "{:?}", bounded.diagnostics);
    input["flow"] = json!([
        {"id":"exit","type":"terminate","source":"end","condition":"age < 18","priority":10},
        {"id":"back","type":"skip","source":"end","target":"start","condition":"true"}
    ]);
    let conditional = inspect(input.clone()).await;
    assert!(conditional.valid, "{:?}", conditional.diagnostics);
    input["flow"][0]["condition"] = json!("false");
    let forced = inspect(input).await;
    assert!(
        forced
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_FLOW_CYCLE" && d.path == "/flow/1/target"),
        "{:?}",
        forced.diagnostics
    );
}

#[tokio::test]
async fn direct_references_randomization_and_unplaced_flow_targets_are_validated() {
    for (path, value, expected) in [
        (
            "/structure/pages/1/questionIds",
            json!(["score", "score"]),
            "/structure/pages/1/questionIds/1",
        ),
        (
            "/structure/pages/0/blocks/1/randomization/fixedPositions",
            json!({"missing":0}),
            "/structure/pages/0/blocks/1/randomization/fixedPositions/missing",
        ),
        (
            "/structure/pages/0/blocks/1/randomization/fixedPositions",
            json!({"score":0,"followup":0}),
            "/structure/pages/0/blocks/1/randomization/fixedPositions/score",
        ),
        (
            "/structure/pages/0/blocks/1/randomization/fixedPositions",
            json!({"score":1.5}),
            "/structure/pages/0/blocks/1/randomization/fixedPositions/score",
        ),
    ] {
        let mut input = fixture();
        let (parent, key) = path.rsplit_once('/').unwrap();
        input.pointer_mut(parent).unwrap()[key] = value;
        let result = inspect(input).await;
        assert!(!result.valid, "Accepted invalid {path}");
        assert!(
            result.diagnostics.iter().any(|d| d.path == expected),
            "{expected}: {:?}",
            result.diagnostics
        );
    }
    let mut input = fixture();
    input["questions"]["orphan"] =
        json!({"type":"text-display","required":false,"display":{"content":"Unused"}});
    input["flow"][0]["target"] = json!("orphan");
    let result = inspect(input).await;
    assert!(
        result
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_REFERENCE_NOT_FOUND" && d.path == "/flow/0/target"),
        "{:?}",
        result.diagnostics
    );
}

#[tokio::test]
async fn participant_redirects_cannot_execute_javascript() {
    for path in [
        "/settings/distribution/completionRedirectUrl",
        "/settings/fraudPrevention/fraudRedirectUrl",
        "/flow/1/screenOutRedirectUrl",
        "/settings/screeners/0/rules/0/screenOutRedirectUrl",
        "/settings/quotas/0/quotas/0/overQuotaRedirectUrl",
    ] {
        let mut input = fixture();
        *input.pointer_mut(path).unwrap() = json!("java\tscript:alert(document.cookie)");
        let result = inspect(input).await;
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "UNSAFE_EXECUTABLE" && d.path == path),
            "{path}: {:?}",
            result.diagnostics
        );
    }
}
