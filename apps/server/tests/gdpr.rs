//! E-RBAC-9 — org GDPR data export + tenant erasure + residency.
//!
//! Drives the real router end-to-end:
//!
//!  (a) an owner-requested export runs to `ready` and its zip bundle covers
//!      the org's sessions + responses (participant PII present in the
//!      bundle, as a DSAR fulfillment must be);
//!  (b) a legal hold blocks erasure (409) and leaves the data intact;
//!  (c) erasure (password + typed slug confirmation) removes participant
//!      data while the org's audit_events survive (including the
//!      `organization.data_erased` entry).
//!
//! Storage is a REAL MinIO (build_media_test_state) so the export artifact is
//! actually written and read back. Sessions/responses are seeded via the
//! superuser fixture pool (bypasses RLS) and inspected the same way.

use std::io::Read;
use std::sync::Arc;
use std::time::Duration;

use axum::http::StatusCode;
use qdesigner_server::state::AppState;
use qdesigner_server::storage::s3::S3StorageService;
use uuid::Uuid;

mod common;
use common::{
    build_media_test_state, build_test_state, fixture_pool, json_request, provision_tenant,
    register_user, test_app,
};

const EXPORT_BUCKET: &str = "qdesigner-gdpr-test";

/// Seed one completed session (with participant PII) + one response under a
/// questionnaire, via the superuser pool.
async fn seed_session_with_response(
    fixtures: &sqlx::PgPool,
    questionnaire_id: Uuid,
    participant: &str,
) -> Uuid {
    let session_id = Uuid::new_v4();
    sqlx::query(
        r#"INSERT INTO sessions (id, questionnaire_id, participant_id, status, ip_address)
           VALUES ($1, $2, $3, 'completed', '203.0.113.9'::inet)"#,
    )
    .bind(session_id)
    .bind(questionnaire_id)
    .bind(participant)
    .execute(fixtures)
    .await
    .expect("seed session");

    sqlx::query(
        r#"INSERT INTO responses (session_id, question_id, value)
           VALUES ($1, 'q1', '{"answer":"hello-secret"}'::jsonb)"#,
    )
    .bind(session_id)
    .execute(fixtures)
    .await
    .expect("seed response");

    session_id
}

