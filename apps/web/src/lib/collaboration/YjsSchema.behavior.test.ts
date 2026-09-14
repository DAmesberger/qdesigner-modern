import { describe, expect, it } from 'vitest';
import { DocumentStore } from '$lib/stores/designer/DocumentStore';
import { questionnaireToYDoc, yDocToQuestionnaire } from './YjsSchema';

describe('collaborative behavioral document', () => {
  it('preserves authored behavior through a collaborative save and remote decode', () => {
    const store = new DocumentStore();
    const source = store.normalizeQuestionnaire({
      ...store.createEmptyQuestionnaire({ id: 'study' }),
      consent: { title: 'Consent', content: 'Read this', requireSignature: true },
      extensions: { 'org.example.protocol': { required: false, data: { version: 2 } } },
      pages: [
        {
          id: 'p',
          questions: ['direct'],
          settings: { timeLimit: 5000 },
          blocks: [
            {
              id: 'b',
              pageId: 'p',
              type: 'adaptive',
              questions: ['item'],
              layout: { type: 'vertical' },
              adaptive: { items: [{ id: 'item', a: 1, b: 0 }], maxItems: 1 },
            },
          ],
        },
      ],
      questions: [
        { id: 'direct', type: 'text-input' },
        { id: 'item', type: 'scale' },
      ],
    });
    const doc = questionnaireToYDoc(source);
    try {
      const remote = yDocToQuestionnaire(doc);
      expect(remote.consent).toEqual(source.consent);
      expect(remote.extensions).toEqual(source.extensions);
      expect(remote.pages).toEqual(source.pages);
      expect(remote.questions).toEqual(source.questions);
    } finally {
      doc.destroy();
    }
  });

  it('clears removed consent and extensions when replacing an existing collaborative document', () => {
    const store = new DocumentStore();
    const original = store.normalizeQuestionnaire({
      ...store.createEmptyQuestionnaire(),
      consent: { content: 'Prior consent' },
      extensions: { 'org.example.protocol': { required: false, data: {} } },
    });
    const doc = questionnaireToYDoc(original);
    try {
      const replacement = { ...original };
      delete replacement.consent;
      delete replacement.extensions;
      questionnaireToYDoc(replacement, doc);
      expect(yDocToQuestionnaire(doc).consent).toBeUndefined();
      expect(yDocToQuestionnaire(doc).extensions).toBeUndefined();
    } finally {
      doc.destroy();
    }
  });
});
