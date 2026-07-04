/**
 * Per-questionnaire CONTENT translation (MOD-04, ADR 0022).
 *
 * This is distinct from Paraglide app-UI i18n (ADR 0019). Paraglide translates
 * the *application chrome* (buttons, designer labels, dashboard) via `m.*()`
 * message functions compiled from static catalogues. THIS module translates the
 * *participant-facing questionnaire content* an author writes — question prompts,
 * option labels, page titles and the welcome/consent/completion chrome — which is
 * author-supplied data, lives inside the questionnaire definition, and therefore
 * cannot live in a static Paraglide catalogue.
 *
 * The translation map is optional and additive: a questionnaire with no
 * `translations` renders exactly as before (the base language the author typed).
 * Each locale bundle only needs to carry the strings that differ; anything
 * missing falls back to the base text via {@link resolveText}.
 */

import type { Questionnaire } from './questionnaire';

/** BCP-47-ish locale code, e.g. `en`, `de`, `fr`, `pt-BR`. */
export type LocaleCode = string;

/** Translated strings for a single question. */
export interface QuestionTranslation {
  /** Localized prompt / body text (maps to `display.prompt` or `display.content`). */
  prompt?: string;
  /** Localized option labels keyed by {@link optionTranslationKey}. */
  options?: Record<string, string>;
}

/** Translated strings for a single page. */
export interface PageTranslation {
  /** Localized page title (maps to `page.name`). */
  title?: string;
}

/** Translated participant-facing chrome outside the question flow. */
export interface ChromeTranslation {
  /** Welcome / start-screen body. */
  welcome?: string;
  /** Informed-consent body. */
  consent?: string;
  /** Completion / thank-you message. */
  completion?: string;
}

/** All translated content for one locale. */
export interface LocaleTranslation {
  /** Optional human-readable label for the language picker, e.g. `Deutsch`. */
  label?: string;
  questions?: Record<string, QuestionTranslation>;
  pages?: Record<string, PageTranslation>;
  chrome?: ChromeTranslation;
}

/** Per-locale content map stored on the questionnaire definition. */
export type QuestionnaireTranslations = Record<LocaleCode, LocaleTranslation>;

/**
 * A typed pointer to a single translatable string. Passed to {@link resolveText}
 * and used by the designer UI as a stable key.
 */
export type TranslationPath =
  | { kind: 'question-prompt'; questionId: string }
  | { kind: 'question-option'; questionId: string; optionKey: string }
  | { kind: 'page-title'; pageId: string }
  | { kind: 'chrome'; slot: keyof ChromeTranslation };

/** Fallback locale used when a questionnaire declares no base language. */
export const DEFAULT_BASE_LOCALE: LocaleCode = 'en';

// A questionnaire definition may carry the translation map either at the top
// level (direct API / import authoring — see the `translations?` field on
// Questionnaire) or nested under `settings.translations` (where the designer
// persists it so it rides the existing settings round-trip through collaboration
// and JSONB persistence, mirroring how `settings.theme` is stored). Reads accept
// both; the settings location wins because it is the designer's live location.
type TranslatableDefinition =
  | (Pick<Questionnaire, 'settings'> & { translations?: QuestionnaireTranslations })
  | null
  | undefined;

/** Resolve the translation map from either storage location (settings wins). */
export function getTranslations(def: TranslatableDefinition): QuestionnaireTranslations | undefined {
  if (!def) return undefined;
  const settingsTranslations = (
    def.settings as { translations?: QuestionnaireTranslations } | undefined
  )?.translations;
  if (settingsTranslations) return settingsTranslations;
  return (def as { translations?: QuestionnaireTranslations }).translations;
}

/** The declared base (authoring) locale of the content, from `settings.language`. */
export function getBaseLocale(def: TranslatableDefinition): LocaleCode {
  const language = (def?.settings as { language?: string } | undefined)?.language;
  return language && language.trim() ? language : DEFAULT_BASE_LOCALE;
}

/**
 * The locales a participant can pick between: the base language first, then every
 * locale that has a translation bundle. Deduplicated, order-stable.
 */
export function getAvailableLocales(def: TranslatableDefinition): LocaleCode[] {
  const base = getBaseLocale(def);
  const locales: LocaleCode[] = [base];
  const translations = getTranslations(def);
  if (translations) {
    for (const locale of Object.keys(translations)) {
      if (!locales.includes(locale)) locales.push(locale);
    }
  }
  return locales;
}

