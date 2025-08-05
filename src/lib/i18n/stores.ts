// QDesigner Modern i18n Stores
// Svelte stores for i18n state management

import { writable, derived, readable } from 'svelte/store';
import { browser } from '$app/environment';
import type { 
  Language, 
  I18nStore, 
  MissingTranslation, 
  TranslationValidationError,
  TranslationEntry 
} from './types';
import { supportedLanguages, defaultLanguage } from './config';

// Create reactive store for i18n state
function createI18nStore() {
  const initialState: I18nStore = {
    currentLanguage: defaultLanguage,
    isRTL: false,
    isInitialized: false,
    translations: {},
    missingKeys: [],
    validationErrors: []
  };

  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    set,
    update,
    
    // Actions
    setLanguage: (language: string) => {
      update(state => {
        const langConfig = supportedLanguages.find(l => l.code === language);
        return {
          ...state,
          currentLanguage: language,
          isRTL: langConfig?.dir === 'rtl' || false
        };
      });
    },

    setInitialized: (initialized: boolean) => {
      update(state => ({ ...state, isInitialized: initialized }));
    },

    setTranslations: (translations: Record<string, any>) => {
      update(state => ({ ...state, translations }));
    },

    addMissingKey: (missing: MissingTranslation) => {
      update(state => {
        const exists = state.missingKeys.some(
          m => m.key === missing.key && 
               m.namespace === missing.namespace && 
               m.language === missing.language
        );
        
        if (!exists) {
          return {
            ...state,
            missingKeys: [...state.missingKeys, missing]
          };
        }
        return state;
      });
    },

    removeMissingKey: (key: string, namespace: string, language: string) => {
      update(state => ({
        ...state,
        missingKeys: state.missingKeys.filter(
          m => !(m.key === key && m.namespace === namespace && m.language === language)
        )
      }));
    },

    addValidationError: (error: TranslationValidationError) => {
      update(state => {
        const exists = state.validationErrors.some(
          e => e.key === error.key && 
               e.namespace === error.namespace && 
               e.language === error.language &&
               e.error === error.error
        );
        
        if (!exists) {
          return {
            ...state,
            validationErrors: [...state.validationErrors, error]
          };
        }
        return state;
      });
    },

    clearValidationErrors: () => {
      update(state => ({ ...state, validationErrors: [] }));
    }
  };
}

export const i18nStore = createI18nStore();

// Derived stores for common values
export const currentLanguage = derived(
  i18nStore,
  $i18nStore => $i18nStore.currentLanguage
);

export const isRTL = derived(
  i18nStore,
  $i18nStore => $i18nStore.isRTL
);

export const isInitialized = derived(
  i18nStore,
  $i18nStore => $i18nStore.isInitialized
);

export const missingTranslations = derived(
  i18nStore,
  $i18nStore => $i18nStore.missingKeys
);

export const validationErrors = derived(
  i18nStore,
  $i18nStore => $i18nStore.validationErrors
);

// Translation management store
function createTranslationManagerStore() {
  const { subscribe, set, update } = writable<TranslationEntry[]>([]);

  return {
    subscribe,
    set,
    update,

    addEntry: (entry: TranslationEntry) => {
      update(entries => {
        const existingIndex = entries.findIndex(e => e.key === entry.key);
        if (existingIndex >= 0) {
          entries[existingIndex] = entry;
        } else {
          entries.push(entry);
        }
        return entries;
      });
    },

    updateEntry: (key: string, updates: Partial<TranslationEntry>) => {
      update(entries => 
        entries.map(entry => 
          entry.key === key ? { ...entry, ...updates, modified: true } : entry
        )
      );
    },

    removeEntry: (key: string) => {
      update(entries => entries.filter(entry => entry.key !== key));
    },

    markAsSaved: () => {
      update(entries => 
        entries.map(entry => ({ ...entry, modified: false }))
      );
    },

    getModifiedEntries: () => {
      let modifiedEntries: TranslationEntry[] = [];
      subscribe(entries => {
        modifiedEntries = entries.filter(entry => entry.modified);
      })();
      return modifiedEntries;
    },

    getMissingTranslations: () => {
      let missingEntries: TranslationEntry[] = [];
      subscribe(entries => {
        missingEntries = entries.filter(entry => entry.missing.length > 0);
      })();
      return missingEntries;
    }
  };
}

export const translationManagerStore = createTranslationManagerStore();

// Language preferences store (persisted in localStorage)
function createLanguagePreferencesStore() {
  const getStoredLanguage = (): string => {
    if (!browser) return defaultLanguage;
    
    try {
      return localStorage.getItem('preferredLanguage') || defaultLanguage;
    } catch {
      return defaultLanguage;
    }
  };

  const { subscribe, set } = writable(getStoredLanguage());

  return {
    subscribe,
    set: (language: string) => {
      set(language);
      if (browser) {
        try {
          localStorage.setItem('preferredLanguage', language);
        } catch (error) {
          console.warn('Failed to save language preference:', error);
        }
      }
    }
  };
}

export const languagePreferences = createLanguagePreferencesStore();

// Active language configuration store
export const activeLanguageConfig = derived(
  currentLanguage,
  $currentLanguage => supportedLanguages.find(l => l.code === $currentLanguage) || supportedLanguages[0]
);

// Translation statistics store
export const translationStats = derived(
  [translationManagerStore, supportedLanguages],
  ([$entries, $supportedLanguages]) => {
    const totalKeys = $entries.length;
    const totalPossibleTranslations = totalKeys * $supportedLanguages.length;
    
    let totalTranslations = 0;
    let missingByLanguage: Record<string, number> = {};
    let completionByLanguage: Record<string, number> = {};
    
    $supportedLanguages.forEach(lang => {
      missingByLanguage[lang.code] = 0;
      completionByLanguage[lang.code] = 0;
    });
    
    $entries.forEach(entry => {
      Object.keys(entry.translations).forEach(lang => {
        if (entry.translations[lang]) {
          totalTranslations++;
          completionByLanguage[lang]++;
        }
      });
      
      entry.missing.forEach(lang => {
        missingByLanguage[lang]++;
      });
    });
    
    // Calculate completion percentages
    Object.keys(completionByLanguage).forEach(lang => {
      completionByLanguage[lang] = totalKeys > 0 
        ? (completionByLanguage[lang] / totalKeys) * 100 
        : 0;
    });
    
    return {
      totalKeys,
      totalTranslations,
      totalPossibleTranslations,
      overallCompletion: totalPossibleTranslations > 0 
        ? (totalTranslations / totalPossibleTranslations) * 100 
        : 0,
      missingByLanguage,
      completionByLanguage,
      modifiedCount: $entries.filter(e => e.modified).length
    };
  }
);

// Read-only store for supported languages
export const supportedLanguagesStore = readable(supportedLanguages);

// Store for tracking translation loading state
export const translationLoadingState = writable({
  isLoading: false,
  loadingLanguage: null as string | null,
  loadingNamespace: null as string | null,
  error: null as string | null
});