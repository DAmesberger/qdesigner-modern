//! Canonical, portable Questionnaire Definition (QDef) behavior.
//!
//! HTTP, UI, and future MCP adapters must cross this interface instead of
//! maintaining their own serializers or validators.

mod persistence;
mod projections;
mod safety;

pub(crate) use persistence::snapshot_questionnaire_version;
pub(crate) use projections::reconcile_variable_projection;

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

use serde::de::{DeserializeSeed, Error as DeError, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::rbac::models::Permission;
use crate::state::AppState;

pub const QDEF_SCHEMA: &str = "https://schemas.qdesigner.dev/questionnaire/1.0.0";
pub const QDEF_FORMAT: &str = "qdesigner.questionnaire";
pub const QDEF_FORMAT_VERSION: &str = "1.0.0";

/// The only public entry point for portable definition behavior.
pub struct QuestionnaireDefinition<A> {
    access: A,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DefinitionCapability {
    Read,
    Write,
}

#[allow(async_fn_in_trait)]
pub trait DefinitionAccess {
    async fn authorize(
        &mut self,
        project_id: Uuid,
        capability: DefinitionCapability,
    ) -> Result<(), ApiError>;

    async fn load(
        &mut self,
        project_id: Uuid,
        questionnaire_id: Uuid,
    ) -> Result<Option<StoredQuestionnaire>, ApiError>;

    async fn apply_validated(
        &mut self,
        input: ValidatedDefinitionChange,
    ) -> Result<ApplyResult, ApiError>;
}

/// A validated definition change. Only the Definition Module constructs it;
/// Repository adapters cannot substitute unvalidated input for its document.
pub struct ValidatedDefinitionChange {
    project_id: Uuid,
    idempotency_key: Option<String>,
    target: Option<ReplacementTarget>,
    commit: bool,
    document: QDefDocument,
    result: ApplyResult,
}

#[derive(Clone, Copy)]
struct ReplacementTarget {
    questionnaire_id: Uuid,
    expected_revision: i32,
}

pub struct PostgresDefinitionAccess<'a> {
    state: &'a AppState,
    connection: &'a mut sqlx::PgConnection,
    user_id: Uuid,
}

impl<'a> PostgresDefinitionAccess<'a> {
    pub fn new(state: &'a AppState, connection: &'a mut sqlx::PgConnection, user_id: Uuid) -> Self {
        Self {
            state,
            connection,
            user_id,
        }
    }
}

impl DefinitionAccess for PostgresDefinitionAccess<'_> {
    async fn apply_validated(
        &mut self,
        input: ValidatedDefinitionChange,
    ) -> Result<ApplyResult, ApiError> {
        persistence::apply_validated(self.connection, self.user_id, input).await
    }

    async fn authorize(
        &mut self,
        project_id: Uuid,
        capability: DefinitionCapability,
    ) -> Result<(), ApiError> {
        let permission = match capability {
            DefinitionCapability::Read => Permission::QuestionnaireRead,
            DefinitionCapability::Write => Permission::QuestionnaireWrite,
        };
        authorize(
            &mut *self.connection,
            &self.state.rbac,
            self.user_id,
            Scope::Project(project_id),
            permission,
        )
        .await
    }

    async fn load(
        &mut self,
        project_id: Uuid,
        questionnaire_id: Uuid,
    ) -> Result<Option<StoredQuestionnaire>, ApiError> {
        let row = sqlx::query_as::<_, StoredQuestionnaireRow>(
            r#"
            SELECT name, description, version AS revision, content, settings,
                   version_major, version_minor, version_patch
            FROM questionnaire_definitions
            WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL
            "#,
        )
        .bind(questionnaire_id)
        .bind(project_id)
        .fetch_optional(&mut *self.connection)
        .await?;

        Ok(row.map(StoredQuestionnaire::from))
    }
}

#[derive(sqlx::FromRow)]
struct StoredQuestionnaireRow {
    name: String,
    description: Option<String>,
    revision: i32,
    version_major: i32,
    version_minor: i32,
    version_patch: i32,
    content: Value,
    settings: Value,
}

impl From<StoredQuestionnaireRow> for StoredQuestionnaire {
    fn from(row: StoredQuestionnaireRow) -> Self {
        Self {
            name: row.name,
            description: row.description,
            revision: row.revision,
            version_major: row.version_major,
            version_minor: row.version_minor,
            version_patch: row.version_patch,
            content: row.content,
            settings: row.settings,
        }
    }
}

#[derive(Debug, Clone)]
pub struct StoredQuestionnaire {
    pub name: String,
    pub description: Option<String>,
    pub revision: i32,
    pub version_major: i32,
    pub version_minor: i32,
    pub version_patch: i32,
    pub content: Value,
    pub settings: Value,
}

