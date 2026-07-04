import { describe, it, expect } from 'vitest';
import type { Questionnaire } from './questionnaire';
import {
  resolveText,
  localizeQuestionnaire,
  getAvailableLocales,
  getBaseLocale,
  getTranslations,
  optionTranslationKey,
  type QuestionnaireTranslations,
} from './translation';

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    id: 'q1',
    name: 'Study',
    description: 'Base description',
    version: '1.0.0',
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    created: new Date(),
    modified: new Date(),
    variables: [],
    questions: [
      {
        id: 'question-1',
        type: 'single-choice',
        order: 0,
        required: false,
        display: {
          prompt: 'What is your favourite colour?',
          options: [
            { id: 'opt-red', label: 'Red', value: 'red' },
            { id: 'opt-blue', label: 'Blue', value: 'blue' },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture
      } as any,
      {
        id: 'instruction-1',
        type: 'instruction',
        order: 1,
        required: false,
        display: { content: 'Please read carefully.' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture
      } as any,
    ],
    pages: [{ id: 'page-1', name: 'Section One' }],
    flow: [],
    settings: { language: 'en' },
    ...overrides,
  };
}

const de: QuestionnaireTranslations = {
  de: {
    label: 'Deutsch',
    questions: {
      'question-1': {
        prompt: 'Was ist deine Lieblingsfarbe?',
        options: { 'opt-red': 'Rot' },
      },
      'instruction-1': { prompt: 'Bitte sorgfältig lesen.' },
    },
    pages: { 'page-1': { title: 'Abschnitt Eins' } },
    chrome: { welcome: 'Willkommen', consent: 'Einwilligung', completion: 'Danke' },
  },
};

describe('resolveText', () => {
  it('returns the base fallback when there are no translations', () => {
    const q = makeQuestionnaire();
    expect(resolveText(q, 'de', { kind: 'question-prompt', questionId: 'question-1' }, 'base')).toBe(
      'base'
    );
  });

  it('returns the localized string when present', () => {
    const q = makeQuestionnaire({ translations: de });
    expect(resolveText(q, 'de', { kind: 'chrome', slot: 'welcome' }, 'base')).toBe('Willkommen');
  });

  it('falls back for a missing or blank translation', () => {
    const q = makeQuestionnaire({
      translations: { de: { chrome: { welcome: '   ' } } },
    });
    expect(resolveText(q, 'de', { kind: 'chrome', slot: 'consent' }, 'base-consent')).toBe(
      'base-consent'
    );
    expect(resolveText(q, 'de', { kind: 'chrome', slot: 'welcome' }, 'base-welcome')).toBe(
      'base-welcome'
    );
  });

  it('reads translations from settings.translations, preferring it over the top level', () => {
    const q = makeQuestionnaire({
      translations: { de: { chrome: { welcome: 'top-level' } } },
      settings: {
        language: 'en',
        translations: { de: { chrome: { welcome: 'from-settings' } } },
      },
    });
    expect(getTranslations(q)?.de?.chrome?.welcome).toBe('from-settings');
    expect(resolveText(q, 'de', { kind: 'chrome', slot: 'welcome' }, 'x')).toBe('from-settings');
  });
});

describe('locale discovery', () => {
  it('lists the base locale first, then translation locales', () => {
    const q = makeQuestionnaire({ translations: { ...de, fr: {} } });
    expect(getBaseLocale(q)).toBe('en');
    expect(getAvailableLocales(q)).toEqual(['en', 'de', 'fr']);
  });

  it('defaults the base locale to en', () => {
    const q = makeQuestionnaire({ settings: {} });
    expect(getBaseLocale(q)).toBe('en');
  });
});

describe('optionTranslationKey', () => {
  it('prefers id, then value, then index', () => {
    expect(optionTranslationKey({ id: 'a', value: 'x' }, 0)).toBe('a');
    expect(optionTranslationKey({ value: 'x' }, 0)).toBe('x');
    expect(optionTranslationKey({}, 3)).toBe('3');
  });
});

describe('localizeQuestionnaire', () => {
  it('returns the same reference when there is nothing to localize', () => {
    const q = makeQuestionnaire();
    expect(localizeQuestionnaire(q, 'de')).toBe(q);
    expect(localizeQuestionnaire(q, undefined)).toBe(q);
  });

  it('returns the same reference for the base locale', () => {
    const q = makeQuestionnaire({ translations: de });
    expect(localizeQuestionnaire(q, 'en')).toBe(q);
  });

  it('localizes prompts, content, option labels and page titles without mutating the original', () => {
    const q = makeQuestionnaire({ translations: de });
    const localized = localizeQuestionnaire(q, 'de');

    expect(localized).not.toBe(q);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    const choice = localized.questions[0] as any;
    expect(choice.display.prompt).toBe('Was ist deine Lieblingsfarbe?');
    expect(choice.display.options[0].label).toBe('Rot');
    // untranslated option falls back to the base label
    expect(choice.display.options[1].label).toBe('Blue');
    // instruction uses display.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    expect((localized.questions[1] as any).display.content).toBe('Bitte sorgfältig lesen.');
    expect(localized.pages[0].name).toBe('Abschnitt Eins');

    // original untouched
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    expect((q.questions[0] as any).display.prompt).toBe('What is your favourite colour?');
    expect(q.pages[0].name).toBe('Section One');
  });
});
