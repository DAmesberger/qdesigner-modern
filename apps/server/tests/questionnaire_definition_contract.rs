use qdesigner_server::error::ApiError;
use qdesigner_server::questionnaire_definition::{
    ApplyInput, ApplyResult, DefinitionAccess, DefinitionCapability, DefinitionReadFailure,
    QuestionnaireDefinition, ReadInput, StoredQuestionnaire, ValidatedDefinitionChange,
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
    async fn apply_validated(
        &mut self,
        _input: ValidatedDefinitionChange,
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

fn ids() -> (Uuid, Uuid) {
    (Uuid::new_v4(), Uuid::new_v4())
}

#[tokio::test]
async fn a_commit_requires_a_nonempty_bounded_idempotency_key() {
    let (project_id, _) = ids();
    for key in [
        None,
        Some("".to_owned()),
        Some(" \t ".to_owned()),
        Some("x".repeat(129)),
    ] {
        let result = QuestionnaireDefinition::new(FakeAccess::default())
            .apply(ApplyInput {
                project_id,
                definition: minimal_definition().to_string(),
                commit: true,
                idempotency_key: key,
                questionnaire_id: None,
                expected_revision: None,
            })
            .await
            .unwrap();
        assert!(!result.committed);
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == "IDEMPOTENCY_KEY_REQUIRED" && d.path == "/idempotencyKey"));
    }
}

#[tokio::test]
async fn invalid_questionnaire_metadata_is_rejected_equally_before_inspection_and_commit() {
    let (project_id, _) = ids();
    for (field, value, code) in [
        ("name", "   ".to_owned(), "QDEF_NAME_INVALID"),
        ("name", "x".repeat(256), "QDEF_NAME_INVALID"),
        ("version", "1.2".to_owned(), "QDEF_VERSION_UNSUPPORTED"),
        (
            "version",
            "1.0.0-beta.1".to_owned(),
            "QDEF_VERSION_UNSUPPORTED",
        ),
        (
            "version",
            "2147483648.0.0".to_owned(),
            "QDEF_VERSION_UNSUPPORTED",
        ),
    ] {
        let mut definition = minimal_definition();
        definition["questionnaire"][field] = json!(value);
        let mut inspection = None;
        for commit in [false, true] {
            let result = QuestionnaireDefinition::new(FakeAccess::default())
                .apply(ApplyInput {
                    project_id,
                    definition: definition.to_string(),
                    commit,
                    idempotency_key: Some("invalid-metadata".into()),
                    questionnaire_id: None,
                    expected_revision: None,
                })
                .await
                .unwrap();
            assert!(!result.valid, "invalid {field} accepted: {value}");
            assert!(!result.committed);
            assert!(result.digest.is_none());
            assert!(result
                .diagnostics
                .iter()
                .any(|d| d.code == code && d.path == format!("/questionnaire/{field}")));
            let diagnostics = serde_json::to_value(&result.diagnostics).unwrap();
            if let Some(expected) = &inspection {
                assert_eq!(&diagnostics, expected);
            }
            inspection = Some(diagnostics);
        }
    }
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
            idempotency_key: None,
            questionnaire_id: None,
            expected_revision: None,
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
            idempotency_key: None,
            questionnaire_id: None,
            expected_revision: None,
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
            idempotency_key: None,
            questionnaire_id: None,
            expected_revision: None,
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
            idempotency_key: None,
            questionnaire_id: None,
            expected_revision: None,
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

fn minimal_definition() -> serde_json::Value {
    json!({
        "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
        "format": "qdesigner.questionnaire", "formatVersion": "1.0.0",
        "questionnaire": {"name": "Inspection", "version": "1.0.0"},
        "assets": {}, "variables": {}, "questions": {
            "copy": {"type": "text-display", "required": false, "display": {"content": "Welcome"}}
        },
        "structure": {"pages": [{"id": "page", "blocks": [
            {"id": "block", "type": "standard", "questionIds": ["copy"]}
        ]}]},
        "flow": [], "rules": [], "settings": {}, "translations": {}, "extensions": {}
    })
}

#[tokio::test]
async fn executable_payloads_are_rejected_at_the_inspection_boundary() {
    let cases = [
        (
            "/rules",
            json!([{"language": "javascript", "script": "alert(1)"}]),
            "/rules/0/language",
        ),
        (
            "/questions/copy/display/content",
            json!("<img src=x onerror='alert(1)'>"),
            "/questions/copy/display/content",
        ),
        (
            "/questions/copy/display/content",
            json!("<a href='java&#x73;cript:alert(1)'>go</a>"),
            "/questions/copy/display/content",
        ),
        (
            "/questions/copy/display/content",
            json!("<ScRiPt>alert(1)</ScRiPt>"),
            "/questions/copy/display/content",
        ),
        (
            "/questions/copy/display",
            json!({"content": "ok", "hooks": {"onEnter": "alert(1)"}}),
            "/questions/copy/display/hooks",
        ),
        (
            "/extensions",
            json!({"custom": {"global_scripts": ["alert(1)"]}}),
            "/extensions/custom/global_scripts",
        ),
    ];
    let (project_id, _) = ids();
    for (field, payload, expected_path) in cases {
        let mut document = minimal_definition();
        *document.pointer_mut(field).unwrap() = payload;
        let result = QuestionnaireDefinition::new(FakeAccess::default())
            .apply(ApplyInput {
                project_id,
                definition: document.to_string(),
                commit: false,
                idempotency_key: None,
                questionnaire_id: None,
                expected_revision: None,
            })
            .await
            .unwrap();
        assert!(!result.valid, "executable payload accepted at {field}");
        assert!(result.canonical.is_none());
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "UNSAFE_EXECUTABLE" && d.path == expected_path),
            "missing diagnostic at {expected_path}: {:?}",
            result.diagnostics
        );
    }
}

