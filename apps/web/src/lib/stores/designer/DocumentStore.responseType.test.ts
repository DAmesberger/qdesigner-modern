import { describe, expect, it } from 'vitest';
import { DocumentStore } from './DocumentStore';

describe('authored response declarations', () => {
  it.each([
    'text-input',
    'number-input',
    'single-choice',
    'multiple-choice',
    'scale',
    'rating',
    'matrix',
    'ranking',
    'date-time',
    'file-upload',
    'media-response',
    'drawing',
    'reaction-time',
    'reaction-experiment',
    'webgl',
  ])('does not invent a responseType when opening a %s module', (type) => {
    const store = new DocumentStore();
    const source = { id: 'q', type, display: { prompt: 'Question' }, config: { min: 2, max: 9 } };
    const normalized = store.normalizeQuestionnaire({ id: 'study', questions: [source] });
    expect(normalized.questions[0]).not.toHaveProperty('responseType');
    expect(normalized.questions[0]).toMatchObject(source);
  });

  it('retains an explicit response declaration through repeated normalization', () => {
    const store = new DocumentStore();
    const source = { id: 'q', type: 'scale', responseType: { type: 'scale', min: 2, max: 9 } };
    const first = store.normalizeQuestionnaire({ id: 'study', questions: [source] });
    expect(first.questions[0]).toMatchObject(source);
    expect(store.normalizeQuestionnaire(first).questions).toEqual(first.questions);
  });
});
