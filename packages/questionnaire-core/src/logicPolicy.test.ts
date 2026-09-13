import { describe, expect, it } from 'vitest';
import { assertNoJavaScriptHooks, findJavaScriptHooks } from './logicPolicy';

describe('questionnaire authored-logic boundary', () => {
  it.each(['globalScripts', 'global_scripts'])('rejects the stored %s alias before normalization', field => {
    const input = { definition: { [field]: { onInit: 'globalThis.executed = true' } } };
    expect(findJavaScriptHooks(input).map(d => d.path)).toEqual([`questionnaire.definition.${field}`]);
    expect(() => assertNoJavaScriptHooks(input)).toThrow('UNSAFE_JAVASCRIPT');
  });
  it('rejects page and question hooks without executing or dropping them', () => {
    const definition = {
      pages: [{ script: 'globalThis.shouldNeverRun = true' }],
      questions: [{ settings: { script: 'export const hooks = {}' } }],
    };
    const before = JSON.stringify(definition);
    expect(findJavaScriptHooks(definition).map((d) => d.path)).toEqual([
      'questionnaire.pages[0].script',
      'questionnaire.questions[0].settings.script',
    ]);
    expect(() => assertNoJavaScriptHooks(definition)).toThrow('UNSAFE_JAVASCRIPT');
    expect(JSON.stringify(definition)).toBe(before);
    expect('shouldNeverRun' in globalThis).toBe(false);
  });

  it('checks stored content and question registries, including custom function bodies', () => {
    expect(
      findJavaScriptHooks({
        content: {
          questions: { q1: { settings: { script: 'throw 1' } } },
          customFunctions: [{ name: 'F', body: 'return 1' }],
        },
      }).map((d) => d.path)
    ).toEqual([
      'questionnaire.content.customFunctions',
      'questionnaire.content.questions["q1"].settings.script',
    ]);
  });

  it('permits empty obsolete fields, ordinary text and existing formula expressions', () => {
    expect(
      findJavaScriptHooks({
        pages: [{ script: '  ' }],
        questions: [{ settings: { script: '' }, display: { content: 'JavaScript example' } }],
        variables: [{ name: 'script', formula: 'SUM(1, 2)' }],
        customFunctions: [],
      })
    ).toEqual([]);
  });

  it('rejects malformed executable field values instead of bypassing the guard', () => {
    expect(() => assertNoJavaScriptHooks({ pages: [{ script: { source: 'throw 1' } }] })).toThrow(
      'UNSAFE_JAVASCRIPT'
    );
  });
});
