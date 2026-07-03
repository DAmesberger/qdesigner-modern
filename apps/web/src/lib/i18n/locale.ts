// App-chrome locale management (Paraglide-backed) — ADR 0019.
//
// Replaces the former i18next stack. Locale selection is compile-time
// (messages are tree-shaken `m.*()` calls) with RUNTIME/COOKIE switching:
// setLocale() persists the PARAGLIDE_LOCALE cookie (our chosen strategy) and
// reloads so every surface re-renders in the new locale. There is no
// URL-locale routing.
//
// Participant-facing questionnaire content translation (MOD-04) is a separate,
// deferred per-questionnaire data-model concern and is intentionally NOT
// handled here.
import {
  getLocale,
  setLocale,
  getTextDirection,
  locales,
} from '$lib/paraglide/runtime';

export type Locale = (typeof locales)[number];

export interface LanguageOption {
  code: Locale;
  /** English name. */
  name: string;
  /** Endonym shown in the switcher. */
  nativeName: string;
  flag: string;
}

// Only locales with committed message files are advertised (MOD-06). The old
// stack listed 8 languages but shipped messages for 3; Paraglide's `locales`
// is the single source of truth and this list mirrors it.
export const languageOptions: readonly LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
];

/**
 * Reflect the active locale onto <html> (lang + dir + rtl/ltr class).
 * getTextDirection() derives the direction from the locale — an Arabic or
 * Hebrew locale would resolve to 'rtl' automatically — so the former
 * dir='rtl' / .rtl class mechanism is preserved even though every currently
 * shipped locale is left-to-right.
 */
export function applyDocumentLocale(locale: Locale = getLocale()): void {
  if (typeof document === 'undefined') return;
  const dir = getTextDirection(locale);
  const el = document.documentElement;
  el.lang = locale;
  el.dir = dir;
  el.classList.toggle('rtl', dir === 'rtl');
  el.classList.toggle('ltr', dir !== 'rtl');
}

/**
 * Persist + activate a locale. setLocale() writes the PARAGLIDE_LOCALE cookie
 * and reloads by default; applyDocumentLocale runs again on the fresh load.
 */
export function changeLocale(locale: Locale): void {
  setLocale(locale);
}

export { getLocale };
