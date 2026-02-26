import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OfflinePersistenceService } from '$lib/services/offlinePersistence';
import { db } from '$lib/services/db/indexeddb';
import { createTestQuestionnaire } from '../factories/questionnaire.factory';

// Use vi.hoisted so the store is created before vi.mock factories run (vi.mock is hoisted)
const { isOnlineStore } = vi.hoisted(() => {
  // Inline a minimal writable store to avoid import issues in hoisted context
  function writable(initial: boolean) {
    let value = initial;
    const subscribers = new Set<(v: boolean) => void>();
    return {
      set(v: boolean) { value = v; subscribers.forEach(fn => fn(v)); },
      update(fn: (v: boolean) => boolean) { value = fn(value); subscribers.forEach(s => s(value)); },
      subscribe(fn: (v: boolean) => void) {
        fn(value);
        subscribers.add(fn);
        return () => { subscribers.delete(fn); };
      }
    };
  }
  return { isOnlineStore: writable(true) };
});

// Mock the offline service (where isOnline is actually imported from)
vi.mock('$lib/services/offline', () => ({
  isOnline: isOnlineStore,
  isOffline: { subscribe: (fn: any) => isOnlineStore.subscribe((v: boolean) => fn(!v)) },
  offline: { subscribe: (fn: any) => { fn({ isOnline: true, isServiceWorkerReady: false, hasUpdate: false, syncPending: false }); return () => {}; } }
}));

// Mock persistence service
vi.mock('$lib/services/questionnairePersistence', () => ({
  QuestionnairePersistenceService: {
    saveQuestionnaire: vi.fn(),
    loadQuestionnaire: vi.fn(),
    listQuestionnaires: vi.fn(),
    deleteQuestionnaire: vi.fn()
  }
}));

// Mock toast store to prevent errors from toast calls
vi.mock('$lib/stores/toast', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}));

