use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    http::HeaderMap,
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::auth::session;
use crate::authz::{authorize, Scope};
use crate::error::ApiError;
use crate::rbac::models::Permission;
use crate::state::AppState;
use crate::websocket::manager::{BinaryWsMessage, WebSocketState, WsMessage};
use crate::websocket::yjs_relay;

/// Control subprotocol marker echoed back to complete the handshake.
const WS_AUTH_PROTOCOL: &str = "qde-auth";

/// GET /api/ws — upgrade to WebSocket.
///
/// Authentication rides the `qd_session` httpOnly cookie. The client still
/// requests the `qde-auth` subprotocol as a stable application marker, but no
/// token is carried in the URL or subprotocol list.
pub async fn ws_upgrade(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let token = session::extract_session_cookie(&headers)
        .ok_or_else(|| ApiError::Unauthorized("Missing WebSocket session".into()))?;
    let user =
        session::resolve_session_token(&state.pool, &token, state.config.auth_session_idle_expiry)
            .await?
            .ok_or_else(|| ApiError::Unauthorized("Invalid WebSocket session".into()))?;

    Ok(ws
        .protocols([WS_AUTH_PROTOCOL])
        .on_upgrade(move |socket| handle_socket(socket, state, user.user_id)))
}

async fn handle_socket(socket: WebSocket, state: AppState, user_id: Uuid) {
    let conn_id = Uuid::new_v4();
    let (json_rx, binary_rx) = state.websocket_state.add_connection(conn_id, user_id).await;

    let (mut sender, mut receiver) = socket.split();

    // We need a shared sender for both the JSON and binary forward tasks.
    // Use an mpsc channel as the single writer to the WebSocket.
    let (ws_tx, mut ws_rx) = tokio::sync::mpsc::channel::<Message>(256);

    // Task: write messages from the internal mpsc to the actual WebSocket.
    let write_task = tokio::spawn(async move {
        while let Some(msg) = ws_rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Tasks: forward broadcast messages to this client. Both survive a
    // `broadcast::error::RecvError::Lagged` (a briefly-slow consumer that missed
    // messages is recoverable) and exit only on `Closed` — see [`forward_json`]
    // / [`forward_binary`].
    let json_forward_task = tokio::spawn(forward_json(
        json_rx,
        state.websocket_state.clone(),
        conn_id,
        ws_tx.clone(),
    ));
    let binary_forward_task = tokio::spawn(forward_binary(
        binary_rx,
        state.websocket_state.clone(),
        conn_id,
        ws_tx.clone(),
    ));

    // Channels this connection subscribed to at the ReadWrite tier. A binary
    // Yjs frame carries no channel of its own — the relay infers it from the
    // subscription set — so the write capability decided at Subscribe time is
    // cached here and consulted on every inbound frame. Re-authorizing per frame
    // would mean a DB round-trip per keystroke; this is strictly stronger than
    // the previous code, which never re-checked a binary frame at all.
    let mut writable_channels: HashSet<String> = HashSet::new();

    // Read messages from the client.
    let ws_state = state.websocket_state.clone();
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(cmd) = serde_json::from_str::<ClientCommand>(&text) {
                    match cmd {
                        ClientCommand::Subscribe { channel } => {
                            match authorize_channel(&state, user_id, &channel).await {
                                ChannelAccess::Denied => {
                                    tracing::warn!(
                                        "User {user_id} unauthorized for channel {channel}"
                                    );
                                }
                                access => {
                                    if access.can_write() {
                                        writable_channels.insert(channel.clone());
                                    } else {
                                        // A demotion (editor → viewer) between two
                                        // subscribes must drop the write capability.
                                        writable_channels.remove(&channel);
                                    }
                                    ws_state.subscribe(&conn_id, channel).await;
                                }
                            }
                        }
                        ClientCommand::Unsubscribe { channel } => {
                            writable_channels.remove(&channel);
                            ws_state.unsubscribe(&conn_id, &channel).await;
                        }
                        ClientCommand::Publish {
                            channel,
                            event,
                            payload,
                        } => {
                            // Ephemeral JSON broadcast — nothing is applied to the
                            // document or persisted, so it stays at the read tier
                            // (unchanged admission semantics, now via the real gate).
                            if authorize_channel(&state, user_id, &channel)
                                .await
                                .is_allowed()
                            {
                                ws_state.broadcast(WsMessage {
                                    channel,
                                    event,
                                    payload,
                                });
                            }
                        }
                        ClientCommand::Presence { channel } => {
                            if authorize_channel(&state, user_id, &channel)
                                .await
                                .is_allowed()
                            {
                                ws_state.broadcast(WsMessage {
                                    channel,
                                    event: "presence".to_string(),
                                    payload: serde_json::json!({
                                        "user_id": user_id,
                                        "action": "join"
                                    }),
                                });
                            }
                        }
                        ClientCommand::Ping => {
                            // Handled at the protocol level; no-op here.
                        }
                    }
                }
            }
            Message::Binary(data) => {
                // Route binary frames through the Yjs relay.
                // Determine which designer channel this connection is subscribed to.
                let channels = ws_state.get_connection_channels(&conn_id).await;
                if let Some(designer_channel) = channels.iter().find(|c| c.starts_with("designer:"))
                {
                    if let Some(qid) = parse_channel_resource(designer_channel) {
                        // A read-only subscriber (project viewer) may sync *from*
                        // the server (step1) but may not mutate it — the relay
                        // drops its step2/update frames.
                        let can_write = writable_channels.contains(designer_channel);
                        let responses = yjs_relay::handle_binary_message(
                            &data,
                            qid,
                            &state.yjs_store,
                            &state.websocket_state,
                            &conn_id,
                            can_write,
                        )
                        .await;

                        // Send reply frames back to this client.
                        for response in responses {
                            if ws_tx.send(Message::Binary(response.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Broadcast presence leave for all channels this connection was subscribed to.
    let channels = state
        .websocket_state
        .get_connection_channels(&conn_id)
        .await;
    for channel in &channels {
        state.websocket_state.broadcast(WsMessage {
            channel: channel.clone(),
            event: "presence".to_string(),
            payload: serde_json::json!({
                "user_id": user_id,
                "action": "leave"
            }),
        });
    }

    // Cleanup. Unregister the connection BEFORE the room-eviction check so
    // `channel_connection_count` no longer counts this departing connection.
    json_forward_task.abort();
    binary_forward_task.abort();
    write_task.abort();
    state.websocket_state.remove_connection(&conn_id).await;

    // Evict any Yjs room whose last subscriber just left. Without this, every
    // questionnaire ever opened pins a `yrs::Doc` for the process lifetime (the
    // disconnect path never touched `yjs_store`). `evict_room` flushes the
    // room's pending state before dropping it, so eviction cannot lose edits.
    for channel in &channels {
        if let Some(qid) = channel
            .strip_prefix("designer:")
            .and_then(|s| Uuid::parse_str(s).ok())
        {
            if state
                .websocket_state
                .channel_connection_count(channel)
                .await
                == 0
            {
                state.yjs_store.evict_room(qid).await;
            }
        }
    }

    tracing::debug!("WebSocket connection {conn_id} closed for user {user_id}");
}

/// Forward JSON broadcast messages to one client until the socket writer closes
/// or the broadcast channel closes.
///
/// A [`broadcast::error::RecvError::Lagged`] is **recoverable**: a briefly-slow
/// consumer missed `n` messages, but the channel is still live and later
/// messages will arrive. The old `while let Ok(..)` treated `Lagged` like
/// `Closed` and exited — permanently killing this connection's forward task, so
/// one momentarily-slow client silently stopped receiving ALL collaborators'
/// updates and presence on a socket that still looked connected. The only fatal
/// error is `Closed`.
async fn forward_json(
    mut rx: broadcast::Receiver<WsMessage>,
    ws_state: Arc<WebSocketState>,
    conn_id: Uuid,
    out: mpsc::Sender<Message>,
) {
    loop {
        match rx.recv().await {
            Ok(msg) => {
                if ws_state.is_subscribed(&conn_id, &msg.channel).await {
                    let text = serde_json::to_string(&msg).unwrap_or_default();
                    if out.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!(%conn_id, skipped = n, "json forward task lagged; continuing");
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

/// Forward binary (Yjs) broadcast messages to one client. Same `Lagged`-survives
/// / `Closed`-exits contract as [`forward_json`]; additionally skips a frame the
/// broadcaster tagged as originating from this same connection.
async fn forward_binary(
    mut rx: broadcast::Receiver<BinaryWsMessage>,
    ws_state: Arc<WebSocketState>,
    conn_id: Uuid,
    out: mpsc::Sender<Message>,
) {
    loop {
        match rx.recv().await {
            Ok(msg) => {
                // Skip if this is our own echoed message.
                if msg.exclude_conn == Some(conn_id) {
                    continue;
                }
                if ws_state.is_subscribed(&conn_id, &msg.channel).await
                    && out.send(Message::Binary(msg.data.into())).await.is_err()
                {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!(%conn_id, skipped = n, "binary forward task lagged; continuing");
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientCommand {
    Subscribe {
        channel: String,
    },
    Unsubscribe {
        channel: String,
    },
    Publish {
        channel: String,
        event: String,
        payload: serde_json::Value,
    },
    Presence {
        channel: String,
    },
    Ping,
}

/// What a user may do on a WebSocket channel.
///
/// The designer channel is a *write* surface: every subscriber's inbound
/// `MSG_SYNC_UPDATE` frame is applied to the server `yrs::Doc` and persisted to
/// `yjs_state` by [`yjs_relay`]. Authorization therefore has to distinguish
/// "may watch" from "may edit" — a single boolean cannot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChannelAccess {
    /// No access at all — the subscribe/publish/presence command is dropped.
    Denied,
    /// May subscribe and receive (live view + presence), but inbound Yjs
    /// *content* frames (sync step2 / update) are rejected by the relay.
    ReadOnly,
    /// May subscribe and mutate the shared document.
    ReadWrite,
}

impl ChannelAccess {
    /// Whether the channel may be joined at all (read tier or better).
    pub fn is_allowed(self) -> bool {
        !matches!(self, ChannelAccess::Denied)
    }

    /// Whether inbound document mutations from this connection are accepted.
    pub fn can_write(self) -> bool {
        matches!(self, ChannelAccess::ReadWrite)
    }
}

/// Authorize `user_id` on a channel through the **same gate the HTTP surface
/// uses** — [`crate::authz::authorize`] at [`Scope::Project`] (ADR 0030/0032).
///
/// Channel format: `designer:{questionnaire_id}`, `questionnaire:{…}` or
/// `analytics:{…}` (see [`parse_channel_resource`]).
///
/// Before this, the channel was gated by a hand-rolled `EXISTS` over
/// `project_members` with **no role filter**. That had two opposite defects:
///
///  * a project **viewer** (post-ADR-0033 possibly a *cross-org* viewer) was
///    admitted, and the relay applies+persists any subscriber's Yjs update — so
///    a read-only collaborator could rewrite questionnaire content, while the
///    HTTP gate for the same content requires editor+; and
///  * an org **owner/admin who is not a project member** was locked out, even
///    though the HTTP gate admits them.
///
/// Both collapse into one fix by asking the real gate:
///   * `QuestionnaireWrite` at project scope → `ProjectRole::Editor` ⇒ [`ReadWrite`](ChannelAccess::ReadWrite)
///   * else `QuestionnaireRead` → `ProjectRole::Viewer` ⇒ [`ReadOnly`](ChannelAccess::ReadOnly)
///   * else [`Denied`](ChannelAccess::Denied)
///
/// No new [`Permission`] variant: the two questionnaire permissions the HTTP
/// designer endpoints already use map onto the ADR-0032 project tiers.
///
/// Fails closed: any DB error, an unparseable channel, or a missing /
/// soft-deleted questionnaire yields `Denied`.
pub async fn authorize_channel(state: &AppState, user_id: Uuid, channel: &str) -> ChannelAccess {
    let Some(questionnaire_id) = parse_channel_resource(channel) else {
        return ChannelAccess::Denied;
    };

    // Resolve the parent project. `questionnaire_definitions` is RLS-exempt
    // (ADR 0012 — the public by-code fillout read), so a plain pool query is
    // enough and keeps the decision RLS-independent (ADR 0032).
    let project_id = match sqlx::query_scalar::<_, Uuid>(
        "SELECT project_id FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
    )
    .bind(questionnaire_id)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(Some(id)) => id,
        Ok(None) => return ChannelAccess::Denied,
        Err(e) => {
            tracing::warn!("channel authz: project lookup failed for {questionnaire_id}: {e}");
            return ChannelAccess::Denied;
        }
    };

    // `authorize`'s coarse gate is RLS-immune (SECURITY DEFINER), but its
    // custom-role tightening layer reads the RLS-bound `organization_members`
    // directly. Run it on a GUC-bearing transaction, exactly as the HTTP
    // handlers do via `middleware::rls_context`, or a custom-role member's row
    // would be invisible and the tightening would silently no-op.
    let mut tx = match state.pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::warn!("channel authz: begin failed: {e}");
            return ChannelAccess::Denied;
        }
    };
    if let Err(e) = sqlx::query("SELECT set_config('app.user_id', $1, true)")
        .bind(user_id.to_string())
        .execute(&mut *tx)
        .await
    {
        tracing::warn!("channel authz: set_config failed: {e}");
        return ChannelAccess::Denied;
    }

    let can_write = authorize(
        &mut tx,
        &state.rbac,
        user_id,
        Scope::Project(project_id),
        Permission::QuestionnaireWrite,
    )
    .await
    .is_ok();

    let access = if can_write {
        ChannelAccess::ReadWrite
    } else if authorize(
        &mut tx,
        &state.rbac,
        user_id,
        Scope::Project(project_id),
        Permission::QuestionnaireRead,
    )
    .await
    .is_ok()
    {
        ChannelAccess::ReadOnly
    } else {
        ChannelAccess::Denied
    };

    // Read-only probe — release the transaction without persisting anything.
    let _ = tx.rollback().await;
    access
}

/// Extract the resource UUID from a channel string like "designer:{uuid}" or "questionnaire:{uuid}".
fn parse_channel_resource(channel: &str) -> Option<Uuid> {
    let parts: Vec<&str> = channel.splitn(2, ':').collect();
    if parts.len() != 2 {
        return None;
    }
    match parts[0] {
        "designer" | "questionnaire" | "analytics" => parts[1].parse::<Uuid>().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};

    /// #3 — a `broadcast::error::RecvError::Lagged` must NOT kill the forward
    /// task. We pre-overflow a capacity-2 broadcast so the receiver's first
    /// `recv()` yields `Lagged`, then assert the task keeps delivering the still
    /// buffered messages rather than exiting.
    ///
    /// Regression guard: with the old `while let Ok(msg) = rx.recv().await` the
    /// task exits on the first `Lagged`, dropping `out`, so `out_rx.recv()`
    /// returns `None` and this fails at:
    ///   "forward task must NOT exit on Lagged — it should keep forwarding".
    #[tokio::test]
    async fn json_forward_survives_lagged() {
        let (tx, rx) = broadcast::channel::<WsMessage>(2);
        // Overflow: the receiver (subscribed at channel creation) misses the
        // earliest 3 of these 5 sends, so its next recv() is `Lagged(3)`.
        for i in 0..5 {
            let _ = tx.send(WsMessage {
                channel: "c".to_string(),
                event: "e".to_string(),
                payload: serde_json::json!(i),
            });
        }

        let ws_state = Arc::new(WebSocketState::new());
        let conn_id = Uuid::new_v4();
        ws_state.add_connection(conn_id, Uuid::new_v4()).await;
        ws_state.subscribe(&conn_id, "c".to_string()).await;

        let (out_tx, mut out_rx) = mpsc::channel::<Message>(16);
        let task = tokio::spawn(forward_json(rx, ws_state, conn_id, out_tx));

        let received = timeout(Duration::from_secs(2), out_rx.recv())
            .await
            .expect("forward task must still be delivering after Lagged (it hung)")
            .expect("forward task must NOT exit on Lagged — it should keep forwarding");
        assert!(
            matches!(received, Message::Text(_)),
            "recovered delivery should be a forwarded text frame"
        );
        task.abort();
    }

    /// The binary (Yjs) forward task carries the same contract — this is the one
    /// that actually matters for collaboration, since one briefly-slow tab would
    /// otherwise stop receiving every collaborator's document updates.
    #[tokio::test]
    async fn binary_forward_survives_lagged() {
        let (tx, rx) = broadcast::channel::<BinaryWsMessage>(2);
        for i in 0..5u8 {
            let _ = tx.send(BinaryWsMessage {
                channel: "designer:c".to_string(),
                data: vec![i],
                exclude_conn: None,
            });
        }

        let ws_state = Arc::new(WebSocketState::new());
        let conn_id = Uuid::new_v4();
        ws_state.add_connection(conn_id, Uuid::new_v4()).await;
        ws_state.subscribe(&conn_id, "designer:c".to_string()).await;

        let (out_tx, mut out_rx) = mpsc::channel::<Message>(16);
        let task = tokio::spawn(forward_binary(rx, ws_state, conn_id, out_tx));

        let received = timeout(Duration::from_secs(2), out_rx.recv())
            .await
            .expect("binary forward task must still be delivering after Lagged (it hung)")
            .expect("binary forward task must NOT exit on Lagged — it should keep forwarding");
        assert!(
            matches!(received, Message::Binary(_)),
            "recovered delivery should be a forwarded binary frame"
        );
        task.abort();
    }
}
