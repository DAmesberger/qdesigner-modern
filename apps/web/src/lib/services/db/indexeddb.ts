import Dexie, { type Table } from 'dexie';
import type { Questionnaire } from '$lib/shared';
import type { ResumeState } from '$lib/runtime/core/ResumeState';
import type { ServerVariableStats } from '@qdesigner/questionnaire-core';

export interface SyncQueueItem {
  id?: string;
  timestamp: number;
  operation: 'create' | 'update' | 'delete';
  table: string;
  recordId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sync queue stores heterogeneous data shapes
  data: any;
  userId: string;
  organizationId: string;  // Added per business decision
  projectId?: string;      // Added per business decision
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  error?: string;
}

export interface OfflineQuestionnaire {
  id: string;
  userId: string;
  questionnaire: Questionnaire;
  lastModified: number;
  syncStatus: 'synced' | 'pending' | 'conflict';
  serverVersion?: number;
  localVersion: number;
}

export interface CachedResource {
  id: string;
  url: string;
  data: Blob;
  mimeType: string;
  size: number;
  lastAccessed: number;
  expiresAt?: number;
}

export interface DraftData {
  id: string;
  userId: string;
  questionnaireId: string;
  data: Partial<Questionnaire>;
  timestamp: number;
  autoSave: boolean;
}

// ── Fillout offline tables ─────────────────────────────────────────

export interface FilloutQuestionnaire {
  /**
   * Synthetic primary key: `${questionnaireId}@${versionMajor}.${versionMinor}.${versionPatch}`
   * (build with {@link filloutDefinitionKey}). Keying by (id, version) lets multiple versions
   * of the same questionnaire coexist so a background refresh to a newer version never
   * overwrites the snapshot an in-flight session pinned. The IndexedDB keyPath stays `id`
   * (Dexie 4 forbids changing a table's primary key in an upgrade), so the composite lives
   * in this field rather than a compound key.
   */
  id: string;
  /** Raw questionnaire id (the value the API and runtime use). */
  questionnaireId: string;
  accessCode: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  data: Record<string, unknown>; // raw questionnaire JSON from API
  syncedAt: number;
}

/**
 * Accounting row for a media asset cached in the `fillout-media-v*` Cache-API store.
 * The Cache API carries no metadata, so recency + ownership needed to bound the cache
 * (evict oldest-questionnaire-first, never evict a version an unsynced session pinned)
 * live here. Compound-keyed by (url, questionnaireKey) so a URL shared by two versions
 * has one row per version and is only deleted from the Cache once no version references it.
 */
export interface FilloutMediaEntry {
  url: string; // Cache-API key (same-origin streaming-proxy URL per shared contract D1)
  questionnaireKey: string; // filloutDefinitionKey() of the owning definition version
  questionnaireId: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  size: number; // best-effort byte size (Content-Length at cache time); 0 when unknown
  cachedAt: number;
}

/** Build the synthetic primary key for a version-pinned fillout definition row. */
export function filloutDefinitionKey(
  questionnaireId: string,
  versionMajor: number,
  versionMinor: number,
  versionPatch: number
): string {
  return `${questionnaireId}@${versionMajor}.${versionMinor}.${versionPatch}`;
}

export interface FilloutSession {
  id: string; // client-generated UUID
  questionnaireId: string;
  status: 'active' | 'completed' | 'abandoned';
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  participantId?: string;
  metadata?: Record<string, unknown>;
  browserInfo?: Record<string, unknown>;
  createdAt: number;
  completedAt?: number;
  // ── Durable resume cursor (E-OFF-1) ──────────────────────────────
  // Written on every answered item so a reload/offline resume has an
  // authoritative pointer even before any child record has synced. These are
  // HINTS for progress display; the runtime recomputes the true first-unanswered
  // item from `answeredQuestionIds` on hydrate (defends against a partial write).
  lastItemIndex?: number;
  lastPageId?: string;
  answeredQuestionIds?: string[];
  // ── True save-and-continue snapshot (E-FLOW-3) ───────────────────
  // The full runtime ResumeState (cursor + loop counters + variable context +
  // presented-item set) captured on each answer boundary. A plain stored column
  // (not an index), so it round-trips without a Dexie schema bump. Mirrored to
  // `sessions.state_snapshot` on the server for cross-device resume.
  resumeState?: ResumeState;
  updatedAt?: number;
  synced: 0 | 1;
}

