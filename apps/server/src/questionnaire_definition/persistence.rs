//! Atomic persistence behind the validated Definition Interface.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{Connection, PgConnection};
use std::collections::BTreeSet;
use uuid::Uuid;

use super::{
    error, invalid, ApplyResult, DefinitionDiagnostic, PreparedChange, PreparedDefinitionChange,
    PreparedDocument, QDefDocument, StoredQuestionnaire, StoredQuestionnaireRow,
};
use crate::audit::{self, AuditAction, AuditEvent};
use crate::error::ApiError;

pub(super) async fn apply_prepared(
    connection: &mut PgConnection,
    actor: Uuid,
    input: PreparedDefinitionChange,
) -> Result<ApplyResult, ApiError> {
    // Edit receipt identity depends on the command, not a result re-derived
    // against a later document. Creation/replacement keep existing identities.
    let (change_kind, payload) =
        match &input.change {
            PreparedChange::Replace(prepared) => (
                "replace",
                prepared.result.digest.clone().ok_or_else(|| {
                    ApiError::Internal("Prepared definition has no digest".into())
                })?,
            ),
            PreparedChange::Edits(edits) => (
                "edits",
                serde_jcs::to_string(edits).map_err(|e| ApiError::Internal(e.to_string()))?,
            ),
        };
    let request_digest = match input.target {
        None => payload,
        Some(target) => format!(
            "sha256:{}",
            hex::encode(Sha256::digest(
                format!(
                    "{change_kind}\0{}\0{}\0{payload}",
                    target.questionnaire_id, target.expected_revision
                )
                .as_bytes()
            ))
        ),
    };

    // Savepoint under the authenticated request transaction: even an adapter
    // catching our error cannot commit a partial mutation.
    let mut tx = connection.begin().await?;
    if input.commit {
        let key = input
            .idempotency_key
            .as_deref()
            .ok_or_else(|| ApiError::Internal("Validated commit has no idempotency key".into()))?;
        let mut hash = Sha256::new();
        hash.update(b"qdef-create\0");
        hash.update(input.project_id.as_bytes());
        hash.update(actor.as_bytes());
        hash.update(key.as_bytes());
        let lock_hash = hash.finalize();
        let lock_key =
            i64::from_be_bytes(lock_hash[..8].try_into().expect("SHA-256 has eight bytes"));
        sqlx::query("SELECT pg_advisory_xact_lock($1)")
            .bind(lock_key)
            .execute(&mut *tx)
            .await?;
        let previous: Option<(String, Value)> = sqlx::query_as(
            "SELECT request_digest, result FROM qdef_apply_requests WHERE project_id=$1 AND actor_user_id=$2 AND idempotency_key=$3"
        ).bind(input.project_id).bind(actor).bind(key).fetch_optional(&mut *tx).await?;
        if let Some((previous_digest, previous_result)) = previous {
            if previous_digest != request_digest {
                return Ok(invalid(vec![error(
                    "IDEMPOTENCY_CONFLICT",
                    "/idempotencyKey",
                    "This key already belongs to a different definition change.",
                    Some("Retry the original request, or use a new key for a new change."),
                )]));
            }
            let receipt = serde_json::from_value(previous_result).map_err(|e| {
                ApiError::Internal(format!("Invalid stored definition receipt: {e}"))
            })?;
            tx.commit().await?;
            return Ok(receipt);
        }
    }

    let current = if let Some(target) = input.target {
        let row: Option<(i32, String, i32, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            "SELECT version,status,collaboration_epoch,created_at FROM questionnaire_definitions WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL FOR UPDATE"
        ).bind(target.questionnaire_id).bind(input.project_id).fetch_optional(&mut *tx).await?;
        let (revision, status, epoch, created_at) =
            row.ok_or_else(|| ApiError::NotFound("Questionnaire not found".into()))?;
        if revision != target.expected_revision {
            let mut conflict = invalid(vec![error("REVISION_CONFLICT", "/expectedRevision", "The draft changed after the revision you selected.", Some("Reload the current draft, review your change, and retry using the current revision."))]);
            conflict.questionnaire_id = Some(target.questionnaire_id);
            conflict.revision = Some(revision);
            return Ok(conflict);
        }
        if status != "draft" {
            return Ok(invalid(vec![error(
                "QDEF_TARGET_NOT_DRAFT",
                "/questionnaireId",
                "Only a draft can be changed through Definition apply.",
                Some("Select an editable draft or create a new draft from this definition."),
            )]));
        }
        let stored = sqlx::query_as::<_, StoredQuestionnaireRow>(
            "SELECT name,description,version AS revision,version_major,version_minor,version_patch,content,COALESCE(settings,'{}'::jsonb) AS settings FROM questionnaire_definitions WHERE id=$1 AND project_id=$2"
        ).bind(target.questionnaire_id).bind(input.project_id).fetch_one(&mut *tx).await?;
        let document =
            super::document_from_stored(StoredQuestionnaire::from(stored)).and_then(|document| {
                let diagnostics = super::validate(&document);
                if super::has_errors(&diagnostics) {
                    Err(diagnostics)
                } else {
                    Ok(document)
                }
            });
        Some(CurrentDraft {
            id: target.questionnaire_id,
            revision,
            epoch,
            created_at,
            document,
        })
    } else {
        None
    };

    let PreparedDocument {
        document,
        mut result,
    } = match input.change {
        PreparedChange::Replace(prepared) => *prepared,
        PreparedChange::Edits(edits) => {
            let prior = current
                .as_ref()
                .ok_or_else(|| ApiError::Internal("Prepared edits have no target".into()))?;
            let before = match &prior.document {
                Ok(document) => document,
                Err(diagnostics) => return Ok(invalid(diagnostics.clone())),
            };
            let before =
                serde_json::to_value(before).map_err(|e| ApiError::Internal(e.to_string()))?;
            let after = match super::edits::apply(&before, &edits) {
                Ok(value) => value,
                Err(diagnostics) => return Ok(invalid(diagnostics)),
            };
            match super::prepare_document(after) {
                Ok(prepared) => prepared,
                Err(diagnostics) => return Ok(invalid(diagnostics)),
            }
        }
    };
    let version = super::semantic_version(&document.questionnaire.version).ok_or_else(|| {
        ApiError::Internal("Prepared definition has an unsupported version".into())
    })?;
    let digest = result
        .digest
        .clone()
        .ok_or_else(|| ApiError::Internal("Prepared definition has no digest".into()))?;
    if let Some(prior) = &current {
        // A native draft can be snapshotted even when it is not yet portable.
        // Never invent a prior digest or semantic diff for that case.
        if let Ok(before) = &prior.document {
            result.before_digest = Some(super::canonicalize(before).map_err(ApiError::Internal)?.1);
            result.diff = Some(super::diff::between(
                &serde_json::to_value(before).map_err(|e| ApiError::Internal(e.to_string()))?,
                &serde_json::to_value(&document).map_err(|e| ApiError::Internal(e.to_string()))?,
            ));
        }
        result.questionnaire_id = Some(prior.id);
        result.revision = Some(prior.revision);
    }
    if !input.commit {
        tx.commit().await?;
        return Ok(result);
    }
    let now = chrono::Utc::now();
    let (id, revision, epoch, created_at) = if let Some(prior) = current {
        let revision = prior
            .revision
            .checked_add(1)
            .ok_or_else(|| ApiError::Conflict("Revision limit reached".into()))?;
        let epoch = prior
            .epoch
            .checked_add(1)
            .ok_or_else(|| ApiError::Conflict("Collaboration generation limit reached".into()))?;
        snapshot_questionnaire_version(&mut tx, prior.id, actor).await?;
        (prior.id, revision, epoch, prior.created_at)
    } else {
        (Uuid::new_v4(), 1, 0, now)
    };

    let organization_id: Uuid =
        sqlx::query_scalar("SELECT organization_id FROM projects WHERE id=$1")
            .bind(input.project_id)
            .fetch_one(&mut *tx)
            .await?;
    let mut settings =
        serde_json::to_value(&document.settings).map_err(|e| ApiError::Internal(e.to_string()))?;
    if let Some(locale) = &document.questionnaire.default_locale {
        settings["language"] = json!(locale);
    }
    let mut content = persisted_content(&document)?;
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
    content["created"] = json!(created_at.to_rfc3339());
    content["modified"] = json!(now.to_rfc3339());

    let written = if input.target.is_some() {
        sqlx::query("UPDATE questionnaire_definitions SET name=$1,description=$2,content=$3,settings=$4,version_major=$5,version_minor=$6,version_patch=$7,version=$8,collaboration_epoch=$9,yjs_state=NULL WHERE id=$10 AND project_id=$11")
            .bind(&document.questionnaire.name).bind(&document.questionnaire.description).bind(&content).bind(&settings)
            .bind(version[0]).bind(version[1]).bind(version[2]).bind(revision).bind(epoch).bind(id).bind(input.project_id)
            .execute(&mut *tx).await
    } else {
        sqlx::query("INSERT INTO questionnaire_definitions (project_id,name,description,content,settings,created_by,version_major,version_minor,version_patch,status,version,id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',1,$10)")
            .bind(input.project_id).bind(&document.questionnaire.name).bind(&document.questionnaire.description).bind(&content).bind(&settings).bind(actor)
            .bind(version[0]).bind(version[1]).bind(version[2]).bind(id).execute(&mut *tx).await
    };
    if let Err(failure) = written {
        if failure.as_database_error().is_some_and(|e| {
            e.constraint() == Some("questionnaire_definitions_project_id_name_version_key")
        }) {
            return Ok(invalid(vec![error("QDEF_NAME_CONFLICT", "/questionnaire/name",
                "A questionnaire with this name already exists in this project.",
                Some("Choose a different questionnaire name and inspect the definition again, or import into another project."))]));
        }
        return Err(ApiError::from_db_error(failure));
    }
    super::reconcile_variable_projection(&mut tx, id, version, &content).await?;
    audit::record(&mut tx, AuditEvent {
        organization_id, actor_user_id: actor,
        action: if change_kind == "edits" { AuditAction::QuestionnaireDefinitionEdited } else if input.target.is_some() { AuditAction::QuestionnaireDefinitionReplaced } else { AuditAction::QuestionnaireDefinitionImported },
        resource_type: audit::resource::QUESTIONNAIRE, resource_id: Some(id),
        metadata: json!({"projectId": input.project_id, "idempotencyKey": input.idempotency_key,
            "beforeDigest": result.before_digest, "afterDigest": digest, "operation": change_kind, "revision": revision, "collaborationEpoch": epoch}), ip: None,
    }).await?;
    result.committed = true;
    result.questionnaire_id = Some(id);
    result.revision = Some(revision);
    sqlx::query("INSERT INTO qdef_apply_requests (project_id,actor_user_id,idempotency_key,request_digest,result) VALUES ($1,$2,$3,$4,$5)")
        .bind(input.project_id).bind(actor).bind(&input.idempotency_key).bind(request_digest)
        .bind(serde_json::to_value(&result).map_err(|e| ApiError::Internal(e.to_string()))?)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(result)
}
struct CurrentDraft {
    id: Uuid,
    revision: i32,
    epoch: i32,
    created_at: chrono::DateTime<chrono::Utc>,
    document: Result<QDefDocument, Vec<DefinitionDiagnostic>>,
}

