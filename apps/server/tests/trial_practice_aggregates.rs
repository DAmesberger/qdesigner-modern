//! Migration 00059 / ADR 0028 — practice trials must never reach a cohort statistic.
//!
//! Three defects let untrustworthy per-trial data into the aggregates a PARTICIPANT
//! is shown, and this file pins all three at the SQL layer:
//!
//!  1. **Practice trials were pooled in.** `trials` had no practice column, so
//!     `fillout_trial_stats` could not exclude warm-ups. A warm-up RT is
//!     systematically slower — that is the entire point of a warm-up — and it was
//!     landing in the cohort quartiles.
//!
//!  2. **Anticipatory (false-start) trials were not invalidated on the live path.**
//!     The 00048 backfill mapped `anticipatory` → `invalidated`; the live runtime
//!     did not. The same false start was excluded when it arrived by backfill and
//!     pooled when it arrived live.
//!
//!  3. **Visibility-invalidated trials were not excluded by the backfill** — the
//!     mirror of (2), in the other direction.
//!
//! `repair_trial_provenance()` (00059) recovers all three from the block summary the
//! trials were dual-written alongside. It is a real shipped function, not a copy
//! pasted into this test, and the migration calls it exactly once.
//!
//! Fixture INSERTs use the migration DSN (`qdesigner`) so setup bypasses RLS.

use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::{build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app};

/// `repair_trial_provenance()` operates on the WHOLE `trials` table, so any test
/// that asserts a before/after around it must not have a sibling test's repair run
/// underneath it. The three repair tests take this lock; the pure-aggregate tests
/// don't need it (they seed explicit flags, or seed an unrecoverable NULL, so a
/// concurrent repair is a no-op on their rows either way).
static REPAIR_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(sqlx::FromRow, Debug)]
struct StatsRow {
    n: i64,
    mean: Option<f64>,
    median: Option<f64>,
    max: Option<f64>,
}

async fn trial_stats(pool: &PgPool, qid: Uuid, question_id: &str) -> StatsRow {
    sqlx::query_as::<_, StatsRow>(
        "SELECT n, mean, median, max \
         FROM public.fillout_trial_stats($1, $2, 'rt', false, '{}'::jsonb)",
    )
    .bind(qid)
    .bind(question_id)
    .fetch_one(pool)
    .await
    .expect("trial_stats")
}

// ── fixtures ──────────────────────────────────────────────────────────────

async fn mk_questionnaire(pool: &PgPool) -> Uuid {
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("tp-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await
    .expect("user");

    let org: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('TP', $1, $2) RETURNING id",
    )
    .bind(format!("tp-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("org");

    let project: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'TP', $2) RETURNING id",
    )
    .bind(org)
    .bind(format!("tp-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await
    .expect("project");

    sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions \
           (project_id, name, content, status, created_by, version_major, version_minor, version_patch) \
         VALUES ($1, $2, '{}'::jsonb, 'published', $3, 1, 0, 0) RETURNING id",
    )
    .bind(project)
    .bind(format!("TP-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user)
    .fetch_one(pool)
    .await
    .expect("questionnaire")
}

async fn mk_session(pool: &PgPool, qid: Uuid) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO sessions \
           (questionnaire_id, status, metadata, questionnaire_version_major, \
            questionnaire_version_minor, questionnaire_version_patch, completed_at) \
         VALUES ($1, 'completed', '{}'::jsonb, 1, 0, 0, now()) RETURNING id",
    )
    .bind(qid)
    .fetch_one(pool)
    .await
    .expect("session")
}

/// A trial row. `is_practice` is `Option<bool>` so a test can seed the three real
/// states: known practice, known test, and UNKNOWN (the pre-00059 row shape).
async fn insert_trial(
    pool: &PgPool,
    sid: Uuid,
    question_id: &str,
    trial_index: i32,
    rt_us: i64,
    is_practice: Option<bool>,
    invalidated: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO trials \
           (session_id, question_id, trial_index, rt_us, correct, is_practice, \
            invalidated, client_id) \
         VALUES ($1, $2, $3, $4, true, $5, $6, $7)",
    )
    .bind(sid)
    .bind(question_id)
    .bind(trial_index)
    .bind(rt_us)
    .bind(is_practice)
    .bind(invalidated)
    .bind(Uuid::new_v4())
    .execute(pool)
    .await
    .expect("trial");
}

