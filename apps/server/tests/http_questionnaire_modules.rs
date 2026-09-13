use axum::http::StatusCode;
use serde_json::{json, Value};

mod common;
use common::{build_test_state, json_request, provision_tenant, register_user, test_app};

fn definition(question: Value) -> Value {
    json!({
        "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
        "format": "qdesigner.questionnaire", "formatVersion": "1.0.0",
        "questionnaire": {"name": "Portable form configuration", "version": "1.0.0"},
        "assets": {}, "variables": {}, "questions": {"answer": question},
        "structure": {"pages": [{"id": "page", "blocks": [{"id": "block", "type": "standard", "questionIds": ["answer"]}]}]},
        "flow": [], "rules": [], "settings": {"allowBackNavigation": true, "showProgressBar": true},
        "translations": {}, "extensions": {}
    })
}

#[tokio::test]
async fn every_catalogue_default_is_a_valid_portable_configuration() {
    let catalogue: Value = serde_json::from_str(include_str!(
        "../../../packages/questionnaire-core/src/module-catalogue.json"
    ))
    .unwrap();
    let modules = catalogue["modules"].as_object().unwrap();
    assert_eq!(
        modules.len(),
        18,
        "Keep the form/display inventory explicit"
    );
    for (kind, module) in modules {
        // Metadata defaults contain both envelope fields and flat module Config
        // fields. Match the documented authoring boundary, without browser code.
        let mut question = serde_json::Map::new();
        let mut config = serde_json::Map::new();
        for (key, value) in module["defaultConfig"].as_object().unwrap() {
            if [
                "display",
                "response",
                "navigation",
                "config",
                "dataSource",
                "visualization",
                "autoAdvance",
                "displayDuration",
            ]
            .contains(&key.as_str())
                && !(key == "autoAdvance" && value.is_object())
            {
                question.insert(key.clone(), value.clone());
            } else {
                config.insert(key.clone(), value.clone());
            }
        }
        if !config.is_empty() {
            question.insert("config".into(), Value::Object(config));
        }
        question.insert("type".into(), json!(kind));
        question.insert("required".into(), json!(false));
        assert_module_round_trip(Value::Object(question)).await;
    }
}

#[tokio::test]
async fn common_presentation_visibility_and_deadlines_are_portable_configuration() {
    assert_module_round_trip(json!({
        "type": "text-input", "required": true, "name": "timed-answer", "tags": ["baseline", "text"],
        "title": "Describe the image", "description": "One sentence", "randomize": false,
        "config": {"inputType": "text", "minLength": 3, "maxLength": 200},
        "conditions": {"show": "true", "enable": "true", "require": "true"},
        "timing": {"minTime": 100, "maxTime": 10000, "showTimer": true, "warningTime": 8000,
            "deadlineMs": 10000, "onTimeout": "warn", "warnAtMs": 8000},
        "navigation": {"showPrevious": true, "showNext": true, "autoAdvance": false, "advanceDelay": 0},
        "styling": {"fontSize": "1.2rem", "color": "#123456"},
        "layout": {"type": "vertical", "columns": 1, "spacing": 12, "alignment": "left"},
        "media": [{"url": "https://example.org/stimulus.png", "type": "image", "alt": "A landscape", "width": 320, "height": 200}],
        "attentionCheck": {"enabled": false, "type": "instructed", "correctAnswer": "landscape"}
    })).await;
}

async fn assert_module_round_trip(question: Value) {
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
    let (status, imported) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&json!({
        "definition": definition(question.clone()).to_string(), "commit": true, "idempotencyKey": "module-import"
    }))).await;
    assert_eq!(status, StatusCode::OK, "{}: {imported:?}", question["type"]);
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
    let canonical: Value = serde_json::from_str(exported["canonical"].as_str().unwrap()).unwrap();
    assert_eq!(canonical["questions"]["answer"], question);
    assert_eq!(exported["canonical"], imported["canonical"]);
    assert_eq!(exported["digest"], imported["digest"]);
}

