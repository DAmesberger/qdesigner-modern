// QDesigner Modern i18n Types
// TypeScript interfaces and types for internationalization

import type { TFunction, Resource } from 'i18next';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  flag?: string;
  region?: string;
  currency?: string;
  dateFormat?: string;
  timeFormat?: string;
}

export interface TranslationNamespace {
  name: string;
  description?: string;
  keys: string[];
}

export interface TranslationEntry {
  key: string;
  namespace: string;
  translations: Record<string, string>;
  missing: string[];
  modified: boolean;
  pluralForm?: boolean;
  variables?: string[];
  context?: string;
  lastModified?: Date;
  modifiedBy?: string;
}

export interface MissingTranslation {
  key: string;
  namespace: string;
  language: string;
  fallbackValue?: string;
  context?: string;
}

export interface TranslationValidationError {
  key: string;
  namespace: string;
  language: string;
  error: 'missing' | 'empty' | 'invalid_interpolation' | 'invalid_plural';
  message: string;
  suggestion?: string;
}

export interface I18nConfig {
  resources: Resource;
  fallbackLng: string;
  debug: boolean;
  defaultNS: string;
  ns: string[];
  interpolation: {
    escapeValue: boolean;
  };
  detection: {
    order: string[];
    lookupQuerystring: string;
    lookupCookie: string;
    lookupLocalStorage: string;
    caches: string[];
    excludeCacheFor: string[];
  };
  compatibilityJSON: 'v3' | 'v4';
  backend?: {
    loadPath: string;
    addPath: string;
  };
}

export interface FormatterOptions {
  number?: Intl.NumberFormatOptions;
  currency?: {
    currency: string;
    options?: Intl.NumberFormatOptions;
  };
  date?: Intl.DateTimeFormatOptions;
  time?: Intl.DateTimeFormatOptions;
  relativeTime?: {
    numeric?: 'always' | 'auto';
    style?: 'long' | 'short' | 'narrow';
  };
  percentage?: {
    decimals?: number;
    options?: Intl.NumberFormatOptions;
  };
  list?: {
    type?: 'conjunction' | 'disjunction' | 'unit';
    style?: 'long' | 'short' | 'narrow';
  };
}

export interface I18nStore {
  currentLanguage: string;
  isRTL: boolean;
  isInitialized: boolean;
  translations: Record<string, any>;
  missingKeys: MissingTranslation[];
  validationErrors: TranslationValidationError[];
}

export interface TranslationHook {
  t: TFunction;
  i18n: any;
  ready: boolean;
  changeLanguage: (lng: string) => Promise<void>;
  currentLanguage: string;
  isRTL: boolean;
}

export interface LanguageSwitcherProps {
  variant?: 'dropdown' | 'tabs' | 'buttons';
  showFlags?: boolean;
  showNativeNames?: boolean;
  size?: 'sm' | 'md' | 'lg';
  position?: 'left' | 'right' | 'center';
  className?: string;
}

export interface TranslationManagerProps {
  readonly?: boolean;
  allowInlineEdit?: boolean;
  showValidation?: boolean;
  showStatistics?: boolean;
  allowImportExport?: boolean;
  filterLanguages?: string[];
  filterNamespaces?: string[];
}

export interface I18nContextValue {
  currentLanguage: string;
  changeLanguage: (lng: string) => Promise<void>;
  t: TFunction;
  isRTL: boolean;
  supportedLanguages: Language[];
  formatters: {
    number: (value: number, options?: Intl.NumberFormatOptions) => string;
    currency: (value: number, currency?: string, options?: Intl.NumberFormatOptions) => string;
    date: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
    time: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
    relativeTime: (date: Date | string | number, options?: FormatterOptions['relativeTime']) => string;
    percentage: (value: number, decimals?: number, options?: Intl.NumberFormatOptions) => string;
    list: (items: string[], options?: FormatterOptions['list']) => string;
  };
}

export interface TranslationImportResult {
  success: boolean;
  imported: number;
  updated: number;
  errors: string[];
  warnings: string[];
}

export interface TranslationExportOptions {
  languages?: string[];
  namespaces?: string[];
  format?: 'json' | 'csv' | 'xlsx';
  includeEmpty?: boolean;
  includeMetadata?: boolean;
}

export interface LocaleDetectionResult {
  detected: string;
  fallback: string;
  supported: boolean;
  confidence: number;
  sources: string[];
}

export interface RTLConfig {
  supportedLanguages: string[];
  stylesheets: {
    ltr: string;
    rtl: string;
  };
  attributes: {
    dir: boolean;
    lang: boolean;
  };
  autoMirror: boolean;
}