/// The question-level block summary the reaction runtimes dual-write alongside the
/// per-trial rows. This is where the truth survives when the trial row lost it.
async fn insert_block_summary(
    pool: &PgPool,
    sid: Uuid,
    question_id: &str,
    trials: serde_json::Value,
) {
    sqlx::query(
        "INSERT INTO responses (session_id, client_id, question_id, value) \
         VALUES ($1, $2, $3, $4)",
    )
    .bind(sid)
    .bind(Uuid::new_v4())
    .bind(question_id)
    .bind(serde_json::json!({ "responses": trials }))
    .execute(pool)
    .await
    .expect("block summary");
}

// ── the aggregate ─────────────────────────────────────────────────────────

/// A warm-up trial is slow ON PURPOSE. Pooling it into the cohort drags the
/// quartiles a participant is compared against.
#[tokio::test]
async fn practice_trials_do_not_reach_the_cohort_aggregate() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let qid = mk_questionnaire(&pool).await;
    let sid = mk_session(&pool, qid).await;

    // Two 900ms warm-ups, then four real 300ms trials.
    insert_trial(&pool, sid, "q-rt", 1, 900_000, Some(true), None).await;
    insert_trial(&pool, sid, "q-rt", 2, 900_000, Some(true), None).await;
    for i in 3..=6 {
        insert_trial(&pool, sid, "q-rt", i, 300_000, Some(false), None).await;
    }

    let stats = trial_stats(&pool, qid, "q-rt").await;

    // Pooling the warm-ups would have given a 500 000µs mean and a 900 000µs max —
    // a cohort a participant is then told they are slower than.
    assert_eq!(stats.n, 1, "one contributing session");
    assert_eq!(
        stats.mean,
        Some(300_000.0),
        "only the four real trials count; pooling practice gives 500000"
    );
    assert_eq!(
        stats.max,
        Some(300_000.0),
        "a 900ms warm-up must not become the cohort maximum"
    );
}

/// UNKNOWN is not a synonym for "not practice".
#[tokio::test]
async fn trials_of_unknown_practice_status_are_held_out_fail_closed() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let qid = mk_questionnaire(&pool).await;
    let sid = mk_session(&pool, qid).await;

    // A pre-00059 row: no practice flag, and no block summary to recover it from.
    insert_trial(&pool, sid, "q-rt", 1, 900_000, None, None).await;
    insert_trial(&pool, sid, "q-rt", 2, 300_000, Some(false), None).await;

    let stats = trial_stats(&pool, qid, "q-rt").await;

    // Admitting the unknown row (a `is_practice IS NOT TRUE` predicate would have)
    // yields a 600 000µs mean built partly from a trial nobody can vouch for.
    assert_eq!(
        stats.mean,
        Some(300_000.0),
        "only the KNOWN test trial counts; admitting the unknown row gives 600000"
    );
}

// ── the repair ────────────────────────────────────────────────────────────