async fn assert_invalid_module(question: Value, path: &str) {
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
    let (status, rejected) = json_request(&app, "POST", &uri, Some(&owner.token), Some(&json!({
        "definition": definition(question).to_string(), "commit": true, "idempotencyKey": "invalid-module"
    }))).await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{path}: {rejected:?}"
    );
    assert_eq!(rejected["committed"], false);
    assert!(
        rejected["diagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["code"] == "QDEF_CONFIG_INVALID" && d["path"] == path),
        "{rejected:?}"
    );
}

#[tokio::test]
async fn choice_option_ids_are_unique_even_when_the_labels_and_values_differ() {
    assert_invalid_module(
        json!({
            "type": "multiple-choice", "required": true,
            "config": {"responseType": {"type": "single"}, "options": [
                {"id": "same", "label": "A", "value": 1},
                {"id": "same", "label": "B", "value": 2}
            ]}
        }),
        "/questions/answer/config/options/1/id",
    )
    .await;
}

#[tokio::test]
async fn analytics_modules_preserve_chart_sources_presentation_and_report_configuration() {
    for question in [
        json!({"type": "bar-chart", "required": false,
            "display": {"prompt": "Your result", "orientation": "vertical", "showErrorBars": true,
                "errorType": "confidence95", "stacked": false, "showValues": true, "showDataLabels": true,
                "barWidth": 0.7, "barSpacing": 0.3, "value": "42", "referenceValue": "50",
                "colors": {"scheme": "custom", "customColors": ["#00ff00", "#ff0000"]},
                "axes": {"x": {"label": "Score", "showGrid": false, "showTicks": true},
                    "y": {"label": "Value", "showGrid": true, "showTicks": true, "min": 0, "max": "auto"}}},
            "dataSource": {"variables": [], "aggregation": "mean"},
            "visualization": {"title": "Result", "showLegend": true, "showTooltips": true},
            "autoAdvance": false, "displayDuration": 4000}),
        json!({"type": "statistical-feedback", "required": false,
            "config": {"title": "Comparison", "subtitle": "Reference population", "chartType": "bell-curve",
                "sourceMode": "norm-table", "metric": "mean", "showPercentile": true, "showSummary": true,
                "refreshMs": 0, "dataSource": {"questionnaireId": "", "source": "variable", "key": "",
                    "currentVariable": "score", "participantId": "", "comparisonParticipantId": "",
                    "normTableId": "custom", "customNorm": {"label": "Reference", "mean": 100, "sd": 15, "reliability": 0.9}},
                "scoreInterpretation": [], "enableReportDownload": true, "reportTitle": "Personal report"},
            "dataSource": {"variables": [], "aggregation": "none"},
            "visualization": {"title": "Comparison", "subtitle": "", "showLegend": false, "showGrid": true, "showTooltips": true, "colorScheme": "default"},
            "autoAdvance": false, "displayDuration": 3500}),
    ] {
        assert_module_round_trip(question).await;
    }
}

#[tokio::test]
async fn number_input_preserves_numeric_constraints_and_presentation() {
    assert_module_round_trip(json!({
        "type": "number-input", "required": true, "name": "weight",
        "text": "Your weight", "instruction": "Enter kilograms",
        "config": {"placeholder": "75.5", "min": 1, "max": 150, "step": 0.5, "decimalPlaces": 1, "prefix": "", "suffix": "kg", "showSpinButtons": false},
        "response": {"type": "number", "saveAs": "weight", "trackTiming": true},
        "responseType": {"type": "number", "min": 1, "max": 150, "step": 0.5},
        "validation": [{"type": "min", "value": 1}, {"type": "max", "value": 150}]
    })).await;
}