/// (a) Export request → poll to ready → the bundle contains the seeded
/// sessions + responses.
#[tokio::test]
async fn export_bundle_covers_sessions_and_responses() {
    let Some(state) = build_media_test_state(EXPORT_BUCKET).await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    seed_session_with_response(&fixtures, tenant.questionnaire_id, "P-EXPORT-001").await;

    // Request the export.
    let (status, job) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/export", tenant.org_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "export accepted: {job:?}");
    let job_id = job["id"].as_str().expect("job id").to_string();

    // Poll until ready (background job).
    let mut ready = None;
    for _ in 0..100 {
        let (poll_status, poll) = json_request(
            &app,
            "GET",
            &format!("/api/organizations/{}/export/{job_id}", tenant.org_id),
            Some(&owner.token),
            None,
        )
        .await;
        assert_eq!(poll_status, StatusCode::OK, "poll ok: {poll:?}");
        match poll["status"].as_str() {
            Some("ready") => {
                ready = Some(poll);
                break;
            }
            Some("failed") => panic!("export failed: {poll:?}"),
            _ => tokio::time::sleep(Duration::from_millis(50)).await,
        }
    }
    if ready.is_none() {
        let dbg: (String, Option<String>) =
            sqlx::query_as("SELECT status, error FROM data_exports WHERE id = $1")
                .bind(Uuid::parse_str(&job_id).unwrap())
                .fetch_one(&fixtures)
                .await
                .expect("load export row for diagnostics");
        panic!(
            "export never ready; db row status={:?} error={:?}",
            dbg.0, dbg.1
        );
    }
    let ready = ready.expect("export reached ready within the poll window");
    assert!(
        ready["download_url"].as_str().is_some(),
        "ready export exposes a presigned download_url: {ready:?}"
    );

    // Fetch the artifact bytes from object storage and inspect the zip.
    let artifact_key: String =
        sqlx::query_scalar("SELECT artifact_key FROM data_exports WHERE id = $1")
            .bind(Uuid::parse_str(&job_id).unwrap())
            .fetch_one(&fixtures)
            .await
            .expect("artifact key");

    let object = state
        .storage
        .get_object(&artifact_key, None)
        .await
        .expect("download export artifact");
    let bytes = object
        .body
        .collect()
        .await
        .expect("collect artifact bytes")
        .to_vec();

    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("export is a valid zip");

    let read_entry = |archive: &mut zip::ZipArchive<std::io::Cursor<Vec<u8>>>, name: &str| {
        let mut s = String::new();
        archive
            .by_name(name)
            .unwrap_or_else(|_| panic!("bundle contains {name}"))
            .read_to_string(&mut s)
            .unwrap();
        s
    };

    let sessions = read_entry(&mut archive, "sessions.json");
    assert!(
        sessions.contains("P-EXPORT-001"),
        "sessions.json carries the participant PII: {sessions}"
    );
    let responses = read_entry(&mut archive, "responses.json");
    assert!(
        responses.contains("hello-secret"),
        "responses.json carries the answer payload: {responses}"
    );
    // Manifest sanity.
    let manifest = read_entry(&mut archive, "manifest.json");
    assert!(manifest.contains("qdesigner.org_export"));

    // Cleanup: remove the export row + artifact so reruns stay clean.
    let _ = state.storage.delete(&artifact_key).await;
    let _ = sqlx::query("DELETE FROM data_exports WHERE organization_id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
    let _ = sqlx::query("DELETE FROM projects WHERE organization_id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
}

/// (a2) F-34: two *concurrent* export requests must not both create a job.
/// The partial unique index `uq_data_exports_org_inflight` (00047) is the
/// atomic arbiter behind the non-atomic in-flight SELECT gate: exactly one
/// request 202s, the other maps the 23505 back to a 409.
#[tokio::test]
async fn concurrent_export_requests_yield_one_202_one_409() {
    let Some(state) = build_media_test_state(EXPORT_BUCKET).await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;

    let uri = format!("/api/organizations/{}/export", tenant.org_id);
    // Fire both requests concurrently against the same router.
    let (a, b) = tokio::join!(
        json_request(&app, "POST", &uri, Some(&owner.token), None),
        json_request(&app, "POST", &uri, Some(&owner.token), None),
    );

    let mut statuses = [a.0, b.0];
    statuses.sort_by_key(|s| s.as_u16());
    assert_eq!(
        statuses,
        [StatusCode::ACCEPTED, StatusCode::CONFLICT],
        "exactly one export accepted, one rejected as in-progress: {:?} / {:?}",
        a,
        b
    );

    // Exactly one row exists for the org.
    let job_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM data_exports WHERE organization_id = $1")
            .bind(tenant.org_id)
            .fetch_one(&fixtures)
            .await
            .expect("count export rows");
    assert_eq!(job_count, 1, "only one export job persisted");

    // Let the winning background job settle, then clean up its artifact + rows.
    for _ in 0..100 {
        let terminal: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM data_exports \
             WHERE organization_id = $1 AND status IN ('ready','failed'))",
        )
        .bind(tenant.org_id)
        .fetch_one(&fixtures)
        .await
        .unwrap_or(false);
        if terminal {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    if let Ok(Some(key)) = sqlx::query_scalar::<_, Option<String>>(
        "SELECT artifact_key FROM data_exports WHERE organization_id = $1",
    )
    .bind(tenant.org_id)
    .fetch_one(&fixtures)
    .await
    {
        let _ = state.storage.delete(&key).await;
    }
    let _ = sqlx::query("DELETE FROM data_exports WHERE organization_id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
    let _ = sqlx::query("DELETE FROM projects WHERE organization_id = $1")
        .bind(tenant.org_id)
        .execute(&fixtures)
        .await;
}

/// (b)+(c) Legal hold blocks erasure; once released, erasure removes
/// participant data but preserves audit_events.
#[tokio::test]
async fn legal_hold_blocks_then_erase_preserves_audit() {
    // Erasure never uploads/downloads (no media seeded), so the stubbed storage
    // is enough — and it avoids racing the export test on bucket creation.
    let Some(state) = build_test_state().await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let session_id =
        seed_session_with_response(&fixtures, tenant.questionnaire_id, "P-ERASE-001").await;

    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&fixtures)
        .await
        .expect("org slug");

    // Enable legal hold.
    let (status, _) = json_request(
        &app,
        "PUT",
        &format!("/api/organizations/{}/legal-hold", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "legal_hold": true })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "legal hold enabled");

    // Erase blocked by the hold → 409, data intact.
    let erase_body = serde_json::json!({ "password": "demo123456", "confirmation": slug });
    let (status, body) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&erase_body),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "legal hold blocks erase: {body:?}"
    );

    let still_there: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_one(&fixtures)
        .await
        .expect("count session under hold");
    assert_eq!(still_there, 1, "session must survive a hold-blocked erase");

    // Release the hold.
    let (status, _) = json_request(
        &app,
        "PUT",
        &format!("/api/organizations/{}/legal-hold", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "legal_hold": false })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "legal hold released");

    // Wrong password → 401.
    let (status, _) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "password": "wrong-password", "confirmation": slug })),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "wrong password → 401");

    // Wrong confirmation → 400.
    let (status, _) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "password": "demo123456", "confirmation": "not-the-slug" })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "confirmation mismatch → 400"
    );

    // Correct erase → 200.
    let (status, body) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&erase_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "erase succeeds: {body:?}");

    // Participant data gone.
    let sessions_left: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE questionnaire_id = $1")
            .bind(tenant.questionnaire_id)
            .fetch_one(&fixtures)
            .await
            .expect("count sessions after erase");
    assert_eq!(sessions_left, 0, "participant sessions must be erased");

    let responses_left: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM responses r
           JOIN sessions s ON s.id = r.session_id
           WHERE s.questionnaire_id = $1"#,
    )
    .bind(tenant.questionnaire_id)
    .fetch_one(&fixtures)
    .await
    .expect("count responses after erase");
    assert_eq!(responses_left, 0, "participant responses must be erased");

    // Org soft-deleted, but the row (and thus its audit_events) survives.
    let deleted_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT deleted_at FROM organizations WHERE id = $1")
            .bind(tenant.org_id)
            .fetch_one(&fixtures)
            .await
            .expect("org row survives erase");
    assert!(deleted_at.is_some(), "org must be soft-deleted");

    // audit_events retained through erasure, including the erase entry.
    let erase_events: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM audit_events WHERE organization_id = $1 AND action = 'organization.data_erased'",
    )
    .bind(tenant.org_id)
    .fetch_one(&fixtures)
    .await
    .expect("count erase audit events");
    assert_eq!(erase_events, 1, "the erasure itself must be audited");

    let total_events: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM audit_events WHERE organization_id = $1")
            .bind(tenant.org_id)
            .fetch_one(&fixtures)
            .await
            .expect("count all audit events");
    assert!(
        total_events >= 1,
        "audit_events must be preserved through erasure"
    );
}