export interface FilloutResponse {
  id?: number; // auto-increment
  sessionId: string;
  clientId: string; // UUID for server dedup
  questionId: string;
  value: unknown;
  reactionTimeUs?: number;
  presentedAt?: string;
  answeredAt?: string;
  metadata?: Record<string, unknown>;
  /**
   * SHA-256 (or FNV-1a fallback) of the canonicalized STORED content (E-OFF-5),
   * computed at write time and re-verified on read. A mismatch means the row was
   * partially written / corrupted / tampered — it is escalated, not synced.
   * Optional so pre-E-OFF-5 rows (and direct test puts) remain valid.
   */
  checksum?: string;
  /** Sync attempt counter (E-OFF-5). Bumped each time the row was sent but not acked. */
  attempts?: number;
  /** Last sync error seen for this row (E-OFF-5 dead-letter diagnostics). */
  lastError?: string;
  synced: 0 | 1;
}

export interface FilloutEvent {
  id?: number; // auto-increment
  sessionId: string;
  clientId: string; // UUID for server dedup
  eventType: string;
  questionId?: string;
  timestampUs: number;
  metadata?: Record<string, unknown>;
  /** Content checksum (E-OFF-5); see {@link FilloutResponse.checksum}. */
  checksum?: string;
  /** Sync attempt counter (E-OFF-5). */
  attempts?: number;
  /** Last sync error seen for this row (E-OFF-5). */
  lastError?: string;
  synced: 0 | 1;
}

export interface FilloutVariable {
  sessionId: string;
  name: string;
  value: unknown;
  /**
   * Per-record concurrency token (E-OFF-4). Regenerated on every `saveVariable`
   * put, so a variable re-written mid-sync gets a fresh id. Ack-driven marking
   * only flips a row to `synced=1` when the server-accepted name still carries
   * the clientId that was sent — a value overwritten during the network round-trip
   * keeps its newer clientId and stays unsynced for the next pass. A plain stored
   * column (structured-clone round-trips it); no index / schema bump needed.
   * Optional so pre-E-OFF-4 rows (and direct test puts) remain valid.
   */
  clientId?: string;
  /** Content checksum (E-OFF-5); see {@link FilloutResponse.checksum}. */
  checksum?: string;
  /** Sync attempt counter (E-OFF-5). */
  attempts?: number;
  /** Last sync error seen for this row (E-OFF-5). */
  lastError?: string;
  synced: 0 | 1;
}

/**
 * One materialized per-trial row (RT-1b), the fourth offline record kind. Written
 * IMMEDIATELY as each reaction trial completes (a first-class analytic object, not
 * a slice of the question-level response) and synced through the same batch
 * `/sync` + `ON CONFLICT (client_id)` dedup path as responses/events. Keyed by the
 * dedup `clientId` (uuid) so a re-shipped trial is idempotent server-side.
 *
 * At-rest encryption (E-OFF-2) mirrors {@link FilloutResponse}: the participant's
 * ANSWER (`optionId`) is AES-GCM encrypted before write and decrypted before sync;
 * the timing/measurement columns (`rtUs`, `sampledTimings`, `provenance`,
 * `invalidated`) stay cleartext, exactly like `reactionTimeUs` / `timingProvenance`
 * on a response row.
 */
export interface FilloutTrial {
  /** Primary key: server dedup clientId (uuid). */
  clientId: string;
  sessionId: string;
  questionId: string;
  /** Monotonic trial number within the question (1-based). */
  trialIndex: number;
  /** Reaction paradigm / task type this trial belongs to. */
  paradigm: string;
  /**
   * The winning ResponseOption id (ADR 0024) — the participant's answer. ENCRYPTED
   * at rest (E-OFF-2), so the stored slot is an envelope; decrypted back to the raw
   * `string | null` before sync. Typed `unknown` because the stored value is the
   * envelope, not the plaintext.
   */
  optionId: unknown;
  /** Winning source family (keyboard/pointer/…), else null. Cleartext measurement. */
  source?: string | null;
  /** Per-trial reaction time in microseconds (ms×1000 floored), else null. */
  rtUs?: number | null;
  /** Trial correctness, else null (unscored). */
  correct?: boolean | null;
  /** Materialized (sampled) phase-plan timings for this trial (ADR 0025). */
  sampledTimings?: unknown;
  /** Per-trial timing-provenance blob (which clocks, latencies, frame health). */
  provenance?: unknown;
  /** W-3 invalidation stamp (e.g. `'visibility'`), else null. */
  invalidated?: string | null;
  /** Content checksum (E-OFF-5); see {@link FilloutResponse.checksum}. */
  checksum?: string;
  /** Sync attempt counter (E-OFF-5). */
  attempts?: number;
  /** Last sync error seen for this row (E-OFF-5). */
  lastError?: string;
  synced: 0 | 1;
}

