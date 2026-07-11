//! P4.1 sessions::sync_session ON CONFLICT dedup tests.
//!
//! sync_session bulk-inserts responses and interaction_events from the
//! offline client; each row carries a `client_id UUID` that's UNIQUE so
//! a retry-after-timeout doesn't create duplicates. This file asserts
//! the DB-level dedup invariant directly:
//!   INSERT INTO responses (session_id, client_id, ...) VALUES (..., $client_id, ...)
//!   ON CONFLICT (client_id) DO NOTHING
//!
//! Same shape for interaction_events.
//!
//! Requires running PostgreSQL with migrations applied.

use sqlx::PgPool;
use uuid::Uuid;

mod common;
use common::fixture_pool;

/// Create a minimal session row that responses/events can reference.
async fn make_session(pool: &PgPool) -> sqlx::Result<Uuid> {
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, password_hash) VALUES ($1, 'placeholder') RETURNING id",
    )
    .bind(format!("u-{}@test.local", Uuid::new_v4()))
    .fetch_one(pool)
    .await?;

    let org_id: Uuid = sqlx::query_scalar(
        "INSERT INTO organizations (name, slug, created_by) VALUES ('O', $1, $2) RETURNING id",
    )
    .bind(format!("o-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    )
    .bind(org_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    let project_id: Uuid = sqlx::query_scalar(
        "INSERT INTO projects (organization_id, name, code) VALUES ($1, 'P', $2) RETURNING id",
    )
    .bind(org_id)
    .bind(format!("p-{}", &Uuid::new_v4().to_string()[..8]))
    .fetch_one(pool)
    .await?;

    let q_id: Uuid = sqlx::query_scalar(
        "INSERT INTO questionnaire_definitions (project_id, name, content, status, created_by) \
         VALUES ($1, $2, '{}'::jsonb, 'draft', $3) RETURNING id",
    )
    .bind(project_id)
    .bind(format!("Q-{}", &Uuid::new_v4().to_string()[..8]))
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    sqlx::query_scalar("INSERT INTO sessions (questionnaire_id) VALUES ($1) RETURNING id")
        .bind(q_id)
        .fetch_one(pool)
        .await
}

#[tokio::test]
async fn responses_dedup_on_client_id() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");
    let client_id = Uuid::new_v4();

    // First insert succeeds. Values are parameterized as JSON to dodge
    // SQL string-literal escaping pitfalls.
    let first_value = serde_json::json!("first");
    let inserted = sqlx::query(
        "INSERT INTO responses (session_id, client_id, question_id, value) \
         VALUES ($1, $2, 'q-1', $3) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(client_id)
    .bind(&first_value)
    .execute(&pool)
    .await
    .expect("insert 1")
    .rows_affected();
    assert_eq!(inserted, 1, "first insert should write one row");

    // Retry with same client_id — dedup'd.
    let retry_value = serde_json::json!("retried-value-must-not-overwrite");
    let inserted_retry = sqlx::query(
        "INSERT INTO responses (session_id, client_id, question_id, value) \
         VALUES ($1, $2, 'q-1', $3) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(client_id)
    .bind(&retry_value)
    .execute(&pool)
    .await
    .expect("insert 2")
    .rows_affected();
    assert_eq!(inserted_retry, 0, "duplicate client_id should be skipped");

    // Confirm there's still exactly ONE row for this client_id and that
    // its value is the ORIGINAL (not overwritten by the retry).
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM responses WHERE client_id = $1")
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, 1);

    let value: serde_json::Value =
        sqlx::query_scalar("SELECT value FROM responses WHERE client_id = $1")
            .bind(client_id)
            .fetch_one(&pool)
            .await
            .expect("value");
    assert_eq!(value, first_value);
}

#[tokio::test]
async fn interaction_events_dedup_on_client_id() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");
    let client_id = Uuid::new_v4();

    let first = sqlx::query(
        "INSERT INTO interaction_events (session_id, client_id, event_type, timestamp_us) \
         VALUES ($1, $2, 'click', 1000) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(client_id)
    .execute(&pool)
    .await
    .expect("insert 1")
    .rows_affected();
    assert_eq!(first, 1);

    let retry = sqlx::query(
        "INSERT INTO interaction_events (session_id, client_id, event_type, timestamp_us) \
         VALUES ($1, $2, 'click', 9999) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(client_id)
    .execute(&pool)
    .await
    .expect("insert 2")
    .rows_affected();
    assert_eq!(retry, 0);

    let ts: i64 =
        sqlx::query_scalar("SELECT timestamp_us FROM interaction_events WHERE client_id = $1")
            .bind(client_id)
            .fetch_one(&pool)
            .await
            .expect("ts");
    assert_eq!(ts, 1000, "original value must survive retry");
}

#[tokio::test]
async fn trials_dedup_on_client_id() {
    // RT-1b: trials sync uses the same `ON CONFLICT (client_id) DO NOTHING`
    // idempotent dedup as responses/events. A retry with the same client_id
    // must not create a second row nor overwrite the original.
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");
    let client_id = Uuid::new_v4();

    let inserted = sqlx::query(
        "INSERT INTO trials (session_id, client_id, question_id, trial_index, rt_us, correct) \
         VALUES ($1, $2, 'q-1', 0, 12345, true) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(client_id)
    .execute(&pool)
    .await
    .expect("insert 1")
    .rows_affected();
    assert_eq!(inserted, 1, "first trial insert should write one row");

    let retry = sqlx::query(
        "INSERT INTO trials (session_id, client_id, question_id, trial_index, rt_us, correct) \
         VALUES ($1, $2, 'q-1', 0, 99999, false) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(client_id)
    .execute(&pool)
    .await
    .expect("insert 2")
    .rows_affected();
    assert_eq!(retry, 0, "duplicate trial client_id should be skipped");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM trials WHERE client_id = $1")
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, 1);

    let rt: i64 = sqlx::query_scalar("SELECT rt_us FROM trials WHERE client_id = $1")
        .bind(client_id)
        .fetch_one(&pool)
        .await
        .expect("rt");
    assert_eq!(rt, 12345, "original trial value must survive retry");
}

#[tokio::test]
async fn trials_backfill_is_idempotent() {
    // RT-1b backfill: exploding a reaction response's `value.responses[]` into
    // trials rows uses a DETERMINISTIC client_id (md5(response_id || ':' ||
    // ordinal)), so re-running the exact backfill statement is a no-op. This
    // mirrors the statement 00048 runs.
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");

    // A two-trial reaction response (the shape the client persists into
    // `responses.value`), with a scalar reaction_time_us that W-8 must NULL.
    let value = serde_json::json!({
        "responses": [
            { "trialNumber": 0, "key": "left",  "reactionTime": 321.5, "isCorrect": true,  "responseDevice": "keyboard" },
            { "trialNumber": 1, "key": "right", "reactionTime": 410.0, "isCorrect": false, "responseDevice": "keyboard", "anticipatory": true }
        ]
    });
    let resp_id: Uuid = sqlx::query_scalar(
        "INSERT INTO responses (session_id, question_id, value, reaction_time_us) \
         VALUES ($1, 'rt-q', $2, 400000) RETURNING id",
    )
    .bind(session_id)
    .bind(&value)
    .fetch_one(&pool)
    .await
    .expect("insert reaction response");

    // The backfill INSERT (subset scoped to this one response for the test).
    let backfill = r#"
        INSERT INTO public.trials
            (session_id, question_id, trial_index, option_id, source, rt_us, correct,
             sampled_timings, provenance, invalidated, client_id)
        SELECT
            r.session_id, r.question_id,
            COALESCE((elem->>'trialNumber')::int, (ord - 1)::int),
            elem->>'key', elem->>'responseDevice',
            CASE WHEN jsonb_typeof(elem->'reactionTime') = 'number'
                 THEN round((elem->>'reactionTime')::numeric * 1000)::bigint ELSE NULL END,
            CASE WHEN jsonb_typeof(elem->'isCorrect') = 'boolean'
                 THEN (elem->>'isCorrect')::boolean ELSE NULL END,
            elem->'phaseTimeline',
            jsonb_strip_nulls(jsonb_build_object('backfilled', true)),
            CASE
                WHEN jsonb_typeof(elem->'invalid') = 'boolean' AND (elem->>'invalid')::boolean
                    THEN COALESCE(elem->>'invalidReason', 'invalid')
                WHEN jsonb_typeof(elem->'anticipatory') = 'boolean' AND (elem->>'anticipatory')::boolean
                    THEN 'anticipatory'
                ELSE NULL END,
            md5(r.id::text || ':' || ord::text)::uuid
        FROM public.responses r
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(r.value->'responses') = 'array'
                 THEN r.value->'responses' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS t(elem, ord)
        WHERE r.id = $1
        ON CONFLICT (client_id) DO NOTHING
    "#;

    let first = sqlx::query(backfill)
        .bind(resp_id)
        .execute(&pool)
        .await
        .expect("backfill 1")
        .rows_affected();
    assert_eq!(first, 2, "two trials materialized from the two-element array");

    let again = sqlx::query(backfill)
        .bind(resp_id)
        .execute(&pool)
        .await
        .expect("backfill 2")
        .rows_affected();
    assert_eq!(again, 0, "re-running the backfill is a deterministic no-op");

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM trials WHERE session_id = $1 AND question_id = 'rt-q'")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(count, 2, "still exactly two trials after two backfill passes");

    // The second trial was flagged anticipatory; the first kept.
    let invalidated: Option<String> = sqlx::query_scalar(
        "SELECT invalidated FROM trials WHERE session_id = $1 AND trial_index = 1",
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await
    .expect("invalidated");
    assert_eq!(invalidated.as_deref(), Some("anticipatory"));

    // rt_us is microseconds (ms × 1000).
    let rt0: Option<i64> =
        sqlx::query_scalar("SELECT rt_us FROM trials WHERE session_id = $1 AND trial_index = 0")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .expect("rt0");
    assert_eq!(rt0, Some(321_500), "321.5ms → 321500us");
}

#[tokio::test]
async fn sync_metadata_merge_preserves_prior_keys_and_is_idempotent() {
    // Mirrors the metadata-merge sync_session runs for a PRE-EXISTING session
    // (online-created): the INSERT branch is skipped, so the final-snapshot
    // metadata (e.g. `qualityReport`) lands only via
    //   UPDATE sessions SET metadata = COALESCE(metadata,'{}'::jsonb) || $2 WHERE id = $1
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");

    // Seed prior metadata (as an online-created session would already carry).
    let prior = serde_json::json!({ "fingerprint": "abc123", "kept": true });
    sqlx::query("UPDATE sessions SET metadata = $2 WHERE id = $1")
        .bind(session_id)
        .bind(&prior)
        .execute(&pool)
        .await
        .expect("seed prior metadata");

    // Apply the exact merge statement sync_session runs.
    let patch = serde_json::json!({ "qualityReport": { "flatlines": 0, "speeder": false } });
    let merge_sql =
        "UPDATE sessions SET metadata = COALESCE(metadata, '{}'::jsonb) || $2 WHERE id = $1";
    sqlx::query(merge_sql)
        .bind(session_id)
        .bind(&patch)
        .execute(&pool)
        .await
        .expect("merge 1");

    let merged: serde_json::Value =
        sqlx::query_scalar("SELECT metadata FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .expect("read merged");

    // Prior keys survive AND the new key is present.
    assert_eq!(merged["fingerprint"], serde_json::json!("abc123"));
    assert_eq!(merged["kept"], serde_json::json!(true));
    assert_eq!(merged["qualityReport"], patch["qualityReport"]);

    // A second identical sync is idempotent — the object is unchanged.
    sqlx::query(merge_sql)
        .bind(session_id)
        .bind(&patch)
        .execute(&pool)
        .await
        .expect("merge 2");

    let merged_again: serde_json::Value =
        sqlx::query_scalar("SELECT metadata FROM sessions WHERE id = $1")
            .bind(session_id)
            .fetch_one(&pool)
            .await
            .expect("read merged again");
    assert_eq!(
        merged_again, merged,
        "second identical merge must be a no-op"
    );
}

#[tokio::test]
async fn batched_multi_row_insert_dedups_and_counts_only_new_rows() {
    // Mirrors the chunked multi-row INSERT sync_session now issues for
    // responses: a single `INSERT ... VALUES (row), (row), ... ON CONFLICT
    // (client_id) DO NOTHING`. The batch's rows_affected() must count ONLY the
    // rows actually inserted (skipped duplicates don't count) — this is what
    // responses_synced/events_synced accumulate. Here k of N rows collide with
    // pre-existing client_ids, so the batch must report N-k and the table must
    // hold exactly N rows for the session.
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");

    const N: usize = 6;
    const K: usize = 2;
    let client_ids: Vec<Uuid> = (0..N).map(|_| Uuid::new_v4()).collect();

    // Pre-insert the first K rows so they already exist on the server.
    for cid in client_ids.iter().take(K) {
        sqlx::query(
            "INSERT INTO responses (session_id, client_id, question_id, value) \
             VALUES ($1, $2, 'q-1', '\"pre\"'::jsonb) ON CONFLICT (client_id) DO NOTHING",
        )
        .bind(session_id)
        .bind(cid)
        .execute(&pool)
        .await
        .expect("pre-insert");
    }

    // Batch-insert all N rows in one multi-row statement (the handler's shape).
    let mut builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        "INSERT INTO responses (session_id, question_id, value, client_id) ",
    );
    builder.push_values(client_ids.iter(), |mut row, cid| {
        row.push_bind(session_id)
            .push_bind("q-1")
            .push_bind(serde_json::json!("batch"))
            .push_bind(cid);
    });
    builder.push(" ON CONFLICT (client_id) DO NOTHING");
    let affected = builder
        .build()
        .execute(&pool)
        .await
        .expect("batch insert")
        .rows_affected();

    assert_eq!(
        affected,
        (N - K) as u64,
        "batch rows_affected must count only newly-inserted rows"
    );

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM responses WHERE session_id = $1")
        .bind(session_id)
        .fetch_one(&pool)
        .await
        .expect("count");
    assert_eq!(count, N as i64, "table must hold exactly N distinct rows");

    // The pre-existing rows must retain their ORIGINAL value (DO NOTHING, not
    // overwrite): the K colliding client_ids still read "pre".
    for cid in client_ids.iter().take(K) {
        let value: serde_json::Value =
            sqlx::query_scalar("SELECT value FROM responses WHERE client_id = $1")
                .bind(cid)
                .fetch_one(&pool)
                .await
                .expect("value");
        assert_eq!(
            value,
            serde_json::json!("pre"),
            "collision must not overwrite"
        );
    }
}

#[tokio::test]
async fn responses_upsert_patches_value_on_conflict() {
    // issue #34: a binary answer first syncs carrying `{status:'pending'}`; once
    // the blob uploads, the client re-sends the SAME client_id with
    // `{status:'uploaded', mediaUrl}`. The handler's responses upsert is
    // `ON CONFLICT (client_id) DO UPDATE SET value = EXCLUDED.value`, so the
    // patched value OVERWRITES the pending one — unlike events/trials, which stay
    // `DO NOTHING` and keep their first value. Exactly one row survives.
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");
    // The exact write-once-except-pending clause the handler issues.
    let upsert = "INSERT INTO responses (session_id, client_id, question_id, value) \
         VALUES ($1, $2, 'q-file', $3) \
         ON CONFLICT (client_id) DO UPDATE SET value = EXCLUDED.value \
         WHERE (jsonb_typeof(responses.value) = 'object' \
                AND responses.value->>'status' = 'pending') \
             OR (jsonb_typeof(responses.value) = 'array' AND EXISTS ( \
                 SELECT 1 FROM jsonb_array_elements(responses.value) e \
                 WHERE e->>'status' = 'pending'))";

    // (a) A pending binary reference IS patched to its uploaded value.
    let client_id = Uuid::new_v4();
    let pending = serde_json::json!({ "clientId": "b-1", "name": "a.png", "status": "pending" });
    let affected1 = sqlx::query(upsert)
        .bind(session_id)
        .bind(client_id)
        .bind(&pending)
        .execute(&pool)
        .await
        .expect("insert pending")
        .rows_affected();
    assert_eq!(affected1, 1, "first upsert inserts the pending reference");

    let uploaded = serde_json::json!({
        "clientId": "b-1", "name": "a.png", "status": "uploaded",
        "mediaUrl": "/api/media/xyz/content"
    });
    let affected2 = sqlx::query(upsert)
        .bind(session_id)
        .bind(client_id)
        .bind(&uploaded)
        .execute(&pool)
        .await
        .expect("patch upload")
        .rows_affected();
    assert_eq!(affected2, 1, "pending → uploaded conflicting upsert UPDATEs the row");

    let value: serde_json::Value =
        sqlx::query_scalar("SELECT value FROM responses WHERE client_id = $1")
            .bind(client_id)
            .fetch_one(&pool)
            .await
            .expect("value");
    assert_eq!(value["status"], serde_json::json!("uploaded"), "status patched");
    assert_eq!(
        value["mediaUrl"],
        serde_json::json!("/api/media/xyz/content"),
        "mediaUrl landed on the response"
    );

    // (a-idempotent) Re-sending the SAME uploaded value is now a no-op (the stored
    // row is no longer pending) — the client tolerates this because acks come from
    // accepted_client_ids, not rows_affected.
    let affected_noop = sqlx::query(upsert)
        .bind(session_id)
        .bind(client_id)
        .bind(&uploaded)
        .execute(&pool)
        .await
        .expect("resend uploaded")
        .rows_affected();
    assert_eq!(affected_noop, 0, "resend against an already-uploaded row does not update");

    // (b) A tampered resend against the now-uploaded (non-pending) row must NOT
    // overwrite it — write-once integrity is preserved.
    let tampered = serde_json::json!({
        "clientId": "b-1", "name": "a.png", "status": "uploaded",
        "mediaUrl": "/api/media/ATTACKER/content"
    });
    let affected_tamper = sqlx::query(upsert)
        .bind(session_id)
        .bind(client_id)
        .bind(&tampered)
        .execute(&pool)
        .await
        .expect("tamper resend")
        .rows_affected();
    assert_eq!(affected_tamper, 0, "non-pending row is not rewritable");
    let after_tamper: serde_json::Value =
        sqlx::query_scalar("SELECT value FROM responses WHERE client_id = $1")
            .bind(client_id)
            .fetch_one(&pool)
            .await
            .expect("value after tamper");
    assert_eq!(
        after_tamper["mediaUrl"],
        serde_json::json!("/api/media/xyz/content"),
        "the original mediaUrl survives a tampered resend"
    );

    // (b) An ordinary scalar answer is write-once: a re-send with a different value
    // never overwrites the recorded answer.
    let scalar_cid = Uuid::new_v4();
    let original = serde_json::json!("my answer");
    sqlx::query(upsert)
        .bind(session_id)
        .bind(scalar_cid)
        .bind(&original)
        .execute(&pool)
        .await
        .expect("insert scalar");
    let scalar_resend = sqlx::query(upsert)
        .bind(session_id)
        .bind(scalar_cid)
        .bind(serde_json::json!("changed answer"))
        .execute(&pool)
        .await
        .expect("scalar resend")
        .rows_affected();
    assert_eq!(scalar_resend, 0, "a recorded scalar answer is not rewritable");
    let scalar_value: serde_json::Value =
        sqlx::query_scalar("SELECT value FROM responses WHERE client_id = $1")
            .bind(scalar_cid)
            .fetch_one(&pool)
            .await
            .expect("scalar value");
    assert_eq!(scalar_value, original, "original scalar answer survives the resend");

    // Still exactly two rows total (binary + scalar) — no duplicates created.
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM responses WHERE client_id = ANY($1)",
    )
    .bind(vec![client_id, scalar_cid])
    .fetch_one(&pool)
    .await
    .expect("count");
    assert_eq!(count, 2, "one binary + one scalar row, no duplicates");
}

#[tokio::test]
async fn distinct_client_ids_each_create_a_row() {
    let Some(pool) = fixture_pool().await else {
        eprintln!("Skipping: DATABASE_URL not set");
        return;
    };

    let session_id = make_session(&pool).await.expect("session");
    let cid_a = Uuid::new_v4();
    let cid_b = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO responses (session_id, client_id, question_id, value) \
                 VALUES ($1, $2, 'q-1', '1'::jsonb) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(cid_a)
    .execute(&pool)
    .await
    .expect("a");
    sqlx::query(
        "INSERT INTO responses (session_id, client_id, question_id, value) \
                 VALUES ($1, $2, 'q-1', '2'::jsonb) ON CONFLICT (client_id) DO NOTHING",
    )
    .bind(session_id)
    .bind(cid_b)
    .execute(&pool)
    .await
    .expect("b");

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM responses WHERE session_id = $1 AND client_id IN ($2, $3)",
    )
    .bind(session_id)
    .bind(cid_a)
    .bind(cid_b)
    .fetch_one(&pool)
    .await
    .expect("count");
    assert_eq!(count, 2, "two distinct client_ids should leave two rows");
}
