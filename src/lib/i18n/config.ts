// QDesigner Modern i18n Configuration
// i18next configuration with enhanced features

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import type { Resource } from 'i18next';
import { browser } from '$app/environment';
import type { Language, I18nConfig, MissingTranslation, TranslationValidationError } from './types';
import { i18nStore } from './stores';

// Import locale resources
import enTranslations from './locales/en/index.js';
import deTranslations from './locales/de/index.js';
import esTranslations from './locales/es/index.js';

// Enhanced language configuration with flags and regional settings
export const supportedLanguages: Language[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
    flag: '🇺🇸',
    region: 'US',
    currency: 'USD',
    dateFormat: 'MM/dd/yyyy',
    timeFormat: '12h'
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    dir: 'ltr',
    flag: '🇩🇪',
    region: 'DE',
    currency: 'EUR',
    dateFormat: 'dd.MM.yyyy',
    timeFormat: '24h'
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    dir: 'ltr',
    flag: '🇪🇸',
    region: 'ES',
    currency: 'EUR',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h'
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    dir: 'ltr',
    flag: '🇫🇷',
    region: 'FR',
    currency: 'EUR',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h'
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    dir: 'ltr',
    flag: '🇯🇵',
    region: 'JP',
    currency: 'JPY',
    dateFormat: 'yyyy/MM/dd',
    timeFormat: '24h'
  },
  {
    code: 'zh',
    name: 'Chinese (Simplified)',
    nativeName: '简体中文',
    dir: 'ltr',
    flag: '🇨🇳',
    region: 'CN',
    currency: 'CNY',
    dateFormat: 'yyyy/MM/dd',
    timeFormat: '24h'
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    flag: '🇸🇦',
    region: 'SA',
    currency: 'SAR',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '12h'
  },
  {
    code: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    dir: 'rtl',
    flag: '🇮🇱',
    region: 'IL',
    currency: 'ILS',
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h'
  }
];

export const defaultLanguage = 'en';

// Resource configuration
export const resources: Resource = {
  en: enTranslations,
  de: deTranslations,
  es: esTranslations
  // Note: Other languages will be loaded dynamically or can be added here
};

// Namespaces for organizing translations
export const namespaces = [
  'common',
  'questions', 
  'analytics',
  'auth',
  'errors',
  'validation',
  'designer',
  'fillout',
  'admin',
  'onboarding'
];

// Enhanced language detection options
const detectionOptions = {
  order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
  lookupQuerystring: 'lng',
  lookupCookie: 'i18next',
  lookupLocalStorage: 'i18nextLng',
  lookupFromPathIndex: 0,
  lookupFromSubdomainIndex: 0,
  caches: ['localStorage', 'cookie'],
  excludeCacheFor: ['cimode'],
  cookieMinutes: 10080, // 7 days
  cookieDomain: browser ? window.location.hostname : undefined
};

// Enhanced i18n configuration
export const i18nConfig: I18nConfig = {
  resources,
  fallbackLng: defaultLanguage,
  debug: import.meta.env.DEV,
  defaultNS: 'common',
  ns: namespaces,
  interpolation: {
    escapeValue: false // Svelte already escapes values
  },
  detection: detectionOptions,
  compatibilityJSON: 'v3',
  backend: {
    loadPath: '/locales/{{lng}}/{{ns}}.json',
    addPath: '/locales/add/{{lng}}/{{ns}}'
  }
};

// Initialize i18n
i18n
  .use(Backend)
  .use(LanguageDetector)
  .init(i18nConfig)
  .then(() => {
    // Update store when initialized
    i18nStore.setInitialized(true);
    i18nStore.setLanguage(i18n.language);
  });

// Listen for language changes
i18n.on('languageChanged', (lng) => {
  i18nStore.setLanguage(lng);
  updateDocumentAttributes(lng);
});

// Listen for missing translations
i18n.on('missingKey', (lngs, namespace, key, fallbackValue) => {
  const missing: MissingTranslation = {
    key,
    namespace,
    language: Array.isArray(lngs) ? lngs[0] : lngs,
    fallbackValue,
    context: 'runtime'
  };
  i18nStore.addMissingKey(missing);
});

// Helper functions
export function getCurrentLanguage(): string {
  return i18n.language || defaultLanguage;
}

export function getLanguageDirection(language?: string): 'ltr' | 'rtl' {
  const lang = language || getCurrentLanguage();
  const langConfig = supportedLanguages.find(l => l.code === lang);
  return langConfig?.dir || 'ltr';
}

export function isRTL(language?: string): boolean {
  return getLanguageDirection(language) === 'rtl';
}

export function getLanguageConfig(language?: string): Language | undefined {
  const lang = language || getCurrentLanguage();
  return supportedLanguages.find(l => l.code === lang);
}

export async function changeLanguage(language: string): Promise<void> {
  if (!supportedLanguages.find(l => l.code === language)) {
    throw new Error(`Unsupported language: ${language}`);
  }

  await i18n.changeLanguage(language);
  updateDocumentAttributes(language);
  
  // Store preference
  if (browser) {
    try {
      localStorage.setItem('preferredLanguage', language);
    } catch (error) {
      console.warn('Failed to save language preference:', error);
    }
  }
}

