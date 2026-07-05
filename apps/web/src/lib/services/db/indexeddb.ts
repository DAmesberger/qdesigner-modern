import Dexie, { type Table } from 'dexie';
import type { Questionnaire } from '$lib/shared';

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
  synced: 0 | 1;
}

export interface FilloutVariable {
  sessionId: string;
  name: string;
  value: unknown;
  synced: 0 | 1;
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
   */
  async purgeSyncedSessionData(sessionId: string): Promise<void> {
    await this.transaction('rw',
      this.filloutSessions,
      this.filloutResponses,
      this.filloutEvents,
      this.filloutVariables,
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

        const sessionRow = await this.filloutSessions.get(sessionId);
        if (sessionRow && sessionRow.synced === 1) {
          await this.filloutSessions.delete(sessionId);
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
  async clearAllFilloutData(): Promise<void> {
    await this.transaction('rw',
      this.filloutSessions,
      this.filloutResponses,
      this.filloutEvents,
      this.filloutVariables,
      async () => {
        await Promise.all([
          this.filloutSessions.clear(),
          this.filloutResponses.clear(),
          this.filloutEvents.clear(),
          this.filloutVariables.clear()
        ]);
      }
    );
  }
}

// Create and export database instance
export const db = new QDesignerDatabase();

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
