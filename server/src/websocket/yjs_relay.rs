//! Yjs binary relay — forwards binary Yjs sync/awareness messages between
//! WebSocket clients subscribed to the same designer channel.
//!
//! Protocol: Binary frames are prefixed with a varuint message type:
//!   0 = Sync message (step1, step2, update)
//!   1 = Awareness message (relayed as-is)
//!
//! Sync messages are processed against the server-side `yrs::Doc` so that
//! new clients can obtain the full state from the server. Awareness messages
//! are relayed opaquely (the server doesn't maintain awareness state because
//! `yrs::sync::Awareness` is `!Send`).

use crate::websocket::manager::WebSocketState;
use crate::websocket::yjs_store::YjsStore;
use uuid::Uuid;

/// Message type constants matching the JS side.
const MSG_SYNC: u8 = 0;
const MSG_AWARENESS: u8 = 1;

/// Yjs sync sub-message types.
const MSG_SYNC_STEP1: u8 = 0;
const MSG_SYNC_STEP2: u8 = 1;
const MSG_SYNC_UPDATE: u8 = 2;

/// Handle an incoming binary frame from a client subscribed to a
/// `designer:{questionnaire_id}` channel.
///
/// Returns binary frames to send back to the originating client.
/// Also broadcasts to other subscribers via the WebSocketState.
pub async fn handle_binary_message(
    data: &[u8],
    questionnaire_id: Uuid,
    yjs_store: &YjsStore,
    ws_state: &WebSocketState,
    conn_id: &Uuid,
) -> Vec<Vec<u8>> {
    if data.len() < 2 {
        return vec![];
    }

    let msg_type = data[0];
    let payload = &data[1..];

    match msg_type {
        MSG_SYNC => handle_sync(payload, questionnaire_id, yjs_store, ws_state, conn_id, data).await,
        MSG_AWARENESS => {
            // Relay awareness frames to other subscribers without processing.
            ws_state.broadcast_binary(
                &format!("designer:{questionnaire_id}"),
                data.to_vec(),
                Some(*conn_id),
            );
            vec![]
        }
        _ => {
            tracing::debug!("Unknown Yjs message type: {msg_type}");
            vec![]
        }
    }
}

async fn handle_sync(
    payload: &[u8],
    questionnaire_id: Uuid,
    yjs_store: &YjsStore,
    ws_state: &WebSocketState,
    conn_id: &Uuid,
    raw_frame: &[u8],
) -> Vec<Vec<u8>> {
    if payload.is_empty() {
        return vec![];
    }

    let sync_type = payload[0];
    let sync_payload = &payload[1..];
    let room_lock = yjs_store.get_or_create_room(questionnaire_id).await;
    let room = room_lock.lock().await;

    let mut responses: Vec<Vec<u8>> = Vec::new();

    match sync_type {
        MSG_SYNC_STEP1 => {
            // Client sends its state vector. We reply with our diff (step2).
            match room.encode_diff(sync_payload) {
                Ok(diff) => {
                    // Build: [MSG_SYNC, MSG_SYNC_STEP2, ...diff]
                    let mut frame = Vec::with_capacity(2 + diff.len());
                    frame.push(MSG_SYNC);
                    frame.push(MSG_SYNC_STEP2);
                    frame.extend_from_slice(&diff);
                    responses.push(frame);

                    // Also send our state vector back so the client can send us its diff.
                    let sv = room.encode_state_vector();
                    let mut sv_frame = Vec::with_capacity(2 + sv.len());
                    sv_frame.push(MSG_SYNC);
                    sv_frame.push(MSG_SYNC_STEP1);
                    sv_frame.extend_from_slice(&sv);
                    responses.push(sv_frame);
                }
                Err(e) => {
                    tracing::warn!("Yjs sync step1 error for {questionnaire_id}: {e}");
                }
            }
        }
        MSG_SYNC_STEP2 | MSG_SYNC_UPDATE => {
            // Client sends an update or step2 diff. Apply to our doc.
            if let Err(e) = room.apply_update(sync_payload) {
                tracing::warn!("Yjs update error for {questionnaire_id}: {e}");
            }

            // Relay to other subscribers.
            ws_state.broadcast_binary(
                &format!("designer:{questionnaire_id}"),
                raw_frame.to_vec(),
                Some(*conn_id),
            );
        }
        _ => {
            tracing::debug!("Unknown Yjs sync sub-type: {sync_type}");
        }
    }

    responses
}
