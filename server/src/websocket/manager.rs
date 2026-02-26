use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;

/// A message that flows through the broadcast channel.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WsMessage {
    pub channel: String,
    pub event: String,
    pub payload: serde_json::Value,
}

/// Per-connection state.
#[derive(Debug)]
#[allow(dead_code)]
pub struct Connection {
    pub user_id: Uuid,
    pub subscriptions: Vec<String>,
}

/// Manages all WebSocket connections and channel subscriptions.
#[derive(Clone)]
pub struct WebSocketState {
    /// broadcast sender — every message goes to all receivers who then filter by channel.
    tx: broadcast::Sender<WsMessage>,
    /// connected clients keyed by a connection UUID.
    connections: Arc<RwLock<HashMap<Uuid, Connection>>>,
}

impl WebSocketState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel::<WsMessage>(1024);
        Self {
            tx,
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new connection; returns a broadcast receiver.
    pub async fn add_connection(
        &self,
        conn_id: Uuid,
        user_id: Uuid,
    ) -> broadcast::Receiver<WsMessage> {
        let conn = Connection {
            user_id,
            subscriptions: Vec::new(),
        };
        self.connections.write().await.insert(conn_id, conn);
        self.tx.subscribe()
    }

    /// Remove a connection.
    pub async fn remove_connection(&self, conn_id: &Uuid) {
        self.connections.write().await.remove(conn_id);
    }

    /// Subscribe a connection to a channel.
    pub async fn subscribe(&self, conn_id: &Uuid, channel: String) {
        if let Some(conn) = self.connections.write().await.get_mut(conn_id) {
            if !conn.subscriptions.contains(&channel) {
                conn.subscriptions.push(channel);
            }
        }
    }

    /// Unsubscribe a connection from a channel.
    pub async fn unsubscribe(&self, conn_id: &Uuid, channel: &str) {
        if let Some(conn) = self.connections.write().await.get_mut(conn_id) {
            conn.subscriptions.retain(|c| c != channel);
        }
    }

    /// Broadcast a message to a specific channel.
    pub fn broadcast(&self, msg: WsMessage) {
        // Ignore send errors (no receivers).
        let _ = self.tx.send(msg);
    }

    /// Check whether a connection is subscribed to a channel.
    pub async fn is_subscribed(&self, conn_id: &Uuid, channel: &str) -> bool {
        self.connections
            .read()
            .await
            .get(conn_id)
            .map_or(false, |c| c.subscriptions.iter().any(|s| s == channel))
    }

    /// Return the number of active connections.
    #[allow(dead_code)]
    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }
}
