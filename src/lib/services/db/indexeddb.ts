import Dexie, { type Table } from 'dexie';
import type { Questionnaire, Question, Page, Variable } from '$lib/shared/types/types';

export interface SyncQueueItem {
  id?: string;
  timestamp: number;
  operation: 'create' | 'update' | 'delete';
  table: string;
  recordId: string;
  data: any;
  userId: string;
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

class QDesignerDatabase extends Dexie {
  // Tables
  questionnaires!: Table<OfflineQuestionnaire>;
  syncQueue!: Table<SyncQueueItem>;
  resources!: Table<CachedResource>;
  drafts!: Table<DraftData>;

  constructor() {
    super('QDesignerOfflineDB');
    
    // Define schema
    this.version(1).stores({
      questionnaires: 'id, userId, syncStatus, lastModified',
      syncQueue: '++id, userId, status, timestamp, [userId+status]',
      resources: 'id, url, lastAccessed, expiresAt',
      drafts: 'id, userId, questionnaireId, timestamp, [userId+questionnaireId]'
    });
  }

  // Helper methods
  async saveQuestionnaire(questionnaire: Questionnaire, userId: string): Promise<void> {
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
        userId
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