// QDesigner Modern i18n Hooks
// Svelte hooks for i18n integration

import { derived } from 'svelte/store';
import { browser } from '$app/environment';
import i18n from './config';
import type { TFunction } from 'i18next';
import type { TranslationHook } from './types';
import { 
  i18nStore, 
  currentLanguage, 
  isRTL,
  isInitialized,
  supportedLanguagesStore,
  translationLoadingState 
} from './stores';
import { changeLanguage } from './config';

// Create a derived store for translations that updates when language changes
export const t = derived(
  [currentLanguage, isInitialized],
  ([$currentLanguage, $isInitialized]) => {
    if (!$isInitialized) {
      return ((key: string, options?: any) => key) as TFunction;
    }
    
    return ((key: string, options?: any) => {
      try {
        return i18n.t(key, options);
      } catch (error) {
        console.warn(`Translation failed for key: ${key}`, error);
        return key;
      }
    }) as TFunction;
  }
);

// Hook for using translations in Svelte components
export function useTranslation(namespace?: string): TranslationHook {
  // Create namespaced translation function
  const tFunc = ((key: string, options?: any) => {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    try {
      return i18n.t(fullKey, options);
    } catch (error) {
      console.warn(`Translation failed for key: ${fullKey}`, error);
      return key;
    }
  }) as TFunction;
  
  // Get current values from stores
  let currentLang = '';
  let rtl = false;
  
  currentLanguage.subscribe(lang => { currentLang = lang; });
  isRTL.subscribe(isRtl => { rtl = isRtl; });
  
  return {
    t: tFunc,
    i18n,
    ready: i18n.isInitialized,
    changeLanguage,
    currentLanguage: currentLang,
    isRTL: rtl
  };
}

// Hook for language switching functionality
export function useLanguageSwitcher() {
  let currentLang = '';
  let supportedLangs: any[] = [];
  
  currentLanguage.subscribe(lang => { currentLang = lang; });
  supportedLanguagesStore.subscribe(langs => { supportedLangs = langs; });
  
  return {
    currentLanguage: currentLang,
    supportedLanguages: supportedLangs,
    changeLanguage: async (lng: string) => {
      translationLoadingState.update(state => ({
        ...state,
        isLoading: true,
        loadingLanguage: lng
      }));
      
      try {
        await changeLanguage(lng);
        
        translationLoadingState.update(state => ({
          ...state,
          isLoading: false,
          loadingLanguage: null,
          error: null
        }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Language change failed';
        
        translationLoadingState.update(state => ({
          ...state,
          isLoading: false,
          loadingLanguage: null,
          error: errorMessage
        }));
        
        throw error;
      }
    },
    isLoading: derived(translationLoadingState, state => state.isLoading),
    error: derived(translationLoadingState, state => state.error)
  };
}

// Hook for format functions with reactivity
export function useFormatters() {
  let currentLang = '';
  currentLanguage.subscribe(lang => { currentLang = lang; });
  
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    try {
      return new Intl.NumberFormat(currentLang, options).format(value);
    } catch (error) {
      return new Intl.NumberFormat('en', options).format(value);
    }
  };
  
  const formatCurrency = (value: number, currency: string = 'USD', options?: Intl.NumberFormatOptions) => {
    try {
      return new Intl.NumberFormat(currentLang, {
        style: 'currency',
        currency,
        ...options
      }).format(value);
    } catch (error) {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency: 'USD',
        ...options
      }).format(value);
    }
  };
  
  const formatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    try {
      return new Intl.DateTimeFormat(currentLang, options).format(dateObj);
    } catch (error) {
      return new Intl.DateTimeFormat('en', options).format(dateObj);
    }
  };
  
  const formatTime = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const defaultOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      ...options
    };
    
    try {
      return new Intl.DateTimeFormat(currentLang, defaultOptions).format(dateObj);
    } catch (error) {
      return new Intl.DateTimeFormat('en', defaultOptions).format(dateObj);
    }
  };
  
  const formatRelativeTime = (date: Date | string | number, options?: { numeric?: 'always' | 'auto'; style?: 'long' | 'short' | 'narrow' }) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const { numeric = 'auto', style = 'long' } = options || {};
    
    try {
      const rtf = new Intl.RelativeTimeFormat(currentLang, { numeric, style });
      
      const diff = dateObj.getTime() - Date.now();
      const absDiff = Math.abs(diff);
      
      if (absDiff < 60000) {
        return rtf.format(Math.round(diff / 1000), 'second');
      } else if (absDiff < 3600000) {
        return rtf.format(Math.round(diff / 60000), 'minute');
      } else if (absDiff < 86400000) {
        return rtf.format(Math.round(diff / 3600000), 'hour');
      } else if (absDiff < 2592000000) {
        return rtf.format(Math.round(diff / 86400000), 'day');
      } else if (absDiff < 31536000000) {
        return rtf.format(Math.round(diff / 2592000000), 'month');
      } else {
        return rtf.format(Math.round(diff / 31536000000), 'year');
      }
    } catch (error) {
      // Fallback for browsers without RelativeTimeFormat
      const diff = dateObj.getTime() - Date.now();
      const absDiff = Math.abs(diff);
      const isPast = diff < 0;
      
      if (absDiff < 60000) {
        const seconds = Math.round(absDiff / 1000);
        return isPast ? `${seconds} seconds ago` : `in ${seconds} seconds`;
      } else if (absDiff < 3600000) {
        const minutes = Math.round(absDiff / 60000);
        return isPast ? `${minutes} minutes ago` : `in ${minutes} minutes`;
      } else if (absDiff < 86400000) {
        const hours = Math.round(absDiff / 3600000);
        return isPast ? `${hours} hours ago` : `in ${hours} hours`;
      } else {
        const days = Math.round(absDiff / 86400000);
        return isPast ? `${days} days ago` : `in ${days} days`;
      }
    }
  };
  
  const formatPercentage = (value: number, decimals: number = 0) => {
    try {
      return new Intl.NumberFormat(currentLang, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value / 100);
    } catch (error) {
      return new Intl.NumberFormat('en', {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value / 100);
    }
  };
  
  const formatList = (items: string[], options?: { type?: 'conjunction' | 'disjunction'; style?: 'long' | 'short' }) => {
    const { type = 'conjunction', style = 'long' } = options || {};
    
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    
    // Check for modern ListFormat support
    if ('ListFormat' in Intl) {
      try {
        // @ts-ignore - ListFormat might not be in all TypeScript versions
        return new Intl.ListFormat(currentLang, { style, type }).format(items);
      } catch {
        // Fall through to manual formatting
      }
    }
    
    // Manual list formatting fallback
    if (items.length === 2) {
      const conjunction = type === 'disjunction' ? ' or ' : ' and ';
      return items.join(conjunction);
    }
    
    const lastItem = items[items.length - 1];
    const otherItems = items.slice(0, -1);
    const conjunction = type === 'disjunction' ? ', or ' : ', and ';
    
    return otherItems.join(', ') + conjunction + lastItem;
  };
  
  return {
    formatNumber,
    formatCurrency,
    formatDate,
    formatTime,
    formatRelativeTime,
    formatPercentage,
    formatList
  };
}

