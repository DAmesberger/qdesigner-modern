import { describe, it, expect } from 'vitest';
import { computeProgressTotal, type ProgressDefinition } from './progress';

describe('computeProgressTotal', () => {
  it('counts pages for a plain linear definition', () => {
    const def: ProgressDefinition = { pages: [{}, {}, {}] };
    expect(computeProgressTotal(def)).toBe(3);
  });

  it('returns null when there are no pages to count against', () => {
    expect(computeProgressTotal({ pages: [] })).toBeNull();
    expect(computeProgressTotal({})).toBeNull();
    expect(computeProgressTotal(null)).toBeNull();
  });

  it('is indeterminate when any page holds an adaptive block', () => {
    const def: ProgressDefinition = {
      pages: [{ blocks: [{ type: 'standard' }] }, { blocks: [{ type: 'adaptive' }] }],
    };
    expect(computeProgressTotal(def)).toBeNull();
  });

  it('is indeterminate for a dynamic-source loop block (answer / variable)', () => {
    const answerLoop: ProgressDefinition = {
      pages: [{ blocks: [{ type: 'loop', loop: { source: { type: 'answer' } } }] }],
    };
    const variableLoop: ProgressDefinition = {
      pages: [{ blocks: [{ type: 'loop', loop: { source: { type: 'variable' } } }] }],
    };
    expect(computeProgressTotal(answerLoop)).toBeNull();
    expect(computeProgressTotal(variableLoop)).toBeNull();
  });

  it('stays determinate for a static (fixed-values) loop block', () => {
    const staticLoop: ProgressDefinition = {
      pages: [{ blocks: [{ type: 'loop', loop: { source: { type: 'static' } } }] }, {}],
    };
    // A static loop expands within its own page; the page count is still honest.
    expect(computeProgressTotal(staticLoop)).toBe(2);
  });

  it('is indeterminate when the flow contains a loop rule', () => {
    const def: ProgressDefinition = {
      pages: [{}, {}],
      flow: [{ type: 'skip' }, { type: 'loop' }],
    };
    expect(computeProgressTotal(def)).toBeNull();
  });
});