#[derive(Debug, Clone)]
pub struct ReadInput {
    pub project_id: Uuid,
    pub questionnaire_id: Uuid,
}

#[derive(Debug, Clone)]
pub struct ApplyInput {
    pub project_id: Uuid,
    /// Raw UTF-8 JSON. Parsing is owned by this Module, never by an Adapter.
    pub definition: String,
    pub commit: bool,
    pub idempotency_key: Option<String>,
    pub questionnaire_id: Option<Uuid>,
    pub expected_revision: Option<i32>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionArtifact {
    /// Exact canonical UTF-8 file contents, including the final LF.
    pub canonical: String,
    /// SHA-256 over RFC 8785 canonical JSON bytes (without the file LF).
    pub digest: String,
    /// Mutable installation revision. This is not part of the portable QDef.
    pub revision: i32,
    pub metadata: DefinitionMetadata,
    pub diagnostics: Vec<DefinitionDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub valid: bool,
    pub committed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub questionnaire_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<i32>,
    pub canonical: Option<String>,
    pub digest: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before_digest: Option<String>,
    pub metadata: Option<DefinitionMetadata>,
    pub diagnostics: Vec<DefinitionDiagnostic>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionValidationFailure {
    pub valid: bool,
    pub diagnostics: Vec<DefinitionDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionMetadata {
    pub questionnaire_name: String,
    pub questionnaire_version: String,
    pub format_version: String,
    pub question_count: usize,
    pub page_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionDiagnostic {
    pub code: String,
    pub severity: DiagnosticSeverity,
    pub path: String,
    pub message: String,
    pub hint: Option<String>,
    pub related_paths: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct DefinitionReadError {
    pub diagnostics: Vec<DefinitionDiagnostic>,
}

impl fmt::Display for DefinitionReadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = self
            .diagnostics
            .first()
            .map(|diagnostic| diagnostic.message.as_str())
            .unwrap_or("Questionnaire definition could not be exported");
        formatter.write_str(message)
    }
}

impl std::error::Error for DefinitionReadError {}

#[derive(Debug)]
pub enum DefinitionReadFailure {
    Access(ApiError),
    Invalid(DefinitionReadError),
}

struct UniqueJson(Value);

struct UniqueJsonSeed {
    path: Vec<String>,
}

impl<'de> DeserializeSeed<'de> for UniqueJsonSeed {
    type Value = UniqueJson;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        deserializer.deserialize_any(UniqueJsonVisitor { path: self.path })
    }
}

struct UniqueJsonVisitor {
    path: Vec<String>,
}

impl<'de> Visitor<'de> for UniqueJsonVisitor {
    type Value = UniqueJson;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON value without duplicate object keys")
    }

    fn visit_bool<E: DeError>(self, value: bool) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::Bool(value)))
    }

    fn visit_i64<E: DeError>(self, value: i64) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::Number(Number::from(value))))
    }

    fn visit_u64<E: DeError>(self, value: u64) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::Number(Number::from(value))))
    }

    fn visit_f64<E: DeError>(self, value: f64) -> Result<Self::Value, E> {
        Number::from_f64(value)
            .map(Value::Number)
            .map(UniqueJson)
            .ok_or_else(|| E::custom("non-finite JSON number"))
    }

    fn visit_str<E: DeError>(self, value: &str) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::String(value.to_owned())))
    }

    fn visit_string<E: DeError>(self, value: String) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::String(value)))
    }

    fn visit_none<E: DeError>(self) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::Null))
    }

    fn visit_unit<E: DeError>(self) -> Result<Self::Value, E> {
        Ok(UniqueJson(Value::Null))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element_seed(UniqueJsonSeed {
            path: child_path(&self.path, values.len().to_string()),
        })? {
            values.push(value.0);
        }
        Ok(UniqueJson(Value::Array(values)))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut object: A) -> Result<Self::Value, A::Error> {
        let mut values = Map::new();
        while let Some(key) = object.next_key::<String>()? {
            if values.contains_key(&key) {
                let path = json_pointer(&child_path(&self.path, key.clone()));
                return Err(A::Error::custom(format!(
                    "QDEF_DUPLICATE_KEY_AT_HEX:{}: object key '{key}' occurs more than once",
                    hex::encode(path)
                )));
            }
            let value = object.next_value_seed(UniqueJsonSeed {
                path: child_path(&self.path, key.clone()),
            })?;
            values.insert(key, value.0);
        }
        Ok(UniqueJson(Value::Object(values)))
    }
}

fn child_path(parent: &[String], segment: String) -> Vec<String> {
    let mut path = parent.to_vec();
    path.push(segment);
    path
}

