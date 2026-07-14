//! ADR 0036 — the two analytics numbers that were confidently wrong.
//!
//! Both endpoints under test rendered a plausible-looking figure in the product
//! UI, which is worse than rendering nothing: a researcher had no cue that the
//! number was meaningless.
//!
//! 1. **Completion rate divided by a response-ROW count.** `total_responses` is
//!    `COUNT(DISTINCT r.id)` — one row per answered question. Dividing completed
//!    sessions by it reported a study where every single participant finished as
//!    ~10% complete (10 questions → ~10 response rows per session). The
//!    `.max(completed_sessions)` calls in the old code were papering over the
//!    fact that the denominator could be smaller than the numerator.
//!
//! 2. **The cross-questionnaire "correlation" was not a correlation.** It paired
//!    the i-th session of questionnaire A with the i-th session of B — two
//!    chronologically-unrelated people — and truncated the longer arm. It now
//!    inner-joins on `participant_id`.
//!
//! Fixtures are seeded on the migration DSN (`qdesigner`, BYPASSRLS); the
//! endpoints are driven through the real router as an authenticated org owner,
//! who is admitted to the study tables by the 00021 org-member SELECT branch.

use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
};

/// Seed one session and its per-question response rows.
///
/// `question_count` response rows land under this session — this is the knob
/// that made the completion-rate bug visible: a session is one unit of
/// completion but N units of `total_responses`.
///
/// `rank` orders sessions on `created_at`, which is the order the analytics
/// sample loader returns rows in (`ORDER BY s.created_at ASC`) and therefore the
/// order the OLD index-pairing correlation consumed them in.
async fn seed_session(
    pool: &PgPool,
    questionnaire_id: Uuid,
    participant_id: &str,
    completed: bool,
    rank: i64,
    question_count: usize,
    score: Option<f64>,
) {
    let status = if completed { "completed" } else { "active" };
    let session_id: Uuid = sqlx::query_scalar(
        "INSERT INTO sessions (questionnaire_id, participant_id, status, created_at, started_at, completed_at) \
         VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, NOW(), \
                 CASE WHEN $3 = 'completed' THEN NOW() + interval '5 seconds' ELSE NULL END) \
         RETURNING id",
    )
    .bind(questionnaire_id)
    .bind(participant_id)
    .bind(status)
    .bind(rank.to_string())
    .fetch_one(pool)
    .await
    .expect("seed session");

    for i in 0..question_count {
        sqlx::query(
            "INSERT INTO responses (session_id, client_id, question_id, value) VALUES ($1, $2, $3, $4)",
        )
        .bind(session_id)
        .bind(Uuid::new_v4())
        .bind(format!("q{i}"))
        .bind(serde_json::json!(0))
        .execute(pool)
        .await
        .expect("seed response");
    }

    // The aggregation key the analytics endpoints are asked to correlate on.
    if let Some(score) = score {
        sqlx::query(
            "INSERT INTO responses (session_id, client_id, question_id, value) VALUES ($1, $2, 'score', $3)",
        )
        .bind(session_id)
        .bind(Uuid::new_v4())
        .bind(serde_json::json!(score))
        .execute(pool)
        .await
        .expect("seed score");
    }
}

