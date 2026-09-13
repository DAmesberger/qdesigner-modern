//! Atomic persistence behind the validated Definition Interface.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{Connection, PgConnection};
use uuid::Uuid;

use super::{error, invalid, ApplyResult, CreateDefinition, QDefDocument};
use crate::audit::{self, AuditAction, AuditEvent};
use crate::error::ApiError;

pub(super) async fn create(
    connection: &mut PgConnection,
    actor: Uuid,
    input: CreateDefinition,
) -> Result<ApplyResult, ApiError> {
    let document = &input.document;
    let version = super::semantic_version(&document.questionnaire.version).ok_or_else(|| {
        ApiError::Internal("Validated definition has an unsupported version".into())
    })?;
    let mut content = persisted_content(document)?;
    let mut settings =
        serde_json::to_value(&document.settings).map_err(|e| ApiError::Internal(e.to_string()))?;
    if let Some(locale) = &document.questionnaire.default_locale {
        settings["language"] = json!(locale);
    }
    let digest = input
        .result
        .digest
        .as_deref()
        .ok_or_else(|| ApiError::Internal("Validated definition has no digest".into()))?;

    // This is a savepoint under the authenticated request transaction. Every
    // failure rolls back our writes even if an adapter catches the error.
    let mut tx = connection.begin().await?;
    let mut hash = Sha256::new();
    hash.update(b"qdef-create\0");
    hash.update(input.project_id.as_bytes());
    hash.update(actor.as_bytes());
    hash.update(input.idempotency_key.as_bytes());
    let lock_hash = hash.finalize();
    let lock_key = i64::from_be_bytes(lock_hash[..8].try_into().expect("SHA-256 has eight bytes"));
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(lock_key)
        .execute(&mut *tx)
        .await?;

    let previous: Option<(String, Value)> = sqlx::query_as(
        "SELECT request_digest, result FROM qdef_apply_requests WHERE project_id=$1 AND actor_user_id=$2 AND idempotency_key=$3"
    ).bind(input.project_id).bind(actor).bind(&input.idempotency_key)
        .fetch_optional(&mut *tx).await?;
    if let Some((previous_digest, previous_result)) = previous {
        if previous_digest != digest {
            return Ok(invalid(vec![error(
                "IDEMPOTENCY_CONFLICT",
                "/idempotencyKey",
                "This key already belongs to a different import.",
                Some("Retry the original definition, or use a new key for a new import."),
            )]));
        }
        let result = serde_json::from_value(previous_result)
            .map_err(|e| ApiError::Internal(format!("Invalid stored import receipt: {e}")))?;
        tx.commit().await?;
        return Ok(result);
    }

    let organization_id: Uuid =
        sqlx::query_scalar("SELECT organization_id FROM projects WHERE id=$1")
            .bind(input.project_id)
            .fetch_one(&mut *tx)
            .await?;
    let id = Uuid::new_v4();
    // The collaboration room seeds from this projection, so it must receive
    // both portable metadata and trusted installation bindings at first open.
    content["id"] = json!(id);
    content["projectId"] = json!(input.project_id);
    content["organizationId"] = json!(organization_id);
    content["name"] = json!(document.questionnaire.name);
    if let Some(description) = &document.questionnaire.description {
        content["description"] = json!(description);
    }
    content["version"] = json!(document.questionnaire.version);
    content["versionMajor"] = json!(version[0]);
    content["versionMinor"] = json!(version[1]);
    content["versionPatch"] = json!(version[2]);
    content["settings"] = settings.clone();
    let now = chrono::Utc::now().to_rfc3339();
    content["created"] = json!(now);
    content["modified"] = json!(now);
    let inserted = sqlx::query(
        "INSERT INTO questionnaire_definitions (project_id,name,description,content,settings,created_by,version_major,version_minor,version_patch,status,version,id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',1,$10)"
    ).bind(input.project_id).bind(&document.questionnaire.name)
        .bind(&document.questionnaire.description).bind(&content).bind(&settings).bind(actor)
        .bind(version[0]).bind(version[1]).bind(version[2]).bind(id)
        .execute(&mut *tx).await;
    if let Err(failure) = inserted {
        if failure.as_database_error().is_some_and(|e| {
            e.constraint() == Some("questionnaire_definitions_project_id_name_version_key")
        }) {
            return Ok(invalid(vec![error("QDEF_NAME_CONFLICT", "/questionnaire/name",
                "A questionnaire with this name already occupies the initial revision in this project.",
                Some("Choose a different questionnaire name and inspect the definition again, or import into another project."))]));
        }
        return Err(ApiError::from_db_error(failure));
    }

    audit::record(
        &mut tx,
        AuditEvent {
            organization_id,
            actor_user_id: actor,
            action: AuditAction::QuestionnaireDefinitionImported,
            resource_type: audit::resource::QUESTIONNAIRE,
            resource_id: Some(id),
            metadata: json!({"projectId": input.project_id, "idempotencyKey": input.idempotency_key,
            "beforeDigest": null, "afterDigest": digest, "revision": 1}),
            ip: None,
        },
    )
    .await?;

    let mut result = input.result;
    result.committed = true;
    result.questionnaire_id = Some(id);
    result.revision = Some(1);
    sqlx::query("INSERT INTO qdef_apply_requests (project_id,actor_user_id,idempotency_key,request_digest,result) VALUES ($1,$2,$3,$4,$5)")
        .bind(input.project_id).bind(actor).bind(&input.idempotency_key).bind(&result.digest)
        .bind(serde_json::to_value(&result).map_err(|e| ApiError::Internal(e.to_string()))?)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(result)
}

fn persisted_content(document: &QDefDocument) -> Result<Value, ApiError> {
    let mut questions = Vec::new();
    for (order, (id, question)) in document.questions.iter().enumerate() {
        let mut value =
            serde_json::to_value(question).map_err(|e| ApiError::Internal(e.to_string()))?;
        value["id"] = json!(id);
        value["order"] = json!(order);
        questions.push(value);
    }
    let pages: Vec<Value> = document.structure.pages.iter().map(|page| {
        let blocks: Vec<Value> = page.blocks.iter().map(|block| {
            let mut value = json!({"id": block.id, "pageId": page.id, "type": block.kind, "questions": block.question_ids});
            if let Some(name) = &block.name { value["name"] = json!(name); }
            value
        }).collect();
        let mut value = json!({"id": page.id, "blocks": blocks});
        if let Some(name) = &page.name { value["name"] = json!(name); }
        value
    }).collect();
    Ok(json!({"questions": questions, "pages": pages, "variables": [], "flow": []}))
}
