import { describe, it, expect } from 'vitest';
import type { Questionnaire } from './questionnaire';
import {
  resolveText,
  localizeQuestionnaire,
  getAvailableLocales,
  getBaseLocale,
  getTranslations,
  getQuestionBasePrompt,
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

// A questionnaire carrying a single arbitrary-shaped question plus a `de` prompt
// translation for it — used to prove the localizer writes to the SAME field the
// runtime renders from, for every persisted prompt shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising heterogeneous persisted question shapes
function withQuestion(question: any, prompt = 'Übersetzt'): Questionnaire {
  return makeQuestionnaire({
    questions: [question],
    translations: { de: { questions: { [question.id]: { prompt } } } },
  });
}

describe('getQuestionBasePrompt', () => {
  it('mirrors the runtime resolution order title → prompt → config.prompt → display.prompt → display.content → text', () => {
    expect(getQuestionBasePrompt({ title: 'T', prompt: 'P', display: { prompt: 'D' } })).toBe('T');
    expect(getQuestionBasePrompt({ prompt: 'P', display: { prompt: 'D' } })).toBe('P');
    expect(getQuestionBasePrompt({ config: { prompt: 'C' }, display: { prompt: 'D' } })).toBe('C');
    expect(getQuestionBasePrompt({ display: { prompt: 'D' } })).toBe('D');
    expect(getQuestionBasePrompt({ display: { content: 'Content' } })).toBe('Content');
    expect(getQuestionBasePrompt({ text: 'How are you feeling today?' })).toBe(
      'How are you feeling today?'
    );
    expect(getQuestionBasePrompt({})).toBe('');
    // an object-shaped `prompt` (reaction-time stimulus) is not a usable string
    expect(getQuestionBasePrompt({ prompt: { text: 'x' }, text: 'flat' })).toBe('flat');
  });
});

describe('localizeQuestionnaire — writes the field the runtime renders', () => {
  it('localizes a bare text-input whose prompt lives in the flat `text` field (no display object)', () => {
    const q = withQuestion({ id: 'q-text', type: 'text-input', order: 0, text: 'How are you?' });
    const localized = localizeQuestionnaire(q, 'de');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    const question = localized.questions[0] as any;
    expect(question.text).toBe('Übersetzt');
    expect(question.display).toBeUndefined();
    // original untouched
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    expect((q.questions[0] as any).text).toBe('How are you?');
  });

  it('localizes the flat `prompt` field when present', () => {
    const q = withQuestion({ id: 'q-flat', type: 'text-input', order: 0, prompt: 'Base' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    expect((localizeQuestionnaire(q, 'de').questions[0] as any).prompt).toBe('Übersetzt');
  });

  it('localizes the flat `title` field first when present', () => {
    const q = withQuestion({
      id: 'q-title',
      type: 'text-input',
      order: 0,
      title: 'Base title',
      display: { prompt: 'ignored' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    const question = localizeQuestionnaire(q, 'de').questions[0] as any;
    expect(question.title).toBe('Übersetzt');
    // the shadowed display.prompt is left as-is (runtime never reads it here)
    expect(question.display.prompt).toBe('ignored');
  });

  it('localizes a flat `config.prompt` field', () => {
    const q = withQuestion({
      id: 'q-config',
      type: 'text-input',
      order: 0,
      config: { prompt: 'Base config prompt' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    expect((localizeQuestionnaire(q, 'de').questions[0] as any).config.prompt).toBe('Übersetzt');
  });

  it('defaults to display.prompt when the question carries no base prompt field', () => {
    const q = withQuestion({ id: 'q-empty', type: 'text-input', order: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    expect((localizeQuestionnaire(q, 'de').questions[0] as any).display.prompt).toBe('Übersetzt');
  });

  it('localizes option labels from display.options, config.options and responseType.options', () => {
    const q = makeQuestionnaire({
      questions: [
        {
          id: 'q-opts',
          type: 'single-choice',
          order: 0,
          text: 'Pick one',
          display: { options: [{ id: 'a', label: 'Apple', value: 'apple' }] },
          config: { options: [{ id: 'a', label: 'Apple', value: 'apple' }] },
          responseType: { type: 'single', options: [{ value: 'apple', label: 'Apple' }] },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture
        } as any,
      ],
      translations: {
        de: { questions: { 'q-opts': { prompt: 'Wähle', options: { a: 'Apfel', apple: 'Apfel' } } } },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fixture access
    const question = localizeQuestionnaire(q, 'de').questions[0] as any;
    expect(question.text).toBe('Wähle');
    expect(question.display.options[0].label).toBe('Apfel');
    expect(question.config.options[0].label).toBe('Apfel');
    expect(question.responseType.options[0].label).toBe('Apfel');
  });
});
