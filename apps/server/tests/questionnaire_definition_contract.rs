use qdesigner_server::error::ApiError;
use qdesigner_server::questionnaire_definition::{
    ApplyInput, DefinitionAccess, DefinitionCapability, DefinitionReadFailure,
    QuestionnaireDefinition, ReadInput, StoredQuestionnaire,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Default)]
struct FakeAccess {
    stored: Option<StoredQuestionnaire>,
    authorized: Vec<DefinitionCapability>,
}

impl DefinitionAccess for FakeAccess {
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

fn ids() -> (Uuid, Uuid) {
    (Uuid::new_v4(), Uuid::new_v4())
}

#[tokio::test]
async fn text_only_qdef_round_trips_through_the_questionnaire_definition_interface() {
    let stored = StoredQuestionnaire {
        name: "Welcome study".into(),
        description: Some("A minimal text-only Questionnaire".into()),
        revision: 7,
        version_major: 1,
        version_minor: 2,
        version_patch: 3,
        content: json!({
            "questions": [
                {
                    "id": "question-second",
                    "type": "text-instruction",
                    "order": 2,
                    "required": false,
                    "display": { "content": "Continue when ready." }
                },
                {
                    "id": "question-first",
                    "type": "text-display",
                    "order": 1,
                    "required": false,
                    "display": { "content": "Welcome." }
                }
            ],
            "pages": [{
                "id": "page-introduction",
                "name": "Introduction",
                "blocks": [{
                    "id": "block-copy",
                    "type": "standard",
                    "questions": ["question-first", "question-second"]
                }]
            }]
        }),
        settings: json!({
            "showProgressBar": true,
            "allowBackNavigation": false
        }),
    };

    let (project_id, questionnaire_id) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess {
        stored: Some(stored),
        ..Default::default()
    });
    let exported = definitions
        .read(ReadInput {
            project_id,
            questionnaire_id,
        })
        .await
        .expect("minimal text-only Questionnaire should export");

    let expected = concat!(
        "{\"$schema\":\"https://schemas.qdesigner.dev/questionnaire/1.0.0\",",
        "\"assets\":{},\"extensions\":{},\"flow\":[],",
        "\"format\":\"qdesigner.questionnaire\",\"formatVersion\":\"1.0.0\",",
        "\"questionnaire\":{\"description\":\"A minimal text-only Questionnaire\",",
        "\"name\":\"Welcome study\",\"version\":\"1.2.3\"},",
        "\"questions\":{",
        "\"question-first\":{\"display\":{\"content\":\"Welcome.\"},",
        "\"required\":false,\"type\":\"text-display\"},",
        "\"question-second\":{\"display\":{\"content\":\"Continue when ready.\"},",
        "\"required\":false,\"type\":\"text-instruction\"}},",
        "\"rules\":[],",
        "\"settings\":{\"allowBackNavigation\":false,\"showProgressBar\":true},",
        "\"structure\":{\"pages\":[{\"blocks\":[{\"id\":\"block-copy\",",
        "\"questionIds\":[\"question-first\",\"question-second\"],",
        "\"type\":\"standard\"}],\"id\":\"page-introduction\",",
        "\"name\":\"Introduction\"}]},\"translations\":{},\"variables\":{}}\n"
    );

    assert_eq!(exported.canonical, expected);
    assert_eq!(exported.metadata.questionnaire_name, "Welcome study");
    assert_eq!(exported.metadata.questionnaire_version, "1.2.3");
    assert_eq!(exported.metadata.format_version, "1.0.0");
    assert_eq!(exported.revision, 7);
    assert!(exported.diagnostics.is_empty());

    let expected_digest = format!(
        "sha256:{}",
        hex::encode(Sha256::digest(expected.trim_end_matches('\n').as_bytes()))
    );
    assert_eq!(exported.digest, expected_digest);

    let inspected = definitions
        .apply(ApplyInput {
            project_id,
            definition: exported.canonical.clone(),
            commit: false,
        })
        .await
        .expect("definition inspection should be authorized");

    assert!(inspected.valid);
    assert!(!inspected.committed);
    assert_eq!(inspected.canonical.as_deref(), Some(expected));
    assert_eq!(inspected.digest.as_deref(), Some(expected_digest.as_str()));
    assert_eq!(inspected.metadata, Some(exported.metadata));
    assert!(inspected.diagnostics.is_empty());
    assert_eq!(
        definitions.access().authorized,
        vec![DefinitionCapability::Read, DefinitionCapability::Write]
    );
}

#[tokio::test]
async fn designer_authored_text_defaults_are_part_of_the_supported_minimal_shape() {
    let (project_id, questionnaire_id) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess {
        stored: Some(StoredQuestionnaire {
            name: "Designer text".into(),
            description: None,
            revision: 1,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            content: json!({
                "questions": [{
                    "id": "question-copy",
                    "type": "text-display",
                    "order": 0,
                    "required": false,
                    "display": {
                        "content": "## Welcome",
                        "format": "markdown",
                        "enableMarkdown": true,
                        "variables": false
                    },
                    "config": {
                        "autoAdvance": { "enabled": false, "delay": 5000 },
                        "styling": { "fontSize": "1rem", "textAlign": "left" }
                    }
                }],
                "variables": [],
                "flow": [],
                "pages": [{
                    "id": "page-one",
                    "name": "Page 1",
                    "blocks": [{
                        "id": "block-one",
                        "pageId": "page-one",
                        "name": "Block 1",
                        "type": "standard",
                        "questions": ["question-copy"]
                    }]
                }]
            }),
            settings: json!({
                "allowBackNavigation": false,
                "showProgressBar": true,
                "saveProgress": true,
                "webgl": { "targetFPS": 120 }
            }),
        }),
        ..Default::default()
    });
    let exported = definitions
        .read(ReadInput {
            project_id,
            questionnaire_id,
        })
        .await
        .expect("the designer's default text shape should be exportable");

    assert!(exported.canonical.contains("\"targetFPS\":120"));
    assert!(exported.canonical.contains("\"autoAdvance\""));
}