// ── Durable erasure: the objects, not just the rows (migration 00060) ────────
//
// Erasure used to capture exactly ONE of the three object-key columns in this
// schema, and to purge even that one best-effort AFTER the rows were destroyed.
// Three things were therefore true of a "successful" erasure:
//
//   * every PARTICIPANT-uploaded file (`session_media.s3_key`) survived it —
//     the key was never captured, and `ON DELETE CASCADE` took the row that
//     named it, so the object was left in the bucket with nothing pointing at
//     it. Unfindable, and un-erasable thereafter.
//   * every export zip (`data_exports.artifact_key`) survived it — a complete
//     archive of exactly the data being erased, still referenced by a live row,
//     still downloadable.
//   * a storage outage during the purge lost the keys with the rows, and the
//     caller was told "erased" regardless.
//
// The three tests below are the counter-examples, driven against a REAL MinIO —
// mocking the storage would mock away the very failure being fixed.

/// Upload a real object into MinIO under `key`.
async fn put_object(state: &AppState, key: &str, body: &[u8]) {
    state
        .storage
        .upload(key, body.to_vec(), "application/octet-stream")
        .await
        .unwrap_or_else(|e| panic!("seed object {key}: {e}"));
}

/// Does the object still exist in storage?
async fn object_exists(state: &AppState, key: &str) -> bool {
    state.storage.get_object(key, None).await.is_ok()
}