/// The truth was never lost — it was dual-written into the block summary. Recover it.
#[tokio::test]
async fn repair_recovers_the_practice_flag_from_the_block_summary() {
    let _guard = REPAIR_LOCK.lock().await;
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let qid = mk_questionnaire(&pool).await;
    let sid = mk_session(&pool, qid).await;

    // Trial rows as they were ingested BEFORE 00059: practice status unknown.
    insert_trial(&pool, sid, "q-rt", 1, 900_000, None, None).await;
    insert_trial(&pool, sid, "q-rt", 2, 300_000, None, None).await;

    // …but the block summary the runtime wrote alongside them knows.
    insert_block_summary(
        &pool,
        sid,
        "q-rt",
        serde_json::json!([
            { "trialNumber": 1, "isPractice": true },
            { "trialNumber": 2, "isPractice": false },
        ]),
    )
    .await;

    // Before the repair, BOTH rows are unknown, so the cohort is empty — the
    // fail-closed posture, visible.
    assert_eq!(trial_stats(&pool, qid, "q-rt").await.n, 0);

    sqlx::query("SELECT public.repair_trial_provenance()")
        .execute(&pool)
        .await
        .expect("repair");

    let flags: Vec<(i32, Option<bool>)> = sqlx::query_as(
        "SELECT trial_index, is_practice FROM trials WHERE session_id = $1 ORDER BY trial_index",
    )
    .bind(sid)
    .fetch_all(&pool)
    .await
    .expect("flags");
    assert_eq!(flags, vec![(1, Some(true)), (2, Some(false))]);

    // …and now the cohort is exactly the one real trial.
    let stats = trial_stats(&pool, qid, "q-rt").await;
    assert_eq!(stats.n, 1);
    assert_eq!(stats.median, Some(300_000.0));
}

/// Live rows lost `anticipatory`; backfilled rows lost `visibility`. One repair,
/// both directions — and after it, live and backfill finally agree.
#[tokio::test]
async fn repair_invalidates_anticipatory_and_visibility_trials() {
    let _guard = REPAIR_LOCK.lock().await;
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let qid = mk_questionnaire(&pool).await;
    let sid = mk_session(&pool, qid).await;

    // 1: a false start, ingested LIVE — the old runtime never stamped it.
    // 2: a hidden-tab trial, ingested by the 00048 BACKFILL — which never read the flag.
    // 3: a clean trial.
    // 4: already invalidated for a different reason — must NOT be overwritten.
    insert_trial(&pool, sid, "q-rt", 1, 90_000, Some(false), None).await;
    insert_trial(&pool, sid, "q-rt", 2, 800_000, Some(false), None).await;
    insert_trial(&pool, sid, "q-rt", 3, 300_000, Some(false), None).await;
    insert_trial(
        &pool,
        sid,
        "q-rt",
        4,
        310_000,
        Some(false),
        Some("stimulus-render-failed"),
    )
    .await;

    insert_block_summary(
        &pool,
        sid,
        "q-rt",
        serde_json::json!([
            { "trialNumber": 1, "isPractice": false, "anticipatory": true },
            { "trialNumber": 2, "isPractice": false, "visibilityInvalidated": true },
            { "trialNumber": 3, "isPractice": false, "anticipatory": false },
            { "trialNumber": 4, "isPractice": false, "anticipatory": true },
        ]),
    )
    .await;

    // Before: the false start (90ms — timed against a stimulus not yet shown) and the
    // hidden-tab trial are both still in the cohort.
    let before = trial_stats(&pool, qid, "q-rt").await;
    assert_eq!(before.mean, Some((90_000.0 + 800_000.0 + 300_000.0) / 3.0));

    sqlx::query("SELECT public.repair_trial_provenance()")
        .execute(&pool)
        .await
        .expect("repair");

    let reasons: Vec<(i32, Option<String>)> = sqlx::query_as(
        "SELECT trial_index, invalidated FROM trials WHERE session_id = $1 ORDER BY trial_index",
    )
    .bind(sid)
    .fetch_all(&pool)
    .await
    .expect("reasons");
    assert_eq!(
        reasons,
        vec![
            (1, Some("anticipatory".into())),
            (2, Some("visibility".into())),
            (3, None),
            // An existing reason is never clobbered, even though the summary also
            // marks this trial anticipatory.
            (4, Some("stimulus-render-failed".into())),
        ]
    );

    // After: only the one clean trial survives into the cohort.
    let after = trial_stats(&pool, qid, "q-rt").await;
    assert_eq!(after.mean, Some(300_000.0));
}

