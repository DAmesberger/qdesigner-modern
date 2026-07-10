import { describe, it, expect } from 'vitest';
import {
  pivotParticipants,
  describeFields,
  applyFilter,
  numericValues,
  compareCohorts,
} from './advancedAnalytics';
import type { FilterQuery } from './types/filter';
import type { ExportRow } from '$lib/shared/types/api';

function row(partial: Partial<ExportRow>): ExportRow {
  return {
    session_id: 's1',
    participant_id: null,
    session_status: 'completed',
    started_at: null,
    completed_at: null,
    question_id: 'q1',
    value: null,
    reaction_time_us: null,
    presented_at: null,
    answered_at: null,
    ...partial,
  };
}

/** Two participants: one in arm "A" scoring 10, one in arm "B" scoring 2. */
const rows: ExportRow[] = [
  row({ session_id: 's1', question_id: 'arm', value: 'A' }),
  row({ session_id: 's1', question_id: 'score', value: 10 }),
  row({ session_id: 's2', question_id: 'arm', value: 'B' }),
  row({ session_id: 's2', question_id: 'score', value: 2 }),
];

describe('pivotParticipants', () => {
  it('groups rows into one record per session, first value wins', () => {
    const dup: ExportRow[] = [
      row({ session_id: 's1', question_id: 'q1', value: 'first' }),
      row({ session_id: 's1', question_id: 'q1', value: 'second' }),
      row({ session_id: 's2', question_id: 'q1', value: 'other' }),
    ];
    const result = pivotParticipants(dup);
    expect(result).toHaveLength(2);
    expect(result[0]!.values.q1).toBe('first');
  });

  it('returns an empty array for no rows', () => {
    expect(pivotParticipants([])).toEqual([]);
  });
});

describe('describeFields', () => {
  it('classifies numeric vs text fields and collects distinct values', () => {
    const fields = describeFields(rows);
    const arm = fields.find((f) => f.key === 'arm')!;
    const score = fields.find((f) => f.key === 'score')!;
    expect(arm.type).toBe('text');
    expect(score.type).toBe('number');
    expect(arm.distinctValues.sort()).toEqual(['A', 'B']);
  });

  it('preserves first-appearance column order', () => {
    expect(describeFields(rows).map((f) => f.key)).toEqual(['arm', 'score']);
  });
});

describe('applyFilter', () => {
  const participants = pivotParticipants(rows);
  const fields = describeFields(rows);

  it('returns everyone when no query is supplied', () => {
    expect(applyFilter(participants, undefined, fields)).toHaveLength(2);
  });

  it('treats a blank rule value as a no-op (matches everyone)', () => {
    const query: FilterQuery = {
      logic: 'AND',
      groups: [{ id: 'g', logic: 'AND', rules: [{ id: 'r', field: 'score', operator: 'gt', value: '' }] }],
    };
    expect(applyFilter(participants, query, fields)).toHaveLength(2);
  });

  it('applies a numeric comparison', () => {
    const query: FilterQuery = {
      logic: 'AND',
      groups: [{ id: 'g', logic: 'AND', rules: [{ id: 'r', field: 'score', operator: 'gt', value: '5' }] }],
    };
    const matched = applyFilter(participants, query, fields);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.values.arm).toBe('A');
  });

  it('applies an OR across two rules in a group', () => {
    const query: FilterQuery = {
      logic: 'AND',
      groups: [
        {
          id: 'g',
          logic: 'OR',
          rules: [
            { id: 'r1', field: 'score', operator: 'gt', value: '5' },
            { id: 'r2', field: 'arm', operator: 'eq', value: 'B' },
          ],
        },
      ],
    };
    expect(applyFilter(participants, query, fields)).toHaveLength(2);
  });
});

describe('numericValues', () => {
  it('extracts finite numeric values for a field', () => {
    expect(numericValues(pivotParticipants(rows), 'score').sort((a, b) => a - b)).toEqual([2, 10]);
  });
});

describe('compareCohorts', () => {
  it('reports per-arm descriptive stats and an effect size when arms are large enough', () => {
    const many: ExportRow[] = [];
    for (let i = 0; i < 6; i++) {
      many.push(row({ session_id: `a${i}`, question_id: 'arm', value: 'A' }));
      many.push(row({ session_id: `a${i}`, question_id: 'score', value: 8 + (i % 2) }));
      many.push(row({ session_id: `b${i}`, question_id: 'arm', value: 'B' }));
      many.push(row({ session_id: `b${i}`, question_id: 'score', value: 2 + (i % 2) }));
    }
    const result = compareCohorts(pivotParticipants(many), 'arm', 'A', 'B', 'score');
    expect(result.cohortA.n).toBe(6);
    expect(result.cohortB.n).toBe(6);
    expect(result.cohortA.stats).not.toBeNull();
    expect(result.effectSize).not.toBeNull();
    expect(result.pValue).not.toBeNull();
  });

  it('leaves effect size / p-value null when a cohort is too small', () => {
    const result = compareCohorts(pivotParticipants(rows), 'arm', 'A', 'B', 'score');
    expect(result.cohortA.n).toBe(1);
    expect(result.effectSize).toBeNull();
    expect(result.pValue).toBeNull();
  });
});
