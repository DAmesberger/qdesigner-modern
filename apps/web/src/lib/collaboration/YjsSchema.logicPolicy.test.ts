import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { questionnaireToYDoc, yDocToQuestionnaire } from './YjsSchema';

describe('collaborative definition logic policy', () => {
  it('rejects a legacy page hook before decoding can silently drop it', () => {
    const doc = new Y.Doc();
    const page = new Y.Map<unknown>();
    doc.getArray('pages').push([page]);
    page.set('id', 'p1');
    page.set('script', 'const hooks = {}');
    expect(() => yDocToQuestionnaire(doc)).toThrow('UNSAFE_JAVASCRIPT');
    expect(page.get('script')).toBe('const hooks = {}');
    doc.destroy();
  });

  it('rejects legacy question hooks stored inside settings', () => {
    const doc = new Y.Doc();
    const question = new Y.Map<unknown>();
    doc.getMap('questions').set('q1', question);
    question.set('settings', { script: 'const hooks = {}' });
    expect(() => yDocToQuestionnaire(doc)).toThrow('UNSAFE_JAVASCRIPT');
    doc.destroy();
  });

  it('rejects reseeding before mutating the collaborative document', () => {
    const doc = new Y.Doc();
    const definition = yDocToQuestionnaire(doc);
    Object.assign(definition.settings, { script: 'throw 1' });
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => questionnaireToYDoc(definition, doc)).toThrow('UNSAFE_JAVASCRIPT');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    doc.destroy();
  });
});