/**
 * Append-only sync-journey audit for every durable participant record (E-OFF-5).
 * One row per record `clientId`, tracking its passage from `pending` (enqueued
 * locally) → `acked` (server durably holds it) or → `deadletter` (K sync attempts
 * failed; escalated to a human, never silently dropped). Reconcile diffs the
 * `acked` rows against what the server actually reports so a client-side
 * over-marking (locally acked, server-missing) is detected and re-queued.
 */
export interface FilloutSyncLedgerEntry {
  /** Primary key: the record's dedup `clientId`. */
  clientId: string;
  sessionId: string;
  kind: 'response' | 'event' | 'variable' | 'trial';
  state: 'pending' | 'acked' | 'deadletter';
  attempts: number;
  lastError?: string;
  updatedAt: number;
}

/**
 * Cached aggregate for one SERVER-COMPUTED VARIABLE (server-computed-variable /
 * E-FEEDBACK-3). One row per (version-pinned definition, variable): the runtime
 * reads these before construction and injects each into the ONE VariableEngine as
 * a `'server-sync'` value, so server-computed variables resolve OFFLINE from the
 * last synced aggregate (falling back to the variable's `defaultValue` when a row
 * is absent). Keyed `[definitionKey+variableId]` so concurrent versions coexist,
 * mirroring {@link FilloutQuestionnaire}. `declHash` lets the +page.svelte snapshot
 * builder safely reuse a row cross-version when the declaration is byte-identical.
 */
export interface FilloutServerVariable {
  /** {@link filloutDefinitionKey}(questionnaireId, maj, min, patch) — same composite as filloutQuestionnaires. */
  definitionKey: string;
  /** Variable id from the definition (the key the runtime injects against). */
  variableId: string;
  /** Variable name (the mathjs symbol consumers resolve). */
  name: string;
  /** Stable content hash of the `server` declaration (matches the questionnaire-core `declHash`). */
  declHash: string;
  questionnaireId: string;
  /** Cohort size (populated even below the anonymity floor). */
  n: number;
  /** Full stats, or `null` when withheld below the server's n>=5 anonymity floor. */
  stats: ServerVariableStats | null;
  /** Server-clock ISO-8601 timestamp of the aggregation. */
  computedAt: string;
  /** Client-clock ms when this row was written (drives the freshness skip). */
  syncedAt: number;
}

/** Reserved primary key of the single device-root-key row in `filloutKeys`. */
export const DEVICE_ROOT_KEY_ID = '__device_root__';

/**
 * Key material for encryption-at-rest (E-OFF-2). One row per session holds that
 * session's AES-GCM data key WRAPPED by the device root key; a single reserved
 * row ({@link DEVICE_ROOT_KEY_ID}) holds the non-extractable device root key
 * itself. Persisting the root key as a `CryptoKey` object (structured-clone) —
 * rather than raw bytes — means IndexedDB never stores extractable key material.
 * Destroying a row (purge / clear-this-device) renders the paired ciphertext
 * permanently unreadable.
 */
export interface FilloutKeyRow {
  /** Primary key: a session id, or {@link DEVICE_ROOT_KEY_ID} for the root-key row. */
  sessionId: string;
  /** Device-root row ONLY: non-extractable AES-GCM wrapping key (wrapKey/unwrapKey usages). */
  rootKey?: CryptoKey;
  /** Per-session row ONLY: this session's data key, wrapped by the device root key. */
  wrappedKey?: ArrayBuffer;
  /** Per-session row ONLY: the IV used to wrap `wrappedKey`. */
  iv?: Uint8Array;
  createdAt: number;
}

class QDesignerDatabase extends Dexie {
  // Designer tables
  questionnaires!: Table<OfflineQuestionnaire>;
  syncQueue!: Table<SyncQueueItem>;
  resources!: Table<CachedResource>;
  drafts!: Table<DraftData>;

  // Fillout offline tables
  filloutQuestionnaires!: Table<FilloutQuestionnaire>;
  filloutSessions!: Table<FilloutSession>;
  filloutResponses!: Table<FilloutResponse>;
  filloutEvents!: Table<FilloutEvent>;
  filloutVariables!: Table<FilloutVariable>;
  filloutMedia!: Table<FilloutMediaEntry>;
  filloutServerVariables!: Table<FilloutServerVariable>;
  filloutTrials!: Table<FilloutTrial, string>;
  filloutKeys!: Table<FilloutKeyRow, string>;
  filloutSyncLedger!: Table<FilloutSyncLedgerEntry, string>;

