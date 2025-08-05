// QDesigner Modern i18n Module
// Main exports for internationalization support

export { default as i18n, supportedLanguages, formatters } from './config';
export * from './hooks';
export * from './stores';
export * from './types';
export * from './utils/formatting';

// Re-export components
export { default as LanguageSwitcher } from './components/LanguageSwitcher.svelte';
export { default as TranslationManager } from './components/TranslationManager.svelte';

// Utility functions
export {
  getCurrentLanguage,
  getLanguageDirection,
  isRTL,
  changeLanguage,
  detectMissingTranslations,
  validateTranslationKeys
} from './config';