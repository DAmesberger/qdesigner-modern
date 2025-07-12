import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutoSaveService } from '$lib/services/autoSave';
import { CrashRecoveryService } from '$lib/services/crashRecovery';
import { createTestQuestionnaire } from '../factories/questionnaire.factory';
import { get } from 'svelte/store';

// Mock stores
vi.mock('$lib/stores/designerStore', () => ({
  designerStore: {
    subscribe: vi.fn(),
    getState: vi.fn(),
    saveQuestionnaire: vi.fn(),
    importQuestionnaire: vi.fn()
  }
}));

// Mock offline persistence
vi.mock('$lib/services/offlinePersistence', () => ({
  OfflinePersistenceService: {
    saveQuestionnaire: vi.fn()
  }
}));

describe('AutoSaveService', () => {
  let autoSave: AutoSaveService;
  const mockState = {
    questionnaire: createTestQuestionnaire(),
    hasUnsavedChanges: false,
    userId: 'test-user-123'
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Reset singleton instance
    (AutoSaveService as any).instance = null;
    autoSave = AutoSaveService.getInstance();
    
    // Mock store subscription
    const { designerStore } = require('$lib/stores/designerStore');
    designerStore.getState.mockReturnValue(mockState);
    designerStore.subscribe.mockImplementation((callback: any) => {
      callback(mockState);
      return () => {};
    });
  });
  
  afterEach(() => {
    autoSave.stop();
    vi.useRealTimers();
  });
  
  describe('Auto-save triggering', () => {
    it('should start auto-save when enabled', () => {
      autoSave.configure({ enabled: true, intervalMs: 30000 });
      autoSave.start();
      
      expect(autoSave.isRunning()).toBe(true);
    });
    
    it('should not save when no unsaved changes', async () => {
      const { designerStore } = require('$lib/stores/designerStore');
      mockState.hasUnsavedChanges = false;
      
      autoSave.configure({ enabled: true, intervalMs: 1000 });
      autoSave.start();
      
      // Advance timer
      vi.advanceTimersByTime(1500);
      
      expect(designerStore.saveQuestionnaire).not.toHaveBeenCalled();
    });
    
    it('should save when unsaved changes exist', async () => {
      const { designerStore } = require('$lib/stores/designerStore');
      designerStore.saveQuestionnaire.mockResolvedValue(true);
      mockState.hasUnsavedChanges = true;
      
      autoSave.configure({ enabled: true, intervalMs: 1000 });
      autoSave.start();
      
      // Advance timer
      vi.advanceTimersByTime(1500);
      
      expect(designerStore.saveQuestionnaire).toHaveBeenCalledTimes(1);
    });
    
    it('should respect configured interval', () => {
      const { designerStore } = require('$lib/stores/designerStore');
      designerStore.saveQuestionnaire.mockResolvedValue(true);
      mockState.hasUnsavedChanges = true;
      
      autoSave.configure({ enabled: true, intervalMs: 5000 });
      autoSave.start();
      
      // Not enough time passed
      vi.advanceTimersByTime(4000);
      expect(designerStore.saveQuestionnaire).not.toHaveBeenCalled();
      
      // Now enough time passed
      vi.advanceTimersByTime(2000);
      expect(designerStore.saveQuestionnaire).toHaveBeenCalledTimes(1);
    });
    
    it('should stop auto-save when disabled', () => {
      const { designerStore } = require('$lib/stores/designerStore');
      mockState.hasUnsavedChanges = true;
      
      autoSave.configure({ enabled: true, intervalMs: 1000 });
      autoSave.start();
      
      // Stop auto-save
      autoSave.stop();
      
      // Advance timer - should not save
      vi.advanceTimersByTime(2000);
      expect(designerStore.saveQuestionnaire).not.toHaveBeenCalled();
    });
  });
  
  describe('Manual save tracking', () => {
    it('should reset unsaved changes tracking after manual save', () => {
      mockState.hasUnsavedChanges = true;
      autoSave.trackChanges();
      
      expect(autoSave.hasUnsavedChanges()).toBe(true);
      
      autoSave.resetTracking();
      expect(autoSave.hasUnsavedChanges()).toBe(false);
    });
    
    it('should update last save time', () => {
      const beforeSave = Date.now();
      vi.setSystemTime(beforeSave);
      
      autoSave.updateLastSaved();
      expect(autoSave.getLastSaved()).toBe(beforeSave);
      
      // Advance time
      const afterSave = beforeSave + 60000;
      vi.setSystemTime(afterSave);
      
      autoSave.updateLastSaved();
      expect(autoSave.getLastSaved()).toBe(afterSave);
    });
  });
  
  describe('Conflict detection', () => {
    it('should detect when external changes occurred', async () => {
      const originalModified = new Date('2024-01-01');
      const externalModified = new Date('2024-01-02');
      
      mockState.questionnaire.modified = originalModified;
      autoSave.trackChanges();
      
      // Simulate external change
      const hasConflict = autoSave.checkForConflicts({
        ...mockState.questionnaire,
        modified: externalModified
      });
      
      expect(hasConflict).toBe(true);
    });
    
    it('should not detect conflict when no external changes', () => {
      const modified = new Date('2024-01-01');
      mockState.questionnaire.modified = modified;
      
      const hasConflict = autoSave.checkForConflicts({
        ...mockState.questionnaire,
        modified: modified
      });
      
      expect(hasConflict).toBe(false);
    });
  });
  
  describe('Error handling', () => {
    it('should handle save failures gracefully', async () => {
      const { designerStore } = require('$lib/stores/designerStore');
      designerStore.saveQuestionnaire.mockRejectedValue(new Error('Network error'));
      mockState.hasUnsavedChanges = true;
      
      autoSave.configure({ enabled: true, intervalMs: 1000 });
      autoSave.start();
      
      vi.advanceTimersByTime(1500);
      
      // Should not throw, but mark error
      expect(autoSave.getLastError()).toBeTruthy();
      expect(autoSave.getLastError()).toContain('Network error');
    });
    
    it('should retry after failure', async () => {
      const { designerStore } = require('$lib/stores/designerStore');
      designerStore.saveQuestionnaire
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true);
        
      mockState.hasUnsavedChanges = true;
      
      autoSave.configure({ enabled: true, intervalMs: 1000 });
      autoSave.start();
      
      // First attempt fails
      vi.advanceTimersByTime(1500);
      expect(designerStore.saveQuestionnaire).toHaveBeenCalledTimes(1);
      
      // Second attempt succeeds
      vi.advanceTimersByTime(1000);
      expect(designerStore.saveQuestionnaire).toHaveBeenCalledTimes(2);
      expect(autoSave.getLastError()).toBeNull();
    });
  });
});