#[tokio::test]
async fn choice_modules_preserve_option_identity_order_values_and_selection_constraints() {
    for (kind, response_type) in [("multiple-choice", "multiple"), ("single-choice", "single")] {
        assert_module_round_trip(json!({
            "type": kind, "required": true, "name": "fruit",
            "display": {"prompt": "Choose fruit", "layout": "horizontal", "randomizeOptions": false},
            "config": {"responseType": {"type": response_type}, "options": [
                {"id": "pear", "label": "Pear", "value": 7, "description": "Green fruit", "image": {"type":"image","url":"https://example.org/pear.png","alt":"Pear"}},
                {"id": "apple", "label": "Apple", "value": "apple", "disabled": false}
            ], "minSelections": 1, "maxSelections": if response_type == "multiple" { 2 } else { 1 }, "otherOption": false},
            "response": {"type": response_type, "saveAs": "fruit", "trackTiming": true}
        })).await;
    }
}

#[tokio::test]
async fn scale_and_rating_preserve_their_distinct_labels_and_presentation_models() {
    for question in [
        json!({"type": "scale", "required": true, "display": {"prompt": "Agreement", "min": 1, "max": 7, "step": 1, "style": "buttons", "orientation": "horizontal", "labels": {"min": "Disagree", "max": "Agree"}}, "config": {"min": 0, "max": 10, "step": 2, "displayType": "slider", "showValue": true, "labels": [{"value": 0, "label": "Low", "description": "No agreement"}, {"value": 10, "label": "High"}]}, "response": {"type": "scale", "valueType": "number"}}),
        json!({"type": "rating", "required": false, "text": "Enjoyment", "config": {"levels": 5, "style": "hearts", "allowHalf": true, "showValue": true, "labels": ["Poor", "Fair", "Good", "Very good", "Excellent"]}, "response": {"type": "rating", "saveAs": "enjoyment", "trackTiming": true}}),
    ] {
        assert_module_round_trip(question).await;
    }
}

#[tokio::test]
async fn matrix_and_ranking_preserve_ordered_items_and_layout_configuration() {
    for question in [
        json!({"type": "matrix", "required": true, "config": {"prompt": "Evaluate each item", "responseType": "checkbox", "rows": [{"id": "taste", "label": "Taste", "description": "Flavor", "required": true}, {"id": "texture", "label": "Texture", "required": false}], "columns": [{"id": "good", "label": "Good", "value": 2, "width": "8rem"}, {"id": "bad", "label": "Bad", "value": 1}], "mobileLayout": "cards", "stickyHeaders": true, "alternateRowColors": true}, "response": {"type": "matrix", "saveAs": "ratings"}}),
        json!({"type": "ranking", "required": true, "display": {"prompt": "Rank these"}, "config": {"items": [{"id": "pear", "label": "Pear"}, {"id": "apple", "label": "Apple"}, {"id": "plum", "label": "Plum"}], "layout": "horizontal", "animation": false, "allowPartial": false, "tieBreaking": true, "showNumbers": false, "dragHandlePosition": "both"}, "response": {"type": "ranking", "trackTiming": true}}),
    ] {
        assert_module_round_trip(question).await;
    }
}

#[tokio::test]
async fn date_time_preserves_nullable_bounds_format_and_excluded_dates() {
    assert_module_round_trip(json!({
        "type": "date-time", "required": false, "text": "Appointment",
        "config": {"mode": "datetime", "format": "YYYY-MM-DD HH:mm", "showCalendar": true, "minDate": null, "maxDate": "2030-12-31T23:59", "disabledDates": ["2026-12-25", "2026-12-26"], "defaultToToday": false, "timeStep": 15},
        "response": {"type": "datetime", "saveAs": "appointment", "trackTiming": true}
    })).await;
}

#[tokio::test]
async fn binary_capture_modules_preserve_constraints_and_recording_configuration() {
    for question in [
        json!({"type": "file-upload", "required": true, "display": {"prompt": "Upload supporting files"}, "config": {"accept": ["image/*", ".pdf"], "maxSize": 31457280, "maxFiles": 3, "dragDrop": false}, "response": {"type": "file", "saveAs": "attachments", "trackTiming": true}}),
        json!({"type": "media-response", "required": false, "display": {"prompt": "Record a response", "recordingMode": "audio", "maxDuration": 120}, "config": {"recordingMode": "video-audio", "maxDuration": 45, "maxFileSize": 52428800, "audioQuality": "high", "videoQuality": "low", "allowRerecord": false, "countdown": 5}, "response": {"type": "file", "saveAs": "recording", "trackTiming": true}}),
    ] {
        assert_module_round_trip(question).await;
    }
}

