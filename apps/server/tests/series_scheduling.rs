//! E-FLOW-2 — longitudinal / EMA study-series scheduling integration test.
//!
//! Covers the whole vertical against the running Postgres:
//!   1. **Enroll + materialize** — a researcher creates a 3-wave fixed
//!      series and enrolls a participant; all three prompts are
//!      materialized and the scheduler cursor points at wave 0.
//!   2. **Scheduler tick** — `series::run_tick` delivers the due wave,
//!      stamps `delivered_at`, and advances `next_prompt_at` to the next
//!      wave. Advancing the clock (past-dating wave 1) and ticking again
//!      delivers wave 1 and points at wave 2.
//!   3. **Resolve + complete** — the anonymous participant resolves the
//!      reminder link (token GUC) to the current wave, then posts
//!      completion back, advancing the enrollment.
//!   4. **RLS token isolation** — at the SQL layer (non-BYPASSRLS role),
//!      a participant bound to one enrollment's token sees only that
//!      enrollment + its series + its prompts, never a sibling's.
//!
//! Skips cleanly when no DB is reachable (panics under `REQUIRE_DB`),
//! mirroring the other integration files.

use axum::http::StatusCode;
use uuid::Uuid;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
};

/// Publish the tenant's questionnaire so the participant paths are
/// coherent (and to mirror a real study).
async fn publish(app: &axum::Router, token: &str, project_id: Uuid, qid: Uuid) {
    let (status, body) = json_request(
        app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaires/{qid}/publish"),
        Some(token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "publish questionnaire: {body:?}");
}

#[tokio::test]
async fn enroll_materializes_waves_and_scheduler_delivers_each_wave() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB");
        return;
    };
    let app = test_app(state.clone());
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };

    let researcher = register_user(&app).await;
    let tenant = provision_tenant(&app, &researcher.token).await;
    publish(
        &app,
        &researcher.token,
        tenant.project_id,
        tenant.questionnaire_id,
    )
    .await;

    // Create a 3-wave fixed series (baseline + two follow-ups).
    let series_body = serde_json::json!({
        "questionnaire_id": tenant.questionnaire_id,
        "name": "Daily diary",
        "schedule_kind": "fixed",
        "wave_defs": [
            { "label": "Baseline", "offsetSeconds": 0 },
            { "label": "Day 1", "offsetSeconds": 86400 },
            { "label": "Day 2", "offsetSeconds": 172800 }
        ]
    });
    let (status, series) = json_request(
        &app,
        "POST",
        "/api/series",
        Some(&researcher.token),
        Some(&series_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create series: {series:?}");
    let series_id = series["id"].as_str().unwrap().to_string();

    // Enroll a participant.
    let enroll_body = serde_json::json!({
        "participant_ref": "P001",
        "contact_channel": "participant@test.local"
    });
    let (status, enrollment) = json_request(
        &app,
        "POST",
        &format!("/api/series/{series_id}/enroll"),
        Some(&researcher.token),
        Some(&enroll_body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "enroll: {enrollment:?}");
    assert_eq!(
        enrollment["materialized_waves"].as_i64(),
        Some(3),
        "all 3 fixed waves materialized at enrollment"
    );
    let enrollment_id = Uuid::parse_str(enrollment["id"].as_str().unwrap()).unwrap();
    assert!(
        enrollment["resume_link"]
            .as_str()
            .unwrap()
            .contains("?token="),
        "resume link carries the token"
    );

    // Three prompt rows exist, all pending.
    let prompt_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM series_prompt WHERE enrollment_id = $1")
            .bind(enrollment_id)
            .fetch_one(&fx)
            .await
            .unwrap();
    assert_eq!(prompt_count, 3, "3 prompts materialized");

    // ── Tick 1: wave 0 is due now (offset 0) → delivered. ──
    let delivered = qdesigner_server::series::run_tick(&state).await.unwrap();
    assert!(
        delivered >= 1,
        "wave 0 should be delivered on the first tick"
    );

    let (w0_delivered, w0_status): (Option<chrono::DateTime<chrono::Utc>>, String) =
        sqlx::query_as("SELECT delivered_at, status FROM series_prompt WHERE enrollment_id = $1 AND wave_index = 0")
            .bind(enrollment_id)
            .fetch_one(&fx)
            .await
            .unwrap();
    assert!(w0_delivered.is_some(), "wave 0 delivered_at stamped");
    assert_eq!(w0_status, "delivered");

    // next_prompt_at now points to wave 1 (future).
    let next_after_w0: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT next_prompt_at FROM series_enrollment WHERE id = $1")
            .bind(enrollment_id)
            .fetch_one(&fx)
            .await
            .unwrap();
    assert!(
        next_after_w0
            .map(|t| t > chrono::Utc::now())
            .unwrap_or(false),
        "cursor advanced to the (future) wave 1"
    );

    // A second tick delivers nothing (wave 1 not yet due).
    let delivered_again = qdesigner_server::series::run_tick(&state).await.unwrap();
    assert_eq!(delivered_again, 0, "no wave due yet after wave 0");

    // ── Advance the clock: past-date wave 1 (BYPASSRLS fixture pool). ──
    sqlx::query(
        "UPDATE series_prompt SET scheduled_at = now() - interval '1 minute' \
         WHERE enrollment_id = $1 AND wave_index = 1",
    )
    .bind(enrollment_id)
    .execute(&fx)
    .await
    .unwrap();

    // ── Tick 2: wave 1 now due → delivered; wave 2 still pending. ──
    let delivered_w1 = qdesigner_server::series::run_tick(&state).await.unwrap();
    assert!(delivered_w1 >= 1, "wave 1 delivered after clock advance");

    let w1_status: String = sqlx::query_scalar(
        "SELECT status FROM series_prompt WHERE enrollment_id = $1 AND wave_index = 1",
    )
    .bind(enrollment_id)
    .fetch_one(&fx)
    .await
    .unwrap();
    assert_eq!(w1_status, "delivered", "wave 1 delivered");

    let w2_status: String = sqlx::query_scalar(
        "SELECT status FROM series_prompt WHERE enrollment_id = $1 AND wave_index = 2",
    )
    .bind(enrollment_id)
    .fetch_one(&fx)
    .await
    .unwrap();
    assert_eq!(w2_status, "pending", "wave 2 still pending");
}

#[tokio::test]
async fn resolve_and_complete_advances_enrollment() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB");
        return;
    };
    let app = test_app(state.clone());
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };

    let researcher = register_user(&app).await;
    let tenant = provision_tenant(&app, &researcher.token).await;
    publish(
        &app,
        &researcher.token,
        tenant.project_id,
        tenant.questionnaire_id,
    )
    .await;

    let series_body = serde_json::json!({
        "questionnaire_id": tenant.questionnaire_id,
        "name": "Two wave",
        "schedule_kind": "fixed",
        "wave_defs": [
            { "label": "Baseline", "offsetSeconds": 0 },
            { "label": "Follow-up", "offsetSeconds": 3600 }
        ]
    });
    let (_s, series) = json_request(
        &app,
        "POST",
        "/api/series",
        Some(&researcher.token),
        Some(&series_body),
    )
    .await;
    let series_id = series["id"].as_str().unwrap().to_string();

    let (_s, enrollment) = json_request(
        &app,
        "POST",
        &format!("/api/series/{series_id}/enroll"),
        Some(&researcher.token),
        Some(&serde_json::json!({ "contact_channel": "p@test.local" })),
    )
    .await;
    let token = enrollment["resume_token"].as_str().unwrap().to_string();
    let enrollment_id = Uuid::parse_str(enrollment["id"].as_str().unwrap()).unwrap();

    // ── Resolve the reminder link (anonymous, token in URL). ──
    let (status, resolved) = json_request(
        &app,
        "GET",
        &format!("/api/series/prompt/{token}"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "resolve prompt: {resolved:?}");
    assert_eq!(
        resolved["wave_index"].as_i64(),
        Some(0),
        "current wave is 0"
    );
    assert_eq!(resolved["total_waves"].as_i64(), Some(2));
    assert_eq!(resolved["status"].as_str(), Some("active"));
    assert_eq!(
        resolved["wave_label"].as_str(),
        Some("Baseline"),
        "wave label surfaced for branching / display"
    );

    // Seed a completed session (FK target for the completion bind).
    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions (id, questionnaire_id, status) VALUES ($1, $2, 'completed')")
        .bind(session_id)
        .bind(tenant.questionnaire_id)
        .execute(&fx)
        .await
        .unwrap();

    // ── Complete wave 0. ──
    let (status, completed) = json_request(
        &app,
        "POST",
        &format!("/api/series/prompt/{token}/complete"),
        None,
        Some(&serde_json::json!({ "session_id": session_id, "wave_index": 0 })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "complete wave 0: {completed:?}");
    assert_eq!(
        completed["status"].as_str(),
        Some("active"),
        "still active (wave 1 remains)"
    );
    assert_eq!(completed["next_wave_index"].as_i64(), Some(1));

    // Enrollment advanced to wave 1; wave 0 prompt bound to the session.
    let current_wave: i32 =
        sqlx::query_scalar("SELECT current_wave_index FROM series_enrollment WHERE id = $1")
            .bind(enrollment_id)
            .fetch_one(&fx)
            .await
            .unwrap();
    assert_eq!(current_wave, 1, "enrollment advanced to wave 1");

    let bound_session: Option<Uuid> = sqlx::query_scalar(
        "SELECT session_id FROM series_prompt WHERE enrollment_id = $1 AND wave_index = 0",
    )
    .bind(enrollment_id)
    .fetch_one(&fx)
    .await
    .unwrap();
    assert_eq!(
        bound_session,
        Some(session_id),
        "wave 0 prompt bound to its session"
    );

    // ── Resolve now returns wave 1 (distinct content for branching). ──
    let (_s, resolved2) = json_request(
        &app,
        "GET",
        &format!("/api/series/prompt/{token}"),
        None,
        None,
    )
    .await;
    assert_eq!(resolved2["wave_index"].as_i64(), Some(1), "now on wave 1");
    assert_eq!(resolved2["wave_label"].as_str(), Some("Follow-up"));

    // ── Unsubscribe withdraws the enrollment. ──
    let (status, _u) = json_request(
        &app,
        "POST",
        &format!("/api/series/prompt/{token}/unsubscribe"),
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "unsubscribe");
    let final_status: String =
        sqlx::query_scalar("SELECT status FROM series_enrollment WHERE id = $1")
            .bind(enrollment_id)
            .fetch_one(&fx)
            .await
            .unwrap();
    assert_eq!(final_status, "withdrawn");
}

/// SQL-level RLS token isolation, mirroring `rls_enforcement.rs`: a fresh
/// non-BYPASSRLS role bound to one enrollment's token sees only that
/// enrollment, its series, and its prompts.
#[tokio::test]
async fn rls_token_isolation() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };

    // Seed a tenant + series + two enrollments with distinct tokens.
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id",
    )
    .bind(format!("r-{}@test.local", Uuid::new_v4()))
    .fetch_one(&pool)
    .await
    .unwrap();
    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('O', $1, $2) RETURNING id",
    )
    .bind(format!("o-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')")
        .bind(org).bind(user).execute(&pool).await.unwrap();
    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("PC{}", &Uuid::new_v4().to_string()[..6]))
    .fetch_one(&pool)
    .await
    .unwrap();
    let qid: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, status) VALUES ($1, 'Q', 'published') RETURNING id",
    )
    .bind(project)
    .fetch_one(&pool)
    .await
    .unwrap();
    let series: Uuid = sqlx::query_scalar(
        "INSERT INTO study_series (questionnaire_id, name) VALUES ($1, 'S') RETURNING id",
    )
    .bind(qid)
    .fetch_one(&pool)
    .await
    .unwrap();
    let (enr_a, token_a): (Uuid, Uuid) = sqlx::query_as(
        "INSERT INTO series_enrollment (series_id, contact_channel) VALUES ($1, 'a@x') RETURNING id, resume_token",
    )
    .bind(series)
    .fetch_one(&pool)
    .await
    .unwrap();
    let enr_b: Uuid = sqlx::query_scalar(
        "INSERT INTO series_enrollment (series_id, contact_channel) VALUES ($1, 'b@x') RETURNING id",
    )
    .bind(series)
    .fetch_one(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO series_prompt (enrollment_id, wave_index, scheduled_at) VALUES ($1, 0, now())",
    )
    .bind(enr_a)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO series_prompt (enrollment_id, wave_index, scheduled_at) VALUES ($1, 0, now())",
    )
    .bind(enr_b)
    .execute(&pool)
    .await
    .unwrap();

    // Pin a fresh non-BYPASSRLS role bound to enrollment A's token.
    let role_name = format!("series_rls_{}", Uuid::new_v4().simple());
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(&format!("CREATE ROLE {role_name} NOLOGIN NOBYPASSRLS"))
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(&format!("GRANT pg_read_all_data TO {role_name}"))
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query(&format!("SET LOCAL ROLE {role_name}"))
        .execute(&mut *tx)
        .await
        .unwrap();
    sqlx::query("SELECT set_config('app.enrollment_token', $1, true)")
        .bind(token_a.to_string())
        .execute(&mut *tx)
        .await
        .unwrap();

    let visible_enrollments: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM series_enrollment ORDER BY id")
            .fetch_all(&mut *tx)
            .await
            .unwrap();
    assert_eq!(
        visible_enrollments,
        vec![enr_a],
        "participant bound to token A sees only enrollment A"
    );

    let visible_series: i64 = sqlx::query_scalar("SELECT count(*) FROM study_series")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(visible_series, 1, "sees the series behind their enrollment");

    let visible_prompts: Vec<Uuid> = sqlx::query_scalar("SELECT enrollment_id FROM series_prompt")
        .fetch_all(&mut *tx)
        .await
        .unwrap();
    assert_eq!(
        visible_prompts,
        vec![enr_a],
        "sees only their own prompts, never enrollment B's"
    );

    // Rolling back drops both the temp role (created in-tx) and any writes.
    tx.rollback().await.ok();
}