#[tokio::test]
async fn unsafe_content_has_the_same_actionable_findings_for_inspection_and_commit() {
    let (project_id, _) = ids();
    let mut document = minimal_definition();
    document["settings"]["global_scripts"] = json!(["window.location = 'https://example.invalid'"]);
    document["questions"]["copy"]["display"]["content"] =
        json!("<img src=x onerror='import(\"https://example.invalid/code.js\")'>");

    let mut inspected = None;
    for commit in [false, true] {
        let result = QuestionnaireDefinition::new(FakeAccess::default())
            .apply(ApplyInput {
                project_id,
                definition: document.to_string(),
                commit,
                idempotency_key: None,
                questionnaire_id: None,
                expected_revision: None,
            })
            .await
            .unwrap();
        assert!(!result.valid);
        assert!(!result.committed);
        assert!(result.canonical.is_none());
        assert!(result.digest.is_none());
        for path in [
            "/settings/global_scripts",
            "/questions/copy/display/content",
        ] {
            let finding = result
                .diagnostics
                .iter()
                .find(|d| d.path == path)
                .unwrap_or_else(|| panic!("missing finding for {path}: {:?}", result.diagnostics));
            assert_eq!(finding.code, "UNSAFE_EXECUTABLE");
            assert_eq!(
                finding.severity,
                qdesigner_server::questionnaire_definition::DiagnosticSeverity::Error
            );
            assert!(!finding.message.is_empty());
            assert!(finding.hint.as_ref().is_some_and(|hint| !hint.is_empty()));
        }
        if let Some(expected) = &inspected {
            assert_eq!(&result.diagnostics, expected);
        } else {
            inspected = Some(result.diagnostics);
        }
    }
}

