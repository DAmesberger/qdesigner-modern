//! F-37 (corrected) — a genuinely **out-of-band** write to a questionnaire's
//! `content` must invalidate the cached collab CRDT binary (`yjs_state`), so the
//! next room creation re-seeds from the fresh content instead of masking the
//! edit with a stale CRDT snapshot — BUT a content write while a collab **room
//! is open** must NOT invalidate that room's authoritative binary.
//!
//! The original F-37 NULLed `yjs_state` on *every* content write, on the false
//! premise that a content write is always the non-collab autosave writer. In
//! fact the debounced autosave keeps running during a collab session (a remote
//! Yjs edit flips the store dirty), so the unconditional NULL wiped the live
//! room's identity on essentially every keystroke — and the next re-seed (after
//! a restart or room eviction) then duplicated every page for a reconnecting
//! tab. The discriminator is an open room in `YjsStore`: it is the authority
//! while live and owns `yjs_state`; only when no room is open is a content
//! write out-of-band and the stale binary safe (indeed required) to drop.

use axum::http::StatusCode;
use uuid::Uuid;

mod common;
use common::{
    build_test_state, fixture_pool, json_request, provision_tenant, register_user, test_app,
};

/// Seed a non-NULL `yjs_state` on the questionnaire (as the collab room would
/// have persisted), returning nothing — read it back via the fixture pool.
async fn seed_yjs_state(fx: &sqlx::PgPool, qid: Uuid) {
    sqlx::query(
        "UPDATE questionnaire_definitions SET yjs_state = '\\x0102030405'::bytea WHERE id = $1",
    )
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
    let uri = format!("/api/projects/{}/questionnaires/{}", tenant.project_id, qid);

    // (1) With NO room open, a content write is out-of-band and must NULL
    // yjs_state (F-37). No room was ever opened in this test, so
    // `has_active_room(qid)` is false and the invalidation fires.
    seed_yjs_state(&fx, qid).await;
    assert!(!yjs_state_is_null(&fx, qid).await, "precondition: seeded");

    let content_body = serde_json::json!({
        "content": { "pages": [{ "id": "p1", "blocks": [] }] }
    });
    let (status, json) =
        json_request(&app, "PATCH", &uri, Some(&owner.token), Some(&content_body)).await;
    assert_eq!(status, StatusCode::OK, "content update ok: {json:?}");
    assert!(
        yjs_state_is_null(&fx, qid).await,
        "an out-of-band content write (no room open) must invalidate yjs_state (F-37)"
    );

    // (2) A metadata-only write (no content) must LEAVE yjs_state intact — the
    // invalidation is scoped to content writes, not every update.
    seed_yjs_state(&fx, qid).await;
    let name_body = serde_json::json!({ "name": "Renamed, no content change" });
    let (status, json) =
        json_request(&app, "PATCH", &uri, Some(&owner.token), Some(&name_body)).await;
    assert_eq!(status, StatusCode::OK, "name update ok: {json:?}");
    assert!(
        !yjs_state_is_null(&fx, qid).await,
        "a metadata-only write must not touch yjs_state"
    );
}

/// #1 — a content write while a collab **room is open** must NOT wipe that
/// room's authoritative CRDT binary. This is the corruption reproduction: the
/// autosave keeps firing during a collab session (a collab-driven edit flips the
/// store dirty), so the original unconditional NULL destroyed the live room's
/// identity on every edit, and the next re-seed (after restart / eviction)
/// duplicated every page for a reconnecting tab.
///
/// Regression guard: with an unconditional `yjs_state = NULL` in
/// `questionnaires.rs` this fails at the post-edit assertion:
///   "a content write while a collab room is open must NOT wipe yjs_state (#1)".
#[tokio::test]
async fn content_write_preserves_yjs_state_while_a_room_is_open() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let Some(fx) = fixture_pool().await else {
        eprintln!("skipping: no fixture pool");
        return;
    };
    // Hold a handle to the SAME rooms map the HTTP handler consults (YjsStore is
    // Arc-backed, so the clone shares state with `state.yjs_store`).
    let yjs_store = state.yjs_store.clone();
    let app = test_app(state);

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let qid = tenant.questionnaire_id;
    let uri = format!("/api/projects/{}/questionnaires/{}", tenant.project_id, qid);

    // Give the questionnaire real content. No room is open yet, so this write is
    // out-of-band and legitimately NULLs yjs_state (the F-37 path, case 1).
    let seed_body = serde_json::json!({
        "content": { "pages": [{ "id": "p1", "blocks": [] }] }
    });
    let (status, json) =
        json_request(&app, "PATCH", &uri, Some(&owner.token), Some(&seed_body)).await;
    assert_eq!(status, StatusCode::OK, "seed content ok: {json:?}");

    // Open the collab room: the server seeds a VALID yjs_state from content and
    // caches the room, so `has_active_room(qid)` is now true.
    let _room = yjs_store.get_or_create_room(qid).await;
    assert!(
        yjs_store.has_active_room(&qid).await,
        "precondition: room is open"
    );
    assert!(
        !yjs_state_is_null(&fx, qid).await,
        "precondition: opening the room persisted a non-NULL yjs_state"
    );

    // The corruption trigger: a content write WHILE the room is open (exactly
    // what the autosave does on every collab-driven edit) must leave the room's
    // authoritative binary intact.
    let edit_body = serde_json::json!({
        "content": {
            "pages": [
                { "id": "p1", "blocks": [] },
                { "id": "p2", "blocks": [] }
            ]
        }
    });
    let (status, json) =
        json_request(&app, "PATCH", &uri, Some(&owner.token), Some(&edit_body)).await;
    assert_eq!(status, StatusCode::OK, "content edit ok: {json:?}");
    assert!(
        !yjs_state_is_null(&fx, qid).await,
        "a content write while a collab room is open must NOT wipe yjs_state (#1)"
    );
}