/// The repair will be re-run — an offline client can still sync a NULL-practice row
/// long after the migration. Running it twice must not change anything.
#[tokio::test]
async fn repair_is_idempotent() {
    let _guard = REPAIR_LOCK.lock().await;
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let qid = mk_questionnaire(&pool).await;
    let sid = mk_session(&pool, qid).await;

    insert_trial(&pool, sid, "q-rt", 1, 300_000, None, None).await;
    insert_block_summary(
        &pool,
        sid,
        "q-rt",
        serde_json::json!([{ "trialNumber": 1, "isPractice": false }]),
    )
    .await;

    let first: (i64, i64) = sqlx::query_as("SELECT * FROM public.repair_trial_provenance()")
        .fetch_one(&pool)
        .await
        .expect("first repair");
    assert!(
        first.0 >= 1,
        "the first run recovers this session's flag (and any other repairable row)"
    );

    // Whatever the first run fixed, the second must find nothing left: the UPDATEs
    // are guarded on `IS NULL`, so a known value is never rewritten. Counting from
    // zero here is safe because the lock keeps a sibling test from seeding new
    // repairable rows between the two calls.
    let second: (i64, i64) = sqlx::query_as("SELECT * FROM public.repair_trial_provenance()")
        .fetch_one(&pool)
        .await
        .expect("second repair");
    assert_eq!(second, (0, 0), "a second run has nothing left to do");

    assert_eq!(trial_stats(&pool, qid, "q-rt").await.n, 1);
}

// ── the sync path ─────────────────────────────────────────────────────────

