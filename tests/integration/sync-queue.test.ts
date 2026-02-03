import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { SupabaseTestInstance } from '../utils/supabase-test';
import { OfflinePersistenceService } from '$lib/services/offlinePersistence';
import { db } from '$lib/services/db/indexeddb';
import { createTestQuestionnaire, createCompleteQuestionnaire } from '../factories/questionnaire.factory';
  import { QuestionnairePersistenceService } from "$lib/services/questionnairePersistence";

describe('Sync Queue Integration Tests', () => {
  let testDb: SupabaseTestInstance;
  let testUser: any;
  let testOrg: any;
  let testProject: any;
  
  beforeAll(async () => {
    // Set up test database
    testDb = new SupabaseTestInstance('sync-queue-tests');
    await testDb.setup();
    
    // Create test organization and user
    testOrg = await testDb.createTestOrganization('Sync Test Org');
    testUser = await testDb.createTestUser({
      email: 'sync-test@example.com',
      role: 'editor',
      organizationId: testOrg.id
    });
    
    // Create test project
    testProject = await testDb.createTestProject(testOrg.id, 'Sync Test Project');
    
    // Configure persistence service to use test database
    QuestionnairePersistenceService.configure({
      supabaseClient: testDb.serviceClient
    });
  });
  
  afterAll(async () => {
    await testDb.cleanup();
  });
  
  beforeEach(async () => {
    // Clear IndexedDB before each test
    await db.questionnaires.clear();
    await db.syncQueue.clear();
    await db.drafts.clear();
    
    // Sign in test user
    await testDb.signIn(testUser);
  });
  
  afterEach(() => {
    // Stop any running sync
    OfflinePersistenceService.stopSync();
  });
  
  describe('Basic sync operations', () => {
    it('should sync a new questionnaire when coming online', async () => {
      // Create questionnaire while "offline"
      const questionnaire = createTestQuestionnaire({
        projectId: testProject.id,
        organizationId: testOrg.id
      });
      
      // Save offline (simulate offline mode)
      await db.questionnaires.add({
        id: questionnaire.id,
        userId: testUser.id,
        data: questionnaire,
        lastModified: new Date(),
        synced: false
      });
      
      await db.syncQueue.add({
        id: `sync_${Date.now()}`,
        type: 'questionnaire',
        action: 'save',
        data: questionnaire,
        userId: testUser.id,
        timestamp: new Date(),
        retries: 0
      });
      
      // Verify questionnaire doesn't exist on server yet
      const { data: beforeSync } = await testDb.serviceClient
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', questionnaire.id)
        .single();
        
      expect(beforeSync).toBeNull();
      
      // Process sync queue
      await OfflinePersistenceService.processSyncQueue(testUser.id);
      
      // Verify questionnaire now exists on server
      const { data: afterSync } = await testDb.serviceClient
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', questionnaire.id)
        .single();
        
      expect(afterSync).toBeDefined();
      expect(afterSync.name).toBe(questionnaire.name);
      expect(afterSync.project_id).toBe(testProject.id);
      
      // Verify sync queue is empty
      const remainingQueue = await db.syncQueue.toArray();
      expect(remainingQueue).toHaveLength(0);
      
      // Verify local copy marked as synced
      const localCopy = await db.questionnaires.get(questionnaire.id);
      expect(localCopy?.synced).toBe(true);
    });
    
    it('should handle multiple questionnaires in sync queue', async () => {
      const questionnaires = [
        createTestQuestionnaire({
          id: 'sync-test-1',
          name: 'Sync Test 1',
          projectId: testProject.id,
          organizationId: testOrg.id
        }),
        createTestQuestionnaire({
          id: 'sync-test-2',
          name: 'Sync Test 2',
          projectId: testProject.id,
          organizationId: testOrg.id
        }),
        createTestQuestionnaire({
          id: 'sync-test-3',
          name: 'Sync Test 3',
          projectId: testProject.id,
          organizationId: testOrg.id
        })
      ];
      
      // Add all to sync queue
      for (const q of questionnaires) {
        await db.questionnaires.add({
          id: q.id,
          userId: testUser.id,
          data: q,
          lastModified: new Date(),
          synced: false
        });
        
        await db.syncQueue.add({
          id: `sync_${q.id}`,
          type: 'questionnaire',
          action: 'save',
          data: q,
          userId: testUser.id,
          timestamp: new Date(),
          retries: 0
        });
      }
      
      // Process sync queue
      await OfflinePersistenceService.processSyncQueue(testUser.id);
      
      // Verify all questionnaires synced
      for (const q of questionnaires) {
        const { data } = await testDb.serviceClient
          .from('questionnaire_definitions')
          .select('*')
          .eq('id', q.id)
          .single();
          
        expect(data).toBeDefined();
        expect(data.name).toBe(q.name);
      }
      
      // Verify sync queue is empty
      const remainingQueue = await db.syncQueue.toArray();
      expect(remainingQueue).toHaveLength(0);
    });
    
    it('should handle update operations in sync queue', async () => {
      // First create a questionnaire on server
      const originalQuestionnaire = createCompleteQuestionnaire();
      originalQuestionnaire.projectId = testProject.id;
      originalQuestionnaire.organizationId = testOrg.id;
      
      const { data: created } = await testDb.serviceClient
        .from('questionnaire_definitions')
        .insert({
          id: originalQuestionnaire.id,
          project_id: testProject.id,
          name: originalQuestionnaire.name,
          code: `TEST_${Date.now()}`,
          version: 1,
          definition: originalQuestionnaire,
          created_by: testUser.id,
          is_active: false
        })
        .select()
        .single();
        
      expect(created).toBeDefined();
      
      // Modify locally while "offline"
      const modifiedQuestionnaire = {
        ...originalQuestionnaire,
        name: 'Modified Name',
        description: 'Modified Description',
        modified: new Date()
      };
      
      await db.questionnaires.add({
        id: modifiedQuestionnaire.id,
        userId: testUser.id,
        data: modifiedQuestionnaire,
        lastModified: new Date(),
        synced: false
      });
      
      await db.syncQueue.add({
        id: `sync_update_${Date.now()}`,
        type: 'questionnaire',
        action: 'update',
        data: modifiedQuestionnaire,
        userId: testUser.id,
        timestamp: new Date(),
        retries: 0
      });
      
      // Process sync
      await OfflinePersistenceService.processSyncQueue(testUser.id);
      
      // Verify server was updated
      const { data: updated } = await testDb.serviceClient
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', originalQuestionnaire.id)
        .single();
        
      expect(updated.definition.name).toBe('Modified Name');
      expect(updated.definition.description).toBe('Modified Description');
    });
  });
  
  describe('Conflict resolution', () => {
    it('should detect and handle conflicts during sync', async () => {
      // Create questionnaire on server
      const serverQuestionnaire = createTestQuestionnaire({
        name: 'Server Version',
        projectId: testProject.id,
        organizationId: testOrg.id
      });
      
      await testDb.createTestQuestionnaire(
        testProject.id,
        testUser.id,
        serverQuestionnaire
      );
      
      // Create different local version
      const localQuestionnaire = {
        ...serverQuestionnaire,
        name: 'Local Version',
        description: 'This is the local version',
        modified: new Date()
      };
      
      await db.questionnaires.add({
        id: localQuestionnaire.id,
        userId: testUser.id,
        data: localQuestionnaire,
        lastModified: new Date(),
        synced: false
      });
      
      await db.syncQueue.add({
        id: `sync_conflict_${Date.now()}`,
        type: 'questionnaire',
        action: 'update',
        data: localQuestionnaire,
        userId: testUser.id,
        timestamp: new Date(),
        retries: 0
      });
      
      // Modify server version to create conflict
      await testDb.serviceClient
        .from('questionnaire_definitions')
        .update({
          definition: {
            ...serverQuestionnaire,
            name: 'Server Version Updated',
            modified: new Date()
          }
        })
        .eq('id', serverQuestionnaire.id);
      
      // Process sync - should detect conflict
      const conflicts = await OfflinePersistenceService.processSyncQueue(testUser.id);
      
      // Verify conflict was detected
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('version_mismatch');
      expect(conflicts[0].localData.name).toBe('Local Version');
      expect(conflicts[0].serverData.name).toBe('Server Version Updated');
    });
  });
  
  describe('Error handling and retries', () => {
    it('should retry failed sync operations', async () => {
      const questionnaire = createTestQuestionnaire({
        projectId: testProject.id,
        organizationId: testOrg.id
      });
      
      // Add to sync queue with simulated previous failure
      await db.syncQueue.add({
        id: `sync_retry_${Date.now()}`,
        type: 'questionnaire',
        action: 'save',
        data: questionnaire,
        userId: testUser.id,
        timestamp: new Date(),
        retries: 2 // Already failed twice
      });
      
      // Process sync - should succeed this time
      await OfflinePersistenceService.processSyncQueue(testUser.id);
      
      // Verify synced successfully
      const { data } = await testDb.serviceClient
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', questionnaire.id)
        .single();
        
      expect(data).toBeDefined();
      
      // Verify removed from queue
      const remainingQueue = await db.syncQueue.toArray();
      expect(remainingQueue).toHaveLength(0);
    });
    
    it('should handle partial sync failures gracefully', async () => {
      // Create one valid and one invalid questionnaire
      const validQuestionnaire = createTestQuestionnaire({
        projectId: testProject.id,
        organizationId: testOrg.id
      });
      
      const invalidQuestionnaire = createTestQuestionnaire({
        projectId: 'invalid-project-id', // This will fail due to FK constraint
        organizationId: testOrg.id
      });
      
      // Add both to sync queue
      await db.syncQueue.bulkAdd([
        {
          id: `sync_valid_${Date.now()}`,
          type: 'questionnaire',
          action: 'save',
          data: validQuestionnaire,
          userId: testUser.id,
          timestamp: new Date(),
          retries: 0
        },
        {
          id: `sync_invalid_${Date.now()}`,
          type: 'questionnaire',
          action: 'save',
          data: invalidQuestionnaire,
          userId: testUser.id,
          timestamp: new Date(),
          retries: 0
        }
      ]);
      
      // Process sync
      await OfflinePersistenceService.processSyncQueue(testUser.id);
      
      // Verify valid questionnaire was synced
      const { data: valid } = await testDb.serviceClient
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', validQuestionnaire.id)
        .single();
        
      expect(valid).toBeDefined();
      
      // Verify invalid questionnaire remains in queue with retry count
      const remainingQueue = await db.syncQueue.toArray();
      expect(remainingQueue).toHaveLength(1);
      expect(remainingQueue[0].data.id).toBe(invalidQuestionnaire.id);
      expect(remainingQueue[0].retries).toBe(1);
    });
  });
  
  describe('Real-time sync', () => {
    it('should receive real-time updates from other clients', async () => {
      const questionnaire = createTestQuestionnaire({
        projectId: testProject.id,
        organizationId: testOrg.id
      });
      
      // Create questionnaire from another "client"
      await testDb.createTestQuestionnaire(
        testProject.id,
        testUser.id,
        questionnaire
      );
      
      // Set up real-time subscription
      const updates: any[] = [];
      const channel = testDb.client
        .channel('questionnaire-updates')
        .on('postgres_changes', {
          event: '*',
          schema: testDb.schema,
          table: 'questionnaire_definitions'
        }, (payload) => {
          updates.push(payload);
        })
        .subscribe();
      
      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update from another client
      await testDb.serviceClient
        .from('questionnaire_definitions')
        .update({
          definition: {
            ...questionnaire,
            name: 'Updated via Another Client'
          }
        })
        .eq('id', questionnaire.id);
      
      // Wait for real-time update
      await testDb.waitForRealtimeUpdate('questionnaire_definitions');
      
      // Verify update was received
      expect(updates).toHaveLength(1);
      expect(updates[0].eventType).toBe('UPDATE');
      expect(updates[0].new.definition.name).toBe('Updated via Another Client');
      
      // Clean up
      await channel.unsubscribe();
    });
  });
});