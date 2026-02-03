import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflinePersistenceService } from '$lib/services/offlinePersistence';
import { db } from '$lib/services/db/indexeddb';
import { createTestQuestionnaire } from '../factories/questionnaire.factory';
import { get } from 'svelte/store';
import { isOnline } from '$lib/stores/network';

// Mock network store
vi.mock('$lib/stores/network', () => ({
  isOnline: {
    subscribe: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
  }
}));

// Mock Supabase persistence
vi.mock('$lib/services/questionnairePersistence', () => ({
  QuestionnairePersistenceService: {
    saveQuestionnaire: vi.fn(),
    loadQuestionnaire: vi.fn()
  }
}));

describe('OfflinePersistenceService', () => {
  const testUserId = 'test-user-123';
  
  beforeEach(async () => {
    // Clear IndexedDB
    await db.questionnaires.clear();
    await db.syncQueue.clear();
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Default to online
    vi.mocked(get).mockReturnValue(true);
  });
  
  afterEach(() => {
    OfflinePersistenceService.stopSync();
  });
  
  describe('saveQuestionnaire', () => {
    it('should save to IndexedDB when offline', async () => {
      // Set offline
      vi.mocked(get).mockReturnValue(false);
      
      const questionnaire = createTestQuestionnaire();
      const result = await OfflinePersistenceService.saveQuestionnaire(questionnaire, testUserId);
      
      expect(result.success).toBe(true);
      expect(result.savedOffline).toBe(true);
      expect(result.syncPending).toBe(true);
      
      // Verify saved to IndexedDB
      const saved = await db.questionnaires.get(questionnaire.id);
      expect(saved).toBeDefined();
      expect(saved?.data).toEqual(questionnaire);
      expect(saved?.userId).toBe(testUserId);
      
      // Verify sync queue entry created
      const queueItems = await db.syncQueue.toArray();
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0]).toMatchObject({
        type: 'questionnaire',
        action: 'save',
        data: questionnaire,
        userId: testUserId
      });
    });
    
    it('should save to both IndexedDB and server when online', async () => {
      // Set online
      vi.mocked(get).mockReturnValue(true);
      
      const questionnaire = createTestQuestionnaire();
      const mockSaveQuestionnaire = vi.fn().mockResolvedValue(true);
      
      // Mock the import
      const { QuestionnairePersistenceService } = await import('$lib/services/questionnairePersistence');
      QuestionnairePersistenceService.saveQuestionnaire = mockSaveQuestionnaire;
      
      const result = await OfflinePersistenceService.saveQuestionnaire(questionnaire, testUserId);
      
      expect(result.success).toBe(true);
      expect(result.savedOffline).toBe(false);
      expect(result.syncPending).toBe(false);
      
      // Verify saved to IndexedDB
      const saved = await db.questionnaires.get(questionnaire.id);
      expect(saved).toBeDefined();
      expect(saved?.synced).toBe(true);
      
      // Verify server save was called
      expect(mockSaveQuestionnaire).toHaveBeenCalledWith(questionnaire, testUserId);
    });
    
    it('should handle server save failure gracefully', async () => {
      // Set online
      vi.mocked(get).mockReturnValue(true);
      
      const questionnaire = createTestQuestionnaire();
      const mockSaveQuestionnaire = vi.fn().mockRejectedValue(new Error('Server error'));
      
      const { QuestionnairePersistenceService } = await import('$lib/services/questionnairePersistence');
      QuestionnairePersistenceService.saveQuestionnaire = mockSaveQuestionnaire;
      
      const result = await OfflinePersistenceService.saveQuestionnaire(questionnaire, testUserId);
      
      expect(result.success).toBe(true);
      expect(result.savedOffline).toBe(true);
      expect(result.syncPending).toBe(true);
      expect(result.error).toContain('Failed to sync');
      
      // Verify still saved to IndexedDB
      const saved = await db.questionnaires.get(questionnaire.id);
      expect(saved).toBeDefined();
      expect(saved?.synced).toBe(false);
      
      // Verify sync queue entry created
      const queueItems = await db.syncQueue.toArray();
      expect(queueItems).toHaveLength(1);
    });
  });
  
  describe('loadQuestionnaire', () => {
    it('should load from IndexedDB when offline', async () => {
      // Set offline
      vi.mocked(get).mockReturnValue(false);
      
      const questionnaire = createTestQuestionnaire();
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        data: questionnaire,
        lastModified: new Date(),
        synced: false
      });
      
      const loaded = await OfflinePersistenceService.loadQuestionnaire(questionnaire.id, testUserId);
      
      expect(loaded).toEqual(questionnaire);
    });
    
    it('should try server first when online, fall back to IndexedDB', async () => {
      // Set online
      vi.mocked(get).mockReturnValue(true);
      
      const questionnaire = createTestQuestionnaire();
      const serverQuestionnaire = { ...questionnaire, modified: new Date() };
      
      const mockLoadQuestionnaire = vi.fn().mockResolvedValue(serverQuestionnaire);
      const { QuestionnairePersistenceService } = await import('$lib/services/questionnairePersistence');
      QuestionnairePersistenceService.loadQuestionnaire = mockLoadQuestionnaire;
      
      // Add to IndexedDB
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        data: questionnaire,
        lastModified: new Date(),
        synced: true
      });
      
      const loaded = await OfflinePersistenceService.loadQuestionnaire(questionnaire.id, testUserId);
      
      expect(loaded).toEqual(serverQuestionnaire);
      expect(mockLoadQuestionnaire).toHaveBeenCalledWith(questionnaire.id, testUserId);
      
      // Verify IndexedDB was updated with server version
      const cached = await db.questionnaires.get(questionnaire.id);
      expect(cached?.data).toEqual(serverQuestionnaire);
    });
    
    it('should return null when questionnaire not found', async () => {
      const loaded = await OfflinePersistenceService.loadQuestionnaire('non-existent', testUserId);
      expect(loaded).toBeNull();
    });
  });
  
  describe('sync queue processing', () => {
    it('should process sync queue when going online', async () => {
      const questionnaire = createTestQuestionnaire();
      
      // Add items to sync queue
      await db.syncQueue.add({
        id: 'sync-1',
        type: 'questionnaire',
        action: 'save',
        data: questionnaire,
        userId: testUserId,
        timestamp: new Date(),
        retries: 0
      });
      
      const mockSaveQuestionnaire = vi.fn().mockResolvedValue(true);
      const { QuestionnairePersistenceService } = await import('$lib/services/questionnairePersistence');
      QuestionnairePersistenceService.saveQuestionnaire = mockSaveQuestionnaire;
      
      // Start sync
      vi.mocked(get).mockReturnValue(true);
      await OfflinePersistenceService.startSync(testUserId);
      
      // Wait for sync to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify sync was attempted
      expect(mockSaveQuestionnaire).toHaveBeenCalledWith(questionnaire, testUserId);
      
      // Verify queue was cleared
      const remaining = await db.syncQueue.toArray();
      expect(remaining).toHaveLength(0);
    });
    
    it('should retry failed sync operations', async () => {
      const questionnaire = createTestQuestionnaire();
      
      // Add item to sync queue
      await db.syncQueue.add({
        id: 'sync-1',
        type: 'questionnaire',
        action: 'save',
        data: questionnaire,
        userId: testUserId,
        timestamp: new Date(),
        retries: 0
      });
      
      // First attempt fails
      const mockSaveQuestionnaire = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true);
        
      const { QuestionnairePersistenceService } = await import('$lib/services/questionnairePersistence');
      QuestionnairePersistenceService.saveQuestionnaire = mockSaveQuestionnaire;
      
      // Start sync
      vi.mocked(get).mockReturnValue(true);
      await OfflinePersistenceService.processSyncQueue(testUserId);
      
      // Verify retry count increased
      const queueItems = await db.syncQueue.toArray();
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0].retries).toBe(1);
      
      // Process again - should succeed
      await OfflinePersistenceService.processSyncQueue(testUserId);
      
      // Verify queue cleared after success
      const remaining = await db.syncQueue.toArray();
      expect(remaining).toHaveLength(0);
    });
    
    it('should give up after max retries', async () => {
      const questionnaire = createTestQuestionnaire();
      
      // Add item with max retries already
      await db.syncQueue.add({
        id: 'sync-1',
        type: 'questionnaire',
        action: 'save',
        data: questionnaire,
        userId: testUserId,
        timestamp: new Date(),
        retries: 5 // Max retries
      });
      
      const mockSaveQuestionnaire = vi.fn().mockRejectedValue(new Error('Persistent error'));
      const { QuestionnairePersistenceService } = await import('$lib/services/questionnairePersistence');
      QuestionnairePersistenceService.saveQuestionnaire = mockSaveQuestionnaire;
      
      // Process sync
      await OfflinePersistenceService.processSyncQueue(testUserId);
      
      // Verify item was removed from queue
      const remaining = await db.syncQueue.toArray();
      expect(remaining).toHaveLength(0);
    });
  });
  
  describe('conflict detection', () => {
    it('should detect conflicts when local and server versions differ', async () => {
      const localQuestionnaire = createTestQuestionnaire({
        name: 'Local Version',
        modified: new Date('2024-01-01')
      });
      
      const serverQuestionnaire = {
        ...localQuestionnaire,
        name: 'Server Version',
        modified: new Date('2024-01-02')
      };
      
      // Add local version
      await db.questionnaires.add({
        id: localQuestionnaire.id,
        userId: testUserId,
        data: localQuestionnaire,
        lastModified: localQuestionnaire.modified,
        synced: false
      });
      
      const hasConflict = await OfflinePersistenceService.checkForConflicts(
        localQuestionnaire.id,
        serverQuestionnaire,
        testUserId
      );
      
      expect(hasConflict).toBe(true);
    });
    
    it('should not detect conflict when versions are the same', async () => {
      const questionnaire = createTestQuestionnaire();
      
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        data: questionnaire,
        lastModified: questionnaire.modified,
        synced: true
      });
      
      const hasConflict = await OfflinePersistenceService.checkForConflicts(
        questionnaire.id,
        questionnaire,
        testUserId
      );
      
      expect(hasConflict).toBe(false);
    });
  });
  
  describe('cache management', () => {
    it('should clean up old cached data', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days old
      
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1); // 1 day old
      
      // Add old and recent questionnaires
      await db.questionnaires.bulkAdd([
        {
          id: 'old-1',
          userId: testUserId,
          data: createTestQuestionnaire({ id: 'old-1' }),
          lastModified: oldDate,
          synced: true
        },
        {
          id: 'recent-1',
          userId: testUserId,
          data: createTestQuestionnaire({ id: 'recent-1' }),
          lastModified: recentDate,
          synced: true
        }
      ]);
      
      await OfflinePersistenceService.cleanupOldData();
      
      // Verify old data removed, recent data kept
      const remaining = await db.questionnaires.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('recent-1');
    });
    
    it('should not clean up unsynced data regardless of age', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days old
      
      await db.questionnaires.add({
        id: 'old-unsynced',
        userId: testUserId,
        data: createTestQuestionnaire({ id: 'old-unsynced' }),
        lastModified: oldDate,
        synced: false // Not synced
      });
      
      await OfflinePersistenceService.cleanupOldData();
      
      // Verify unsynced data was kept
      const remaining = await db.questionnaires.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('old-unsynced');
    });
  });
});