describe('OfflinePersistenceService', () => {
  const testUserId = 'test-user-123';
  const testProjectId = 'test-project-123';
  const testOrgId = 'test-org-123';

  beforeEach(async () => {
    // Clear IndexedDB tables
    await db.questionnaires.clear();
    await db.syncQueue.clear();
    await db.drafts.clear();
    await db.resources.clear();

    // Reset mocks
    vi.clearAllMocks();

    // Default to online
    isOnlineStore.set(true);
  });

  afterEach(() => {
    OfflinePersistenceService.stopSync();
  });

  describe('saveQuestionnaire', () => {
    it('should save to IndexedDB when offline', async () => {
      // Set offline
      isOnlineStore.set(false);

      const questionnaire = createTestQuestionnaire();
      const result = await OfflinePersistenceService.saveQuestionnaire(
        questionnaire, testUserId, testProjectId, testOrgId
      );

      expect(result.success).toBe(true);
      expect(result.isOffline).toBe(true);
      expect(result.questionnaireId).toBe(questionnaire.id);

      // Verify saved to IndexedDB
      const saved = await db.questionnaires.get(questionnaire.id);
      expect(saved).toBeDefined();
      expect(saved?.questionnaire).toEqual(questionnaire);
      expect(saved?.userId).toBe(testUserId);

      // Verify sync queue entry created
      const queueItems = await db.syncQueue.toArray();
      expect(queueItems.length).toBeGreaterThanOrEqual(1);
      expect(queueItems[0]).toMatchObject({
        table: 'questionnaires',
        operation: 'create',
        recordId: questionnaire.id,
        userId: testUserId,
        status: 'pending'
      });
    });

    it('should save to both IndexedDB and server when online', async () => {
      // Set online
      isOnlineStore.set(true);

      const questionnaire = createTestQuestionnaire();

      const { QuestionnairePersistenceService: MockPersistence } = await import('$lib/services/questionnairePersistence');
      vi.mocked(MockPersistence.saveQuestionnaire).mockResolvedValue({
        success: true,
        questionnaireId: questionnaire.id
      });

      const result = await OfflinePersistenceService.saveQuestionnaire(
        questionnaire, testUserId, testProjectId, testOrgId
      );

      expect(result.success).toBe(true);

      // Verify saved to IndexedDB
      const saved = await db.questionnaires.get(questionnaire.id);
      expect(saved).toBeDefined();

      // Verify server save was called
      expect(MockPersistence.saveQuestionnaire).toHaveBeenCalledWith(questionnaire, testProjectId);
    });

    it('should handle server save failure gracefully', async () => {
      // Set online
      isOnlineStore.set(true);

      const questionnaire = createTestQuestionnaire();

      const { QuestionnairePersistenceService: MockPersistence } = await import('$lib/services/questionnairePersistence');
      vi.mocked(MockPersistence.saveQuestionnaire).mockRejectedValue(new Error('Server error'));

      const result = await OfflinePersistenceService.saveQuestionnaire(
        questionnaire, testUserId, testProjectId, testOrgId
      );

      // Should still succeed with offline save
      expect(result.success).toBe(true);
      expect(result.isOffline).toBe(true);

      // Verify still saved to IndexedDB
      const saved = await db.questionnaires.get(questionnaire.id);
      expect(saved).toBeDefined();
      expect(saved?.questionnaire).toEqual(questionnaire);
    });
  });

  describe('loadQuestionnaire', () => {
    it('should load from IndexedDB when offline', async () => {
      // Set offline
      isOnlineStore.set(false);

      const questionnaire = createTestQuestionnaire();
      // Pre-populate IndexedDB
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'pending',
        localVersion: 1
      });

      const result = await OfflinePersistenceService.loadQuestionnaire(questionnaire.id, testUserId);

      expect(result.success).toBe(true);
      expect(result.questionnaire).toEqual(questionnaire);
      expect(result.isOffline).toBe(true);
    });

    it('should try server first when online, fall back to IndexedDB', async () => {
      // Set online
      isOnlineStore.set(true);

      const questionnaire = createTestQuestionnaire();
      const serverQuestionnaire = { ...questionnaire, name: 'Server Version' };

      const { QuestionnairePersistenceService: MockPersistence } = await import('$lib/services/questionnairePersistence');
      vi.mocked(MockPersistence.loadQuestionnaire).mockResolvedValue({
        success: true,
        questionnaire: serverQuestionnaire
      });

      // Add to IndexedDB as well
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'synced',
        localVersion: 1
      });

      const result = await OfflinePersistenceService.loadQuestionnaire(
        questionnaire.id, testUserId, testProjectId
      );

      expect(result.success).toBe(true);
      expect(result.questionnaire).toEqual(serverQuestionnaire);
      expect(MockPersistence.loadQuestionnaire).toHaveBeenCalledWith(testProjectId, questionnaire.id);
    });

    it('should return failure when questionnaire not found', async () => {
      // Set offline so it only checks IndexedDB
      isOnlineStore.set(false);

      const result = await OfflinePersistenceService.loadQuestionnaire('non-existent', testUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Questionnaire not found');
    });
  });

  describe('sync management', () => {
    it('should start and stop sync process', async () => {
      OfflinePersistenceService.startSync(testUserId);
      // Should not throw

      OfflinePersistenceService.stopSync();
      // Should not throw
    });

    it('should sync pending changes when online', async () => {
      const questionnaire = createTestQuestionnaire();

      // Add questionnaire to IndexedDB first (needed for the sync queue to reference it)
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'pending',
        localVersion: 1
      });

      // Add item to sync queue
      await db.syncQueue.add({
        timestamp: Date.now(),
        operation: 'update',
        table: 'questionnaires',
        recordId: questionnaire.id,
        data: { ...questionnaire, projectId: testProjectId },
        userId: testUserId,
        organizationId: testOrgId,
        projectId: testProjectId,
        retryCount: 0,
        status: 'pending'
      });

      const { QuestionnairePersistenceService: MockPersistence } = await import('$lib/services/questionnairePersistence');
      vi.mocked(MockPersistence.saveQuestionnaire).mockResolvedValue({
        success: true,
        questionnaireId: questionnaire.id
      });

      // Set online and sync
      isOnlineStore.set(true);
      await OfflinePersistenceService.syncPendingChanges(testUserId);

      // Verify sync was attempted
      expect(MockPersistence.saveQuestionnaire).toHaveBeenCalled();
    });

    it('should not sync when offline', async () => {
      isOnlineStore.set(false);

      const { QuestionnairePersistenceService: MockPersistence } = await import('$lib/services/questionnairePersistence');

      await OfflinePersistenceService.syncPendingChanges(testUserId);

      // Should not attempt any server calls when offline
      expect(MockPersistence.saveQuestionnaire).not.toHaveBeenCalled();
    });
  });

  describe('conflict detection', () => {
    it('should detect conflicts when local version is ahead of server version', async () => {
      const questionnaire = createTestQuestionnaire();

      // Add questionnaire with local version much higher than server version
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'pending',
        serverVersion: 1,
        localVersion: 5
      });

      const conflicts = await OfflinePersistenceService.checkForConflicts(testUserId);

      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]).toMatchObject({
        questionnaireId: questionnaire.id,
        localVersion: 5,
        serverVersion: 1
      });
    });

    it('should not detect conflict when versions are close', async () => {
      const questionnaire = createTestQuestionnaire();

      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'synced',
        serverVersion: 1,
        localVersion: 1
      });

      const conflicts = await OfflinePersistenceService.checkForConflicts(testUserId);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('storage management', () => {
    it('should clear all offline data', async () => {
      const questionnaire = createTestQuestionnaire();

      // Add some data
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'synced',
        localVersion: 1
      });

      await db.syncQueue.add({
        timestamp: Date.now(),
        operation: 'create',
        table: 'questionnaires',
        recordId: questionnaire.id,
        data: questionnaire,
        userId: testUserId,
        organizationId: testOrgId,
        retryCount: 0,
        status: 'pending'
      });

      // Clear everything
      await OfflinePersistenceService.clearOfflineData();

      // Verify all tables are empty
      const questionnaires = await db.questionnaires.toArray();
      const syncItems = await db.syncQueue.toArray();

      expect(questionnaires).toHaveLength(0);
      expect(syncItems).toHaveLength(0);
    });

    it('should report storage usage', async () => {
      const questionnaire = createTestQuestionnaire();

      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUserId,
        questionnaire: questionnaire,
        lastModified: Date.now(),
        syncStatus: 'synced',
        localVersion: 1
      });

      const usage = await db.getStorageUsage();

      expect(usage.items).toBeGreaterThan(0);
      expect(usage.used).toBeGreaterThan(0);
    });
  });
});
