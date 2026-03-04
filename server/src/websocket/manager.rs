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

/// A binary message that flows through the binary broadcast channel (Yjs frames).
#[derive(Debug, Clone)]
pub struct BinaryWsMessage {
    pub channel: String,
    pub data: Vec<u8>,
    /// Connection to exclude from receiving (the sender).
    pub exclude_conn: Option<Uuid>,
}

/// Per-connection state.
#[derive(Debug)]
#[allow(dead_code)]
pub struct Connection {
    pub user_id: Uuid,
    pub subscriptions: Vec<String>,
}

use crate::websocket::redis_bridge::RedisBridge;

/// Manages all WebSocket connections and channel subscriptions.
#[derive(Clone)]
pub struct WebSocketState {
    /// broadcast sender — every message goes to all receivers who then filter by channel.
    tx: broadcast::Sender<WsMessage>,
    /// binary broadcast sender for Yjs frames.
    binary_tx: broadcast::Sender<BinaryWsMessage>,
    /// connected clients keyed by a connection UUID.
    connections: Arc<RwLock<HashMap<Uuid, Connection>>>,
    /// Optional Redis bridge for cross-node relay.
    redis_bridge: Option<Arc<RedisBridge>>,
}

impl WebSocketState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel::<WsMessage>(1024);
        let (binary_tx, _) = broadcast::channel::<BinaryWsMessage>(1024);
        Self {
            tx,
            binary_tx,
            connections: Arc::new(RwLock::new(HashMap::new())),
            redis_bridge: None,
        }
    }

    /// Set the Redis bridge for cross-node Yjs relay.
    pub fn set_redis_bridge(&mut self, bridge: RedisBridge) {
        self.redis_bridge = Some(Arc::new(bridge));
    }

    /// Register a new connection; returns broadcast receivers for both JSON and binary channels.
    pub async fn add_connection(
        &self,
        conn_id: Uuid,
        user_id: Uuid,
    ) -> (
        broadcast::Receiver<WsMessage>,
        broadcast::Receiver<BinaryWsMessage>,
    ) {
        let conn = Connection {
            user_id,
            subscriptions: Vec::new(),
        };
        self.connections.write().await.insert(conn_id, conn);
        (self.tx.subscribe(), self.binary_tx.subscribe())
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

    /// Broadcast a JSON message to a specific channel.
    pub fn broadcast(&self, msg: WsMessage) {
        // Ignore send errors (no receivers).
        let _ = self.tx.send(msg);
    }

    /// Broadcast a binary message to a specific channel, optionally excluding one connection.
    /// Also publishes to Redis for cross-node relay if a bridge is configured.
    pub fn broadcast_binary(
        &self,
        channel: &str,
        data: Vec<u8>,
        exclude_conn: Option<Uuid>,
    ) {
        // Publish to Redis for cross-node relay.
        if let Some(ref bridge) = self.redis_bridge {
            bridge.publish(channel, data.clone());
        }

        let _ = self.binary_tx.send(BinaryWsMessage {
            channel: channel.to_string(),
            data,
            exclude_conn,
        });
    }

    /// Check whether a connection is subscribed to a channel.
    pub async fn is_subscribed(&self, conn_id: &Uuid, channel: &str) -> bool {
        self.connections
            .read()
            .await
            .get(conn_id)
            .map_or(false, |c| c.subscriptions.iter().any(|s| s == channel))
    }

    /// Return the user IDs subscribed to a given channel.
    #[allow(dead_code)]
    pub async fn get_channel_users(&self, channel: &str) -> Vec<Uuid> {
        let conns = self.connections.read().await;
        let mut user_ids = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for conn in conns.values() {
            if conn.subscriptions.iter().any(|c| c == channel) && seen.insert(conn.user_id) {
                user_ids.push(conn.user_id);
            }
        }
        user_ids
    }

    /// Return all channels a specific connection is subscribed to.
    pub async fn get_connection_channels(&self, conn_id: &Uuid) -> Vec<String> {
        self.connections
            .read()
            .await
            .get(conn_id)
            .map(|c| c.subscriptions.clone())
            .unwrap_or_default()
    }

    /// Return the number of active connections.
    #[allow(dead_code)]
    pub async fn connection_count(&self) -> usize {
        self.connections.read().await.len()
    }
}
