use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::AppState;
use crate::websocket::manager::WsMessage;

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
    let mut rx = state.websocket_state.add_connection(conn_id, user_id).await;

    let (mut sender, mut receiver) = socket.split();

    // Spawn a task that forwards broadcast messages to this client.
    let ws_state = state.websocket_state.clone();
    let forward_conn_id = conn_id;
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            // Only forward if the connection is subscribed to this channel.
            if ws_state
                .is_subscribed(&forward_conn_id, &msg.channel)
                .await
            {
                let text = serde_json::to_string(&msg).unwrap_or_default();
                if sender.send(Message::Text(text.into())).await.is_err() {
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
                            ws_state.subscribe(&conn_id, channel).await;
                        }
                        ClientCommand::Unsubscribe { channel } => {
                            ws_state.unsubscribe(&conn_id, &channel).await;
                        }
                        ClientCommand::Publish {
                            channel,
                            event,
                            payload,
                        } => {
                            ws_state.broadcast(WsMessage {
                                channel,
                                event,
                                payload,
                            });
                        }
                        ClientCommand::Ping => {
                            // Handled at the protocol level; no-op here.
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup
    send_task.abort();
    state.websocket_state.remove_connection(&conn_id).await;
    tracing::debug!("WebSocket connection {conn_id} closed for user {user_id}");
}

#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientCommand {
    Subscribe { channel: String },
    Unsubscribe { channel: String },
    Publish {
        channel: String,
        event: String,
        payload: serde_json::Value,
    },
    Ping,
}
