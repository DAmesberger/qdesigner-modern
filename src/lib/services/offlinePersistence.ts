import { db, type SyncQueueItem } from './db/indexeddb';
import { QuestionnairePersistenceService } from './questionnairePersistence';
import { isOnline } from './offline';
import { get } from 'svelte/store';
import { toast } from '$lib/stores/toast';
import type { Questionnaire } from '$lib/shared';

export interface OfflineSaveResult {
  success: boolean;
  questionnaireId?: string;
  isOffline?: boolean;
  error?: string;
}

export class OfflinePersistenceService {
  private static syncInProgress = false;
  private static syncInterval: NodeJS.Timeout | null = null;

  /**
   * Save questionnaire with offline support
   */
  static async saveQuestionnaire(questionnaire: Questionnaire, userId: string): Promise<OfflineSaveResult> {
    try {
      // Always save to IndexedDB first (offline-first)
      await db.saveQuestionnaire(questionnaire, userId);
      
      // Save draft for recovery
      await db.saveDraft(questionnaire.id, questionnaire, userId, true);

      // If online, sync to server
      if (get(isOnline)) {
        try {
          const result = await QuestionnairePersistenceService.saveQuestionnaire(questionnaire, userId);
          
          if (result.success) {
            // Mark as synced in IndexedDB
            await db.questionnaires.update(questionnaire.id, {
              syncStatus: 'synced',
              serverVersion: (await db.questionnaires.get(questionnaire.id))?.localVersion
            });
            
            // Clear drafts on successful save
            await db.clearDrafts(questionnaire.id, userId);
          }
          
          return result;
        } catch (error) {
          console.error('Online save failed, data saved offline:', error);
          // Continue with offline save
        }
      }

      // Offline save successful
      return {
        success: true,
        questionnaireId: questionnaire.id,
        isOffline: true
      };
    } catch (error) {
      console.error('Error saving questionnaire:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Load questionnaire with offline fallback
   */
  static async loadQuestionnaire(questionnaireId: string, userId: string): Promise<{
    success: boolean;
    questionnaire?: Questionnaire;
    isOffline?: boolean;
    error?: string;
  }> {
    try {
      // Try to load from server first if online
      if (get(isOnline)) {
        try {
          const result = await QuestionnairePersistenceService.loadQuestionnaire(questionnaireId);
          
          if (result.success && result.questionnaire) {
            // Update IndexedDB with server version
            await db.saveQuestionnaire(result.questionnaire, userId);
            await db.questionnaires.update(questionnaireId, {
              syncStatus: 'synced',
              serverVersion: (await db.questionnaires.get(questionnaireId))?.localVersion
            });
            
            return result;
          }
        } catch (error) {
          console.error('Online load failed, trying offline:', error);
        }
      }

      // Load from IndexedDB
      const questionnaire = await db.getQuestionnaire(questionnaireId, userId);
      
      if (questionnaire) {
        return {
          success: true,
          questionnaire,
          isOffline: true
        };
      }

      return {
        success: false,
        error: 'Questionnaire not found'
      };
    } catch (error) {
      console.error('Error loading questionnaire:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * List questionnaires from offline storage
   */
  static async listQuestionnaires(userId: string): Promise<any[]> {
    try {
      // If online, try to get fresh list
      if (get(isOnline)) {
        try {
          const result = await QuestionnairePersistenceService.listQuestionnaires(userId);
          if (result.success) {
            // Update local cache with server list
            // This is a simplified approach - in production you'd want more sophisticated sync
            return result.questionnaires || [];
          }
        } catch (error) {
          console.error('Online list failed, using offline:', error);
        }
      }

      // Get from IndexedDB
      const offlineQuestionnaires = await db.listQuestionnaires(userId);
      
      return offlineQuestionnaires.map(oq => ({
        id: oq.questionnaire.id,
        name: oq.questionnaire.name,
        description: oq.questionnaire.description,
        version: oq.questionnaire.version,
        created_at: new Date(oq.questionnaire.created).toISOString(),
        updated_at: new Date(oq.lastModified).toISOString(),
        syncStatus: oq.syncStatus
      }));
    } catch (error) {
      console.error('Error listing questionnaires:', error);
      return [];
    }
  }

  /**
   * Start automatic sync process
   */
  static startSync(userId: string) {
    if (this.syncInterval) {
      return; // Already running
    }

    // Initial sync
    this.syncPendingChanges(userId);

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      if (get(isOnline) && !this.syncInProgress) {
        this.syncPendingChanges(userId);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop automatic sync
   */
  static stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Sync all pending changes
   */
  static async syncPendingChanges(userId: string) {
    if (this.syncInProgress || !get(isOnline)) {
      return;
    }

    this.syncInProgress = true;
    
    try {
      const pendingItems = await db.getPendingSyncItems(userId);
      
      if (pendingItems.length === 0) {
        return;
      }

      toast.info(`Syncing ${pendingItems.length} pending changes...`);
      
      let successCount = 0;
      let failCount = 0;

      for (const item of pendingItems) {
        try {
          await this.syncItem(item);
          await db.markSyncItemComplete(item.id!);
          successCount++;
        } catch (error) {
          console.error('Sync failed for item:', item, error);
          await db.markSyncItemFailed(item.id!, error instanceof Error ? error.message : 'Unknown error');
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Synced ${successCount} changes successfully`);
      }
      
      if (failCount > 0) {
        toast.error(`Failed to sync ${failCount} changes`, {
          action: {
            label: 'Retry',
            onClick: () => this.syncPendingChanges(userId)
          }
        });
      }
    } catch (error) {
      console.error('Sync process failed:', error);
      toast.error('Sync failed. Will retry when online.');
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync a single item
   */
  private static async syncItem(item: SyncQueueItem) {
    switch (item.table) {
      case 'questionnaires':
        switch (item.operation) {
          case 'create':
          case 'update':
            return await QuestionnairePersistenceService.saveQuestionnaire(
              item.data,
              item.userId
            );
          case 'delete':
            return await QuestionnairePersistenceService.deleteQuestionnaire(
              item.recordId,
              item.userId
            );
        }
        break;
      // Add other table types as needed
    }
  }

  /**
   * Get storage usage information
   */
  static async getStorageInfo() {
    const usage = await db.getStorageUsage();
    const estimate = await navigator.storage?.estimate();
    
    return {
      used: usage.used,
      items: usage.items,
      quota: estimate?.quota || 0,
      percentUsed: estimate ? (estimate.usage || 0) / (estimate.quota || 1) * 100 : 0
    };
  }

  /**
   * Clear all offline data
   */
  static async clearOfflineData() {
    await db.clearAllData();
    toast.info('Offline data cleared');
  }

  /**
   * Check for conflicts between local and server versions
   */
  static async checkForConflicts(userId: string): Promise<Array<{
    questionnaireId: string;
    localVersion: number;
    serverVersion?: number;
  }>> {
    const conflicts: Array<any> = [];
    const localQuestionnaires = await db.listQuestionnaires(userId);
    
    for (const local of localQuestionnaires) {
      if (local.syncStatus === 'pending' && local.serverVersion !== undefined) {
        if (local.localVersion > (local.serverVersion || 0) + 1) {
          conflicts.push({
            questionnaireId: local.id,
            localVersion: local.localVersion,
            serverVersion: local.serverVersion
          });
        }
      }
    }
    
    return conflicts;
  }
}