fn json_pointer(path: &[String]) -> String {
    if path.is_empty() {
        return "/".into();
    }
    format!(
        "/{}",
        path.iter()
            .map(|segment| pointer_segment(segment))
            .collect::<Vec<_>>()
            .join("/")
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefDocument {
    #[serde(rename = "$schema")]
    schema: String,
    format: String,
    format_version: String,
    questionnaire: QDefQuestionnaire,
    assets: BTreeMap<String, Value>,
    variables: BTreeMap<String, Value>,
    questions: BTreeMap<String, QDefTextQuestion>,
    structure: QDefStructure,
    flow: Vec<Value>,
    rules: Vec<Value>,
    settings: QDefSettings,
    translations: BTreeMap<String, Value>,
    extensions: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefQuestionnaire {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_locale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefTextQuestion {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    required: bool,
    display: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    navigation: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    config: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    validation: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefStructure {
    pages: Vec<QDefPage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefPage {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    blocks: Vec<QDefBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefBlock {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(rename = "type")]
    kind: String,
    question_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefSettings {
    #[serde(default)]
    allow_back_navigation: bool,
    #[serde(default)]
    show_progress_bar: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    save_progress: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    webgl: Option<QDefWebGlSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QDefWebGlSettings {
    #[serde(rename = "targetFPS")]
    #[serde(skip_serializing_if = "Option::is_none")]
    target_fps: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    antialias: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pixel_ratio: Option<f64>,
}

impl<A: DefinitionAccess> QuestionnaireDefinition<A> {
    pub fn new(access: A) -> Self {
        Self { access }
    }

    pub fn access(&self) -> &A {
        &self.access
    }

    pub async fn read(
        &mut self,
        input: ReadInput,
    ) -> Result<DefinitionArtifact, DefinitionReadFailure> {
        self.access
            .authorize(input.project_id, DefinitionCapability::Read)
            .await
            .map_err(DefinitionReadFailure::Access)?;
        let stored = self
            .access
            .load(input.project_id, input.questionnaire_id)
            .await
            .map_err(DefinitionReadFailure::Access)?
            .ok_or_else(|| {
                DefinitionReadFailure::Access(ApiError::NotFound("Questionnaire not found".into()))
            })?;
        let revision = stored.revision;
        let document = match document_from_stored(stored) {
            Ok(document) => document,
            Err(diagnostics) => {
                return Err(DefinitionReadFailure::Invalid(DefinitionReadError {
                    diagnostics,
                }));
            }
        };

        let diagnostics = validate(&document);
        if has_errors(&diagnostics) {
            return Err(DefinitionReadFailure::Invalid(DefinitionReadError {
                diagnostics,
            }));
        }

        let (canonical, digest) = canonicalize(&document).map_err(|message| {
            DefinitionReadFailure::Invalid(DefinitionReadError {
                diagnostics: vec![error(
                    "QDEF_CANONICALIZATION_FAILED",
                    "/",
                    message,
                    Some("Remove non-finite or otherwise non-canonical JSON values."),
                )],
            })
        })?;

        Ok(DefinitionArtifact {
            metadata: metadata(&document),
            canonical,
            digest,
            revision,
            diagnostics,
        })
    }

    pub async fn apply(&mut self, input: ApplyInput) -> Result<ApplyResult, ApiError> {
        self.access
            .authorize(input.project_id, DefinitionCapability::Write)
            .await?;

        let raw_definition = match parse_unique_json(&input.definition) {
            Ok(definition) => definition,
            Err(parse_error) => {
                let parse_message = parse_error.to_string();
                let duplicate = parse_message
                    .split_once("QDEF_DUPLICATE_KEY_AT_HEX:")
                    .and_then(|(_, payload)| payload.split_once(": "))
                    .and_then(|(encoded_path, message)| {
                        String::from_utf8(hex::decode(encoded_path).ok()?)
                            .ok()
                            .map(|path| (path, message))
                    });
                return Ok(invalid(vec![error(
                    if duplicate.is_some() {
                        "QDEF_DUPLICATE_KEY"
                    } else {
                        "QDEF_JSON_INVALID"
                    },
                    duplicate.as_ref().map_or("/", |(path, _)| path.as_str()),
                    if let Some((_, message)) = duplicate.as_ref() {
                        (*message).to_owned()
                    } else {
                        format!("Definition is not valid JSON: {parse_error}")
                    },
                    if duplicate.is_some() {
                        Some("Give every object member, including stable-id registry keys, a unique name.")
                    } else {
                        Some("Upload a UTF-8 JSON file exported by QDesigner.")
                    },
                )]));
            }
        };

        let mut envelope_diagnostics = validate_envelope(&raw_definition);
        safety::inspect(&raw_definition, "", &mut envelope_diagnostics);
        if has_errors(&envelope_diagnostics) {
            return Ok(invalid(envelope_diagnostics));
        }

        let document: QDefDocument = match serde_json::from_value(raw_definition) {
            Ok(document) => document,
            Err(parse_error) => {
                return Ok(invalid(vec![error(
                    "QDEF_SCHEMA_INVALID",
                    "/",
                    format!("Definition does not match the supported QDef schema: {parse_error}"),
                    Some("Use the exported .qdef.json shape and remove unknown core fields."),
                )]));
            }
        };

        let diagnostics = validate(&document);
        if has_errors(&diagnostics) {
            return Ok(invalid(diagnostics));
        }

        let result = match canonicalize(&document) {
            Ok((canonical, digest)) => ApplyResult {
                valid: true,
                committed: false,
                questionnaire_id: None,
                revision: None,
                metadata: Some(metadata(&document)),
                canonical: Some(canonical),
                digest: Some(digest),
                before_digest: None,
                diagnostics,
            },
            Err(message) => invalid(vec![error(
                "QDEF_CANONICALIZATION_FAILED",
                "/",
                message,
                Some("Remove non-finite or otherwise non-canonical JSON values."),
            )]),
        };
        if !result.valid {
            return Ok(result);
        }
        let target = match (input.questionnaire_id, input.expected_revision) {
            (None, None) => None,
            (Some(questionnaire_id), Some(expected_revision)) if expected_revision > 0 => {
                Some(ReplacementTarget {
                    questionnaire_id,
                    expected_revision,
                })
            }
            _ => {
                return Ok(invalid(vec![error(
                    "EXPECTED_REVISION_REQUIRED",
                    "/expectedRevision",
                    "Replacing a draft requires its identity and current server revision.",
                    Some("Reload the draft and use the revision returned by the server."),
                )]))
            }
        };
        if !input.commit && target.is_none() {
            return Ok(result);
        }
        let idempotency_key = input
            .idempotency_key
            .filter(|key| !key.trim().is_empty() && key.len() <= 128);
        if input.commit && idempotency_key.is_none() {
            return Ok(invalid(vec![error(
                "IDEMPOTENCY_KEY_REQUIRED",
                "/idempotencyKey",
                "Changing a draft requires a nonempty idempotency key of at most 128 bytes.",
                Some("Generate a key for this change and reuse it when retrying the same request."),
            )]));
        }
        self.access
            .apply_validated(ValidatedDefinitionChange {
                project_id: input.project_id,
                idempotency_key,
                target,
                commit: input.commit,
                document,
                result,
            })
            .await
    }
}

fn parse_unique_json(source: &str) -> Result<Value, serde_json::Error> {
    let mut deserializer = serde_json::Deserializer::from_str(source);
    let value = UniqueJsonSeed { path: Vec::new() }
        .deserialize(&mut deserializer)?
        .0;
    deserializer.end()?;
    Ok(value)
}

fn document_from_stored(
    stored: StoredQuestionnaire,
) -> Result<QDefDocument, Vec<DefinitionDiagnostic>> {
    let mut diagnostics = Vec::new();
    safety::inspect(&stored.content, "/content", &mut diagnostics);
    safety::inspect(&stored.settings, "/settings", &mut diagnostics);
    let content = match stored.content.as_object() {
        Some(content) => content,
        None => {
            return Err(vec![error(
                "QDEF_STORED_CONTENT_INVALID",
                "/content",
                "Stored Questionnaire content must be a JSON object.",
                None,
            )]);
        }
    };

    diagnose_unknown_keys(
        content,
        &[
            "id",
            "projectId",
            "organizationId",
            "name",
            "description",
            "version",
            "versionMajor",
            "versionMinor",
            "versionPatch",
            "created",
            "modified",
            "metadata",
            "settings",
            "questions",
            "pages",
            "variables",
            "flow",
        ],
        "/content",
        &mut diagnostics,
    );
    diagnose_non_empty_capability(content, "variables", &mut diagnostics);
    diagnose_non_empty_capability(content, "flow", &mut diagnostics);

    let mut questions = BTreeMap::new();
    let stored_questions = match content.get("questions") {
        Some(Value::Array(questions)) => questions.clone(),
        Some(_) => {
            diagnostics.push(error(
                "QDEF_STORED_QUESTION_INVALID",
                "/content/questions",
                "Stored Questionnaire questions must be a JSON array.",
                None,
            ));
            Vec::new()
        }
        None => Vec::new(),
    };

    for (index, value) in stored_questions.into_iter().enumerate() {
        let path = format!("/content/questions/{index}");
        let Some(mut object) = value.as_object().cloned() else {
            diagnostics.push(error(
                "QDEF_STORED_QUESTION_INVALID",
                &path,
                "Stored text question must be a JSON object.",
                None,
            ));
            continue;
        };
        let id = take_required_string(&mut object, "id", &path, &mut diagnostics);
        // Ordering is represented by stable-ID references in blocks.
        object.remove("order");

        // The designer projects an explicit non-response marker onto display
        // modules on save. It carries no behavior beyond their module type.
        // Other responseType values remain subject to schema validation.
        if matches!(
            object.get("type").and_then(Value::as_str),
            Some("text-display" | "text-instruction")
        ) && (object.get("responseType") == Some(&serde_json::json!({"type": "none"}))
            || object.get("responseType") == Some(&serde_json::json!({"type": "none", "delay": 0})))
        {
            object.remove("responseType");
        }

        let question: QDefTextQuestion = match serde_json::from_value(Value::Object(object)) {
            Ok(question) => question,
            Err(parse_error) => {
                diagnostics.push(error(
                    "QDEF_STORED_TEXT_SHAPE_UNSUPPORTED",
                    &path,
                    format!("Text question is outside the minimal QDef shape: {parse_error}"),
                    Some("Remove unsupported behavior or wait for its QDef capability ticket."),
                ));
                continue;
            }
        };

        if let Some(id) = id {
            if questions.insert(id.clone(), question).is_some() {
                diagnostics.push(error(
                    "QDEF_DUPLICATE_ID",
                    &path,
                    format!("Question id '{id}' is duplicated."),
                    Some("Give every question a stable, unique id."),
                ));
            }
        }
    }

    let pages = map_pages(content, &mut diagnostics);
    let mut stored_settings = stored.settings.clone();
    let default_locale = if let Some(object) = stored_settings.as_object_mut() {
        let locale = optional_stored_string(
            object,
            "language",
            "/settings",
            "settings",
            "QDEF_STORED_SETTINGS_UNSUPPORTED",
            &mut diagnostics,
        );
        object.remove("language");
        locale
    } else {
        None
    };
    let settings: QDefSettings = match serde_json::from_value(stored_settings) {
        Ok(settings) => settings,
        Err(parse_error) => {
            diagnostics.push(error(
                "QDEF_STORED_SETTINGS_UNSUPPORTED",
                "/settings",
                format!("Questionnaire settings are outside the minimal QDef shape: {parse_error}"),
                Some("Remove unsupported settings or wait for their QDef capability ticket."),
            ));
            QDefSettings::default()
        }
    };

    if has_errors(&diagnostics) {
        return Err(diagnostics);
    }

    Ok(QDefDocument {
        schema: QDEF_SCHEMA.into(),
        format: QDEF_FORMAT.into(),
        format_version: QDEF_FORMAT_VERSION.into(),
        questionnaire: QDefQuestionnaire {
            name: stored.name,
            description: stored.description,
            version: format!(
                "{}.{}.{}",
                stored.version_major, stored.version_minor, stored.version_patch
            ),
            default_locale,
        },
        assets: BTreeMap::new(),
        variables: BTreeMap::new(),
        questions,
        structure: QDefStructure { pages },
        flow: Vec::new(),
        rules: Vec::new(),
        settings,
        translations: BTreeMap::new(),
        extensions: BTreeMap::new(),
    })
}

fn map_pages(
    content: &Map<String, Value>,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> Vec<QDefPage> {
    let mut result = Vec::new();
    let pages = match content.get("pages") {
        Some(Value::Array(pages)) => pages.clone(),
        Some(_) => {
            diagnostics.push(error(
                "QDEF_STORED_PAGE_INVALID",
                "/content/pages",
                "Stored Questionnaire pages must be a JSON array.",
                None,
            ));
            Vec::new()
        }
        None => Vec::new(),
    };

    for (page_index, value) in pages.into_iter().enumerate() {
        let path = format!("/content/pages/{page_index}");
        let Some(object) = value.as_object() else {
            diagnostics.push(error(
                "QDEF_STORED_PAGE_INVALID",
                &path,
                "Stored page must be a JSON object.",
                None,
            ));
            continue;
        };
        diagnose_unknown_keys(
            object,
            &["id", "name", "questions", "blocks"],
            &path,
            diagnostics,
        );
        if object.get("questions").is_some_and(value_is_non_empty) {
            diagnostics.push(error(
                "QDEF_STORED_PAGE_SHAPE_UNSUPPORTED",
                format!("{path}/questions"),
                "Direct page question references are outside the minimal QDef shape.",
                Some("Place ordered question ids in a stable standard block."),
            ));
        }
        let Some(id) = required_string(object, "id", &path, diagnostics) else {
            continue;
        };
        let name = optional_stored_string(
            object,
            "name",
            &path,
            "page",
            "QDEF_STORED_PAGE_INVALID",
            diagnostics,
        );
        let mut blocks = Vec::new();
        let stored_blocks = match object.get("blocks") {
            Some(Value::Array(blocks)) => blocks.clone(),
            Some(_) => {
                diagnostics.push(error(
                    "QDEF_STORED_BLOCK_INVALID",
                    format!("{path}/blocks"),
                    "Stored page blocks must be a JSON array.",
                    None,
                ));
                Vec::new()
            }
            None => Vec::new(),
        };

        for (block_index, block_value) in stored_blocks.into_iter().enumerate() {
            let block_path = format!("{path}/blocks/{block_index}");
            let Some(block) = block_value.as_object() else {
                diagnostics.push(error(
                    "QDEF_STORED_BLOCK_INVALID",
                    &block_path,
                    "Stored block must be a JSON object.",
                    None,
                ));
                continue;
            };
            diagnose_unknown_keys(
                block,
                &["id", "pageId", "name", "type", "questions"],
                &block_path,
                diagnostics,
            );
            let Some(block_id) = required_string(block, "id", &block_path, diagnostics) else {
                continue;
            };
            if let Some(page_id) = optional_stored_string(
                block,
                "pageId",
                &block_path,
                "block",
                "QDEF_STORED_BLOCK_INVALID",
                diagnostics,
            ) {
                if page_id != id {
                    diagnostics.push(error(
                        "QDEF_REFERENCE_NOT_FOUND",
                        format!("{block_path}/pageId"),
                        format!(
                            "Block pageId '{page_id}' does not match its containing page '{id}'."
                        ),
                        Some("Use the containing page's stable id."),
                    ));
                }
            }
            let kind = match block.get("type") {
                None => "standard".to_owned(),
                Some(Value::String(kind)) => kind.clone(),
                Some(_) => {
                    diagnostics.push(error(
                        "QDEF_STORED_BLOCK_INVALID",
                        format!("{block_path}/type"),
                        "Stored block 'type' must be a string when present.",
                        None,
                    ));
                    "standard".to_owned()
                }
            };
            if kind != "standard" {
                diagnostics.push(error(
                    "QDEF_BLOCK_TYPE_UNSUPPORTED",
                    format!("{block_path}/type"),
                    format!("Block type '{kind}' is not supported by the text-only QDef tracer."),
                    Some("Use a standard block for this tracer."),
                ));
            }
            let mut question_ids = Vec::new();
            let stored_question_ids = match block.get("questions") {
                Some(Value::Array(question_ids)) => question_ids.as_slice(),
                Some(_) => {
                    diagnostics.push(error(
                        "QDEF_STORED_BLOCK_INVALID",
                        format!("{block_path}/questions"),
                        "Stored block questions must be an array of stable ids.",
                        Some("Reference each question by its stable string id."),
                    ));
                    &[]
                }
                None => &[],
            };
            for (question_index, value) in stored_question_ids.iter().enumerate() {
                if let Some(question_id) = value.as_str() {
                    question_ids.push(question_id.to_owned());
                } else {
                    diagnostics.push(error(
                        "QDEF_STORED_BLOCK_INVALID",
                        format!("{block_path}/questions/{question_index}"),
                        "Block question references must be stable string ids.",
                        Some("Reference a question by its stable id."),
                    ));
                }
            }
            blocks.push(QDefBlock {
                id: block_id,
                name: optional_stored_string(
                    block,
                    "name",
                    &block_path,
                    "block",
                    "QDEF_STORED_BLOCK_INVALID",
                    diagnostics,
                ),
                kind,
                question_ids,
            });
        }
        result.push(QDefPage { id, name, blocks });
    }

    result
}

fn validate_envelope(definition: &Value) -> Vec<DefinitionDiagnostic> {
    let mut diagnostics = Vec::new();
    let Some(object) = definition.as_object() else {
        return vec![error(
            "QDEF_SCHEMA_INVALID",
            "/",
            "Questionnaire Definition must be a JSON object.",
            Some("Upload a canonical .qdef.json file."),
        )];
    };

    check_constant(
        object,
        "$schema",
        QDEF_SCHEMA,
        "QDEF_SCHEMA_UNSUPPORTED",
        &mut diagnostics,
    );
    check_constant(
        object,
        "format",
        QDEF_FORMAT,
        "QDEF_FORMAT_UNSUPPORTED",
        &mut diagnostics,
    );
    check_constant(
        object,
        "formatVersion",
        QDEF_FORMAT_VERSION,
        "QDEF_FORMAT_VERSION_UNSUPPORTED",
        &mut diagnostics,
    );
    diagnostics
}

fn semantic_version(source: &str) -> Option<[i32; 3]> {
    let parts = source
        .split('.')
        .map(str::parse::<i32>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    let version: [i32; 3] = parts.try_into().ok()?;
    (version.iter().all(|part| *part >= 0)
        && format!("{}.{}.{}", version[0], version[1], version[2]) == source)
        .then_some(version)
}

fn validate(document: &QDefDocument) -> Vec<DefinitionDiagnostic> {
    let mut diagnostics = Vec::new();
    if document.questionnaire.name.trim().is_empty()
        || document.questionnaire.name.chars().count() > 255
    {
        diagnostics.push(error(
            "QDEF_NAME_INVALID",
            "/questionnaire/name",
            "Questionnaire name must contain text and be at most 255 characters.",
            Some("Choose a nonempty name of at most 255 characters."),
        ));
    }
    if semantic_version(&document.questionnaire.version).is_none() {
        diagnostics.push(error("QDEF_VERSION_UNSUPPORTED", "/questionnaire/version",
            "This installation supports three integer version components from 0 to 2147483647, without prerelease or build suffixes.",
            Some("Use a supported questionnaire version, for example 1.0.0.")));
    }
    for (field, nonempty) in [
        ("assets", !document.assets.is_empty()),
        ("variables", !document.variables.is_empty()),
        ("flow", !document.flow.is_empty()),
        ("rules", !document.rules.is_empty()),
        ("translations", !document.translations.is_empty()),
        ("extensions", !document.extensions.is_empty()),
    ] {
        if nonempty {
            diagnostics.push(error(
                "QDEF_CAPABILITY_UNSUPPORTED",
                format!("/{field}"),
                format!("Nonempty '{field}' is outside the text-only QDef tracer."),
                Some("Keep this capability empty until its QDef implementation is delivered."),
            ));
        }
    }
    let mut page_ids = BTreeSet::new();
    let mut block_ids = BTreeSet::new();
    let mut referenced_questions = BTreeSet::new();

    for (id, question) in &document.questions {
        if id.trim().is_empty() {
            diagnostics.push(error(
                "QDEF_ID_EMPTY",
                "/questions",
                "Question registry keys cannot be empty.",
                Some("Give every question a stable, non-empty id."),
            ));
        }
        if !matches!(question.kind.as_str(), "text-display" | "text-instruction") {
            diagnostics.push(error(
                "QDEF_QUESTION_TYPE_UNSUPPORTED",
                format!("/questions/{}/type", pointer_segment(id)),
                format!(
                    "Question type '{}' is not supported by the text-only QDef tracer.",
                    question.kind
                ),
                Some("Use text-display or text-instruction for this tracer."),
            ));
        }
    }

    for (page_index, page) in document.structure.pages.iter().enumerate() {
        if page.id.trim().is_empty() || !page_ids.insert(page.id.clone()) {
            diagnostics.push(error(
                "QDEF_DUPLICATE_ID",
                format!("/structure/pages/{page_index}/id"),
                format!("Page id '{}' must be non-empty and unique.", page.id),
                Some("Give every page a stable, unique id."),
            ));
        }
        for (block_index, block) in page.blocks.iter().enumerate() {
            if block.id.trim().is_empty() || !block_ids.insert(block.id.clone()) {
                diagnostics.push(error(
                    "QDEF_DUPLICATE_ID",
                    format!("/structure/pages/{page_index}/blocks/{block_index}/id"),
                    format!("Block id '{}' must be non-empty and unique.", block.id),
                    Some("Give every block a stable, unique id."),
                ));
            }
            if block.kind != "standard" {
                diagnostics.push(error(
                    "QDEF_BLOCK_TYPE_UNSUPPORTED",
                    format!("/structure/pages/{page_index}/blocks/{block_index}/type"),
                    format!(
                        "Block type '{}' is not supported by the text-only QDef tracer.",
                        block.kind
                    ),
                    Some("Use a standard block for this tracer."),
                ));
            }
            for (question_index, question_id) in block.question_ids.iter().enumerate() {
                if !document.questions.contains_key(question_id) {
                    diagnostics.push(error(
                        "QDEF_REFERENCE_NOT_FOUND",
                        format!(
                            "/structure/pages/{page_index}/blocks/{block_index}/questionIds/{question_index}"
                        ),
                        format!("Question reference '{question_id}' does not resolve."),
                        Some("Reference a key that exists in /questions."),
                    ));
                } else {
                    referenced_questions.insert(question_id.clone());
                }
            }
        }
    }

    for question_id in document.questions.keys() {
        if !referenced_questions.contains(question_id) {
            diagnostics.push(DefinitionDiagnostic {
                code: "QDEF_QUESTION_UNREFERENCED".into(),
                severity: DiagnosticSeverity::Warning,
                path: format!("/questions/{}", pointer_segment(question_id)),
                message: format!("Question '{question_id}' is not referenced by any block."),
                hint: Some("Add its stable id to an ordered block questionIds list.".into()),
                related_paths: Vec::new(),
            });
        }
    }

    diagnostics
}

fn canonicalize(document: &QDefDocument) -> Result<(String, String), String> {
    let bytes = serde_jcs::to_vec(document).map_err(|error| error.to_string())?;
    let digest = format!("sha256:{}", hex::encode(Sha256::digest(&bytes)));
    let mut canonical = String::from_utf8(bytes).map_err(|error| error.to_string())?;
    canonical.push('\n');
    Ok((canonical, digest))
}

fn metadata(document: &QDefDocument) -> DefinitionMetadata {
    DefinitionMetadata {
        questionnaire_name: document.questionnaire.name.clone(),
        questionnaire_version: document.questionnaire.version.clone(),
        format_version: document.format_version.clone(),
        question_count: document.questions.len(),
        page_count: document.structure.pages.len(),
    }
}

fn invalid(diagnostics: Vec<DefinitionDiagnostic>) -> ApplyResult {
    ApplyResult {
        valid: false,
        committed: false,
        questionnaire_id: None,
        revision: None,
        canonical: None,
        digest: None,
        before_digest: None,
        metadata: None,
        diagnostics,
    }
}

fn has_errors(diagnostics: &[DefinitionDiagnostic]) -> bool {
    diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
}

fn check_constant(
    object: &Map<String, Value>,
    field: &str,
    expected: &str,
    code: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) {
    if object.get(field).and_then(Value::as_str) != Some(expected) {
        diagnostics.push(error(
            code,
            format!("/{}", pointer_segment(field)),
            format!("'{field}' must be '{expected}'."),
            Some("Export from a compatible QDesigner version or upgrade this installation."),
        ));
    }
}

fn required_string(
    object: &Map<String, Value>,
    field: &str,
    base_path: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> Option<String> {
    match object.get(field).and_then(Value::as_str) {
        Some(value) if !value.trim().is_empty() => Some(value.to_owned()),
        _ => {
            diagnostics.push(error(
                "QDEF_ID_REQUIRED",
                format!("{base_path}/{field}"),
                format!("'{field}' must be a non-empty string."),
                Some("Assign a stable identifier before export."),
            ));
            None
        }
    }
}

fn optional_stored_string(
    object: &Map<String, Value>,
    field: &str,
    base_path: &str,
    entity: &str,
    code: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> Option<String> {
    match object.get(field) {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(value.clone()),
        Some(_) => {
            diagnostics.push(error(
                code,
                format!("{base_path}/{field}"),
                format!("Stored {entity} '{field}' must be a string when present."),
                None,
            ));
            None
        }
    }
}

fn take_required_string(
    object: &mut Map<String, Value>,
    field: &str,
    base_path: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) -> Option<String> {
    match object
        .remove(field)
        .and_then(|value| value.as_str().map(str::to_owned))
    {
        Some(value) if !value.trim().is_empty() => Some(value),
        _ => {
            diagnostics.push(error(
                "QDEF_ID_REQUIRED",
                format!("{base_path}/{field}"),
                format!("'{field}' must be a non-empty string."),
                Some("Assign a stable identifier before export."),
            ));
            None
        }
    }
}

fn error(
    code: impl Into<String>,
    path: impl Into<String>,
    message: impl Into<String>,
    hint: Option<&str>,
) -> DefinitionDiagnostic {
    DefinitionDiagnostic {
        code: code.into(),
        severity: DiagnosticSeverity::Error,
        path: path.into(),
        message: message.into(),
        hint: hint.map(str::to_owned),
        related_paths: Vec::new(),
    }
}

fn pointer_segment(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

fn diagnose_unknown_keys(
    object: &Map<String, Value>,
    allowed: &[&str],
    base_path: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            diagnostics.push(error(
                "QDEF_STORED_CAPABILITY_UNSUPPORTED",
                format!("{base_path}/{}", pointer_segment(key)),
                format!("Stored field '{key}' is outside the minimal text-only QDef shape."),
                Some("Wait for the corresponding QDef capability ticket; the field was not discarded."),
            ));
        }
    }
}

fn diagnose_non_empty_capability(
    object: &Map<String, Value>,
    field: &str,
    diagnostics: &mut Vec<DefinitionDiagnostic>,
) {
    if object.get(field).is_some_and(value_is_non_empty) {
        diagnostics.push(error(
            "QDEF_STORED_CAPABILITY_UNSUPPORTED",
            format!("/content/{field}"),
            format!("Stored '{field}' behavior is outside the minimal text-only QDef shape."),
            Some("Wait for the corresponding QDef capability ticket; the behavior was not discarded."),
        ));
    }
}

fn value_is_non_empty(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => !values.is_empty(),
        Value::String(value) => !value.is_empty(),
        Value::Bool(value) => *value,
        Value::Number(_) => true,
    }
}
