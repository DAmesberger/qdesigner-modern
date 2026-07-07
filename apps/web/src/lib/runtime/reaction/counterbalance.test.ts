import { describe, expect, it } from 'vitest';
import {
  assignCounterbalance,
  blockOrderPermutation,
  findFactorAssignment,
  type CounterbalanceScheme,
} from './counterbalance';
import { generateLatinSquare } from '$lib/runtime/experimental';

const BLOCK_ORDER: CounterbalanceScheme = {
  factor: 'block-order',
  levels: ['compatible-first', 'incompatible-first'],
  method: 'latin-square',
};

const KEY_MAPPING: CounterbalanceScheme = {
  factor: 'key-mapping',
  levels: ['standard', 'reversed'],
  method: 'round-robin',
};

describe('assignCounterbalance', () => {
  it('returns an empty assignment when no schemes are declared', () => {
    const a = assignCounterbalance(undefined, { sessionId: 's' });
    expect(a.factors).toEqual([]);
    expect(a.cell).toEqual({});
    expect(a.cellKey).toBe('');

    expect(assignCounterbalance([], { sessionId: 's' }).cellKey).toBe('');
  });

  it('is deterministic per session id (same session -> same cell)', () => {
    const schemes = [BLOCK_ORDER, KEY_MAPPING];
    const first = assignCounterbalance(schemes, { seed: 'seed-1', sessionId: 'session-abc' });
    const second = assignCounterbalance(schemes, { seed: 'seed-1', sessionId: 'session-abc' });

    expect(second).toEqual(first);
    expect(second.cellKey).toBe(first.cellKey);
  });

  it('varies the cell across different session ids', () => {
    const schemes = [BLOCK_ORDER];
    const keys = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const a = assignCounterbalance(schemes, { seed: 'seed', sessionId: `session-${i}` });
      keys.add(findFactorAssignment(a, 'block-order')!.levelIndex);
    }
    // Both levels must be reached across many sessions (not pinned to one).
    expect(keys.size).toBe(2);
  });

  it('round-robins evenly across levels over N sequential participants', () => {
    const scheme: CounterbalanceScheme = {
      factor: 'block-order',
      levels: ['a', 'b', 'c'],
      method: 'round-robin',
    };
    const counts = [0, 0, 0];
    const N = 300;
    for (let i = 0; i < N; i++) {
      const a = assignCounterbalance([scheme], { seed: 'seed', participantIndex: i });
      const idx = findFactorAssignment(a, 'block-order')!.levelIndex;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    // Exactly even: 300 / 3 == 100 each.
    expect(counts).toEqual([100, 100, 100]);
  });

  it('latin-square method also cycles evenly across levels off a participant counter', () => {
    const scheme: CounterbalanceScheme = {
      factor: 'block-order',
      levels: ['x', 'y', 'z', 'w'],
      method: 'latin-square',
    };
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 400; i++) {
      const a = assignCounterbalance([scheme], { participantIndex: i });
      const idx = findFactorAssignment(a, 'block-order')!.levelIndex;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    expect(counts).toEqual([100, 100, 100, 100]);
  });

  it('random method distributes across all levels over many sessions', () => {
    const scheme: CounterbalanceScheme = {
      factor: 'stimulus-subset',
      levels: ['list-a', 'list-b'],
      method: 'random',
    };
    const counts = [0, 0];
    for (let i = 0; i < 500; i++) {
      const a = assignCounterbalance([scheme], { seed: 's', sessionId: `p${i}` });
      const idx = findFactorAssignment(a, 'stimulus-subset')!.levelIndex;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    // Both levels are used and neither is wildly starved (loose fairness bound).
    expect(counts[0]!).toBeGreaterThan(150);
    expect(counts[1]!).toBeGreaterThan(150);
  });

  it('the first scheme wins when a factor is declared twice', () => {
    const a = assignCounterbalance(
      [
        { factor: 'key-mapping', levels: ['standard'], method: 'round-robin' },
        { factor: 'key-mapping', levels: ['reversed'], method: 'round-robin' },
      ],
      { sessionId: 's' }
    );
    expect(a.factors.filter((f) => f.factor === 'key-mapping')).toHaveLength(1);
    expect(a.cell['key-mapping']).toBe('standard');
  });

  it('builds a compact, stable cell key', () => {
    const a = assignCounterbalance([BLOCK_ORDER, KEY_MAPPING], {
      seed: 'seed',
      participantIndex: 1,
    });
    // participantIndex 1 -> level 1 for both binary factors.
    expect(a.cell['block-order']).toBe('incompatible-first');
    expect(a.cell['key-mapping']).toBe('reversed');
    expect(a.cellKey).toBe('block-order=incompatible-first;key-mapping=reversed');
  });

  it('clamps to a single level when a scheme declares one level', () => {
    const a = assignCounterbalance(
      [{ factor: 'block-order', levels: ['only'], method: 'round-robin' }],
      { participantIndex: 7 }
    );
    expect(findFactorAssignment(a, 'block-order')!.levelIndex).toBe(0);
    expect(a.cell['block-order']).toBe('only');
  });
});

describe('blockOrderPermutation', () => {
  it('matches the Latin square row for a given level (cell)', () => {
    const n = 4;
    const square = generateLatinSquare(n);
    for (let level = 0; level < n; level++) {
      expect(blockOrderPermutation(level, n)).toEqual(square[level]);
    }
  });

  it('tiles a Latin square: each block appears once per position across levels', () => {
    const n = 5;
    const rows = Array.from({ length: n }, (_, level) => blockOrderPermutation(level, n));
    for (let position = 0; position < n; position++) {
      const column = new Set(rows.map((row) => row[position]));
      expect(column.size).toBe(n); // every block index used exactly once in this position
    }
  });

  it('wraps the level index modulo the block count', () => {
    expect(blockOrderPermutation(4, 4)).toEqual(blockOrderPermutation(0, 4));
    expect(blockOrderPermutation(5, 4)).toEqual(blockOrderPermutation(1, 4));
  });

  it('handles degenerate block counts', () => {
    expect(blockOrderPermutation(3, 0)).toEqual([]);
    expect(blockOrderPermutation(3, 1)).toEqual([0]);
  });
});