#[tokio::test]
async fn executable_aliases_cannot_hide_in_nested_module_configuration() {
    let (project_id, _) = ids();
    for (field, value) in [
        (
            "onClick",
            json!("import('https://example.invalid/plugin.js')"),
        ),
        ("ON_submit", json!("new Function('return window')()")),
        (
            "custom_function",
            json!({"body": "globalThis.document.cookie"}),
        ),
        ("global_script", json!("window.fetch('/api/private')")),
        ("javaScript", json!("document.location")),
        ("language", json!(" JavaScript ")),
        ("language", json!("text/javascript; charset=utf-8")),
    ] {
        let mut document = minimal_definition();
        document["questions"]["copy"]["config"] = json!({ "nested": { field: value } });
        let result = QuestionnaireDefinition::new(FakeAccess::default())
            .apply(ApplyInput {
                project_id,
                definition: document.to_string(),
                commit: false,
                idempotency_key: None,
                questionnaire_id: None,
                expected_revision: None,
            })
            .await
            .unwrap();
        let path = format!("/questions/copy/config/nested/{field}");
        assert!(!result.valid, "accepted executable alias {field}");
        assert!(
            result
                .diagnostics
                .iter()
                .any(|d| d.code == "UNSAFE_EXECUTABLE" && d.path == path),
            "missing executable diagnostic for {path}: {:?}",
            result.diagnostics
        );
    }
}

#[tokio::test]
async fn retired_lifecycle_names_cannot_be_imported_as_nested_configuration() {
    let (project_id, _) = ids();
    for name in [
        "onMount",
        "onNavigate",
        "onPageEnter",
        "onPageExit",
        "onTimer",
        "ON_PAGE_ENTER",
        "on-mount",
    ] {
        let mut definition = minimal_definition();
        definition["questions"]["copy"]["config"] =
            json!({"nested": {name: "import('/plugin.js')"}});
        for commit in [false, true] {
            let result = QuestionnaireDefinition::new(FakeAccess::default())
                .apply(ApplyInput {
                    project_id,
                    definition: definition.to_string(),
                    commit,
                    idempotency_key: Some("retired-hook".into()),
                    questionnaire_id: None,
                    expected_revision: None,
                })
                .await
                .unwrap();
            assert!(
                !result.valid,
                "Retired lifecycle name {name} passed inspection"
            );
            assert!(!result.committed);
            assert!(result
                .diagnostics
                .iter()
                .any(|d| d.code == "UNSAFE_EXECUTABLE"
                    && d.path == format!("/questions/copy/config/nested/{name}")));
        }
    }
}

#[tokio::test]
async fn stable_question_identifiers_are_data_not_executable_field_names() {
    let (project_id, _) = ids();
    for id in ["script", "hooks", "onClick", "global_scripts"] {
        let mut document = minimal_definition();
        let question = document["questions"]
            .as_object_mut()
            .unwrap()
            .remove("copy")
            .unwrap();
        document["questions"][id] = question;
        document["structure"]["pages"][0]["blocks"][0]["questionIds"] = json!([id]);
        let result = QuestionnaireDefinition::new(FakeAccess::default())
            .apply(ApplyInput {
                project_id,
                definition: document.to_string(),
                commit: false,
                idempotency_key: None,
                questionnaire_id: None,
                expected_revision: None,
            })
            .await
            .unwrap();
        assert!(
            result.valid,
            "safe question ID {id} rejected: {:?}",
            result.diagnostics
        );
        let exported: serde_json::Value =
            serde_json::from_str(result.canonical.as_ref().unwrap()).unwrap();
        assert_eq!(exported["questions"], document["questions"]);
        assert_eq!(exported["structure"], document["structure"]);
    }
}