function updateDocumentAttributes(language: string): void {
  if (!browser) return;
  
  const direction = getLanguageDirection(language);
  document.documentElement.dir = direction;
  document.documentElement.lang = language;
  
  // Add/remove RTL class for CSS targeting
  if (direction === 'rtl') {
    document.documentElement.classList.add('rtl');
    document.documentElement.classList.remove('ltr');
  } else {
    document.documentElement.classList.add('ltr');
    document.documentElement.classList.remove('rtl');
  }
}

// Translation validation functions
export function validateTranslationKeys(translations: Record<string, any>, namespace: string): TranslationValidationError[] {
  const errors: TranslationValidationError[] = [];
  
  function validateObject(obj: any, keyPath: string[] = []): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...keyPath, key];
      const fullKey = currentPath.join('.');
      
      if (typeof value === 'object' && value !== null) {
        validateObject(value, currentPath);
      } else if (typeof value === 'string') {
        // Check for empty translations
        if (!value.trim()) {
          errors.push({
            key: fullKey,
            namespace,
            language: getCurrentLanguage(),
            error: 'empty',
            message: 'Translation is empty',
            suggestion: 'Provide a translation value'
          });
        }
        
        // Check for invalid interpolation syntax
        const interpolationRegex = /\{\{([^}]+)\}\}/g;
        let match;
        while ((match = interpolationRegex.exec(value)) !== null) {
          const variable = match[1];
          if (!variable || variable.includes('{{') || variable.includes('}}')) {
            errors.push({
              key: fullKey,
              namespace,
              language: getCurrentLanguage(),
              error: 'invalid_interpolation',
              message: `Invalid interpolation syntax: ${match[0]}`,
              suggestion: 'Use {{variableName}} format'
            });
          }
        }
      }
    }
  }
  
  validateObject(translations);
  return errors;
}

export function detectMissingTranslations(
  reference: Record<string, any>,
  target: Record<string, any>,
  namespace: string,
  language: string
): MissingTranslation[] {
  const missing: MissingTranslation[] = [];
  
  function compareObjects(ref: any, tgt: any, keyPath: string[] = []): void {
    for (const [key, value] of Object.entries(ref)) {
      const currentPath = [...keyPath, key];
      const fullKey = currentPath.join('.');
      
      if (typeof value === 'object' && value !== null) {
        if (!tgt[key] || typeof tgt[key] !== 'object') {
          missing.push({
            key: fullKey,
            namespace,
            language,
            fallbackValue: JSON.stringify(value),
            context: 'validation'
          });
        } else {
          compareObjects(value, tgt[key], currentPath);
        }
      } else {
        if (!(key in tgt) || !tgt[key] || typeof tgt[key] !== 'string') {
          missing.push({
            key: fullKey,
            namespace,
            language,
            fallbackValue: String(value),
            context: 'validation'
          });
        }
      }
    }
  }
  
  compareObjects(reference, target);
  return missing;
}

// Locale-aware formatters with enhanced options
export const formatters = {
  number: (value: number, options?: Intl.NumberFormatOptions) => {
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    
    return new Intl.NumberFormat(locale, options).format(value);
  },
  
  currency: (value: number, currency?: string, options?: Intl.NumberFormatOptions) => {
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    const defaultCurrency = currency || langConfig?.currency || 'USD';
    
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: defaultCurrency,
      ...options
    }).format(value);
  },
  
  date: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  },
  
  time: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: langConfig?.timeFormat === '12h'
    };
    
    return new Intl.DateTimeFormat(locale, { ...defaultOptions, ...options }).format(dateObj);
  },
  
  relativeTime: (date: Date | string | number, options?: { numeric?: 'always' | 'auto'; style?: 'long' | 'short' | 'narrow' }) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    
    const rtf = new Intl.RelativeTimeFormat(locale, {
      numeric: options?.numeric || 'auto',
      style: options?.style || 'long'
    });
    
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
  },
  
  percentage: (value: number, decimals: number = 0, options?: Intl.NumberFormatOptions) => {
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...options
    }).format(value / 100);
  },
  
  list: (items: string[], options?: { type?: 'conjunction' | 'disjunction' | 'unit'; style?: 'long' | 'short' | 'narrow' }) => {
    const lang = getCurrentLanguage();
    const langConfig = getLanguageConfig(lang);
    const locale = langConfig?.region ? `${lang}-${langConfig.region}` : lang;
    
    // Check for modern ListFormat support
    if ('ListFormat' in Intl) {
      // @ts-ignore - ListFormat might not be in all TypeScript versions
      return new Intl.ListFormat(locale, {
        style: options?.style || 'long',
        type: options?.type || 'conjunction'
      }).format(items);
    }
    
    // Fallback for older browsers
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) {
      const conjunction = options?.type === 'disjunction' ? ' or ' : ' and ';
      return items.join(conjunction);
    }
    
    const lastItem = items[items.length - 1];
    const otherItems = items.slice(0, -1);
    const conjunction = options?.type === 'disjunction' ? ', or ' : ', and ';
    
    return otherItems.join(', ') + conjunction + lastItem;
  },

  fileSize: (bytes: number, decimals: number = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
};

export default i18n;