/// Seed a participant-uploaded binary answer: a REAL object in storage plus the
/// `session_media` row that names it — exactly what `POST /api/sessions/{id}/media`
/// produces on the anonymous fillout path.
async fn seed_session_media(state: &AppState, fixtures: &sqlx::PgPool, session_id: Uuid) -> String {
    let key = format!("sessions/{session_id}/media/{}.bin", Uuid::new_v4());
    put_object(state, &key, b"participant-uploaded-secret").await;
    sqlx::query(
        r#"INSERT INTO session_media (session_id, filename, s3_key, content_type, size_bytes)
           VALUES ($1, 'answer.bin', $2, 'application/octet-stream', 26)"#,
    )
    .bind(session_id)
    .bind(&key)
    .execute(fixtures)
    .await
    .expect("seed session_media");
    key
}

/// Seed a designer-uploaded stimulus: a REAL object plus its `media_assets` row.
async fn seed_media_asset(
    state: &AppState,
    fixtures: &sqlx::PgPool,
    org_id: Uuid,
    uploader: Uuid,
) -> String {
    let key = format!("eu/{org_id}/{}.bin", Uuid::new_v4());
    put_object(state, &key, b"designer-stimulus").await;
    sqlx::query(
        r#"INSERT INTO media_assets
               (organization_id, filename, content_type, size_bytes, storage_key, uploaded_by)
           VALUES ($1, 'stimulus.bin', 'application/octet-stream', 17, $2, $3)"#,
    )
    .bind(org_id)
    .bind(&key)
    .bind(uploader)
    .execute(fixtures)
    .await
    .expect("seed media_assets");
    key
}

/// Seed a completed DSAR export: a REAL zip in storage plus the `ready`
/// `data_exports` row pointing at it.
async fn seed_ready_export(state: &AppState, fixtures: &sqlx::PgPool, org_id: Uuid) -> String {
    let job_id = Uuid::new_v4();
    let key = format!("eu/exports/{org_id}/{job_id}.zip");
    put_object(state, &key, b"PK-a-full-copy-of-everything-being-erased").await;
    sqlx::query(
        r#"INSERT INTO data_exports (id, organization_id, status, artifact_key, data_region,
                                     size_bytes, completed_at, expires_at)
           VALUES ($1, $2, 'ready', $3, 'eu', 41, now(), now() + interval '7 days')"#,
    )
    .bind(job_id)
    .bind(org_id)
    .bind(&key)
    .execute(fixtures)
    .await
    .expect("seed data_exports");
    key
}

/// Armed keys still owed for an org (the durable ledger, read past RLS).
async fn pending_keys(fixtures: &sqlx::PgPool, org_id: Uuid) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT storage_key FROM pending_object_deletions
         WHERE organization_id = $1 AND armed_at IS NOT NULL ORDER BY storage_key",
    )
    .bind(org_id)
    .fetch_all(fixtures)
    .await
    .expect("read pending ledger")
}

/// Best-effort teardown so a failing run leaves neither objects nor rows behind.
async fn cleanup(state: &AppState, fixtures: &sqlx::PgPool, org_id: Uuid, keys: &[String]) {
    for k in keys {
        let _ = state.storage.delete(k).await;
    }
    for sql in [
        "DELETE FROM pending_object_deletions WHERE organization_id = $1",
        "DELETE FROM data_exports WHERE organization_id = $1",
        "DELETE FROM projects WHERE organization_id = $1",
        "DELETE FROM media_assets WHERE organization_id = $1",
    ] {
        let _ = sqlx::query(sql).bind(org_id).execute(fixtures).await;
    }
}

