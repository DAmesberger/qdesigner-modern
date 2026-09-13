//! Server-side Yrs document store.
//!
//! Maintains one `yrs::Doc` per questionnaire that is currently being edited and
//! is the **sole seeder** of that document: on first use it derives the CRDT from
//! the `questionnaire_definitions.content` projection, persists the binary state
//! to the `yjs_state` column, and thereafter reloads that binary verbatim. This
//! preserves CRDT item identity across reconnects and server restarts, which is
//! what prevents the page-duplication corruption — clients never seed the shared
//! document themselves, so independent seeds can no longer concatenate.
//!
//! Note: `yrs::Doc` is `Send + Sync`, but `yrs::sync::Awareness` is not (its
//! observers are `!Send`). We store only the `Doc` and handle awareness purely
//! as relay — the server forwards awareness frames without processing them.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use sqlx::PgPool;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{Doc, ReadTxn, Transact};

use crate::websocket::yjs_seed::seed_doc_from_content;

/// Debounce window for persisting the room's binary state after an update. The
/// initial seed is persisted immediately; subsequent edits are flushed at most
/// this often (a stale-by-a-few-seconds `yjs_state` is harmless — a reconnecting
/// client re-sends its recent updates and they merge without duplication because
/// the CRDT item identity is preserved).
const PERSIST_DEBOUNCE: Duration = Duration::from_secs(2);

/// An active collaborative editing session for a single questionnaire.
pub struct YjsRoom {
    pub doc: Doc,
    /// Installation generation; absent rooms must never be served or persisted.
    pub epoch: Option<i32>,
    /// When the binary state was last written to `yjs_state`.
    pub last_persisted: Instant,
}

impl YjsRoom {
    /// Wrap an already-seeded (or already-loaded) document.
    fn from_doc(doc: Doc, epoch: Option<i32>) -> Self {
        Self {
            doc,
            epoch,
            last_persisted: Instant::now(),
        }
    }

    /// Apply a binary Yjs update (v1 encoding) to the server doc.
    pub fn apply_update(
        &self,
        update: &[u8],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        apply_update_to(&self.doc, update)
    }