#[tokio::test]
async fn drawing_preserves_canvas_tools_colors_and_analysis_configuration() {
    assert_module_round_trip(json!({
        "type": "drawing", "required": true, "display": {"prompt": "Draw your route"},
        "config": {"tools": ["pen", "line", "eraser"], "colors": ["#112233", "#abcdef"], "canvas": {"width": 640, "height": 480, "background": null}, "analysis": {"extractFeatures": true, "detectShapes": false, "measurePressure": true, "trackTiming": true}},
        "response": {"type": "drawing", "saveAs": "route"}
    })).await;
}

#[tokio::test]
async fn instruction_aliases_preserve_media_and_navigation_configuration() {
    for kind in ["instruction", "media-display"] {
        assert_module_round_trip(json!({
            "type": kind, "required": false, "name": "instructions",
            "display": {"content": "Read the diagram", "format": "markdown", "enableMarkdown": true, "media": [{"id": "diagram", "type": "image", "url": "https://example.org/diagram.png", "alt": "Study diagram", "position": "below"}]},
            "navigation": {"showNext": true, "autoAdvance": false, "advanceDelay": 1200},
            "response": {"type": "none"}
        })).await;
    }
}

#[tokio::test]
async fn constrained_text_input_preserves_its_complete_configuration_through_import_and_export() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let question = json!({
        "type": "text-input", "required": true, "name": "participant-code",
        "display": {"prompt": "Your participant code", "description": "Use the code from your invitation"},
        "config": {"inputType": "text", "placeholder": "ABC-123", "multiline": false, "minLength": 3, "maxLength": 20, "rows": 2, "autoResize": true},
        "response": {"type": "text", "saveAs": "participant_code", "trackTiming": true},
        "validation": [{"type": "minLength", "value": 3, "message": "At least three characters"}],
        "navigation": {"showNext": true, "autoAdvance": false}
    });
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let source = definition(question.clone());
    let (status, imported) = json_request(
        &app,
        "POST",
        &uri,
        Some(&owner.token),
        Some(&json!({
            "definition": source.to_string(), "commit": true, "idempotencyKey": "form-import"
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{imported:?}");
    assert_eq!(imported["committed"], true);
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
    let round_trip: Value = serde_json::from_str(exported["canonical"].as_str().unwrap()).unwrap();
    assert_eq!(round_trip["questions"]["answer"], question);
    assert_eq!(exported["canonical"], imported["canonical"]);
    assert_eq!(exported["digest"], imported["digest"]);
    let (_, native) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{}/questionnaires/{id}", tenant.project_id),
        Some(&owner.token),
        None,
    )
    .await;
    let mut persisted = native["content"]["questions"][0].clone();
    assert_eq!(
        persisted.as_object_mut().unwrap().remove("id"),
        Some(json!("answer"))
    );
    assert_eq!(
        persisted.as_object_mut().unwrap().remove("order"),
        Some(json!(0))
    );
    assert_eq!(persisted, question);
}

#[tokio::test]
async fn designer_authored_flat_text_configuration_exports_without_inventing_a_display() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let question = json!({
        "id": "answer", "order": 0, "type": "text-input", "required": true,
        "text": "Your participant code", "instruction": "Use your invitation",
        "config": {"inputType": "text", "placeholder": "ABC-123", "multiline": false, "maxLength": 20, "rows": 3, "autoResize": false},
        "response": {"type": "text", "saveAs": "participant_code", "trackTiming": true},
        "responseType": {"type": "text", "minLength": 3, "maxLength": 20},
        "validation": [{"type": "required", "value": true, "message": "This question is required"}]
    });
    let (status, created) = json_request(&app, "POST", &format!("/api/projects/{}/questionnaires", tenant.project_id), Some(&owner.token), Some(&json!({
        "name": "Designer authored portable input", "content": {
            "questions": [question.clone()], "pages": [{"id": "page", "blocks": [{"id": "block", "type": "standard", "questions": ["answer"]}]}], "variables": [], "flow": []
        }, "settings": {"showProgressBar": true}
    }))).await;
    assert_eq!(status, StatusCode::CREATED, "{created:?}");
    let id = created["id"].as_str().unwrap();
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
    let canonical: Value = serde_json::from_str(exported["canonical"].as_str().unwrap()).unwrap();
    let mut expected = question;
    expected.as_object_mut().unwrap().remove("id");
    expected.as_object_mut().unwrap().remove("order");
    assert_eq!(canonical["questions"]["answer"], expected);
    assert!(canonical["questions"]["answer"].get("display").is_none());
}

#[tokio::test]
async fn invalid_text_configuration_reports_the_field_and_leaves_project_drafts_unchanged() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let list_uri = format!("/api/projects/{}/questionnaires", tenant.project_id);
    let uri = format!(
        "/api/projects/{}/questionnaire-definitions/apply",
        tenant.project_id
    );
    let (_, before) = json_request(&app, "GET", &list_uri, Some(&owner.token), None).await;
    for (config, path) in [
        (
            json!({"maxLength": "twenty"}),
            "/questions/answer/config/maxLength",
        ),
        (Value::Null, "/questions/answer/config"),
        (
            json!({"minLength": 10, "maxLength": 3}),
            "/questions/answer/config/maxLength",
        ),
    ] {
        let source = definition(
            json!({"type": "text-input", "required": true, "display": {"prompt": "Your code"}, "config": config}),
        );
        let (status, rejected) = json_request(
            &app,
            "POST",
            &uri,
            Some(&owner.token),
            Some(&json!({
                "definition": source.to_string(), "commit": true, "idempotencyKey": "invalid-config"
            })),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{path}: {rejected:?}"
        );
        assert!(
            rejected["diagnostics"]
                .as_array()
                .unwrap()
                .iter()
                .any(|d| d["code"] == "QDEF_CONFIG_INVALID" && d["path"] == path),
            "{rejected:?}"
        );
        assert_eq!(rejected["committed"], false);
        let (_, after) = json_request(&app, "GET", &list_uri, Some(&owner.token), None).await;
        assert_eq!(after, before);
    }
}

