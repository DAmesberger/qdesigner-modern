use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;
use crate::websocket::manager::WsMessage;
use crate::websocket::yjs_relay;

#[derive(Deserialize)]
pub struct WsQuery {
    /// JWT access token passed as a query parameter for the upgrade request.
    pub token: String,
}

/// GET /api/ws?token=<jwt> — upgrade to WebSocket.
pub async fn ws_upgrade(
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    // Validate the JWT before upgrading.
    let claims = state.jwt_manager.verify_access_token(&query.token)?;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, state, claims.sub)))
}

async fn handle_socket(socket: WebSocket, state: AppState, user_id: Uuid) {
    let conn_id = Uuid::new_v4();
    let (mut json_rx, mut binary_rx) = state
        .websocket_state
        .add_connection(conn_id, user_id)
        .await;

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

    // Task: forward JSON broadcast messages to this client.
    let ws_state_json = state.websocket_state.clone();
    let json_conn_id = conn_id;
    let json_tx = ws_tx.clone();
    let json_forward_task = tokio::spawn(async move {
        while let Ok(msg) = json_rx.recv().await {
            if ws_state_json
                .is_subscribed(&json_conn_id, &msg.channel)
                .await
            {
                let text = serde_json::to_string(&msg).unwrap_or_default();
                if json_tx.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Task: forward binary broadcast messages (Yjs) to this client.
    let ws_state_binary = state.websocket_state.clone();
    let binary_conn_id = conn_id;
    let binary_tx = ws_tx.clone();
    let binary_forward_task = tokio::spawn(async move {
        while let Ok(msg) = binary_rx.recv().await {
            // Skip if this is our own message.
            if msg.exclude_conn == Some(binary_conn_id) {
                continue;
            }
            if ws_state_binary
                .is_subscribed(&binary_conn_id, &msg.channel)
                .await
            {
                if binary_tx
                    .send(Message::Binary(msg.data.into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        }
    });

    // Read messages from the client.
    let ws_state = state.websocket_state.clone();
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(cmd) = serde_json::from_str::<ClientCommand>(&text) {
                    match cmd {
                        ClientCommand::Subscribe { channel } => {
                            if authorize_channel(&state.pool, user_id, &channel).await {
                                ws_state.subscribe(&conn_id, channel).await;
                            } else {
                                tracing::warn!(
                                    "User {user_id} unauthorized for channel {channel}"
                                );
                            }
                        }
                        ClientCommand::Unsubscribe { channel } => {
                            ws_state.unsubscribe(&conn_id, &channel).await;
                        }
                        ClientCommand::Publish {
                            channel,
                            event,
                            payload,
                        } => {
                            if authorize_channel(&state.pool, user_id, &channel).await {
                                ws_state.broadcast(WsMessage {
                                    channel,
                                    event,
                                    payload,
                                });
                            }
                        }
                        ClientCommand::Presence { channel } => {
                            if authorize_channel(&state.pool, user_id, &channel).await {
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
                if let Some(designer_channel) = channels
                    .iter()
                    .find(|c| c.starts_with("designer:"))
                {
                    if let Some(qid) = parse_channel_resource(designer_channel) {
                        let responses = yjs_relay::handle_binary_message(
                            &data,
                            qid,
                            &state.yjs_store,
                            &state.websocket_state,
                            &conn_id,
                        )
                        .await;

                        // Send reply frames back to this client.
                        for response in responses {
                            if ws_tx
                                .send(Message::Binary(response.into()))
                                .await
                                .is_err()
                            {
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

    // Broadcast presence leave for all channels this connection was subscribed to
    let channels = state
        .websocket_state
        .get_connection_channels(&conn_id)
        .await;
    for channel in channels {
        state.websocket_state.broadcast(WsMessage {
            channel,
            event: "presence".to_string(),
            payload: serde_json::json!({
                "user_id": user_id,
                "action": "leave"
            }),
        });
    }

    // Cleanup
    json_forward_task.abort();
    binary_forward_task.abort();
    write_task.abort();
    state.websocket_state.remove_connection(&conn_id).await;
    tracing::debug!("WebSocket connection {conn_id} closed for user {user_id}");
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

/// Verify the user has access to a channel by checking project membership.
/// Channel format: "designer:{questionnaire_id}" or "questionnaire:{questionnaire_id}"
async fn authorize_channel(pool: &PgPool, user_id: Uuid, channel: &str) -> bool {
    let questionnaire_id = match parse_channel_resource(channel) {
        Some(id) => id,
        None => return false,
    };

    sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM project_members pm
            JOIN projects p ON pm.project_id = p.id
            JOIN questionnaire_definitions qd ON qd.project_id = p.id
            WHERE pm.user_id = $1 AND qd.id = $2 AND qd.deleted_at IS NULL
        )
        "#,
    )
    .bind(user_id)
    .bind(questionnaire_id)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

/// Extract the resource UUID from a channel string like "designer:{uuid}" or "questionnaire:{uuid}".
fn parse_channel_resource(channel: &str) -> Option<Uuid> {
    let parts: Vec<&str> = channel.splitn(2, ':').collect();
    if parts.len() != 2 {
        return None;
    }
    match parts[0] {
        "designer" | "questionnaire" => parts[1].parse::<Uuid>().ok(),
        _ => None,
    }
}