/** Human label for a locale in the picker (bundle label → Intl name → code). */
export function getLocaleLabel(def: TranslatableDefinition, locale: LocaleCode): string {
  const bundleLabel = getTranslations(def)?.[locale]?.label;
  if (bundleLabel && bundleLabel.trim()) return bundleLabel;
  try {
    const display = new Intl.DisplayNames([locale], { type: 'language' });
    const name = display.of(locale);
    if (name && name !== locale) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch {
    // Intl.DisplayNames unavailable or invalid locale — fall through to the code.
  }
  return locale;
}

function lookupTranslation(
  translations: QuestionnaireTranslations | undefined,
  locale: LocaleCode | undefined,
  path: TranslationPath
): string | undefined {
  if (!translations || !locale) return undefined;
  const bundle = translations[locale];
  if (!bundle) return undefined;

  switch (path.kind) {
    case 'question-prompt':
      return bundle.questions?.[path.questionId]?.prompt;
    case 'question-option':
      return bundle.questions?.[path.questionId]?.options?.[path.optionKey];
    case 'page-title':
      return bundle.pages?.[path.pageId]?.title;
    case 'chrome':
      return bundle.chrome?.[path.slot];
    default:
      return undefined;
  }
}

/**
 * Return the localized string for `path` in `locale`, or `fallback` (the base
 * text the author typed) when there is no non-empty translation. Blank /
 * whitespace translations are treated as absent so a half-filled locale never
 * blanks out content.
 */
export function resolveText(
  def: TranslatableDefinition,
  locale: LocaleCode | undefined,
  path: TranslationPath,
  fallback: string
): string {
  const translated = lookupTranslation(getTranslations(def), locale, path);
  if (typeof translated === 'string' && translated.trim() !== '') {
    return translated;
  }
  return fallback;
}

/**
 * Stable key for an option's translation entry. Prefers the option `id`, then a
 * stringified `value`, then the positional index. The designer writes with this
 * key and {@link localizeQuestionnaire} reads with it, so they must agree.
 */
export function optionTranslationKey(
  option: { id?: string | number; value?: string | number } | null | undefined,
  index: number
): string {
  if (option) {
    if (option.id !== undefined && option.id !== null && String(option.id) !== '') {
      return String(option.id);
    }
    if (option.value !== undefined && option.value !== null && String(option.value) !== '') {
      return String(option.value);
    }
  }
  return String(index);
}

function safeClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Svelte $state proxies are not always structured-cloneable; fall back.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Produce a copy of the questionnaire with question prompts, option labels and
 * page titles replaced by their `locale` translations (falling back to the base
 * text). Chrome (welcome/consent/completion) is resolved separately at the
 * fillout screen boundary via {@link resolveText}, because those strings live in
 * app-specific definition fields rather than the core content surface.
 *
 * Returns the input unchanged (same reference, no clone) when there is nothing
 * to localize, keeping the common no-translation path allocation-free and
 * fully back-compatible.
 */
export function localizeQuestionnaire<T extends Questionnaire>(
  def: T,
  locale: LocaleCode | undefined
): T {
  if (!def || !locale) return def;
  const translations = getTranslations(def);
  const bundle = translations?.[locale];
  if (!bundle) return def;
  if (locale === getBaseLocale(def)) return def;

  const clone = safeClone(def);

  if (bundle.questions && Array.isArray(clone.questions)) {
    for (const question of clone.questions) {
      const qt = bundle.questions[question.id];
      if (!qt) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- display shapes vary per question type
      const display = (question as any).display;

      if (qt.prompt && qt.prompt.trim() && display) {
        if (typeof display.prompt === 'string') {
          display.prompt = qt.prompt;
        } else if (typeof display.content === 'string') {
          display.content = qt.prompt;
        } else {
          display.prompt = qt.prompt;
        }
      }

      if (qt.options && display && Array.isArray(display.options)) {
        display.options.forEach(
          (
            option: { id?: string | number; value?: string | number; label?: string },
            index: number
          ) => {
            const key = optionTranslationKey(option, index);
            const translatedLabel = qt.options?.[key];
            if (translatedLabel && translatedLabel.trim()) {
              option.label = translatedLabel;
            }
          }
        );
      }
    }
  }

  if (bundle.pages && Array.isArray(clone.pages)) {
    for (const page of clone.pages) {
      const pt = bundle.pages[page.id];
      if (pt?.title && pt.title.trim()) {
        page.name = pt.title;
      }
    }
  }

  return clone;
}