#[tokio::test]
async fn invalid_module_configuration_reports_the_exact_field_for_every_family() {
    for (question, path) in [
        (
            json!({"type":"text-display","config":{"autoAdvance":{"enabled":"yes"}}}),
            "/config/autoAdvance/enabled",
        ),
        (
            json!({"type":"text-instruction","navigation":{"advanceDelay":-1}}),
            "/navigation/advanceDelay",
        ),
        (
            json!({"type":"instruction","display":{"media":"image"}}),
            "/display/media",
        ),
        (
            json!({"type":"media-display","display":{"media":[{"type":"executable","url":"https://example.org/image"}]}}),
            "/display/media/0/type",
        ),
        (
            json!({"type":"text-input","config":{"minLength":-1}}),
            "/config/minLength",
        ),
        (
            json!({"type":"number-input","config":{"step":0}}),
            "/config/step",
        ),
        (
            json!({"type":"number-input","display":{"decimalPlaces":101}}),
            "/display/decimalPlaces",
        ),
        (
            json!({"type":"text-input","responseType":{"maxLength":-1}}),
            "/responseType/maxLength",
        ),
        (
            json!({"type":"scale","response":{"step":0}}),
            "/response/step",
        ),
        (json!({"type":"single-choice","required":true}), ""),
        (json!({"type":"scale","config":{"min":10}}), "/config/min"),
        (
            json!({"type":"multiple-choice","config":{"options":[{"id":"a","label":"A","value":1}],"maxSelections":-1}}),
            "/config/maxSelections",
        ),
        (
            json!({"type":"single-choice","config":{"options":[{"id":"a","label":"A","value":1}],"responseType":{"type":"multiple"}}}),
            "/config/responseType/type",
        ),
        (
            json!({"type":"scale","config":{"min":0,"max":5,"step":0}}),
            "/config/step",
        ),
        (
            json!({"type":"rating","config":{"levels":1}}),
            "/config/levels",
        ),
        (
            json!({"type":"matrix","config":{"rows":[{"id":"r","label":"R"}],"columns":[{"id":"c","label":"C","value":1}],"mobileLayout":"rotate"}}),
            "/config/mobileLayout",
        ),
        (
            json!({"type":"ranking","config":{"items":[{"id":"a","label":"A"}],"allowPartial":"yes"}}),
            "/config/allowPartial",
        ),
        (
            json!({"type":"date-time","config":{"timeStep":0}}),
            "/config/timeStep",
        ),
        (
            json!({"type":"date-time","config":{"minDate":"2026-02-30"}}),
            "/config/minDate",
        ),
        (
            json!({"type":"date-time","config":{"minDate":"2026-12-31","maxDate":"2026-01-01"}}),
            "/config/maxDate",
        ),
        (
            json!({"type":"date-time","display":{"disabledDates":["not-a-date"]}}),
            "/display/disabledDates/0",
        ),
        (
            json!({"type":"statistical-feedback","config":{"sourceMode":"norm-table","dataSource":{}}}),
            "/config/dataSource",
        ),
        (
            json!({"type":"statistical-feedback","display":{"sourceMode":"self-baseline","dataSource":{"currentVariable":"score"}}}),
            "/display/dataSource",
        ),
        (
            json!({"type":"file-upload","config":{"maxFiles":0}}),
            "/config/maxFiles",
        ),
        (
            json!({"type":"media-response","config":{"recordingMode":"screen"}}),
            "/config/recordingMode",
        ),
        (
            json!({"type":"drawing","config":{"canvas":{"width":0}}}),
            "/config/canvas/width",
        ),
        (
            json!({"type":"bar-chart","config":{"axes":{"y":{"min":{}}}}}),
            "/config/axes/y/min",
        ),
        (
            json!({"type":"statistical-feedback","config":{"dataSource":{"customNorm":{"sd":0}}}}),
            "/config/dataSource/customNorm/sd",
        ),
        (
            json!({"type":"text-input","timing":{"warnAtMs":5000,"deadlineMs":1000}}),
            "/timing/deadlineMs",
        ),
        (
            json!({"type":"text-input","conditions":{"show":true}}),
            "/conditions",
        ),
    ] {
        assert_invalid_module(question, &format!("/questions/answer{path}")).await;
    }
}

