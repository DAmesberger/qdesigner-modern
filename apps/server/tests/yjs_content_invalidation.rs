//! F-37 — a non-collab write to a questionnaire's `content` must invalidate the
//! cached collab CRDT binary (`yjs_state`), so the next room creation re-seeds
//! from the fresh content instead of masking the out-of-band edit with a stale
//! CRDT snapshot.
//!
//! The YjsStore's own debounced persist writes `yjs_state` *only* (never
//! `content`), so it cannot trigger this path; the questionnaire update/autosave
//! handler is the sole `content` writer and is where the invalidation lives.

use axum::http::StatusCode;
use uuid::Uuid;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
};

/// Seed a non-NULL `yjs_state` on the questionnaire (as the collab room would
/// have persisted), returning nothing — read it back via the fixture pool.
async fn seed_yjs_state(fx: &sqlx::PgPool, qid: Uuid) {
    sqlx::query("UPDATE questionnaire_definitions SET yjs_state = '\\x0102030405'::bytea WHERE id = $1")
        .bind(qid)
        .execute(fx)
        .await
        .expect("seed yjs_state");
}

async fn yjs_state_is_null(fx: &sqlx::PgPool, qid: Uuid) -> bool {
    let state: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT yjs_state FROM questionnaire_definitions WHERE id = $1")
            .bind(qid)
            .fetch_one(fx)
            .await
            .expect("read yjs_state");
    state.is_none()
}

#[tokio::test]
async fn content_write_invalidates_yjs_state_but_metadata_write_does_not() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let qid = tenant.questionnaire_id;
    let uri = format!(
        "/api/projects/{}/questionnaires/{}",
        tenant.project_id, qid
    );

    // (1) A content write must NULL yjs_state.
    seed_yjs_state(&fx, qid).await;
    assert!(!yjs_state_is_null(&fx, qid).await, "precondition: seeded");

    let content_body = serde_json::json!({
        "content": { "pages": [{ "id": "p1", "blocks": [] }] }
    });
    let (status, json) = json_request(&app, "PATCH", &uri, Some(&owner.token), Some(&content_body)).await;
    assert_eq!(status, StatusCode::OK, "content update ok: {json:?}");
    assert!(
        yjs_state_is_null(&fx, qid).await,
        "a content write must invalidate yjs_state (F-37)"
    );

    // (2) A metadata-only write (no content) must LEAVE yjs_state intact — the
    // invalidation is scoped to content writes, not every update.
    seed_yjs_state(&fx, qid).await;
    let name_body = serde_json::json!({ "name": "Renamed, no content change" });
    let (status, json) = json_request(&app, "PATCH", &uri, Some(&owner.token), Some(&name_body)).await;
    assert_eq!(status, StatusCode::OK, "name update ok: {json:?}");
    assert!(
        !yjs_state_is_null(&fx, qid).await,
        "a metadata-only write must not touch yjs_state"
    );
}
