import { derived, writable } from 'svelte/store';
import i18n from './config';
import type { TFunction } from 'i18next';

// Create a store for the current language
export const currentLanguage = writable(i18n.language);

// Update store when language changes
i18n.on('languageChanged', (lng) => {
  currentLanguage.set(lng);
});

// Create a derived store for translations
export const t = derived(currentLanguage, ($currentLanguage) => {
  return ((key: string, options?: any) => {
    return i18n.t(key, options);
  }) as TFunction;
});

// Create a derived store for RTL
export const isRTL = derived(currentLanguage, ($currentLanguage) => {
  const rtlLanguages = ['ar', 'he'];
  return rtlLanguages.includes($currentLanguage);
});

// Hook for using translations in Svelte components
export function useTranslation(namespace?: string) {
  const tFunc = ((key: string, options?: any) => {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return i18n.t(fullKey, options);
  }) as TFunction;
  
  return {
    t: tFunc,
    i18n,
    ready: i18n.isInitialized
  };
}

// Hook for language switching
export function useLanguageSwitcher() {
  const changeLanguage = async (lng: string) => {
    await i18n.changeLanguage(lng);
    
    // Update document direction
    document.documentElement.dir = ['ar', 'he'].includes(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  };
  
  return {
    currentLanguage: i18n.language,
    supportedLanguages: Object.keys(i18n.options.resources || {}),
    changeLanguage
  };
}

// Format helpers that use the current language
export function useFormatters() {
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(i18n.language, options).format(value);
  };
  
  const formatCurrency = (value: number, currency: string = 'USD') => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency
    }).format(value);
  };
  
  const formatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(i18n.language, options).format(dateObj);
  };
  
  const formatTime = (date: Date | string | number) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(dateObj);
  };
  
  const formatRelativeTime = (date: Date | string | number) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    
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
  };
  
  const formatPercentage = (value: number, decimals: number = 0) => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value / 100);
  };
  
  return {
    formatNumber,
    formatCurrency,
    formatDate,
    formatTime,
    formatRelativeTime,
    formatPercentage
  };
}