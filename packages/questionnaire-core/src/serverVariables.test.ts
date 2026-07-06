import { describe, it, expect } from 'vitest';
import type { ServerComputationDef, Variable } from './questionnaire';
import {
  collectServerVariables,
  declHash,
  materializeServerValue,
  MAX_SERVER_VARIABLES,
  type ServerVariableRow,
} from './serverVariables';

function serverVar(name: string, server: ServerComputationDef, type: Variable['type'] = 'object'): Variable {
  return { id: name, name, type, scope: 'global', server };
}

const fullStats = {
  mean: 42,
  stdDev: 5,
  min: 10,
  max: 80,
  p10: 20,
  p25: 30,
  median: 41,
  p75: 55,
  p90: 66,
  p95: 70,
  p99: 78,
};

const row = (n: number, stats = fullStats): ServerVariableRow => ({
  n,
  stats,
  computedAt: '2026-07-05T12:00:00Z',
});

describe('declHash', () => {
  it('is stable across key order and whitespace', () => {
    const a: ServerComputationDef = {
      source: 'variable',
      key: 'score.anxiety.value',
      stat: 'mean',
      dataset: { id: 'd1', versionScope: 'sameMajor', where: [{ var: 'sex', op: 'eq', value: 'f' }] },
    };
    // Same declaration, different authored key order.
    const b: ServerComputationDef = {
      key: 'score.anxiety.value',
      stat: 'mean',
      dataset: { where: [{ value: 'f', op: 'eq', var: 'sex' }], versionScope: 'sameMajor', id: 'd1' },
      source: 'variable',
    } as ServerComputationDef;
    expect(declHash(a)).toBe(declHash(b));
  });

  it('changes on any semantic field', () => {
    const base: ServerComputationDef = { source: 'variable', key: 'k', stat: 'mean' };
    const h = declHash(base);
    expect(declHash({ ...base, key: 'k2' })).not.toBe(h);
    expect(declHash({ ...base, stat: 'median' })).not.toBe(h);
    expect(declHash({ ...base, source: 'response' })).not.toBe(h);
    expect(declHash({ ...base, staleAfterMs: 1000 })).not.toBe(h);
    expect(declHash({ ...base, dataset: { id: 'd', versionScope: 'exact' } })).not.toBe(h);
  });

  it('where-clause order is semantic (changes the hash)', () => {
    const d1: ServerComputationDef = {
      source: 'variable',
      key: 'k',
      dataset: {
        id: 'd',
        where: [
          { var: 'a', op: 'eq', value: 1 },
          { var: 'b', op: 'eq', value: 2 },
        ],
      },
    };
    const d2: ServerComputationDef = {
      source: 'variable',
      key: 'k',
      dataset: {
        id: 'd',
        where: [
          { var: 'b', op: 'eq', value: 2 },
          { var: 'a', op: 'eq', value: 1 },
        ],
      },
    };
    expect(declHash(d1)).not.toBe(declHash(d2));
  });
});

describe('collectServerVariables', () => {
  it('filters to variables carrying a server block', () => {
    const q = {
      variables: [
        { id: 'plain', name: 'plain', type: 'number', scope: 'global' } as Variable,
        serverVar('cohortAnxiety', { source: 'variable', key: 'score.anxiety.value' }),
      ],
    };
    const out = collectServerVariables(q);
    expect(out.map((v) => v.name)).toEqual(['cohortAnxiety']);
  });

  it('dedupes by name (first wins)', () => {
    const q = {
      variables: [
        serverVar('dup', { source: 'variable', key: 'a' }),
        serverVar('dup', { source: 'variable', key: 'b' }),
      ],
    };
    expect(collectServerVariables(q)).toHaveLength(1);
  });

  it('caps at MAX_SERVER_VARIABLES', () => {
    const variables: Variable[] = [];
    for (let i = 0; i < MAX_SERVER_VARIABLES + 10; i++) {
      variables.push(serverVar(`v${i}`, { source: 'variable', key: `k${i}` }));
    }
    expect(collectServerVariables({ variables })).toHaveLength(MAX_SERVER_VARIABLES);
  });
});

describe('materializeServerValue', () => {
  it('scalar stat returns the requested statistic', () => {
    const v = serverVar('m', { source: 'variable', key: 'k', stat: 'mean' }, 'number');
    expect(materializeServerValue(v, row(100))).toBe(42);
    const sd = serverVar('s', { source: 'variable', key: 'k', stat: 'sd' }, 'number');
    expect(materializeServerValue(sd, row(100))).toBe(5);
    const med = serverVar('md', { source: 'variable', key: 'k', stat: 'median' }, 'number');
    expect(materializeServerValue(med, row(100))).toBe(41);
  });

  it("scalar stat 'n' returns the sample count even below the floor", () => {
    const v = serverVar('c', { source: 'variable', key: 'k', stat: 'n' }, 'number');
    expect(materializeServerValue(v, { n: 3, stats: null, computedAt: 'x' })).toBe(3);
  });

  it('scalar stat returns undefined below the floor (stats null) so defaultValue rules', () => {
    const v = serverVar('m', { source: 'variable', key: 'k', stat: 'mean' }, 'number');
    expect(materializeServerValue(v, { n: 3, stats: null, computedAt: 'x' })).toBeUndefined();
  });

  it('object materialization returns the full bundle with n and computedAt', () => {
    const v = serverVar('obj', { source: 'variable', key: 'k' });
    const bundle = materializeServerValue(v, row(142)) as Record<string, unknown>;
    expect(bundle.n).toBe(142);
    expect(bundle.mean).toBe(42);
    expect(bundle.sd).toBe(5);
    expect(bundle.median).toBe(41);
    expect(bundle.p25).toBe(30);
    expect(bundle.p75).toBe(55);
    expect(bundle.computedAt).toBe('2026-07-05T12:00:00Z');
  });

  it('object materialization below the floor keeps n and computedAt, nulls the stats', () => {
    const v = serverVar('obj', { source: 'variable', key: 'k' });
    const bundle = materializeServerValue(v, { n: 2, stats: null, computedAt: 'ts' }) as Record<string, unknown>;
    expect(bundle.n).toBe(2);
    expect(bundle.computedAt).toBe('ts');
    expect(bundle.mean).toBeUndefined();
    expect(bundle.median).toBeUndefined();
  });

  it('returns undefined when the variable has no server block', () => {
    const v: Variable = { id: 'x', name: 'x', type: 'number', scope: 'global' };
    expect(materializeServerValue(v, row(10))).toBeUndefined();
  });
});