/// (d) The sharpest one: a participant's uploaded file must not survive the
/// erasure of the study that collected it.
///
/// `session_media.s3_key` was never captured. `DELETE FROM projects` cascaded
/// the row away and the key with it, so the object stayed in the bucket forever
/// — orphaned, unfindable, and holding whatever the participant uploaded.
#[tokio::test]
async fn erasure_deletes_participant_uploaded_session_media() {
    let Some(state) = build_media_test_state(EXPORT_BUCKET).await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let session_id =
        seed_session_with_response(&fixtures, tenant.questionnaire_id, "P-MEDIA-001").await;
    let key = seed_session_media(&state, &fixtures, session_id).await;

    assert!(
        object_exists(&state, &key).await,
        "precondition: the participant's file is in storage"
    );

    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&fixtures)
        .await
        .expect("org slug");

    let (status, body) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "password": "demo123456", "confirmation": slug })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "erase completes: {body:?}");
    assert_eq!(
        body["status"], "complete",
        "erase reports complete: {body:?}"
    );
    assert_eq!(body["objects_pending"], 0, "nothing left owed: {body:?}");

    // The row cascaded away — it always did. The OBJECT is the point.
    let rows_left: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM session_media WHERE id IS NOT NULL AND session_id = $1",
    )
    .bind(session_id)
    .fetch_one(&fixtures)
    .await
    .expect("count session_media");
    assert_eq!(rows_left, 0, "session_media row cascaded away");

    assert!(
        !object_exists(&state, &key).await,
        "the participant's uploaded file MUST be gone from object storage after \
         an erasure — it is the most sensitive byte range in the system, and it \
         is the one an erasure used to leave behind: {key}"
    );

    cleanup(&state, &fixtures, tenant.org_id, &[key]).await;
}

/// (e) An erasure must not leave behind a downloadable archive of exactly what
/// it claimed to erase.
///
/// The org is only SOFT-deleted, so `data_exports` rows never cascaded: the row
/// survived, still `ready`, still pointing at a zip of the whole tenant.
#[tokio::test]
async fn erasure_deletes_export_artifacts_and_rows() {
    let Some(state) = build_media_test_state(EXPORT_BUCKET).await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    seed_session_with_response(&fixtures, tenant.questionnaire_id, "P-EXPORTED-001").await;
    let key = seed_ready_export(&state, &fixtures, tenant.org_id).await;

    assert!(
        object_exists(&state, &key).await,
        "precondition: the export zip is in storage"
    );

    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&fixtures)
        .await
        .expect("org slug");

    let (status, body) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "password": "demo123456", "confirmation": slug })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "erase completes: {body:?}");
    assert_eq!(
        body["status"], "complete",
        "erase reports complete: {body:?}"
    );

    assert!(
        !object_exists(&state, &key).await,
        "the export zip MUST be gone — it is a full copy of the erased tenant: {key}"
    );

    let export_rows: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM data_exports WHERE organization_id = $1")
            .bind(tenant.org_id)
            .fetch_one(&fixtures)
            .await
            .expect("count data_exports");
    assert_eq!(
        export_rows, 0,
        "the data_exports rows MUST be gone too — a live row pointing at a \
         deleted artifact is still a record that the export existed, and the \
         org's soft delete does not cascade to them"
    );

    cleanup(&state, &fixtures, tenant.org_id, &[key]).await;
}

