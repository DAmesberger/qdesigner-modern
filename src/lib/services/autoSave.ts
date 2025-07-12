import { derived } from 'svelte/store';
import { designerStore } from '$lib/stores/designerStore';
import { db } from './db/indexeddb';
import { toast } from '$lib/stores/toast';
import { isOnline } from './offline';
import type { Questionnaire } from '$lib/shared/types/types';

interface AutoSaveConfig {
  enabled: boolean;
  intervalMs: number;
  showNotifications: boolean;
}

class AutoSaveService {
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastSavedContent: string = '';
  private isAutoSaving = false;
  private unsubscribe: (() => void) | null = null;
  
  private config: AutoSaveConfig = {
    enabled: true,
    intervalMs: 30000, // 30 seconds
    showNotifications: false
  };

  /**
   * Start auto-save monitoring
   */
  start() {
    if (this.unsubscribe) {
      return; // Already running
    }

    // Subscribe to questionnaire changes
    this.unsubscribe = designerStore.subscribe(state => {
      if (!this.config.enabled || !state.userId || !state.questionnaire.id) {
        return;
      }

      const currentContent = JSON.stringify(state.questionnaire);
      
      // Check if content has changed
      if (currentContent !== this.lastSavedContent) {
        this.scheduleAutoSave(state.questionnaire, state.userId);
      }
    });

    // Load config from localStorage
    this.loadConfig();
  }

  /**
   * Stop auto-save monitoring
   */
  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Schedule an auto-save
   */
  private scheduleAutoSave(questionnaire: Questionnaire, userId: string) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Schedule new save
    this.debounceTimer = setTimeout(() => {
      this.performAutoSave(questionnaire, userId);
    }, this.config.intervalMs);
  }

  /**
   * Perform the auto-save
   */
  private async performAutoSave(questionnaire: Questionnaire, userId: string) {
    if (this.isAutoSaving) {
      return; // Already saving
    }

    this.isAutoSaving = true;

    try {
      // Save to IndexedDB as draft
      await db.saveDraft(questionnaire.id, questionnaire, userId, true);
      
      this.lastSavedContent = JSON.stringify(questionnaire);
      
      if (this.config.showNotifications) {
        toast.info('Auto-saved', { duration: 2000 });
      }

      // Update last saved timestamp in store
      designerStore.updateLastSaved();

      // If online, also save to server
      if (isOnline) {
        try {
          await designerStore.saveQuestionnaire();
        } catch (error) {
          console.error('Auto-save to server failed:', error);
          // Draft is still saved locally, so this is not critical
        }
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast.error('Auto-save failed', { duration: 3000 });
    } finally {
      this.isAutoSaving = false;
    }
  }

  /**
   * Force an immediate save
   */
  async saveNow(): Promise<boolean> {
    const state = designerStore.getState();
    
    if (!state.userId || !state.questionnaire.id) {
      return false;
    }

    // Clear any pending auto-save
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    try {
      await this.performAutoSave(state.questionnaire, state.userId);
      return true;
    } catch (error) {
      console.error('Manual save failed:', error);
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoSaveConfig>) {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoSaveConfig {
    return { ...this.config };
  }

  /**
   * Load config from localStorage
   */
  private loadConfig() {
    try {
      const saved = localStorage.getItem('qdesigner_autosave_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load auto-save config:', error);
    }
  }

  /**
   * Save config to localStorage
   */
  private saveConfig() {
    try {
      localStorage.setItem('qdesigner_autosave_config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save auto-save config:', error);
    }
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    const state = designerStore.getState();
    const currentContent = JSON.stringify(state.questionnaire);
    return currentContent !== this.lastSavedContent;
  }

  /**
   * Reset tracking (e.g., after manual save)
   */
  resetTracking() {
    const state = designerStore.getState();
    this.lastSavedContent = JSON.stringify(state.questionnaire);
  }
}

// Create singleton instance
export const autoSave = new AutoSaveService();

// Derived store for auto-save status
export const autoSaveStatus = derived(
  [designerStore],
  ([$designerStore]) => {
    return {
      enabled: autoSave.getConfig().enabled,
      hasUnsavedChanges: autoSave.hasUnsavedChanges(),
      lastSaved: $designerStore.lastSaved
    };
  }
);

// Warn before leaving with unsaved changes
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (autoSave.hasUnsavedChanges() && autoSave.getConfig().enabled) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }
  });
}