//! Server-side Yrs document store.
//!
//! Maintains one `yrs::Doc` per questionnaire that is currently being edited.
//! Periodically persists the authoritative document state to the
//! `questionnaire_definitions.content` JSONB column.
//!
//! Note: `yrs::Doc` is `Send + Sync`, but `yrs::sync::Awareness` is not (its
//! observers are `!Send`). We store only the `Doc` and handle awareness purely
//! as relay — the server forwards awareness frames without processing them.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Doc, ReadTxn, Transact};

/// An active collaborative editing session for a single questionnaire.
pub struct YjsRoom {
    pub doc: Doc,
    #[allow(dead_code)]
    pub last_persisted: std::time::Instant,
}

// Safety: `yrs::Doc` is Send + Sync.
unsafe impl Send for YjsRoom {}
unsafe impl Sync for YjsRoom {}

impl YjsRoom {
    pub fn new() -> Self {
        Self {
            doc: Doc::new(),
            last_persisted: std::time::Instant::now(),
        }
    }

    /// Apply a binary Yjs update (v1 encoding) to the server doc.
    pub fn apply_update(
        &self,
        update: &[u8],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut txn = self.doc.transact_mut();
        let decoded = yrs::Update::decode_v1(update)?;
        txn.apply_update(decoded)?;
        Ok(())
    }

    /// Get the full state as a binary update for syncing new clients.
    #[allow(dead_code)]
    pub fn encode_state_as_update(&self) -> Vec<u8> {
        let txn = self.doc.transact();
        txn.encode_state_as_update_v1(&yrs::StateVector::default())
    }

    /// Encode the state vector for sync step 1.
    pub fn encode_state_vector(&self) -> Vec<u8> {
        let txn = self.doc.transact();
        txn.state_vector().encode_v1()
    }

    /// Encode state diff relative to a given state vector.
    pub fn encode_diff(
        &self,
        sv: &[u8],
    ) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
        let remote_sv = yrs::StateVector::decode_v1(sv)?;
        let txn = self.doc.transact();
        Ok(txn.encode_state_as_update_v1(&remote_sv))
    }
}

/// Manages all active Yjs rooms (one per questionnaire being edited).
#[derive(Clone)]
pub struct YjsStore {
    rooms: Arc<RwLock<HashMap<Uuid, Arc<Mutex<YjsRoom>>>>>,
}

impl YjsStore {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get or create a room for the given questionnaire ID.
    pub async fn get_or_create_room(&self, questionnaire_id: Uuid) -> Arc<Mutex<YjsRoom>> {
        // Fast path: read lock
        {
            let rooms = self.rooms.read().await;
            if let Some(room) = rooms.get(&questionnaire_id) {
                return room.clone();
            }
        }

        // Slow path: write lock to create
        let mut rooms = self.rooms.write().await;
        rooms
            .entry(questionnaire_id)
            .or_insert_with(|| Arc::new(Mutex::new(YjsRoom::new())))
            .clone()
    }

    /// Remove a room (e.g. when all editors leave).
    #[allow(dead_code)]
    pub async fn remove_room(&self, questionnaire_id: &Uuid) {
        self.rooms.write().await.remove(questionnaire_id);
    }

    /// List all active room IDs (for persistence sweep).
    #[allow(dead_code)]
    pub async fn active_rooms(&self) -> Vec<Uuid> {
        self.rooms.read().await.keys().cloned().collect()
    }
}