fn persisted_content(document: &QDefDocument) -> Result<Value, ApiError> {
    let mut questions = Vec::new();
    let mut seen = BTreeSet::new();
    let ordered_ids = document
        .structure
        .pages
        .iter()
        .flat_map(|page| &page.blocks)
        .flat_map(|block| &block.question_ids)
        .chain(document.questions.keys())
        .filter(|id| seen.insert(*id));
    for (order, id) in ordered_ids.enumerate() {
        let question = document.questions.get(id).ok_or_else(|| {
            ApiError::Internal("Validated structure references a missing question".into())
        })?;
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
/// Snapshot the current questionnaire state into the versions table.
///
/// Takes an exclusive row lock on the questionnaire *before* reading its
/// version so that concurrent save/publish/bump requests are serialized on
/// this questionnaire — without the lock, two transactions could both read the
/// same `version` for their snapshot before either increments it and then both
/// try to INSERT the same `(questionnaire_id, version)` pair, colliding on the
/// `idx_questionnaire_versions_identity` unique index (HTTP 500).
///
/// The INSERT is also idempotent (`ON CONFLICT ... DO NOTHING`): publish does
/// not bump `version`, so re-publishing — or any save that doesn't advance the
/// version — must not create a duplicate snapshot row. `DO NOTHING` (rather
/// than `DO UPDATE`) preserves the first snapshot captured for a given version
/// number, which is the published/historical content for that version.
pub(crate) async fn snapshot_questionnaire_version(
    conn: &mut sqlx::PgConnection,
    questionnaire_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    // Serialize concurrent version mutations on this questionnaire.
    sqlx::query(
        r#"
        SELECT 1 FROM questionnaire_definitions
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE
        "#,
    )
    .bind(questionnaire_id)
    .execute(&mut *conn)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO questionnaire_versions (questionnaire_id, version, content, title, description, created_by, version_major, version_minor, version_patch, settings)
        SELECT id, version, content, name, description, $2, version_major, version_minor, version_patch, settings
        FROM questionnaire_definitions
        WHERE id = $1 AND deleted_at IS NULL
        ON CONFLICT (questionnaire_id, version) DO NOTHING
        "#,
    )
    .bind(questionnaire_id)
    .bind(user_id)
    .execute(&mut *conn)
    .await?;

    Ok(())
}