/// Create a second questionnaire under an existing project, through the API.
async fn make_questionnaire(app: &axum::Router, token: &str, project_id: Uuid) -> Uuid {
    let body = serde_json::json!({ "name": format!("Q {}", &Uuid::new_v4().to_string()[..8]) });
    let (status, q) = json_request(
        app,
        "POST",
        &format!("/api/projects/{project_id}/questionnaires"),
        Some(token),
        Some(&body),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create questionnaire: {q:?}");
    q["id"]
        .as_str()
        .and_then(|s| Uuid::parse_str(s).ok())
        .expect("questionnaire id")
}

/// The completion denominator is sessions STARTED, not response rows.
///
/// Fixture: Q1 has 10 sessions, ALL completed, each answering 10 questions →
/// 100 response rows, 10 sessions, 10 completed. The honest rate is 100%.
/// Q2 has 4 sessions of which 1 completed → 25%.
///
/// The old code computed `completed / max(total_responses, completed)`:
///   Q1 → 10 / max(100, 10) = 0.10   ("10% completion" for a study everyone finished)
///   Q2 →  1 / max( 10,  1) = 0.10
/// and averaged them to 0.10. The honest answer is (1.00 + 0.25) / 2 = 0.625.
#[tokio::test]
async fn completion_rate_divides_by_sessions_not_response_rows() {
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
    let q1 = tenant.questionnaire_id;
    let q2 = make_questionnaire(&app, &user.token, tenant.project_id).await;

    for i in 0..10 {
        seed_session(&pool, q1, &format!("q1-p{i}"), true, i, 10, None).await;
    }
    seed_session(&pool, q2, "q2-p0", true, 0, 10, None).await;
    for i in 1..4 {
        seed_session(&pool, q2, &format!("q2-p{i}"), false, i, 0, None).await;
    }

    // ── Dashboard ────────────────────────────────────────────────────────
    let (status, dash) = json_request(
        &app,
        "GET",
        &format!("/api/sessions/dashboard?organization_id={}", tenant.org_id),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "dashboard: {dash:?}");

    let row = dash["questionnaires"]
        .as_array()
        .expect("questionnaires array")
        .iter()
        .find(|q| q["id"].as_str() == Some(&q1.to_string()))
        .expect("q1 row in dashboard");

    // The two counts are genuinely different quantities, and both are reported.
    assert_eq!(row["total_responses"].as_i64(), Some(100), "response ROWS");
    assert_eq!(row["total_sessions"].as_i64(), Some(10), "sessions STARTED");
    assert_eq!(row["completed_sessions"].as_i64(), Some(10));

    // (1.0 + 0.25) / 2. The bug reported 0.10.
    let avg = dash["stats"]["avg_completion_rate"]
        .as_f64()
        .expect("avg_completion_rate");
    assert!(
        (avg - 0.625).abs() < 1e-9,
        "avg_completion_rate must be 0.625 (Q1 100%, Q2 25%), got {avg}"
    );

    // ── Cross-project analytics ──────────────────────────────────────────
    let (status, cross) = json_request(
        &app,
        "GET",
        &format!(
            "/api/organizations/{}/analytics?questionnaire_ids={q1},{q2}",
            tenant.org_id
        ),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "cross-project analytics: {cross:?}");

    let arms = cross["questionnaires"].as_array().expect("questionnaires");
    let arm_1 = arms
        .iter()
        .find(|q| q["questionnaire_id"].as_str() == Some(&q1.to_string()))
        .expect("q1 arm");
    let arm_2 = arms
        .iter()
        .find(|q| q["questionnaire_id"].as_str() == Some(&q2.to_string()))
        .expect("q2 arm");

    assert_eq!(arm_1["total_sessions"].as_i64(), Some(10));
    assert_eq!(arm_1["response_count"].as_i64(), Some(100));
    let rate_1 = arm_1["completion_rate"].as_f64().expect("q1 rate");
    assert!(
        (rate_1 - 1.0).abs() < 1e-9,
        "every Q1 session completed → 100%, got {rate_1}"
    );

    assert_eq!(arm_2["total_sessions"].as_i64(), Some(4));
    let rate_2 = arm_2["completion_rate"].as_f64().expect("q2 rate");
    assert!(
        (rate_2 - 0.25).abs() < 1e-9,
        "1 of 4 Q2 sessions completed → 25%, got {rate_2}"
    );

    // Overall: 11 completed of 14 started. The bug reported 11/110 = 0.10.
    let overall = cross["aggregate"]["overall_completion_rate"]
        .as_f64()
        .expect("overall_completion_rate");
    assert_eq!(cross["aggregate"]["total_sessions"].as_i64(), Some(14));
    assert!(
        (overall - 11.0 / 14.0).abs() < 1e-9,
        "overall rate must be 11/14, got {overall}"
    );
}

/// The Pearson r must pair observations by PARTICIPANT, not by array index.
///
/// The fixture is built so the two pairings disagree as loudly as possible.
/// Six participants take both questionnaires. In A's chronological order they
/// score 1,2,3,4,5,6; in B's chronological order the scores are 10,20,30,40,50,60
/// — so pairing by index yields a textbook r = +1.0. But B's chronological order
/// is the permutation (P3, P6, P1, P4, P2, P5), so the participant-keyed pairs are
///
///   P1 (1,30)  P2 (2,50)  P3 (3,10)  P4 (4,40)  P5 (5,60)  P6 (6,20)
///
/// whose true correlation is 5/175 ≈ 0.0286 — no relationship at all.
///
/// The old code reported r = 1.000. There is no relationship in this data.
#[tokio::test]
async fn cross_correlation_pairs_by_participant_not_by_index() {
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
    let q_a = tenant.questionnaire_id;
    let q_b = make_questionnaire(&app, &user.token, tenant.project_id).await;

    // Participant ids must be unique per test run but shared across the arms.
    let run = &Uuid::new_v4().to_string()[..8];
    let pid = |n: usize| format!("{run}-P{n}");

    // Arm A, chronological: P1..P6 scoring 1..6.
    for n in 1..=6usize {
        seed_session(&pool, q_a, &pid(n), true, n as i64, 1, Some(n as f64)).await;
    }

    // Arm B, chronological: the permutation, scoring 10,20,...,60.
    for (rank, n) in [3usize, 6, 1, 4, 2, 5].into_iter().enumerate() {
        let score = 10.0 * (rank as f64 + 1.0);
        seed_session(&pool, q_b, &pid(n), true, rank as i64, 1, Some(score)).await;
    }

    let (status, cross) = json_request(
        &app,
        "GET",
        &format!(
            "/api/organizations/{}/analytics?questionnaire_ids={q_a},{q_b}&source=response&key=score",
            tenant.org_id
        ),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "cross-project analytics: {cross:?}");

    let comparisons = cross["cross_comparisons"]
        .as_array()
        .expect("cross_comparisons present when both arms have numeric samples");
    assert_eq!(comparisons.len(), 1, "one pair of questionnaires");
    let c = &comparisons[0];

    assert_eq!(
        c["paired_n"].as_i64(),
        Some(6),
        "all six participants took both questionnaires"
    );

    let r = c["correlation"].as_f64().expect("correlation");
    assert!(
        (r - 5.0 / 175.0).abs() < 1e-9,
        "participant-paired r must be 5/175 ≈ 0.0286; index-paired would be 1.0. Got {r}"
    );
    assert!(
        r < 0.5,
        "a spurious index-paired r=1.0 must be impossible here, got {r}"
    );
}

/// Below the pair floor, refuse to report an r at all.
///
/// Four shared participants: the old code would happily emit a coefficient (with
/// 2 pairs it is ±1 *by construction*). We report `paired_n` and a null
/// correlation, which the UI renders as "insufficient data".
///
/// Also pins the drop rules: a participant present in only one arm contributes
/// nothing, and a participant with several sessions in one arm still counts once.
#[tokio::test]
async fn cross_correlation_withheld_below_pair_floor() {
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
    let q_a = tenant.questionnaire_id;
    let q_b = make_questionnaire(&app, &user.token, tenant.project_id).await;

    let run = &Uuid::new_v4().to_string()[..8];
    let pid = |n: usize| format!("{run}-P{n}");

    // Four participants in both arms.
    for n in 1..=4usize {
        seed_session(&pool, q_a, &pid(n), true, n as i64, 1, Some(n as f64)).await;
        seed_session(&pool, q_b, &pid(n), true, n as i64, 1, Some(2.0 * n as f64)).await;
    }
    // P4 sat arm A twice — still one participant, so still 4 pairs, not 5.
    seed_session(&pool, q_a, &pid(4), true, 90, 1, Some(4.0)).await;
    // P5 and P6 only ever took arm A — unpairable, so still 4 pairs, not 6.
    seed_session(&pool, q_a, &pid(5), true, 91, 1, Some(50.0)).await;
    seed_session(&pool, q_a, &pid(6), true, 92, 1, Some(60.0)).await;

    let (status, cross) = json_request(
        &app,
        "GET",
        &format!(
            "/api/organizations/{}/analytics?questionnaire_ids={q_a},{q_b}&source=response&key=score",
            tenant.org_id
        ),
        Some(&user.token),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "cross-project analytics: {cross:?}");

    let c = &cross["cross_comparisons"].as_array().expect("comparisons")[0];
    assert_eq!(
        c["paired_n"].as_i64(),
        Some(4),
        "only 4 participants appear in both arms (multi-session P4 counts once; \
         A-only P5/P6 are dropped)"
    );
    assert!(
        c["correlation"].is_null(),
        "4 pairs is below the floor — an r here would be noise dressed as a finding, got {:?}",
        c["correlation"]
    );

    // The arm-level deltas still report: they need no pairing.
    assert!(c["mean_delta"].is_number(), "mean delta is still reported");
}
