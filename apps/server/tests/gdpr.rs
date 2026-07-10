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
use std::time::Duration;

use axum::http::StatusCode;
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
