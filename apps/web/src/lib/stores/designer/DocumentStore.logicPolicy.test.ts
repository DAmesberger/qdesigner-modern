import { describe, expect, it } from 'vitest';
import { DocumentStore } from './DocumentStore';

describe('designer input logic policy', () => {
  it.each([
    { scripts: { onInit: 'globalThis.executed = true' } },
    { content: { pages: [{ script: 'globalThis.executed = true' }] } },
    { definition: { questions: [{ settings: { script: 'globalThis.executed = true' } }] } },
  ])('rejects executable fields before normalization can discard them', (input) => {
    const store = new DocumentStore();
    expect(() => store.normalizeQuestionnaire(input)).toThrow('UNSAFE_JAVASCRIPT');
    expect(JSON.stringify(input)).toContain('globalThis.executed = true');
  });
});
