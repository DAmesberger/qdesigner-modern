use qdesigner_server::error::ApiError;
use qdesigner_server::questionnaire_definition::{
    ApplyInput, ApplyResult, DefinitionAccess, DefinitionCapability, PreparedDefinitionChange,
    QuestionnaireDefinition, StoredQuestionnaire,
};
use serde_json::json;
use uuid::Uuid;

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
async fn direct_page_references_remain_ordered_and_normalize_without_a_synthetic_block() {
    let mut input = fixture();
    input["structure"]["pages"][1] = json!({"id":"end","questionIds":["followup","score"]});
    let first = inspect(input).await;
    assert!(first.valid, "{:?}", first.diagnostics);
    let canonical: serde_json::Value =
        serde_json::from_str(first.canonical.as_ref().unwrap()).unwrap();
    assert_eq!(
        canonical["structure"]["pages"][1]["questionIds"],
        json!(["followup", "score"])
    );
    assert_eq!(canonical["structure"]["pages"][1]["blocks"], json!([]));
    assert_eq!(inspect(canonical).await.canonical, first.canonical);
}
