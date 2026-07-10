import { describe, it, expect } from 'vitest';
import {
  countTranslatedStrings,
  countTranslatableSlots,
  localeCompleteness,
  completenessByLocale,
} from './translationCompleteness';

// A small questionnaire whose base-present translatable slots are:
//   q1 prompt, q1 option A, q1 option B  (3)
//   q2 prompt                            (1)  — q2 has no options
//   page p1 title                        (1)
//   chrome: description (welcome)        (1)
// = 6 translatable slots total. (q3 has an empty prompt → not translatable.)
const questionnaire = {
  description: 'Welcome to the study',
  questions: [
    { id: 'q1', display: { prompt: 'How do you feel?', options: [{ label: 'Good' }, { label: 'Bad' }] } },
    { id: 'q2', title: 'Your age?' },
    { id: 'q3', display: { prompt: '' } },
  ],
  pages: [{ id: 'p1', name: 'Intro' }],
};

describe('countTranslatableSlots', () => {
  it('counts only base-present slots (empty prompts excluded)', () => {
    expect(countTranslatableSlots(questionnaire)).toBe(6);
  });

  it('is 0 for an empty questionnaire', () => {
    expect(countTranslatableSlots({ questions: [], pages: [] })).toBe(0);
    expect(countTranslatableSlots(undefined)).toBe(0);
  });
});

describe('countTranslatedStrings', () => {
  it('counts non-empty stored translations across questions, pages and chrome', () => {
    const bundle = {
      questions: {
        q1: { prompt: 'Wie fühlst du dich?', options: { '0': 'Gut', '1': '' } },
        q2: { prompt: 'Dein Alter?' },
      },
      pages: { p1: { title: 'Einführung' } },
      chrome: { welcome: 'Willkommen', consent: '  ' },
    };
    // q1 prompt + q1 option[0] + q2 prompt + p1 title + chrome.welcome = 5
    // (empty option[1] and whitespace consent are ignored)
    expect(countTranslatedStrings(bundle)).toBe(5);
  });

  it('is 0 for an undefined or empty bundle', () => {
    expect(countTranslatedStrings(undefined)).toBe(0);
    expect(countTranslatedStrings({})).toBe(0);
  });
});

describe('localeCompleteness', () => {
  it('reports done/total/missing/percent against base-present slots', () => {
    const bundle = {
      questions: { q1: { prompt: 'Wie?', options: { '0': 'Gut' } } },
    };
    // done = 2 (q1 prompt + one option), total = 6
    const c = localeCompleteness(questionnaire, bundle);
    expect(c).toEqual({ done: 2, total: 6, missing: 4, percent: 33 });
  });

  it('reaches 100% when every base slot is translated', () => {
    const full = {
      questions: {
        q1: { prompt: 'x', options: { '0': 'a', '1': 'b' } },
        q2: { prompt: 'y' },
      },
      pages: { p1: { title: 't' } },
      chrome: { welcome: 'w' },
    };
    expect(localeCompleteness(questionnaire, full).percent).toBe(100);
  });

  it('clamps done to total so a stray extra translation never exceeds 100%', () => {
    const overfull = {
      questions: { q3: { prompt: 'translation for an empty base slot' } },
    };
    const c = localeCompleteness({ questions: [], pages: [] }, overfull);
    expect(c.total).toBe(0);
    expect(c.done).toBe(0);
    expect(c.percent).toBe(0);
  });

  it('is 0% for a locale with no translations', () => {
    expect(localeCompleteness(questionnaire, undefined).percent).toBe(0);
    expect(localeCompleteness(questionnaire, {}).missing).toBe(6);
  });
});

describe('completenessByLocale', () => {
  it('builds a per-locale map', () => {
    const translations = {
      de: { questions: { q1: { prompt: 'Wie?' } } },
      fr: {},
    };
    const map = completenessByLocale(questionnaire, translations, ['de', 'fr']);
    expect(map.de?.done).toBe(1);
    expect(map.fr?.done).toBe(0);
    expect(map.de?.total).toBe(6);
  });
});
