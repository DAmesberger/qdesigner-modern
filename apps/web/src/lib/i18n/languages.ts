// Language definitions — extracted to a standalone module to avoid circular
// dependencies between stores.ts ↔ config.ts.

import type { Language } from './types';

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