/// The realistic post-deploy case, end to end through the real router.
///
/// A participant is still running the PREVIOUS build. It writes a rich block
/// summary — `responses[].isPractice` is right there — but a trial row WITHOUT
/// the flag, because `buildRuntimeTrialEvent` dropped it. That was the bug.
///
/// Cohort aggregates are fail-closed, so if nothing recovered those rows they
/// would be excluded from every statistic FOREVER: the cohort would get silently
/// emptier instead of more honest, which is the opposite of the point. The sync
/// handler runs the session-scoped repair on every batch, so the flag is restored
/// from the summary the runtime dual-wrote and the real trials count again.
#[tokio::test]
async fn sync_recovers_the_practice_flag_an_old_client_never_sent() {
    let _guard = REPAIR_LOCK.lock().await;
    let Some(state) = build_test_state().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let qid = tenant.questionnaire_id;

    let (status, published) = json_request(
        &app,
        "POST",
        &format!(
            "/api/projects/{}/questionnaires/{qid}/publish",
            tenant.project_id
        ),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "publish: {published:?}");

    let (status, session) = json_request(
        &app,
        "POST",
        "/api/sessions",
        None,
        Some(&serde_json::json!({ "questionnaire_id": qid })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "anon session: {session:?}");
    let sid = session["id"].as_str().expect("session id");

    // Exactly what the previous build puts on the wire: trials with NO is_practice
    // (the flag never reached RuntimeTrialEvent), and a block summary that has it.
    let sync_body = serde_json::json!({
        // The participant finishes the study — cohort aggregates only admit
        // COMPLETED sessions, so this is what makes them a cohort member at all.
        "status": "completed",
        "responses": [{
            "client_id": Uuid::new_v4(),
            "question_id": "rt-q",
            "value": { "responses": [
                { "trialNumber": 1, "isPractice": true,  "anticipatory": false },
                { "trialNumber": 2, "isPractice": false, "anticipatory": false },
                { "trialNumber": 3, "isPractice": false, "anticipatory": true },
            ]},
        }],
        "events": [],
        "variables": [],
        "trials": [
            { "client_id": Uuid::new_v4(), "question_id": "rt-q", "trial_index": 1, "rt_us": 900_000, "correct": true },
            { "client_id": Uuid::new_v4(), "question_id": "rt-q", "trial_index": 2, "rt_us": 300_000, "correct": true },
            { "client_id": Uuid::new_v4(), "question_id": "rt-q", "trial_index": 3, "rt_us":  90_000, "correct": true },
        ],
    });
    let (status, synced) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{sid}/sync"),
        None,
        Some(&sync_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "sync: {synced:?}");
    assert_eq!(synced["trials_synced"].as_i64(), Some(3));

    let sid: Uuid = sid.parse().expect("uuid");
    let rows: Vec<(i32, Option<bool>, Option<String>)> = sqlx::query_as(
        "SELECT trial_index, is_practice, invalidated FROM trials \
         WHERE session_id = $1 ORDER BY trial_index",
    )
    .bind(sid)
    .fetch_all(&pool)
    .await
    .expect("trials");

    assert_eq!(
        rows,
        vec![
            // The warm-up is recovered as practice…
            (1, Some(true), None),
            // …the real trial as a real trial…
            (2, Some(false), None),
            // …and the false start is invalidated, which the live path also failed
            // to do (the 00048 backfill always did — now they agree).
            (3, Some(false), Some("anticipatory".into())),
        ]
    );

    // Nothing is left UNKNOWN, so the one genuine trial reaches the cohort — and
    // neither the 900ms warm-up nor the 90ms false start drags it.
    let stats = trial_stats(&pool, qid, "rt-q").await;
    assert_eq!(stats.n, 1);
    assert_eq!(stats.mean, Some(300_000.0));
}

/// Q1: the LIVE path writes `is_practice` directly — the repair is only a tail.
///
/// A CURRENT client carries the flag on the wire (`RuntimeTrialEvent.isPractice` →
/// `SyncTrialItem.is_practice` → the `trials` INSERT), so the steady state does not
/// depend on `repair_trial_provenance` having run.
///
/// This test proves that by syncing trials with NO block-summary response at all.
/// There is nothing for the repair to read: if `is_practice` is set afterwards, the
/// INSERT is the only thing that could have set it.
#[tokio::test]
async fn live_sync_writes_the_practice_flag_directly_without_any_repair() {
    let _guard = REPAIR_LOCK.lock().await;
    let Some(state) = build_test_state().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL_MIGRATIONS not set");
        return;
    };
    let app = test_app(state);
    let user = register_user(&app).await;
    let tenant = provision_tenant(&app, &user.token).await;
    let qid = tenant.questionnaire_id;

    let (status, _) = json_request(
        &app,
        "POST",
        &format!(
            "/api/projects/{}/questionnaires/{qid}/publish",
            tenant.project_id
        ),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, session) = json_request(
        &app,
        "POST",
        "/api/sessions",
        None,
        Some(&serde_json::json!({ "questionnaire_id": qid })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let sid = session["id"].as_str().expect("session id");

    // A current client. Note `responses: []` — no block summary exists, so
    // repair_trial_provenance has no source to recover from and cannot be the
    // explanation for anything below.
    let (status, synced) = json_request(
        &app,
        "POST",
        &format!("/api/sessions/{sid}/sync"),
        None,
        Some(&serde_json::json!({
            "status": "completed",
            "responses": [],
            "events": [],
            "variables": [],
            "trials": [
                { "client_id": Uuid::new_v4(), "question_id": "rt-q", "trial_index": 1,
                  "rt_us": 900_000, "correct": true, "is_practice": true },
                { "client_id": Uuid::new_v4(), "question_id": "rt-q", "trial_index": 2,
                  "rt_us": 300_000, "correct": true, "is_practice": false },
            ],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "sync: {synced:?}");

    let sid: Uuid = sid.parse().expect("uuid");
    let rows: Vec<(i32, Option<bool>)> = sqlx::query_as(
        "SELECT trial_index, is_practice FROM trials WHERE session_id = $1 ORDER BY trial_index",
    )
    .bind(sid)
    .fetch_all(&pool)
    .await
    .expect("trials");

    // Straight off the INSERT. No repair involved, and nothing left UNKNOWN.
    assert_eq!(rows, vec![(1, Some(true)), (2, Some(false))]);
    assert!(
        !sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM trials WHERE session_id = $1 AND is_practice IS NULL)"
        )
        .bind(sid)
        .fetch_one(&pool)
        .await
        .expect("null probe"),
        "a current client leaves no trial of unknown provenance"
    );

    // And the warm-up is out of the cohort on the strength of the INSERT alone.
    let stats = trial_stats(&pool, qid, "rt-q").await;
    assert_eq!(stats.n, 1);
    assert_eq!(stats.mean, Some(300_000.0));
}