#[tokio::test]
async fn unsupported_qdef_versions_return_stable_structured_diagnostics() {
    let (project_id, _) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess::default());
    let result = definitions
        .apply(ApplyInput {
            project_id,
            definition: json!({
            "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
            "format": "qdesigner.questionnaire",
            "formatVersion": "2.0.0"
            })
            .to_string(),
            commit: false,
        })
        .await
        .expect("definition inspection should be authorized");

    assert!(!result.valid);
    assert!(!result.committed);
    assert_eq!(
        result.diagnostics[0].code,
        "QDEF_FORMAT_VERSION_UNSUPPORTED"
    );
    assert_eq!(result.diagnostics[0].path, "/formatVersion");
    assert!(result.canonical.is_none());
    assert!(result.digest.is_none());
}

#[tokio::test]
async fn malformed_json_is_reported_by_the_questionnaire_definition_interface() {
    let (project_id, _) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess::default());
    let result = definitions
        .apply(ApplyInput {
            project_id,
            definition: "{ definitely not JSON".into(),
            commit: false,
        })
        .await
        .expect("definition inspection should be authorized");

    assert!(!result.valid);
    assert_eq!(result.diagnostics[0].code, "QDEF_JSON_INVALID");
    assert_eq!(result.diagnostics[0].path, "/");
}

#[tokio::test]
async fn duplicate_raw_json_registry_keys_are_rejected_before_deserialization() {
    let (project_id, _) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess::default());
    let result = definitions
        .apply(ApplyInput {
            project_id,
            definition: r#"{
                "$schema":"https://schemas.qdesigner.dev/questionnaire/1.0.0",
                "format":"qdesigner.questionnaire",
                "formatVersion":"1.0.0",
                "questions":{"question: alpha":{},"question: alpha":{}}
            }"#
            .into(),
            commit: false,
        })
        .await
        .expect("definition inspection should be authorized");

    assert!(!result.valid);
    assert_eq!(result.diagnostics[0].code, "QDEF_DUPLICATE_KEY");
    assert_eq!(result.diagnostics[0].path, "/questions/question: alpha");
    assert!(result.diagnostics[0].message.contains("question: alpha"));
}

#[tokio::test]
async fn wrongly_typed_stored_collections_are_not_silently_treated_as_empty() {
    let (project_id, questionnaire_id) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess {
        stored: Some(StoredQuestionnaire {
            name: "Broken stored shape".into(),
            description: None,
            revision: 1,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            content: json!({ "questions": {}, "pages": "not-an-array" }),
            settings: json!({}),
        }),
        ..Default::default()
    });

    let error = definitions
        .read(ReadInput {
            project_id,
            questionnaire_id,
        })
        .await
        .expect_err("malformed stored collections must block export");
    let DefinitionReadFailure::Invalid(error) = error else {
        panic!("expected structured definition diagnostics");
    };
    let codes = error
        .diagnostics
        .iter()
        .map(|diagnostic| diagnostic.code.as_str())
        .collect::<Vec<_>>();
    assert!(codes.contains(&"QDEF_STORED_QUESTION_INVALID"));
    assert!(codes.contains(&"QDEF_STORED_PAGE_INVALID"));
}

#[tokio::test]
async fn wrongly_typed_stored_optional_scalars_are_not_silently_normalized() {
    let (project_id, questionnaire_id) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess {
        stored: Some(StoredQuestionnaire {
            name: "Broken stored scalars".into(),
            description: None,
            revision: 1,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            content: json!({
                "questions": [],
                "pages": [{
                    "id": "page-1",
                    "name": 7,
                    "blocks": [{
                        "id": "block-1",
                        "pageId": false,
                        "name": [],
                        "type": 42,
                        "questions": []
                    }]
                }]
            }),
            settings: json!({}),
        }),
        ..Default::default()
    });

    let error = definitions
        .read(ReadInput {
            project_id,
            questionnaire_id,
        })
        .await
        .expect_err("malformed stored scalar fields must block export");
    let DefinitionReadFailure::Invalid(error) = error else {
        panic!("expected structured definition diagnostics");
    };
    let paths = error
        .diagnostics
        .iter()
        .map(|diagnostic| diagnostic.path.as_str())
        .collect::<Vec<_>>();
    assert!(paths.contains(&"/content/pages/0/name"));
    assert!(paths.contains(&"/content/pages/0/blocks/0/pageId"));
    assert!(paths.contains(&"/content/pages/0/blocks/0/name"));
    assert!(paths.contains(&"/content/pages/0/blocks/0/type"));
}
