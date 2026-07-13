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
/// `can_write` is the connection's channel tier as decided by
/// [`authorize_channel`](crate::websocket::handler::authorize_channel): `true`
/// only for an editor+ on the parent project. A **read-only** subscriber (a
/// project viewer) may still run sync step1 — a pure read of the server doc —
/// and may relay awareness (presence/cursors), but its content-bearing frames
/// (`MSG_SYNC_STEP2` / `MSG_SYNC_UPDATE`) are dropped here rather than applied
/// to the server `yrs::Doc` and persisted to `yjs_state`. This is the
/// enforcement point for the WS write boundary; the gate is
/// `authorize_channel`.
///
/// Returns binary frames to send back to the originating client.
/// Also broadcasts to other subscribers via the WebSocketState.
pub async fn handle_binary_message(
    data: &[u8],
    questionnaire_id: Uuid,
    yjs_store: &YjsStore,
    ws_state: &WebSocketState,
    conn_id: &Uuid,
    can_write: bool,
) -> Vec<Vec<u8>> {
    if data.len() < 2 {
        return vec![];
    }

    let msg_type = data[0];
    let payload = &data[1..];

    match msg_type {
        MSG_SYNC => {
            handle_sync(
                payload,
                questionnaire_id,
                yjs_store,
                ws_state,
                conn_id,
                data,
                can_write,
            )
            .await
        }
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

#[allow(clippy::too_many_arguments)]
async fn handle_sync(
    payload: &[u8],
    questionnaire_id: Uuid,
    yjs_store: &YjsStore,
    ws_state: &WebSocketState,
    conn_id: &Uuid,
    raw_frame: &[u8],
    can_write: bool,
) -> Vec<Vec<u8>> {
    if payload.is_empty() {
        return vec![];
    }

    let sync_type = payload[0];
    let sync_payload = &payload[1..];

    // Write boundary: a content-bearing sync frame from a read-only subscriber
    // is dropped before the room is even opened — not applied, not relayed, not
    // persisted. Step1 (state-vector exchange) is a read and stays open to all
    // admitted subscribers.
    if !can_write && matches!(sync_type, MSG_SYNC_STEP2 | MSG_SYNC_UPDATE) {
        tracing::warn!(
            %questionnaire_id,
            "rejected Yjs content frame from a read-only subscriber"
        );
        return vec![];
    }

    let room_lock = yjs_store.get_or_create_room(questionnaire_id).await;

    let mut responses: Vec<Vec<u8>> = Vec::new();
    // Binary state to flush to `yjs_state` after releasing the room lock (so the
    // DB write never blocks other operations on this room).
    let mut persist_snapshot: Option<Vec<u8>> = None;

    {
        let mut room = room_lock.lock().await;

        match sync_type {
            MSG_SYNC_STEP1 => {
                // Client sends its state vector. We reply with our diff (step2).
                match decode_var_uint8_array(sync_payload) {
                    Ok(state_vector) => match room.encode_diff(state_vector) {
                        Ok(diff) => {
                            // Build: [MSG_SYNC, MSG_SYNC_STEP2, ...diff]
                            let mut frame = Vec::with_capacity(
                                2 + encoded_var_uint_len(diff.len()) + diff.len(),
                            );
                            frame.push(MSG_SYNC);
                            frame.push(MSG_SYNC_STEP2);
                            encode_var_uint(diff.len(), &mut frame);
                            frame.extend_from_slice(&diff);
                            responses.push(frame);

                            // Also send our state vector back so the client can send us its diff.
                            let sv = room.encode_state_vector();
                            let mut sv_frame =
                                Vec::with_capacity(2 + encoded_var_uint_len(sv.len()) + sv.len());
                            sv_frame.push(MSG_SYNC);
                            sv_frame.push(MSG_SYNC_STEP1);
                            encode_var_uint(sv.len(), &mut sv_frame);
                            sv_frame.extend_from_slice(&sv);
                            responses.push(sv_frame);
                        }
                        Err(e) => {
                            tracing::warn!("Yjs sync step1 error for {questionnaire_id}: {e}");
                        }
                    },
                    Err(error) => {
                        tracing::warn!(
                            "Yjs sync step1 decode error for {questionnaire_id}: {error}"
                        );
                    }
                }
            }
            MSG_SYNC_STEP2 | MSG_SYNC_UPDATE => {
                // Client sends an update or step2 diff. Apply to our doc.
                match decode_var_uint8_array(sync_payload) {
                    Ok(update) => {
                        if let Err(e) = room.apply_update(update) {
                            tracing::warn!("Yjs update error for {questionnaire_id}: {e}");
                        } else {
                            // Debounced persistence of the authoritative binary state.
                            persist_snapshot = YjsStore::take_persist_snapshot(&mut room);
                        }

                        // Relay to other subscribers.
                        ws_state.broadcast_binary(
                            &format!("designer:{questionnaire_id}"),
                            raw_frame.to_vec(),
                            Some(*conn_id),
                        );
                    }
                    Err(error) => {
                        tracing::warn!("Yjs update decode error for {questionnaire_id}: {error}");
                    }
                }
            }
            _ => {
                tracing::debug!("Unknown Yjs sync sub-type: {sync_type}");
            }
        }
    }

    if let Some(bytes) = persist_snapshot {
        yjs_store.persist(questionnaire_id, &bytes).await;
    }

    responses
}

fn decode_var_uint8_array(data: &[u8]) -> Result<&[u8], &'static str> {
    let (len, offset) = decode_var_uint(data)?;
    let len = len as usize;
    let end = offset
        .checked_add(len)
        .ok_or("overflow while decoding Yjs payload length")?;

    if data.len() < end {
        return Err("Yjs payload shorter than declared length");
    }

    Ok(&data[offset..end])
}

fn decode_var_uint(data: &[u8]) -> Result<(u64, usize), &'static str> {
    let mut value = 0u64;
    let mut shift = 0u32;

    for (index, byte) in data.iter().copied().enumerate() {
        value |= u64::from(byte & 0x7f) << shift;

        if byte & 0x80 == 0 {
            return Ok((value, index + 1));
        }

        shift += 7;
        if shift >= 64 {
            return Err("Yjs varuint is too large");
        }
    }

    Err("Unexpected end of Yjs varuint")
}

