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
        MSG_SYNC => {
            handle_sync(
                payload,
                questionnaire_id,
                yjs_store,
                ws_state,
                conn_id,
                data,
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
            let state_vector = match decode_var_uint8_array(sync_payload) {
                Ok(value) => value,
                Err(error) => {
                    tracing::warn!("Yjs sync step1 decode error for {questionnaire_id}: {error}");
                    return responses;
                }
            };

            match room.encode_diff(state_vector) {
                Ok(diff) => {
                    // Build: [MSG_SYNC, MSG_SYNC_STEP2, ...diff]
                    let mut frame =
                        Vec::with_capacity(2 + encoded_var_uint_len(diff.len()) + diff.len());
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
            }
        }
        MSG_SYNC_STEP2 | MSG_SYNC_UPDATE => {
            // Client sends an update or step2 diff. Apply to our doc.
            let update = match decode_var_uint8_array(sync_payload) {
                Ok(value) => value,
                Err(error) => {
                    tracing::warn!("Yjs update decode error for {questionnaire_id}: {error}");
                    return responses;
                }
            };

            if let Err(e) = room.apply_update(update) {
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