#[tokio::test]
async fn unsupported_tracer_capabilities_do_not_receive_a_valid_digest() {
    let (project_id, _) = ids();
    for field in [
        "assets",
        "variables",
        "flow",
        "rules",
        "translations",
        "extensions",
    ] {
        let mut document = minimal_definition();
        document[field] = if matches!(field, "flow" | "rules") {
            json!([{"safe": true}])
        } else {
            json!({"entry": {"safe": true}})
        };
        let result = QuestionnaireDefinition::new(FakeAccess::default())
            .apply(ApplyInput {
                project_id,
                definition: document.to_string(),
                commit: false,
                idempotency_key: None,
                questionnaire_id: None,
                expected_revision: None,
            })
            .await
            .unwrap();
        assert!(!result.valid, "unsupported {field} was accepted");
        assert!(result.digest.is_none());
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.code == "QDEF_CAPABILITY_UNSUPPORTED" && d.path == format!("/{field}")));
    }
}

#[tokio::test]
async fn passive_html_and_literal_script_discussion_remain_portable_text() {
    let (project_id, _) = ids();
    let mut document = minimal_definition();
    document["questions"]["copy"]["display"]["content"] =
        json!("<p>A &amp; B discuss JavaScript: <em>eval()</em> is text.</p>");
    let result = QuestionnaireDefinition::new(FakeAccess::default())
        .apply(ApplyInput {
            project_id,
            definition: document.to_string(),
            commit: false,
            idempotency_key: None,
            questionnaire_id: None,
            expected_revision: None,
        })
        .await
        .unwrap();
    assert!(result.valid, "{:?}", result.diagnostics);
    let canonical: serde_json::Value =
        serde_json::from_str(result.canonical.as_ref().unwrap()).unwrap();
    assert_eq!(canonical["questions"], document["questions"]);
}

#[tokio::test]
async fn javascript_language_markers_and_executable_ast_nodes_are_not_opaque_config() {
    let (project_id, _) = ids();
    for (expression, path) in [
        (
            json!({"type": "javascript", "source": "globalThis.fetch('/secret')"}),
            "/questions/copy/config/expression/type",
        ),
        (
            json!({"dialect": "application/javascript", "source": "import('/module')"}),
            "/questions/copy/config/expression/dialect",
        ),
        (
            json!({"type": "ImportExpression", "source": {"type": "Literal", "value": "/module"}}),
            "/questions/copy/config/expression/type",
        ),
        (
            json!({"type": "NewExpression", "callee": {"type": "Identifier", "name": "Function"}, "arguments": []}),
            "/questions/copy/config/expression/type",
        ),
    ] {
        let mut definition = minimal_definition();
        definition["questions"]["copy"]["config"] = json!({"expression": expression});
        for commit in [false, true] {
            let result = QuestionnaireDefinition::new(FakeAccess::default())
                .apply(ApplyInput {
                    project_id,
                    definition: definition.to_string(),
                    commit,
                    idempotency_key: Some("unsafe-ast".into()),
                    questionnaire_id: None,
                    expected_revision: None,
                })
                .await
                .unwrap();
            assert!(!result.valid, "Executable model was accepted: {expression}");
            assert!(result
                .diagnostics
                .iter()
                .any(|d| d.code == "UNSAFE_EXECUTABLE" && d.path == path));
        }
    }
}

#[tokio::test]
async fn stored_executable_text_is_rejected_before_export() {
    let (project_id, questionnaire_id) = ids();
    let mut definitions = QuestionnaireDefinition::new(FakeAccess {
        stored: Some(StoredQuestionnaire {
            name: "Unsafe stored copy".into(),
            description: None,
            revision: 1,
            version_major: 1,
            version_minor: 0,
            version_patch: 0,
            content: json!({"questions": [{"id": "copy", "type": "text-display",
                "display": {"content": "<img src=x onerror='alert(1)'>"}}], "pages": []}),
            settings: json!({}),
        }),
        ..Default::default()
    });
    let failure = definitions
        .read(ReadInput {
            project_id,
            questionnaire_id,
        })
        .await
        .unwrap_err();
    let DefinitionReadFailure::Invalid(error) = failure else {
        panic!("expected content rejection");
    };
    assert!(
        error
            .diagnostics
            .iter()
            .any(|d| d.code == "UNSAFE_EXECUTABLE"
                && d.path == "/content/questions/0/display/content")
    );
}
