/**
 * Per-locale translation completeness (R4-5).
 *
 * Pure helpers extracted from TranslationPanel so the completeness numbers the
 * panel shows are unit-testable and computed from the same translation
 * structures the panel already renders (R1-7's `countTranslations`, generalized
 * here as `countTranslatedStrings`). No `$state` — safe to import in plain
 * `.test.ts`.
 */

import { getQuestionBasePrompt, type LocaleCode, type LocaleTranslation } from '$lib/shared';

/* eslint-disable @typescript-eslint/no-explicit-any -- questionnaire/option shapes vary per type; mirrors TranslationPanel's own loose access */

/** Options a question exposes for translation — mirrors TranslationPanel.questionOptions. */
function questionOptions(question: any): Array<{ label?: unknown }> {
  const options =
    question?.display?.options ?? question?.config?.options ?? question?.responseType?.options;
  return Array.isArray(options) ? options : [];
}

/** The three chrome slots the panel translates, in base-text form. */
function chromeBaseValues(questionnaire: any): string[] {
  return [
    questionnaire?.description ?? '',
    questionnaire?.consent?.content ?? '',
    questionnaire?.settings?.distribution?.completionMessage ??
      questionnaire?.completionMessage ??
      '',
  ];
}

/**
 * Non-empty translated strings stored for a locale bundle. Identical semantics
 * to the panel's original `countTranslations`; kept as the single numerator.
 */
export function countTranslatedStrings(bundle: LocaleTranslation | undefined): number {
  if (!bundle) return 0;
  let count = 0;
  for (const q of Object.values(bundle.questions ?? {})) {
    if (q.prompt && q.prompt.trim()) count += 1;
    for (const label of Object.values(q.options ?? {})) {
      if (label && label.trim()) count += 1;
    }
  }
  for (const p of Object.values(bundle.pages ?? {})) {
    if (p.title && p.title.trim()) count += 1;
  }
  for (const value of Object.values(bundle.chrome ?? {})) {
    if (value && value.trim()) count += 1;
  }
  return count;
}

/**
 * Total translatable slots that actually have base content — the denominator.
 * Only base-present fields count so 100% is reachable (an empty base prompt is
 * nothing to translate).
 */
export function countTranslatableSlots(questionnaire: any): number {
  let total = 0;
  for (const q of questionnaire?.questions ?? []) {
    if (getQuestionBasePrompt(q).trim()) total += 1;
    for (const option of questionOptions(q)) {
      if (String(option?.label ?? '').trim()) total += 1;
    }
  }
  for (const p of questionnaire?.pages ?? []) {
    if ((p?.name ?? '').trim()) total += 1;
  }
  for (const value of chromeBaseValues(questionnaire)) {
    if (value.trim()) total += 1;
  }
  return total;
}

export interface LocaleCompleteness {
  /** Translated slots filled for this locale (clamped to `total`). */
  done: number;
  /** Base-present translatable slots. */
  total: number;
  /** Slots still awaiting a translation. */
  missing: number;
  /** Whole-percent completion, 0 when nothing is translatable. */
  percent: number;
}

/** Completeness of one locale against the base-present translatable slots. */
export function localeCompleteness(
  questionnaire: any,
  bundle: LocaleTranslation | undefined
): LocaleCompleteness {
  const total = countTranslatableSlots(questionnaire);
  const done = Math.min(countTranslatedStrings(bundle), total);
  const missing = Math.max(total - done, 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, missing, percent };
}

/** Convenience map builder for a set of locales. */
export function completenessByLocale(
  questionnaire: any,
  translations: Record<LocaleCode, LocaleTranslation> | undefined,
  locales: LocaleCode[]
): Record<LocaleCode, LocaleCompleteness> {
  const out: Record<LocaleCode, LocaleCompleteness> = {};
  for (const locale of locales) {
    out[locale] = localeCompleteness(questionnaire, translations?.[locale]);
  }
  return out;
}