fn encode_var_uint(value: usize, out: &mut Vec<u8>) {
    let mut remaining = value;
    loop {
        let mut byte = (remaining & 0x7f) as u8;
        remaining >>= 7;
        if remaining != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if remaining == 0 {
            break;
        }
    }
}

fn encoded_var_uint_len(mut value: usize) -> usize {
    let mut len = 1;
    while value >= 0x80 {
        value >>= 7;
        len += 1;
    }
    len
}

#[cfg(test)]
mod tests {
    use super::{decode_var_uint8_array, encode_var_uint};

    #[test]
    fn decodes_length_prefixed_yjs_payload() {
        let payload = [3_u8, 10, 20, 30];
        let decoded = decode_var_uint8_array(&payload).expect("payload should decode");
        assert_eq!(decoded, &[10, 20, 30]);
    }

    #[test]
    fn rejects_truncated_yjs_payload() {
        let payload = [3_u8, 10, 20];
        let error = decode_var_uint8_array(&payload).expect_err("payload should be truncated");
        assert_eq!(error, "Yjs payload shorter than declared length");
    }

    #[test]
    fn encodes_and_decodes_length_prefixed_yjs_payload() {
        let mut payload = Vec::new();
        encode_var_uint(130, &mut payload);
        payload.extend(std::iter::repeat_n(7_u8, 130));

        let decoded = decode_var_uint8_array(&payload).expect("payload should roundtrip");
        assert_eq!(decoded.len(), 130);
        assert!(decoded.iter().all(|value| *value == 7));
    }
}
