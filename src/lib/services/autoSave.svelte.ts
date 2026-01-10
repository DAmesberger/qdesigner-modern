import { designerStore } from '$lib/stores/designer.svelte';
import { db } from './db/indexeddb';
import { toast } from '$lib/stores/toast';
import { isOnline } from './offline';
import type { Questionnaire } from '$lib/shared';

interface AutoSaveConfig {
  enabled: boolean;
  intervalMs: number;
  showNotifications: boolean;
}

class AutoSaveService {
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastSavedContent: string = '';
  private isAutoSaving = false;
  private cleanupEffect: (() => void) | null = null;
  
  config = $state<AutoSaveConfig>({
    enabled: true,
    intervalMs: 30000, // 30 seconds
    showNotifications: false
  });

  constructor() {}

  /**
   * Start auto-save monitoring
   */
  start() {
    if (this.cleanupEffect) {
      return; // Already running
    }
    
    // In Svelte 5 .svelte.ts files, we can use $effect.root to create effects that live outside component tree
    this.cleanupEffect = $effect.root(() => {
        $effect(() => {
            const state = designerStore;
            if (!this.config.enabled || !state.userId || !state.questionnaire.id) {
                return;
            }
            
            // This will track questionnaire because it is a rune
            const currentContent = JSON.stringify(state.questionnaire);
            
            if (currentContent !== this.lastSavedContent) {
                // Determine if this is the FIRST run (init) to avoid saving immediately on load?
                // lastSavedContent is empty initially.
                // If we want to avoid saving on load, we should init lastSavedContent elsewhere or check 'isDirty'
                if (this.lastSavedContent !== '') {
                     this.scheduleAutoSave(state.questionnaire, state.userId);
                } else {
                    this.lastSavedContent = currentContent;
                }
            }
        });
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

    if (this.cleanupEffect) {
      this.cleanupEffect();
      this.cleanupEffect = null;
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

      // Update last saved timestamp in store (setLastSaved is inferred?)
      // designerStore.lastSaved = Date.now(); // handled by saveQuestionnaire if actually saving or we can set it
      // But we are saving DRAFT here.
      
      // If online, also save to server
      if (isOnline) {
        try {
          await designerStore.saveQuestionnaire();
        } catch (error) {
          console.error('Auto-save to server failed:', error as Error);
          // Draft is still saved locally, so this is not critical
        }
      }
    } catch (error) {
      console.error('Auto-save failed:', error as Error);
      toast.error('Auto-save failed', { duration: 3000 });
    } finally {
      this.isAutoSaving = false;
    }
  }

  /**
   * Force an immediate save
   */
  async saveNow(): Promise<boolean> {
    const state = designerStore;
    
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
      console.error('Manual save failed:', error as Error);
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
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('qdesigner_autosave_config');
            if (saved) {
                this.config = { ...this.config, ...JSON.parse(saved) };
            }
        }
    } catch (error) {
      console.error('Failed to load auto-save config:', error as Error);
    }
  }

  /**
   * Save config to localStorage
   */
  private saveConfig() {
    try {
      if (typeof localStorage !== 'undefined') {
          localStorage.setItem('qdesigner_autosave_config', JSON.stringify(this.config));
      }
    } catch (error) {
      console.error('Failed to save auto-save config:', error as Error);
    }
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    const state = designerStore;
    const currentContent = JSON.stringify(state.questionnaire);
    return currentContent !== this.lastSavedContent;
  }

  /**
   * Reset tracking (e.g., after manual save)
   */
  resetTracking() {
    const state = designerStore;
    this.lastSavedContent = JSON.stringify(state.questionnaire);
  }
}

// Create singleton instance
export const autoSave = new AutoSaveService();

// Deprecated derived store export removal - consumers should use autoSave.config directly
// or we can export a derived if really needed, but Svelte 5 prefers direct access