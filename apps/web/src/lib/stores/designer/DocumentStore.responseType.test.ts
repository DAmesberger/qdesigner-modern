import { describe, it, expect } from 'vitest';
import { DocumentStore } from './DocumentStore';

/**
 * ensureResponseType is private; exercise it through normalizeQuestionnaire, which
 * runs normalizeQuestionOrders -> ensureResponseType on every question. Guards the
 * MOD-02 (advanced types) and MOD-03 (multi-select) response-type mappings.
 */
function responseTypeFor(type: string, display: Record<string, unknown> = {}) {
  const store = new DocumentStore();
  const normalized = store.normalizeQuestionnaire({
    id: 'qn',
    name: 'T',
    questions: [{ id: 'q1', type, display }],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reading dynamic responseType off normalized question
  return (normalized.questions[0] as any).responseType;
}

describe('DocumentStore.ensureResponseType mappings', () => {
  it('keeps multiple-choice as multi-select (MOD-03)', () => {
    expect(responseTypeFor('multiple-choice').type).toBe('multiple');
  });

  it('maps single-choice to single-select', () => {
    expect(responseTypeFor('single-choice').type).toBe('single');
  });

  it('gives the six advanced types a non-none, capturable response type (MOD-02)', () => {
    expect(responseTypeFor('matrix', { rows: [{ id: 'r1' }], columns: [{ id: 'c1', value: 1 }] })).toMatchObject({
      type: 'matrix',
    });
    expect(responseTypeFor('ranking').type).toBe('ranking');
    expect(responseTypeFor('date-time').type).toBe('datetime');
    expect(responseTypeFor('file-upload').type).toBe('file');
    expect(responseTypeFor('media-response').type).toBe('file');
    expect(responseTypeFor('drawing').type).toBe('drawing');
  });

  it('carries matrix rows/columns through for the runtime component', () => {
    const rt = responseTypeFor('matrix', {
      rows: [{ id: 'r1', label: 'Row' }],
      columns: [{ id: 'c1', label: 'Col', value: 1 }],
      responseType: 'single',
    });
    expect(rt.rows).toHaveLength(1);
    expect(rt.columns).toHaveLength(1);
  });
});