/// (f) The durability contract itself: storage fails DURING the erasure.
///
/// The old shape captured the keys, destroyed the rows, and only then tried to
/// delete the objects — so a storage outage at that instant destroyed the only
/// record of what was still owed, and the handler returned 200 anyway. This
/// test forces exactly that outage (a real S3 client pointed at a dead endpoint)
/// and asserts the three things that make the erasure honest instead:
///
///   1. the keys SURVIVE, armed, on the durable ledger;
///   2. the caller is NOT told it succeeded (202 / `incomplete`, with a count);
///   3. the work is resumable — a retry against live storage finishes it.
#[tokio::test]
async fn erasure_under_storage_failure_keeps_keys_and_reports_incomplete() {
    let Some(state) = build_media_test_state(EXPORT_BUCKET).await else {
        return;
    };
    let Some(fixtures) = fixture_pool().await else {
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let session_id =
        seed_session_with_response(&fixtures, tenant.questionnaire_id, "P-OUTAGE-001").await;

    // One of each object-key column — all three must be durable.
    let participant_key = seed_session_media(&state, &fixtures, session_id).await;
    let stimulus_key = seed_media_asset(&state, &fixtures, tenant.org_id, owner.id).await;
    let export_key = seed_ready_export(&state, &fixtures, tenant.org_id).await;
    let all_keys = vec![
        participant_key.clone(),
        stimulus_key.clone(),
        export_key.clone(),
    ];

    // The outage: a real S3 client whose endpoint refuses connections. Same
    // pool, same DB — only object storage is down, which is the whole point.
    let mut broken = state.clone();
    broken.storage = Arc::new(S3StorageService::new_unchecked(
        "http://127.0.0.1:1",
        "dead",
        "dead",
        EXPORT_BUCKET,
    ));
    let broken_app = test_app(broken.clone());

    let slug: String = sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
        .bind(tenant.org_id)
        .fetch_one(&fixtures)
        .await
        .expect("org slug");

    let (status, body) = json_request(
        &broken_app,
        "POST",
        &format!("/api/organizations/{}/erase", tenant.org_id),
        Some(&owner.token),
        Some(&serde_json::json!({ "password": "demo123456", "confirmation": slug })),
    )
    .await;

    // 2. The report is honest. A 200/"erased" here would be a false compliance
    //    claim — objects the erasure promised to destroy are still in the bucket.
    assert_eq!(
        status,
        StatusCode::ACCEPTED,
        "an erasure that could not delete its objects must NOT report success \
         (200); it is incomplete: {body:?}"
    );
    assert_eq!(
        body["status"], "incomplete",
        "status is incomplete: {body:?}"
    );
    assert_eq!(
        body["objects_pending"], 3,
        "all 3 objects still owed: {body:?}"
    );
    assert_eq!(body["objects_deleted"], 0, "storage was down: {body:?}");
    assert!(
        body["last_error"].as_str().is_some(),
        "the storage failure is surfaced, not swallowed: {body:?}"
    );

    // The DB destruction DID commit — it is irreversible and that is fine.
    let sessions_left: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE questionnaire_id = $1")
            .bind(tenant.questionnaire_id)
            .fetch_one(&fixtures)
            .await
            .expect("count sessions");
    assert_eq!(sessions_left, 0, "the DB rows are destroyed");

    // 1. …and every key survived it, armed, on the ledger. THIS is what the old
    //    code lost forever: the rows that named these objects are gone.
    let mut pending = pending_keys(&fixtures, tenant.org_id).await;
    let mut expected = all_keys.clone();
    pending.sort();
    expected.sort();
    assert_eq!(
        pending, expected,
        "all three keys — participant upload, designer stimulus, export zip — \
         must survive the destruction of the rows that named them"
    );

    // The objects are untouched: storage was down, so nothing was deleted. The
    // erasure is genuinely unfinished, and says so.
    for key in &all_keys {
        assert!(
            object_exists(&state, key).await,
            "object should still exist — storage was down: {key}"
        );
    }

    // The half-failed erasure is VISIBLE, not a warning in a log.
    let (status, st) = json_request(
        &app,
        "GET",
        &format!("/api/organizations/{}/erasure", tenant.org_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        st["status"], "incomplete",
        "status endpoint sees it: {st:?}"
    );
    assert_eq!(st["objects_pending"], 3, "…and counts it: {st:?}");

    // 3. Storage recovers → the retry finishes the job.
    let (status, retry) = json_request(
        &app,
        "POST",
        &format!("/api/organizations/{}/erasure/retry", tenant.org_id),
        Some(&owner.token),
        None,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "retry against live storage completes the erasure: {retry:?}"
    );
    assert_eq!(retry["status"], "complete", "…and says so: {retry:?}");
    assert_eq!(retry["objects_deleted"], 3, "all 3 purged: {retry:?}");
    assert_eq!(retry["objects_pending"], 0, "nothing owed: {retry:?}");

    for key in &all_keys {
        assert!(
            !object_exists(&state, key).await,
            "every object must be gone after the retry: {key}"
        );
    }
    assert!(
        pending_keys(&fixtures, tenant.org_id).await.is_empty(),
        "a confirmed deletion clears the ledger"
    );

    cleanup(&state, &fixtures, tenant.org_id, &all_keys).await;
}
