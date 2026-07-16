//! #2 — Yjs room lifecycle: eviction on last-client disconnect.
//!
//! Every questionnaire ever opened used to pin a `yrs::Doc` for the process
//! lifetime — `remove_room` was dead code and the WS disconnect path never
//! touched `yjs_store`. The fix evicts a room once its channel has no remaining
//! subscribers, but eviction must FLUSH the room's pending state first: an edit
//! applied to the in-memory doc but not yet debounce-persisted would otherwise
//! be lost, and — worse — the next re-seed from stale `content` would mint fresh
//! CRDT identity and duplicate pages for a reconnecting tab.
//!
//! Tested at the function seam (`get_or_create_room` / `handle_binary_message` /
//! `evict_room`), like `ws_channel_authz.rs`: a full WebSocket round-trip would
//! need a TCP listener + WS client the harness does not have.

use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map, ReadTxn, StateVector, Transact};

use qdesigner_server::websocket::yjs_relay::handle_binary_message;
use qdesigner_server::websocket::yjs_store::YjsStore;

mod common;
use common::{build_test_state, provision_tenant, register_user, test_app};

const MSG_SYNC: u8 = 0;
const MSG_SYNC_UPDATE: u8 = 2;
// Must fit in 32 bits: yrs truncates a `Doc` client id to u32, so a larger
// value would key the state vector under a different id and never match.
const MARKER_CLIENT_ID: u64 = 2_718_281_828;

fn encode_var_uint(mut value: usize, out: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

/// A well-formed editor update frame that writes a key under a distinctive
/// client id, so the id's presence in a doc's state vector proves the update
/// landed.
fn marker_update_frame() -> Vec<u8> {
    let doc = Doc::with_client_id(MARKER_CLIENT_ID);
    let map = doc.get_or_insert_map("marker");
    {
        let mut txn = doc.transact_mut();
        map.insert(&mut txn, "edited", "yes");
    }
    let update = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    let mut frame = vec![MSG_SYNC, MSG_SYNC_UPDATE];
    encode_var_uint(update.len(), &mut frame);
    frame.extend_from_slice(&update);
    frame
}

/// Whether a freshly-loaded room for `qid` carries the marker update — i.e.
/// whether the update survived in the persisted `yjs_state`.
async fn persisted_state_has_marker(store: &YjsStore, qid: Uuid) -> bool {
    let room_lock = store.get_or_create_room(qid).await;
    let room = room_lock.lock().await;
    let sv = StateVector::decode_v1(&room.encode_state_vector()).expect("decode state vector");
    sv.get(&MARKER_CLIENT_ID) > 0
}

#[tokio::test]
async fn eviction_flushes_pending_state_before_dropping_the_room() {
    let Some(state) = build_test_state().await else {
        eprintln!("skipping: no DB reachable");
        return;
    };
    let app = test_app(state.clone());

    let owner = register_user(&app).await;
    let tenant = provision_tenant(&app, &owner.token).await;
    let qid = tenant.questionnaire_id;
    let store = &state.yjs_store;

    // Open the room and apply an editor update. The update lands in the
    // in-memory doc; the debounced persist has NOT fired (we are well within the
    // 2s window since room creation), so the on-disk `yjs_state` does not yet
    // carry it.
    let conn_id = Uuid::new_v4();
    let responses = handle_binary_message(
        &marker_update_frame(),
        qid,
        store,
        &state.websocket_state,
        &conn_id,
        true, // can_write — editor tier
    )
    .await;
    // (An update frame relays but produces no direct reply.)
    let _ = responses;
    assert!(
        store.has_active_room(&qid).await,
        "precondition: room is open"
    );

    // Evict as the disconnect path would once the last subscriber leaves.
    store.evict_room(qid).await;
    assert!(
        !store.has_active_room(&qid).await,
        "the room must be dropped from the map on eviction (memory-leak fix)"
    );

    // The eviction must have flushed the in-memory edit to `yjs_state`, so a
    // reconnecting client that re-opens the room sees the SAME CRDT (identity
    // preserved) rather than a stale re-seed. `persisted_state_has_marker`
    // re-creates the room, which loads the persisted binary verbatim.
    assert!(
        persisted_state_has_marker(store, qid).await,
        "eviction must flush the room's pending edit to yjs_state before dropping it"
    );
}