// Hook for translation validation and management
export function useTranslationValidation() {
  const validateKey = (key: string, namespace?: string): boolean => {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return i18n.exists(fullKey);
  };
  
  const getMissingKeys = (keys: string[], namespace?: string): string[] => {
    return keys.filter(key => !validateKey(key, namespace));
  };
  
  const getTranslationWithFallback = (key: string, fallback: string, namespace?: string): string => {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    
    if (i18n.exists(fullKey)) {
      return i18n.t(fullKey);
    }
    
    // Log missing translation
    i18nStore.addMissingKey({
      key: fullKey,
      namespace: namespace || 'common',
      language: i18n.language,
      fallbackValue: fallback
    });
    
    return fallback;
  };
  
  return {
    validateKey,
    getMissingKeys,
    getTranslationWithFallback,
    missingTranslations: derived(i18nStore, state => state.missingKeys)
  };
}

// Hook for RTL/LTR handling
export function useDirectionality() {
  return {
    isRTL,
    currentLanguage,
    toggleDirection: () => {
      // This would typically be handled by language switching
      console.warn('Direction should be changed via language switching');
    },
    getDirectionalValue: <T>(ltrValue: T, rtlValue: T): T => {
      let rtl = false;
      isRTL.subscribe(value => { rtl = value; })();
      return rtl ? rtlValue : ltrValue;
    }
  };
}

// Hook for managing translation loading states
export function useTranslationLoader() {
  const loadNamespace = async (namespace: string, language?: string): Promise<void> => {
    const lang = language || i18n.language;
    
    translationLoadingState.update(state => ({
      ...state,
      isLoading: true,
      loadingNamespace: namespace
    }));
    
    try {
      await i18n.loadNamespaces(namespace);
      await i18n.setDefaultNamespace(namespace);
      
      translationLoadingState.update(state => ({
        ...state,
        isLoading: false,
        loadingNamespace: null,
        error: null
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load namespace';
      
      translationLoadingState.update(state => ({
        ...state,
        isLoading: false,
        loadingNamespace: null,
        error: errorMessage
      }));
      
      throw error;
    }
  };
  
  const preloadLanguage = async (language: string): Promise<void> => {
    translationLoadingState.update(state => ({
      ...state,
      isLoading: true,
      loadingLanguage: language
    }));
    
    try {
      await i18n.loadLanguages(language);
      
      translationLoadingState.update(state => ({
        ...state,
        isLoading: false,
        loadingLanguage: null,
        error: null
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to preload language';
      
      translationLoadingState.update(state => ({
        ...state,
        isLoading: false,
        loadingLanguage: null,
        error: errorMessage
      }));
      
      throw error;
    }
  };
  
  return {
    loadNamespace,
    preloadLanguage,
    loadingState: translationLoadingState
  };
}

// Development-only hook for debugging translations
export function useTranslationDebug() {
  if (import.meta.env.PROD) {
    return {
      debugMode: false,
      enableDebug: () => {},
      disableDebug: () => {},
      logMissingTranslations: () => {},
      getLoadedNamespaces: () => [],
      getCurrentResources: () => ({})
    };
  }
  
  const enableDebug = () => {
    i18n.options.debug = true;
  };
  
  const disableDebug = () => {
    i18n.options.debug = false;
  };
  
  const logMissingTranslations = () => {
    let missing: any[] = [];
    i18nStore.subscribe(state => { missing = state.missingKeys; })();
    console.group('Missing Translations');
    missing.forEach(item => {
      console.warn(`${item.language}:${item.namespace}:${item.key}`, item);
    });
    console.groupEnd();
  };
  
  const getLoadedNamespaces = (): string[] => {
    return Object.keys(i18n.options.resources?.[i18n.language] || {});
  };
  
  const getCurrentResources = () => {
    return i18n.options.resources?.[i18n.language] || {};
  };
  
  return {
    debugMode: i18n.options.debug || false,
    enableDebug,
    disableDebug,
    logMissingTranslations,
    getLoadedNamespaces,
    getCurrentResources
  };
}