  constructor() {
    super('QDesignerOfflineDB');

    // v1: designer tables
    this.version(1).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]'
    });

    // v2: fillout offline tables
    this.version(2).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
      filloutQuestionnaires: 'id, accessCode, syncedAt',
      filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
      filloutResponses: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutVariables: '[sessionId+name], sessionId, synced'
    });

    // v3: version-pin fillout definitions + media-cache accounting.
    //  - filloutQuestionnaires KEEPS keyPath `id` (Dexie 4 throws on a primary-key change in
    //    an upgrade). `id` now holds the `${questionnaireId}@maj.min.patch` composite so an
    //    (id, version) pair is addressable and concurrent versions coexist; `questionnaireId`
    //    is added as a plain index for GC / grouping.
    //  - filloutMedia is new (compound PK [url+questionnaireKey]) — see FilloutMediaEntry.
    this.version(3)
      .stores({
        questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
        syncQueue: '++id, userId, status, timestamp, [userId+status]',
        resources: 'id, url, lastAccessed, expiresAt',
        drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
        filloutQuestionnaires: 'id, questionnaireId, accessCode, syncedAt',
        filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
        filloutResponses: '++id, sessionId, clientId, synced, [sessionId+synced]',
        filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
        filloutVariables: '[sessionId+name], sessionId, synced',
        filloutMedia: '[url+questionnaireKey], url, questionnaireKey, questionnaireId, cachedAt'
      })
      .upgrade(async (tx) => {
        // Re-key existing v2 filloutQuestionnaires rows (keyed by bare questionnaire id) to
        // the composite key. Read all first, then clear + re-put: every new id differs from
        // its old id and v2 held at most one row per questionnaire id, so this is
        // collision-free, and the whole thing runs inside the version transaction (atomic).
        const table = tx.table('filloutQuestionnaires');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pre-migration row shape
        const rows: any[] = await table.toArray();
        if (rows.length === 0) return;
        await table.clear();
        for (const row of rows) {
          const questionnaireId: string =
            typeof row.questionnaireId === 'string' ? row.questionnaireId : row.id;
          const versionMajor = typeof row.versionMajor === 'number' ? row.versionMajor : 1;
          const versionMinor = typeof row.versionMinor === 'number' ? row.versionMinor : 0;
          const versionPatch = typeof row.versionPatch === 'number' ? row.versionPatch : 0;
          await table.put({
            ...row,
            id: filloutDefinitionKey(questionnaireId, versionMajor, versionMinor, versionPatch),
            questionnaireId,
            versionMajor,
            versionMinor,
            versionPatch
          });
        }
      });

    // v4: resumable sessions (E-OFF-1).
    //  - filloutResponses gains a `questionId` index so a resume can look up the last
    //    answer for a question without a full-table scan. Non-destructive (Dexie reindexes
    //    the existing rows automatically); every other store is carried over unchanged.
    //  - The new FilloutSession resume-cursor fields (lastItemIndex/lastPageId/
    //    answeredQuestionIds/updatedAt) are plain stored columns, not indexes, so they need
    //    no schema entry — structured-clone round-trips them.
    this.version(4).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
      filloutQuestionnaires: 'id, questionnaireId, accessCode, syncedAt',
      filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
      filloutResponses: '++id, sessionId, clientId, questionId, synced, [sessionId+synced]',
      filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutVariables: '[sessionId+name], sessionId, synced',
      filloutMedia: '[url+questionnaireKey], url, questionnaireKey, questionnaireId, cachedAt'
    });

    // v5: server-computed variables (server-computed-variable / E-FEEDBACK-3).
    //  - filloutServerVariables is new: one aggregate row per (version-pinned
    //    definition, variable), compound-keyed [definitionKey+variableId] so
    //    concurrent versions coexist like filloutQuestionnaires. `definitionKey`
    //    and `questionnaireId` are plain indexes for the snapshot read and prune
    //    GC; `syncedAt` drives the freshness-skip query. Purely additive — all v4
    //    stores are restated unchanged and there is NO .upgrade() body, so Dexie
    //    creates the empty table lazily on next open and old clients upgrade
    //    transparently.
    this.version(5).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
      filloutQuestionnaires: 'id, questionnaireId, accessCode, syncedAt',
      filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
      filloutResponses: '++id, sessionId, clientId, questionId, synced, [sessionId+synced]',
      filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutVariables: '[sessionId+name], sessionId, synced',
      filloutMedia: '[url+questionnaireKey], url, questionnaireKey, questionnaireId, cachedAt',
      filloutServerVariables: '[definitionKey+variableId], definitionKey, questionnaireId, syncedAt'
    });

    // v6: encryption-at-rest key store (E-OFF-2).
    //  - filloutKeys is new: one row per session holding that session's AES-GCM
    //    data key WRAPPED by the device root key, plus one reserved row
    //    (DEVICE_ROOT_KEY_ID) holding the non-extractable root CryptoKey itself.
    //    Keyed on `sessionId`; no secondary indexes (all lookups are by PK).
    //  - Purely ADDITIVE. Existing response/variable/session-metadata rows stay
    //    readable: the read paths pass a non-envelope slot through as plaintext
    //    (legacy or insecure-context fallback), so there is NO destructive
    //    re-encrypt migration inside the upgrade transaction (awaiting
    //    crypto.subtle inside a Dexie upgrade tx risks a premature commit).
    //    New writes from v6 onward are encrypted; residual plaintext is removed
    //    by purge-after-sync and clearThisDevice().
    this.version(6).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
      filloutQuestionnaires: 'id, questionnaireId, accessCode, syncedAt',
      filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
      filloutResponses: '++id, sessionId, clientId, questionId, synced, [sessionId+synced]',
      filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutVariables: '[sessionId+name], sessionId, synced',
      filloutMedia: '[url+questionnaireKey], url, questionnaireKey, questionnaireId, cachedAt',
      filloutServerVariables: '[definitionKey+variableId], definitionKey, questionnaireId, syncedAt',
      filloutKeys: 'sessionId'
    });

    // v7: sync-integrity ledger + no-silent-loss (E-OFF-5).
    //  - filloutSyncLedger is new: one append-only audit row per record clientId
    //    (PK `clientId`), with `state`/`kind`/`[sessionId+state]` indexes for the
    //    reconcile diff, dead-letter query, and per-session stats. Purely additive
    //    — no .upgrade() body, so Dexie creates the empty table on next open.
    //  - The new checksum/attempts/lastError columns on filloutResponses/Events/
    //    Variables are plain STORED fields (structured-clone round-trips them), not
    //    indexes, so they need no schema entry; all v6 stores are restated verbatim.
    this.version(7).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
      filloutQuestionnaires: 'id, questionnaireId, accessCode, syncedAt',
      filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
      filloutResponses: '++id, sessionId, clientId, questionId, synced, [sessionId+synced]',
      filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutVariables: '[sessionId+name], sessionId, synced',
      filloutMedia: '[url+questionnaireKey], url, questionnaireKey, questionnaireId, cachedAt',
      filloutServerVariables: '[definitionKey+variableId], definitionKey, questionnaireId, syncedAt',
      filloutKeys: 'sessionId',
      filloutSyncLedger: 'clientId, sessionId, kind, state, updatedAt, [sessionId+state]'
    });

    // v8: per-trial persistence (RT-1b).
    //  - filloutTrials is new: one row per completed reaction trial, PK `clientId`
    //    (the server dedup uuid), with `sessionId`/`synced`/`[sessionId+synced]`
    //    indexes so the sync drain, purge, and export use the same compound-index
    //    pattern as filloutResponses. Purely additive — no .upgrade() body, so
    //    Dexie creates the empty table on next open and older clients upgrade
    //    transparently. All v7 stores are restated verbatim.
    this.version(8).stores({
      questionnaires: 'id, userId, syncStatus, lastModified, [id+userId]',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]',
      filloutQuestionnaires: 'id, questionnaireId, accessCode, syncedAt',
      filloutSessions: 'id, questionnaireId, status, createdAt, synced, [questionnaireId+status]',
      filloutResponses: '++id, sessionId, clientId, questionId, synced, [sessionId+synced]',
      filloutEvents: '++id, sessionId, clientId, synced, [sessionId+synced]',
      filloutVariables: '[sessionId+name], sessionId, synced',
      filloutMedia: '[url+questionnaireKey], url, questionnaireKey, questionnaireId, cachedAt',
      filloutServerVariables: '[definitionKey+variableId], definitionKey, questionnaireId, syncedAt',
      filloutTrials: 'clientId, sessionId, synced, [sessionId+synced]',
      filloutKeys: 'sessionId',
      filloutSyncLedger: 'clientId, sessionId, kind, state, updatedAt, [sessionId+state]'
    });
  }

  // Helper methods
  async saveQuestionnaire(questionnaire: Questionnaire, userId: string, organizationId?: string, projectId?: string): Promise<void> {
    const offlineQuestionnaire: OfflineQuestionnaire = {
      id: questionnaire.id,
      userId,
      questionnaire,
      lastModified: Date.now(),
      syncStatus: 'pending',
      localVersion: 1
    };

    await this.transaction('rw', this.questionnaires, this.syncQueue, async () => {
      // Check if exists
      const existing = await this.questionnaires.get(questionnaire.id);
      
      if (existing) {
        // Update version
        offlineQuestionnaire.localVersion = existing.localVersion + 1;
        offlineQuestionnaire.serverVersion = existing.serverVersion;
      }

      // Save questionnaire
      await this.questionnaires.put(offlineQuestionnaire);

      // Add to sync queue
      await this.addToSyncQueue({
        operation: existing ? 'update' : 'create',
        table: 'questionnaires',
        recordId: questionnaire.id,
        data: questionnaire,
        userId,
        organizationId: organizationId || questionnaire.organizationId || '',
        projectId: projectId || questionnaire.projectId
      });
    });
  }

  async getQuestionnaire(id: string, userId: string): Promise<Questionnaire | null> {
    const result = await this.questionnaires
      .where({ id, userId })
      .first();
    
    return result?.questionnaire || null;
  }

  async listQuestionnaires(userId: string): Promise<OfflineQuestionnaire[]> {
    return await this.questionnaires
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('lastModified');
  }

  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<void> {
    await this.syncQueue.add({
      ...item,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    });
  }

  async getPendingSyncItems(userId: string): Promise<SyncQueueItem[]> {
    return await this.syncQueue
      .where(['userId', 'status'])
      .equals([userId, 'pending'])
      .toArray();
  }

  async markSyncItemComplete(id: string): Promise<void> {
    await this.syncQueue.update(id, { status: 'synced' });
  }

  async markSyncItemFailed(id: string, error: string): Promise<void> {
    const item = await this.syncQueue.get(id);
    if (item) {
      await this.syncQueue.update(id, {
        status: 'failed',
        error,
        retryCount: item.retryCount + 1
      });
    }
  }

  async saveDraft(questionnaireId: string, data: Partial<Questionnaire>, userId: string, autoSave = true): Promise<void> {
    const draft: DraftData = {
      id: `draft_${Date.now()}`,
      userId,
      questionnaireId,
      data,
      timestamp: Date.now(),
      autoSave
    };

    await this.drafts.put(draft);

    // Keep only last 10 drafts per questionnaire
    const drafts = await this.drafts
      .where(['userId', 'questionnaireId'])
      .equals([userId, questionnaireId])
      .reverse()
      .sortBy('timestamp');

    if (drafts.length > 10) {
      const toDelete = drafts.slice(10);
      await Promise.all(toDelete.map(d => this.drafts.delete(d.id)));
    }
  }

  async getLatestDraft(questionnaireId: string, userId: string): Promise<DraftData | null> {
    const drafts = await this.drafts
      .where(['userId', 'questionnaireId'])
      .equals([userId, questionnaireId])
      .reverse()
      .sortBy('timestamp');
    
    return drafts[0] || null;
  }

  async clearDrafts(questionnaireId: string, userId: string): Promise<void> {
    const drafts = await this.drafts
      .where(['userId', 'questionnaireId'])
      .equals([userId, questionnaireId])
      .toArray();

    await Promise.all(drafts.map(d => this.drafts.delete(d.id)));
  }

  async cacheResource(url: string, data: Blob, mimeType: string, expiresInMs?: number): Promise<void> {
    const resource: CachedResource = {
      id: url,
      url,
      data,
      mimeType,
      size: data.size,
      lastAccessed: Date.now(),
      expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined
    };

    await this.resources.put(resource);
  }

  async getCachedResource(url: string): Promise<CachedResource | null> {
    const resource = await this.resources.get(url);
    
    if (resource) {
      // Check if expired
      if (resource.expiresAt && resource.expiresAt < Date.now()) {
        await this.resources.delete(url);
        return null;
      }

      // Update last accessed
      await this.resources.update(url, { lastAccessed: Date.now() });
      return resource;
    }

    return null;
  }

  async cleanupExpiredResources(): Promise<void> {
    const now = Date.now();
    const expired = await this.resources
      .where('expiresAt')
      .below(now)
      .toArray();

    await Promise.all(expired.map(r => this.resources.delete(r.id)));
  }

  async getStorageUsage(): Promise<{ used: number; items: number }> {
    let totalSize = 0;
    let itemCount = 0;

    // Calculate questionnaires size
    const questionnaires = await this.questionnaires.toArray();
    questionnaires.forEach(q => {
      totalSize += JSON.stringify(q).length;
      itemCount++;
    });

    // Calculate resources size
    const resources = await this.resources.toArray();
    for (const resource of resources) {
      totalSize += resource.size;
      itemCount++;
    }

    // Calculate sync queue size
    const syncItems = await this.syncQueue.toArray();
    syncItems.forEach(item => {
      totalSize += JSON.stringify(item).length;
      itemCount++;
    });

    // Calculate drafts size
    const drafts = await this.drafts.toArray();
    drafts.forEach(draft => {
      totalSize += JSON.stringify(draft).length;
      itemCount++;
    });

    // Fillout offline tables (E-OFF-5): participant data dominates the store on a
    // long offline run, so the storage readout must account for it. Media blobs
    // live in the Cache API (tracked via getStorageEstimate), not IndexedDB, so
    // only the metadata row is counted here.
    const filloutTables: Table<{ size?: number }>[] = [
      this.filloutSessions as unknown as Table<{ size?: number }>,
      this.filloutResponses as unknown as Table<{ size?: number }>,
      this.filloutEvents as unknown as Table<{ size?: number }>,
      this.filloutVariables as unknown as Table<{ size?: number }>,
      this.filloutQuestionnaires as unknown as Table<{ size?: number }>,
      this.filloutMedia as unknown as Table<{ size?: number }>,
      this.filloutServerVariables as unknown as Table<{ size?: number }>,
      this.filloutTrials as unknown as Table<{ size?: number }>,
      this.filloutSyncLedger as unknown as Table<{ size?: number }>,
    ];
    for (const table of filloutTables) {
      const rows = await table.toArray();
      for (const row of rows) {
        totalSize += JSON.stringify(row).length;
        itemCount++;
      }
    }

    return { used: totalSize, items: itemCount };
  }

  async clearAllData(): Promise<void> {
    await this.transaction('rw',
      this.questionnaires,
      this.syncQueue,
      this.resources,
      this.drafts,
      async () => {
        await Promise.all([
          this.questionnaires.clear(),
          this.syncQueue.clear(),
          this.resources.clear(),
          this.drafts.clear()
        ]);
      }
    );
  }

  /**
   * Purge SYNCED participant data (responses, events, variables, and the
   * session row itself) for one session from IndexedDB after a successful
   * final sync (F005 — sensitive fillout data must not linger on the device
   * once the server holds it).
   *
   * Safety contract:
   *  - Deletes ONLY rows with `synced === 1`. Any record still awaiting sync
   *    (offline queue) survives, so this can never drop unsynced participant
   *    data. Callers MUST invoke this strictly AFTER the sync ack + markSynced.
   *  - The `filloutSessions` row is removed only when its own `synced === 1`;
   *    if any child record failed to sync (still 0) the session row would have
   *    been re-armed, so it stays.
   *  - Uses the `[sessionId+synced]` compound index for responses/events; the
   *    `filloutVariables` table has no compound index, so it filters on `synced`.
   *  - E-OFF-2: when the session is fully drained (row deleted AND no unsynced
   *    child rows remain), its encryption key (`filloutKeys`) is destroyed too so
   *    no key material lingers. The key is kept while ANY unsynced ciphertext for
   *    the session survives — destroying it would render that data permanently
   *    unreadable before it has synced.
   */
  async purgeSyncedSessionData(sessionId: string): Promise<void> {
    await this.transaction('rw',
      [
        this.filloutSessions,
        this.filloutResponses,
        this.filloutEvents,
        this.filloutVariables,
        this.filloutTrials,
        this.filloutKeys,
      ],
      async () => {
        await this.filloutResponses
          .where('[sessionId+synced]')
          .equals([sessionId, 1])
          .delete();
        await this.filloutEvents
          .where('[sessionId+synced]')
          .equals([sessionId, 1])
          .delete();
        await this.filloutVariables
          .where('sessionId')
          .equals(sessionId)
          .filter((v) => v.synced === 1)
          .delete();
        // Per-trial rows follow the same synced-only crypto-erase (RT-1b).
        await this.filloutTrials
          .where('[sessionId+synced]')
          .equals([sessionId, 1])
          .delete();

        const sessionRow = await this.filloutSessions.get(sessionId);
        const sessionDeleted = !!sessionRow && sessionRow.synced === 1;
        if (sessionDeleted) {
          await this.filloutSessions.delete(sessionId);
        }

        // Destroy the per-session key only once nothing readable remains for it.
        const remaining =
          (await this.filloutResponses.where('sessionId').equals(sessionId).count()) +
          (await this.filloutEvents.where('sessionId').equals(sessionId).count()) +
          (await this.filloutVariables.where('sessionId').equals(sessionId).count()) +
          (await this.filloutTrials.where('sessionId').equals(sessionId).count());
        if (sessionDeleted && remaining === 0) {
          await this.filloutKeys.delete(sessionId);
        }
      }
    );
  }

  /**
   * Wipe ALL fillout participant data from this device — the shared-device
   * "End session / clear this device" action (F005). Clears sessions,
   * responses, events, and variables regardless of `synced` flag, so the
   * caller MUST warn about (and confirm past) any unsynced records first;
   * losing an unsynced record here is intentional user-driven data loss.
   *
   * The cached questionnaire DEFINITIONS (`filloutQuestionnaires`) and media
   * accounting (`filloutMedia`) are intentionally left: they hold only public,
   * non-participant content (the survey itself), are keyed by public access
   * code, and re-download on next use. Clearing them here would evict another
   * participant's in-flight definition pin without cleaning the paired Cache-API
   * store, so definition/media GC stays owned by FilloutContentCache.
   */
  /**
   * FORCE-discard EVERY record for one session, regardless of sync state (F-53) — backs the
   * "discard a previous study's unsubmittable answers" affordance. Unlike
   * {@link purgeSyncedSessionData} this drops UNSYNCED rows too, deletes the session row,
   * clears its sync-ledger entries, and crypto-erases the session's encryption key
   * (`filloutKeys`) so any residual ciphertext becomes permanently unreadable. This is
   * intentional, irreversible data loss: callers MUST confirm and offer export first.
   */
  async purgeSessionCompletely(sessionId: string): Promise<void> {
    await this.transaction('rw',
      [
        this.filloutSessions,
        this.filloutResponses,
        this.filloutEvents,
        this.filloutVariables,
        this.filloutTrials,
        this.filloutKeys,
        this.filloutSyncLedger,
      ],
      async () => {
        await this.filloutResponses.where('sessionId').equals(sessionId).delete();
        await this.filloutEvents.where('sessionId').equals(sessionId).delete();
        await this.filloutVariables.where('sessionId').equals(sessionId).delete();
        await this.filloutTrials.where('sessionId').equals(sessionId).delete();
        await this.filloutSessions.delete(sessionId);
        await this.filloutKeys.delete(sessionId);
        await this.filloutSyncLedger.where('sessionId').equals(sessionId).delete();
      }
    );
  }

  async clearAllFilloutData(): Promise<void> {
    await this.transaction('rw',
      [
        this.filloutSessions,
        this.filloutResponses,
        this.filloutEvents,
        this.filloutVariables,
        this.filloutTrials,
      ],
      async () => {
        await Promise.all([
          this.filloutSessions.clear(),
          this.filloutResponses.clear(),
          this.filloutEvents.clear(),
          this.filloutVariables.clear(),
          this.filloutTrials.clear()
        ]);
      }
    );
  }

  /**
   * Hard "clear this device" for the shared/kiosk research device (E-OFF-2 step 6,
   * surfaced by the shared-device UX in E-OFF-6). Wipes EVERY fillout store —
   * participant data (sessions/responses/events/variables), cached definitions +
   * media accounting, server-variable aggregates, AND the encryption keys
   * (`filloutKeys`) — then deletes the `fillout-media-v2` Cache-API store.
   *
   * Destroying `filloutKeys` is the security payload: any residual UNSYNCED
   * ciphertext left behind (a row a concurrent purge could not remove) becomes
   * permanently undecryptable once its wrapping key is gone. The caller MUST warn
   * about and confirm past any unsynced data first — this is intentional,
   * user-driven, irreversible data loss.
   */
  async clearThisDevice(): Promise<void> {
    await this.transaction('rw',
      [
        this.filloutSessions,
        this.filloutResponses,
        this.filloutEvents,
        this.filloutVariables,
        this.filloutTrials,
        this.filloutQuestionnaires,
        this.filloutMedia,
        this.filloutServerVariables,
        this.filloutKeys,
        this.filloutSyncLedger,
      ],
      async () => {
        await Promise.all([
          this.filloutSessions.clear(),
          this.filloutResponses.clear(),
          this.filloutEvents.clear(),
          this.filloutVariables.clear(),
          this.filloutTrials.clear(),
          this.filloutQuestionnaires.clear(),
          this.filloutMedia.clear(),
          this.filloutServerVariables.clear(),
          this.filloutKeys.clear(),
          this.filloutSyncLedger.clear()
        ]);
      }
    );

    // Evict the paired media blobs. Cache name mirrors FilloutContentCache.MEDIA_CACHE_NAME.
    if (typeof caches !== 'undefined') {
      try {
        await caches.delete('fillout-media-v2');
      } catch {
        // Cache API unavailable / already gone — the IndexedDB wipe above stands.
      }
    }
  }
}

// Create and export database instance
export const db = new QDesignerDatabase();

/**
 * Reopen the connection if it was closed under us. In a shared/kiosk profile
 * (many tabs, past schema upgrades) another tab opening a NEWER schema version
 * makes Dexie close THIS tab's connection so it doesn't block the upgrade — after
 * which the in-flight read/write throws `DatabaseClosedError` (the opaque
 * "DexieError2" seen in the console). Dexie 4 keeps auto-open on across that close
 * so the NEXT operation reopens on its own; this helper lets a hot write path
 * force the reopen and retry the very operation that was interrupted.
 */
export async function ensureDbOpen(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }
}

// Open database on import
db.open().catch(err => {
  console.error('Failed to open IndexedDB:', err);
});

// Cleanup expired resources periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    db.cleanupExpiredResources().catch(console.error);
  }, 60 * 60 * 1000); // Every hour
}