describe('CrashRecoveryService', () => {
  let crashRecovery: CrashRecoveryService;
  const testQuestionnaire = createTestQuestionnaire();
  
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
    // Reset singleton
    (CrashRecoveryService as any).instance = null;
    crashRecovery = CrashRecoveryService.getInstance();
  });
  
  describe('Draft saving', () => {
    it('should save draft to localStorage', () => {
      crashRecovery.saveDraft(testQuestionnaire);
      
      const saved = localStorage.getItem('qdesigner_crash_recovery');
      expect(saved).toBeTruthy();
      
      const parsed = JSON.parse(saved!);
      expect(parsed.questionnaire).toEqual(testQuestionnaire);
      expect(parsed.timestamp).toBeTruthy();
    });
    
    it('should update existing draft', () => {
      crashRecovery.saveDraft(testQuestionnaire);
      
      const modifiedQuestionnaire = {
        ...testQuestionnaire,
        name: 'Modified Name'
      };
      
      crashRecovery.saveDraft(modifiedQuestionnaire);
      
      const saved = localStorage.getItem('qdesigner_crash_recovery');
      const parsed = JSON.parse(saved!);
      expect(parsed.questionnaire.name).toBe('Modified Name');
    });
    
    it('should throttle draft saves', () => {
      const saveSpy = vi.spyOn(localStorage, 'setItem');
      
      // Save multiple times rapidly
      for (let i = 0; i < 10; i++) {
        crashRecovery.saveDraft({
          ...testQuestionnaire,
          name: `Draft ${i}`
        });
      }
      
      // Should only save once due to throttling
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Draft recovery', () => {
    it('should detect recoverable draft', () => {
      crashRecovery.saveDraft(testQuestionnaire);
      
      expect(crashRecovery.hasRecoverableDraft()).toBe(true);
    });
    
    it('should not detect draft when none exists', () => {
      expect(crashRecovery.hasRecoverableDraft()).toBe(false);
    });
    
    it('should not detect old drafts', () => {
      // Save draft with old timestamp
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      localStorage.setItem('qdesigner_crash_recovery', JSON.stringify({
        questionnaire: testQuestionnaire,
        timestamp: oldTimestamp
      }));
      
      expect(crashRecovery.hasRecoverableDraft()).toBe(false);
    });
    
    it('should recover draft', () => {
      crashRecovery.saveDraft(testQuestionnaire);
      
      const recovered = crashRecovery.recoverDraft();
      expect(recovered).toEqual(testQuestionnaire);
    });
    
    it('should clear draft after recovery', () => {
      crashRecovery.saveDraft(testQuestionnaire);
      crashRecovery.recoverDraft();
      
      expect(crashRecovery.hasRecoverableDraft()).toBe(false);
    });
  });
  
  describe('Crash detection', () => {
    it('should mark session as active', () => {
      crashRecovery.markSessionActive();
      
      const sessionData = localStorage.getItem('qdesigner_active_session');
      expect(sessionData).toBeTruthy();
      
      const parsed = JSON.parse(sessionData!);
      expect(parsed.active).toBe(true);
      expect(parsed.lastHeartbeat).toBeTruthy();
    });
    
    it('should detect crashed session', () => {
      // Set up old session
      const oldHeartbeat = Date.now() - (10 * 60 * 1000); // 10 minutes ago
      localStorage.setItem('qdesigner_active_session', JSON.stringify({
        active: true,
        lastHeartbeat: oldHeartbeat
      }));
      
      expect(crashRecovery.detectCrashedSession()).toBe(true);
    });
    
    it('should not detect crash for recent session', () => {
      localStorage.setItem('qdesigner_active_session', JSON.stringify({
        active: true,
        lastHeartbeat: Date.now() - 30000 // 30 seconds ago
      }));
      
      expect(crashRecovery.detectCrashedSession()).toBe(false);
    });
    
    it('should clean up session on graceful exit', () => {
      crashRecovery.markSessionActive();
      crashRecovery.cleanupSession();
      
      const sessionData = localStorage.getItem('qdesigner_active_session');
      const parsed = JSON.parse(sessionData!);
      expect(parsed.active).toBe(false);
    });
  });
  
  describe('Integration with auto-save', () => {
    it('should save draft when auto-save triggers', () => {
      const { designerStore } = require('$lib/stores/designerStore');
      designerStore.getState.mockReturnValue({
        questionnaire: testQuestionnaire,
        hasUnsavedChanges: true,
        userId: 'test-user'
      });
      
      const saveDraftSpy = vi.spyOn(crashRecovery, 'saveDraft');
      
      // Trigger auto-save with crash recovery enabled
      const autoSave = AutoSaveService.getInstance();
      autoSave.configure({ 
        enabled: true, 
        intervalMs: 1000,
        enableCrashRecovery: true 
      });
      
      autoSave.trackChanges();
      
      expect(saveDraftSpy).toHaveBeenCalledWith(testQuestionnaire);
    });
  });
  
  describe('Storage quota handling', () => {
    it('should handle storage quota exceeded', () => {
      // Mock localStorage.setItem to throw quota error
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      
      expect(() => crashRecovery.saveDraft(testQuestionnaire)).not.toThrow();
      expect(crashRecovery.getLastError()).toContain('Storage quota');
      
      setItemSpy.mockRestore();
    });
    
    it('should clean up old data when quota exceeded', () => {
      // Fill storage with old data
      for (let i = 0; i < 10; i++) {
        localStorage.setItem(`old_data_${i}`, 'x'.repeat(1000));
      }
      
      // This should trigger cleanup
      crashRecovery.saveDraft(testQuestionnaire);
      
      // Verify draft was saved
      expect(crashRecovery.hasRecoverableDraft()).toBe(true);
    });
  });
});