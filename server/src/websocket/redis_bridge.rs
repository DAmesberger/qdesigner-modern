//! Redis pub/sub bridge for cross-node Yjs relay.
//!
//! When multiple backend nodes are running behind a load balancer, Yjs binary
//! updates must be forwarded to all nodes. This bridge publishes local updates
//! to a Redis channel and subscribes for remote updates, deduplicating by
//! `node_id` so a node doesn't re-process its own messages.
//!
//! Channel naming: `yjs:{questionnaire_id}` for Yjs binary updates.

use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::websocket::manager::WebSocketState;

/// A binary message relayed through Redis pub/sub.
#[derive(Debug, Clone)]
struct RelayMessage {
    /// The node that originated this message.
    node_id: Uuid,
    /// The designer channel (e.g. "designer:<questionnaire_id>").
    channel: String,
    /// The raw Yjs binary frame.
    data: Vec<u8>,
}

impl RelayMessage {
    /// Encode to a wire format: [16 bytes node_id] [2 bytes channel_len] [channel] [data]
    fn encode(&self) -> Vec<u8> {
        let channel_bytes = self.channel.as_bytes();
        let channel_len = channel_bytes.len() as u16;
        let mut buf = Vec::with_capacity(16 + 2 + channel_bytes.len() + self.data.len());
        buf.extend_from_slice(self.node_id.as_bytes());
        buf.extend_from_slice(&channel_len.to_le_bytes());
        buf.extend_from_slice(channel_bytes);
        buf.extend_from_slice(&self.data);
        buf
    }

    /// Decode from wire format.
    fn decode(buf: &[u8]) -> Option<Self> {
        if buf.len() < 18 {
            return None;
        }

        let node_id = Uuid::from_bytes(buf[..16].try_into().ok()?);
        let channel_len = u16::from_le_bytes([buf[16], buf[17]]) as usize;

        if buf.len() < 18 + channel_len {
            return None;
        }

        let channel = std::str::from_utf8(&buf[18..18 + channel_len]).ok()?.to_string();
        let data = buf[18 + channel_len..].to_vec();

        Some(Self {
            node_id,
            channel,
            data,
        })
    }
}

/// Bridges Yjs binary messages between the local WebSocketState and Redis pub/sub.
pub struct RedisBridge {
    node_id: Uuid,
    redis_client: Arc<redis::Client>,
    /// Sender for publishing to Redis from the local node.
    publish_tx: broadcast::Sender<RelayMessage>,
}

impl RedisBridge {
    const REDIS_CHANNEL: &'static str = "yjs:relay";

    /// Create a new RedisBridge. Call `start()` to begin pub/sub.
    pub fn new(redis_client: Arc<redis::Client>) -> Self {
        let (publish_tx, _) = broadcast::channel::<RelayMessage>(512);
        Self {
            node_id: Uuid::new_v4(),
            redis_client,
            publish_tx,
        }
    }

    /// Publish a Yjs binary update to Redis for cross-node relay.
    pub fn publish(&self, channel: &str, data: Vec<u8>) {
        let msg = RelayMessage {
            node_id: self.node_id,
            channel: channel.to_string(),
            data,
        };
        // Ignore error if no receiver yet.
        let _ = self.publish_tx.send(msg);
    }

    /// Start the Redis pub/sub tasks.
    ///
    /// - Publisher task: reads from `publish_tx` and publishes to Redis.
    /// - Subscriber task: subscribes to Redis and forwards remote messages
    ///   to the local WebSocketState.
    pub fn start(&self, ws_state: Arc<WebSocketState>) {
        self.start_publisher();
        self.start_subscriber(ws_state);
    }

    fn start_publisher(&self) {
        let client = self.redis_client.clone();
        let mut rx = self.publish_tx.subscribe();

        tokio::spawn(async move {
            let mut conn = match client.get_multiplexed_tokio_connection().await {
                Ok(conn) => conn,
                Err(e) => {
                    tracing::error!("Redis publisher connection failed: {e}");
                    return;
                }
            };

            while let Ok(msg) = rx.recv().await {
                let encoded = msg.encode();
                let result: Result<(), redis::RedisError> = redis::cmd("PUBLISH")
                    .arg(Self::REDIS_CHANNEL)
                    .arg(encoded)
                    .query_async(&mut conn)
                    .await;

                if let Err(e) = result {
                    tracing::warn!("Redis publish error: {e}");
                }
            }
        });
    }

    fn start_subscriber(&self, ws_state: Arc<WebSocketState>) {
        let client = self.redis_client.clone();
        let node_id = self.node_id;

        tokio::spawn(async move {
            let mut pubsub_conn = match client.get_async_pubsub().await {
                Ok(conn) => conn,
                Err(e) => {
                    tracing::error!("Redis subscriber connection failed: {e}");
                    return;
                }
            };

            if let Err(e) = pubsub_conn.subscribe(Self::REDIS_CHANNEL).await {
                tracing::error!("Redis subscribe error: {e}");
                return;
            }

            tracing::info!("Redis Yjs bridge started (node {node_id})");

            let mut stream = pubsub_conn.on_message();

            while let Some(msg) = futures_util::StreamExt::next(&mut stream).await {
                let payload: Vec<u8> = match msg.get_payload() {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                let relay_msg = match RelayMessage::decode(&payload) {
                    Some(m) => m,
                    None => continue,
                };

                // Deduplicate: skip messages from this node.
                if relay_msg.node_id == node_id {
                    continue;
                }

                // Forward to local subscribers via WebSocketState.
                ws_state.broadcast_binary(&relay_msg.channel, relay_msg.data, None);
            }
        });
    }
}
