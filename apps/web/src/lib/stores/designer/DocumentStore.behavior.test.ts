import { describe, expect, it } from 'vitest';
import { DocumentStore } from './DocumentStore';

describe('portable behavioral declarations in the designer', () => {
  it('preserves page deadlines, block layout, empty flow targets and optional extensions', () => {
    const store = new DocumentStore();
    const source = {
      ...store.createEmptyQuestionnaire({ id: 'behavior-study' }),
      extensions: { 'org.example.study': { required: false, data: { protocol: 'ABC-1' } } },
      pages: [
        {
          id: 'start',
          settings: { timeLimit: 5000, onTimeLimit: 'terminate', allowNavigation: false },
          blocks: [
            {
              id: 'block',
              pageId: 'start',
              type: 'standard',
              questions: [],
              layout: { type: 'grid', columns: 2, spacing: 8, alignment: 'center' },
            },
          ],
        },
        { id: 'end', blocks: [] },
      ],
      flow: [{ id: 'finish', type: 'skip', condition: 'true', source: 'start', target: 'end' }],
    };
    const normalized = store.normalizeQuestionnaire(source);
    const persisted = JSON.parse(JSON.stringify(store.exportQuestionnaire(normalized)));
    expect(persisted.pages).toEqual(source.pages);
    expect(persisted.extensions).toEqual(source.extensions);
    expect(persisted.flow).toEqual(source.flow);
    expect(JSON.parse(JSON.stringify(store.normalizeQuestionnaire(persisted)))).toEqual(persisted);
  });
});