    /// Get the full state as a binary update for syncing new clients / persisting.
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

fn apply_update_to(
    doc: &Doc,
    update: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut txn = doc.transact_mut();
    let decoded = yrs::Update::decode_v1(update)?;
    txn.apply_update(decoded)?;
    Ok(())
}

fn encode_state(doc: &Doc) -> Vec<u8> {
    let txn = doc.transact();
    txn.encode_state_as_update_v1(&yrs::StateVector::default())
}

/// Manages all active Yjs rooms (one per questionnaire being edited).
#[derive(Clone)]
pub struct YjsStore {
    rooms: Arc<RwLock<HashMap<Uuid, Arc<Mutex<YjsRoom>>>>>,
    pool: PgPool,
}

impl YjsStore {
    pub fn new(pool: PgPool) -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            pool,
        }
    }

    /// Get or create a room for the given questionnaire ID. On first creation the
    /// document is loaded from the persisted `yjs_state`, or seeded from `content`
    /// (once) if no binary state exists yet.
    pub async fn get_or_create_room(&self, questionnaire_id: Uuid) -> Arc<Mutex<YjsRoom>> {
        // Consult durable generation even for cached rooms: another server may
        // have replaced this questionnaire since the last frame.
        let epoch = sqlx::query_scalar::<_, i32>(
            "SELECT collaboration_epoch FROM questionnaire_definitions WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(questionnaire_id)
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten();
        let cached = self.rooms.read().await.get(&questionnaire_id).cloned();
        if let Some(room) = cached {
            if epoch.is_some() && room.lock().await.epoch == epoch {
                return room;
            }
        }
        // Database work must not hold the cache lock: a normal HTTP save can
        // hold the definition row lock while checking for an active room.
        let (doc, epoch) = self.load_or_seed_doc(questionnaire_id).await;
        let room = Arc::new(Mutex::new(YjsRoom::from_doc(doc, epoch)));
        let mut rooms = self.rooms.write().await;
        if let Some(existing) = rooms.get(&questionnaire_id) {
            if epoch.is_some() && existing.lock().await.epoch >= epoch {
                return existing.clone();
            }
        }
        // Never flush an obsolete room into its replacement, nor cache a
        // document whose authoritative state could not be loaded.
        if epoch.is_some() {
            rooms.insert(questionnaire_id, room.clone());
        }
        room
    }

    /// Build the authoritative document for a questionnaire: prefer the persisted
    /// binary; otherwise seed from `content` and persist it under an atomic CAS so
    /// that at most one seeder ever wins (across processes / concurrent opens).
    ///
    /// Returns `(doc, epoch)`. A missing epoch means we could not
    /// establish persisted/adopted state (transient DB error, undecodable bytes, or
    /// a missing row); the caller must NOT cache such a room, and must never serve
    /// our un-persisted local seed — its CRDT identity would diverge from the real
    /// authoritative state and could re-introduce the page duplication.
    async fn load_or_seed_doc(&self, questionnaire_id: Uuid) -> (Doc, Option<i32>) {
        let doc = Doc::new();

        let row: Option<(Option<Vec<u8>>, Option<Value>, i32)> = sqlx::query_as(
            "SELECT yjs_state, content, collaboration_epoch FROM questionnaire_definitions \
             WHERE id = $1 AND deleted_at IS NULL",
        )
        .bind(questionnaire_id)
        .fetch_optional(&self.pool)
        .await
        .unwrap_or(None);

        match row {
            // Authoritative binary already exists — load it verbatim.
            Some((Some(state), _, epoch)) => match apply_update_to(&doc, &state) {
                Ok(()) => (doc, Some(epoch)),
                Err(e) => {
                    // Undecodable persisted bytes: do NOT re-seed from the (possibly
                    // stale) content here and do NOT cache — serve empty so a later
                    // open retries, and so no edit ever overwrites the stored bytes.
                    tracing::warn!(%questionnaire_id, "failed to apply persisted yjs_state: {e}");
                    (Doc::new(), None)
                }
            },
            // Never collaborated yet — seed once from the content projection under an
            // atomic election so at most one seeder ever wins.
            Some((None, Some(content), epoch)) => {
                seed_doc_from_content(&doc, &content);
                let bytes = encode_state(&doc);

                // Only the writer that flips NULL -> state wins the election. A
                // transient DB error is NOT a lost election — in both the lost and
                // error cases our local seed is unpersisted with a divergent identity
                // and must be discarded in favour of the persisted authoritative state.
                let won = matches!(
                    sqlx::query(
                        "UPDATE questionnaire_definitions SET yjs_state = $1 \
                         WHERE id = $2 AND yjs_state IS NULL AND collaboration_epoch = $3",
                    )
                    .bind(&bytes)
                    .bind(questionnaire_id)
                    .bind(epoch)
                    .execute(&self.pool)
                    .await,
                    Ok(ref res) if res.rows_affected() >= 1
                );

                if won {
                    (doc, Some(epoch))
                } else {
                    match self.adopt_persisted(questionnaire_id).await {
                        Some((adopted, epoch)) => (adopted, Some(epoch)),
                        None => (Doc::new(), None),
                    }
                }
            }
            // Row exists with neither state nor content — a genuinely empty
            // questionnaire. Start empty + authoritative; the first edit persists.
            Some((None, None, epoch)) => (doc, Some(epoch)),
            // Row missing (deleted / not found): empty, uncached.
            None => (doc, None),
        }
    }

    /// Read the persisted authoritative state, retrying briefly for the race where a
    /// concurrent winner's `UPDATE` has not yet committed.
    async fn adopt_persisted(&self, questionnaire_id: Uuid) -> Option<(Doc, i32)> {
        for attempt in 0..3 {
            if let Ok(Some((Some(state), epoch))) = sqlx::query_as::<_, (Option<Vec<u8>>, i32)>(
                "SELECT yjs_state, collaboration_epoch FROM questionnaire_definitions WHERE id = $1",
            )
            .bind(questionnaire_id)
            .fetch_optional(&self.pool)
            .await
            {
                let adopted = Doc::new();
                if apply_update_to(&adopted, &state).is_ok() {
                    return Some((adopted, epoch));
                }
            }
            if attempt < 2 {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
        None
    }

    /// Persist a room's current binary state to `yjs_state` (called debounced from
    /// the relay). Best-effort: failures are logged, not surfaced to clients.
    pub async fn persist(&self, questionnaire_id: Uuid, epoch: i32, state: &[u8]) {
        if let Err(e) = sqlx::query(
            "UPDATE questionnaire_definitions SET yjs_state = $1 \
             WHERE id = $2 AND deleted_at IS NULL AND collaboration_epoch = $3",
        )
        .bind(state)
        .bind(questionnaire_id)
        .bind(epoch)
        .execute(&self.pool)
        .await
        {
            tracing::warn!(%questionnaire_id, "failed to persist yjs_state: {e}");
        }
    }

    /// Debounce helper: returns the encoded state to persist if the room is due
    /// for a flush (and stamps `last_persisted`), otherwise `None`.
    pub fn take_persist_snapshot(room: &mut YjsRoom) -> Option<Vec<u8>> {
        if room.last_persisted.elapsed() >= PERSIST_DEBOUNCE {
            room.last_persisted = Instant::now();
            Some(room.encode_state_as_update())
        } else {
            None
        }
    }

    /// Whether a live collab room currently exists for this questionnaire.
    ///
    /// An open room is the **authoritative seeder** of that questionnaire's CRDT
    /// (rooms are cached only once authoritative — see [`get_or_create_room`]).
    /// An out-of-band `content` writer must therefore NOT invalidate `yjs_state`
    /// while a room is open: a content write during a live collab session is the
    /// autosave echoing the CRDT's own content, and NULLing `yjs_state` there
    /// would discard the room's authoritative identity and re-introduce page
    /// duplication on the next re-seed (a reconnect after restart/eviction).
    ///
    /// [`get_or_create_room`]: Self::get_or_create_room
    pub async fn has_active_room(&self, questionnaire_id: &Uuid) -> bool {
        self.rooms.read().await.contains_key(questionnaire_id)
    }

    /// Evict the room for `questionnaire_id` — called from the WS disconnect path
    /// once no connection remains subscribed to its channel. Without this every
    /// questionnaire ever opened pins a `yrs::Doc` for the process lifetime.
    ///
    /// Flushes the room's current binary state to `yjs_state` before dropping it,
    /// so eviction can never lose edits that were applied to the doc but had not
    /// yet been debounce-persisted. The room is removed from the map under the
    /// write lock first (so a concurrent [`get_or_create_room`] cannot hand out
    /// the about-to-be-dropped instance); a later open re-creates it from the
    /// just-persisted bytes, preserving CRDT item identity.
    ///
    /// [`get_or_create_room`]: Self::get_or_create_room
    pub async fn evict_room(&self, questionnaire_id: Uuid) {
        let Some(room) = self.rooms.write().await.remove(&questionnaire_id) else {
            return;
        };
        let (bytes, epoch) = {
            let room = room.lock().await;
            (room.encode_state_as_update(), room.epoch)
        };
        if let Some(epoch) = epoch {
            self.persist(questionnaire_id, epoch, &bytes).await;
        }
    }
}
