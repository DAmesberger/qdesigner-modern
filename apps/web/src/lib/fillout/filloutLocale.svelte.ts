// Fillout chrome locale bridge (R4-1).
//
// Question CONTENT already localizes to the participant's chosen locale
// (effectiveLocale / localizeQuestionnaire / resolveText). The surrounding
// built-in chrome — buttons, consent copy, error screens — is rendered by
// Paraglide `m.*()` calls, which resolve their locale through the app-wide
// cookie/preferredLanguage strategy. Left alone, a Spanish questionnaire would
// ship English chrome.
//
// We overwrite Paraglide's `getLocale()` to prefer a fillout-scoped override
// (the participant's content-locale pick), falling back to the app's normal
// resolution when no override is set. The override is a module-level `$state`,
// so every `m.*()` call made inside a component's reactive scope re-runs when it
// changes — a language-picker switch on the welcome screen updates the chrome
// live. The fillout page sets it as the effective content locale changes and
// clears it on unmount, so the researcher app's locale is never touched.
import {
  getLocale,
  overwriteGetLocale,
  locales,
  baseLocale,
  type Locale,
} from '$lib/paraglide/runtime';

let override = $state<Locale | null>(null);

// Capture the app's original resolver once, then route every lookup through the
// override. Reading `override` inside the closure registers the reactive
// dependency for any `m.*()` call evaluated in a Svelte reactive context.
const originalGetLocale = getLocale;
overwriteGetLocale(() => override ?? originalGetLocale());

/**
 * Map an arbitrary questionnaire content locale onto a locale Paraglide ships
 * chrome messages for. Exact match wins; otherwise the language subtag
 * (`de-AT` → `de`); otherwise the base locale. This keeps an unknown content
 * locale (e.g. `fr`) from falling through to the compiler's last-locale default.
 */
export function resolveChromeLocale(contentLocale: string | null | undefined): Locale {
  if (!contentLocale) return baseLocale;
  const all = locales as readonly string[];
  if (all.includes(contentLocale)) return contentLocale as Locale;
  const lang = contentLocale.split('-')[0]?.toLowerCase();
  if (lang && all.includes(lang)) return lang as Locale;
  return baseLocale;
}

/** Point the fillout chrome at a specific content locale. */
export function setFilloutChromeLocale(contentLocale: string | null | undefined): void {
  override = resolveChromeLocale(contentLocale);
}

/** Restore the app's normal locale resolution (call on fillout unmount). */
export function clearFilloutChromeLocale(): void {
  override = null;
}