#[tokio::test]
async fn native_question_projection_uses_structure_order_instead_of_registry_key_order() {
    let Some(state) = build_test_state().await else {
        return;
    };
    let app = test_app(state);
    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let mut source = definition(json!({"type":"text-input","required":false}));
    source["questions"] = json!({
        "a": {"type":"text-input","required":false,"text":"Second"},
        "z": {"type":"text-input","required":false,"text":"First"}
    });
    source["structure"]["pages"][0]["blocks"][0]["questionIds"] = json!(["z", "a"]);
    let (status, imported) = json_request(&app, "POST", &format!("/api/projects/{}/questionnaire-definitions/apply", tenant.project_id), Some(&owner.token), Some(&json!({"definition":source.to_string(),"commit":true,"idempotencyKey":"reference-order"}))).await;
    assert_eq!(status, StatusCode::OK, "{imported:?}");
    let id = imported["questionnaireId"].as_str().unwrap();
    let (status, native) = json_request(
        &app,
        "GET",
        &format!("/api/projects/{}/questionnaires/{id}", tenant.project_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let questions = native["content"]["questions"].as_array().unwrap();
    assert_eq!(
        questions
            .iter()
            .map(|q| q["id"].as_str().unwrap())
            .collect::<Vec<_>>(),
        vec!["z", "a"]
    );
    assert_eq!(questions[0]["order"], 0);
    assert_eq!(questions[1]["order"], 1);
}
