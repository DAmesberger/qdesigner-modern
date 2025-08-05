import i18n from 'i18next';
// Removed react-i18next - using pure i18next for Svelte
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import type { Resource } from 'i18next';

// Import locale resources
import enTranslations from './locales/en/index.js';
import deTranslations from './locales/de/index.js';
import esTranslations from './locales/es/index.js';
import frTranslations from './locales/fr/index.js';
import jaTranslations from './locales/ja/index.js';
import zhTranslations from './locales/zh/index.js';
import arTranslations from './locales/ar/index.js';
import heTranslations from './locales/he/index.js';

export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' }
];

export const defaultLanguage = 'en';

export const resources: Resource = {
  en: enTranslations,
  de: deTranslations,
  es: esTranslations,
  fr: frTranslations,
  ja: jaTranslations,
  zh: zhTranslations,
  ar: arTranslations,
  he: heTranslations
};

// Language detection options
const detectionOptions = {
  // Order of detection methods
  order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
  
  // Keys to use for detection
  lookupQuerystring: 'lng',
  lookupCookie: 'i18next',
  lookupLocalStorage: 'i18nextLng',
  
  // Cache user language
  caches: ['localStorage', 'cookie'],
  
  // Exclude cache from detection order
  excludeCacheFor: ['cimode']
};

// i18n configuration
export const i18nConfig = {
  // Resources are loaded from the resources object above
  resources,
  
  // Fallback language
  fallbackLng: defaultLanguage,
  
  // Debug mode (disable in production)
  debug: import.meta.env.DEV,
  
  // Namespace configuration
  defaultNS: 'common',
  ns: ['common', 'questions', 'analytics', 'auth', 'errors', 'validation'],
  
  // Interpolation settings
  interpolation: {
    escapeValue: false // React already escapes values
  },
  
  // Detection options
  detection: detectionOptions,
  
  // Svelte compatibility options
  compatibilityJSON: 'v3',
  
  // Backend options (for dynamic loading)
  backend: {
    loadPath: '/locales/{{lng}}/{{ns}}.json',
    addPath: '/locales/add/{{lng}}/{{ns}}'
  }
};

// Initialize i18n
i18n
  .use(Backend) // Load translations from backend
  .use(LanguageDetector) // Detect user language
  // Removed react-i18next integration
  .init(i18nConfig);

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

export async function changeLanguage(language: string): Promise<void> {
  await i18n.changeLanguage(language);
  
  // Update document direction
  document.documentElement.dir = getLanguageDirection(language);
  document.documentElement.lang = language;
  
  // Store preference
  localStorage.setItem('preferredLanguage', language);
}

// Format functions with locale awareness
export const formatters = {
  number: (value: number, options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(i18n.language, options).format(value);
  },
  
  currency: (value: number, currency: string = 'USD') => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency
    }).format(value);
  },
  
  date: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(i18n.language, options).format(dateObj);
  },
  
  time: (date: Date | string | number) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(dateObj);
  },
  
  relativeTime: (date: Date | string | number) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    
    const diff = dateObj.getTime() - Date.now();
    const absDiff = Math.abs(diff);
    
    if (absDiff < 60000) { // Less than 1 minute
      return rtf.format(Math.round(diff / 1000), 'second');
    } else if (absDiff < 3600000) { // Less than 1 hour
      return rtf.format(Math.round(diff / 60000), 'minute');
    } else if (absDiff < 86400000) { // Less than 1 day
      return rtf.format(Math.round(diff / 3600000), 'hour');
    } else if (absDiff < 2592000000) { // Less than 30 days
      return rtf.format(Math.round(diff / 86400000), 'day');
    } else if (absDiff < 31536000000) { // Less than 1 year
      return rtf.format(Math.round(diff / 2592000000), 'month');
    } else {
      return rtf.format(Math.round(diff / 31536000000), 'year');
    }
  },
  
  percentage: (value: number, decimals: number = 0) => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value / 100);
  },
  
  list: (items: string[], type: 'conjunction' | 'disjunction' = 'conjunction') => {
    // @ts-ignore - ListFormat is not in all TypeScript versions yet
    if (typeof Intl.ListFormat !== 'undefined') {
      // @ts-ignore
      return new Intl.ListFormat(i18n.language, { type }).format(items);
    }
    // Fallback for older browsers
    return items.join(type === 'conjunction' ? ' and ' : ' or ');
  }
};

export default i18n;