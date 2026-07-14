//! Export reproducibility: the version pin and the timing provenance must
//! actually survive the trip from the database to the export row.
//!
//! The client composes its `questionnaire_version` cell from three integers and
//! renders `timing_provenance` as a JSON cell, but it can only do that if the
//! server's export SELECT *returns* those columns — before this, it selected ten
//! columns and silently dropped both, so every exported dataset was
//! untraceable to the instrument build that produced it.
//!
//! This test binds against `EXPORT_ROWS_SQL` — the exact statement the handler
//! runs — rather than a copy, so the two cannot drift apart.

use qdesigner_server::api::questionnaires::EXPORT_ROWS_SQL;
use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

/// The columns the export contract promises the client, decoded from the SELECT.
#[derive(Debug, sqlx::FromRow)]
struct ExportRowProbe {
    participant_id: Option<String>,
    question_id: String,
    questionnaire_version_major: Option<i32>,
    questionnaire_version_minor: Option<i32>,
    questionnaire_version_patch: Option<i32>,
    timing_provenance: Option<serde_json::Value>,
}

struct Fixture {
    questionnaire: Uuid,
}

/// Seed one questionnaire with two sessions: one pinned to 1.4.2 carrying a
/// response with timing provenance, and one unpinned session with a response
/// that has none — the two states the export has to distinguish.
async fn build_fixture(pool: &PgPool) -> Fixture {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("exp-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('E', $1, $2) RETURNING id",
    )
    .bind(format!("e-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");

    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'PE', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("pe-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    let questionnaire: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by)
         VALUES ($1, $2, '{}'::jsonb, 'published', $3) RETURNING id",
    )
    .bind(project)
    .bind(format!("QE-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("questionnaire");

    // Session pinned to questionnaire version 1.4.2.
    let pinned: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions
             (questionnaire_id, participant_id, questionnaire_version_major,
              questionnaire_version_minor, questionnaire_version_patch)
         VALUES ($1, 'p-pinned', 1, 4, 2) RETURNING id",
    )
    .bind(questionnaire)
    .fetch_one(pool)
    .await
    .expect("pinned session");

    sqlx::query(
        "INSERT INTO responses (session_id, question_id, value, timing_provenance)
         VALUES ($1, 'q-pinned', '\"congruent\"'::jsonb, $2::jsonb)",
    )
    .bind(pinned)
    .bind(serde_json::json!({
        "onsetMethod": "raf",
        "responseMethod": "event.timeStamp",
        "displayLatencyMs": 8.3,
    }))
    .execute(pool)
    .await
    .expect("pinned response");

    // Session with no version pin and a response with no provenance.
    let unpinned: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, participant_id)
         VALUES ($1, 'p-unpinned') RETURNING id",
    )
    .bind(questionnaire)
    .fetch_one(pool)
    .await
    .expect("unpinned session");

    sqlx::query(
        "INSERT INTO responses (session_id, question_id, value)
         VALUES ($1, 'q-unpinned', '\"x\"'::jsonb)",
    )
    .bind(unpinned)
    .execute(pool)
    .await
    .expect("unpinned response");

    Fixture { questionnaire }
}

async fn fetch_rows(pool: &PgPool, questionnaire: Uuid) -> Vec<ExportRowProbe> {
    sqlx::query_as::<_, ExportRowProbe>(EXPORT_ROWS_SQL)
        .bind(questionnaire)
        .fetch_all(pool)
        .await
        .expect("the export SELECT must return the full export contract")
}

#[tokio::test]
async fn export_select_carries_the_version_pin_and_timing_provenance() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let f = build_fixture(&pool).await;
    let rows = fetch_rows(&pool, f.questionnaire).await;

    let pinned = rows
        .iter()
        .find(|r| r.question_id == "q-pinned")
        .expect("pinned row");

    // The pin: three components, exactly as the client composes "1.4.2" from.
    assert_eq!(pinned.questionnaire_version_major, Some(1));
    assert_eq!(pinned.questionnaire_version_minor, Some(4));
    assert_eq!(pinned.questionnaire_version_patch, Some(2));
    assert_eq!(pinned.participant_id.as_deref(), Some("p-pinned"));

    // The provenance blob arrives whole — this is the evidence behind the
    // sub-millisecond timing claim, so it has to be intact, not merely present.
    let provenance = pinned
        .timing_provenance
        .as_ref()
        .expect("timing_provenance must reach the export");
    assert_eq!(provenance["onsetMethod"], "raf");
    assert_eq!(provenance["responseMethod"], "event.timeStamp");
    assert_eq!(provenance["displayLatencyMs"], 8.3);
}

#[tokio::test]
async fn an_unpinned_session_reports_null_rather_than_a_fabricated_version() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("skipping: DATABASE_URL_MIGRATIONS not set / db unreachable");
        return;
    };
    let f = build_fixture(&pool).await;
    let rows = fetch_rows(&pool, f.questionnaire).await;

    let unpinned = rows
        .iter()
        .find(|r| r.question_id == "q-unpinned")
        .expect("unpinned row");

    // NULL, not 0 — "no version recorded" must stay distinguishable from "v0".
    assert_eq!(unpinned.questionnaire_version_major, None);
    assert_eq!(unpinned.questionnaire_version_minor, None);
    assert_eq!(unpinned.questionnaire_version_patch, None);
    assert!(unpinned.timing_provenance.is_none());
}
