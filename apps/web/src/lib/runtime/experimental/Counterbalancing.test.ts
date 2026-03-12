import { describe, it, expect } from 'vitest';
import {
  generateLatinSquare,
  generateBalancedLatinSquare,
  generateFullCounterbalancing,
  getBlockOrder,
} from './Counterbalancing';

describe('generateLatinSquare', () => {
  it('returns empty array for n=0', () => {
    expect(generateLatinSquare(0)).toEqual([]);
  });

  it('returns [[0]] for n=1', () => {
    expect(generateLatinSquare(1)).toEqual([[0]]);
  });

  it('generates a valid 3x3 Latin Square', () => {
    const square = generateLatinSquare(3);
    expect(square).toHaveLength(3);

    // Each row should contain all values 0..2
    for (const row of square) {
      expect([...row].sort()).toEqual([0, 1, 2]);
    }

    // Each column should contain all values 0..2
    for (let col = 0; col < 3; col++) {
      const column = square.map((row) => row[col]!);
      expect([...column].sort()).toEqual([0, 1, 2]);
    }
  });

  it('generates a valid 4x4 Latin Square', () => {
    const square = generateLatinSquare(4);
    expect(square).toHaveLength(4);

    for (const row of square) {
      expect([...row].sort()).toEqual([0, 1, 2, 3]);
    }

    for (let col = 0; col < 4; col++) {
      const column = square.map((row) => row[col]!);
      expect([...column].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('generateBalancedLatinSquare', () => {
  it('returns empty array for n=0', () => {
    expect(generateBalancedLatinSquare(0)).toEqual([]);
  });

  it('returns [[0]] for n=1', () => {
    expect(generateBalancedLatinSquare(1)).toEqual([[0]]);
  });

  it('generates n rows for even n', () => {
    const square = generateBalancedLatinSquare(4);
    expect(square).toHaveLength(4);

    // Each row should be a valid permutation of [0,1,2,3]
    for (const row of square) {
      expect(row).toHaveLength(4);
      expect([...row].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('generates 2n rows for odd n', () => {
    const square = generateBalancedLatinSquare(3);
    expect(square).toHaveLength(6); // 2*3

    for (const row of square) {
      expect(row).toHaveLength(3);
      expect([...row].sort()).toEqual([0, 1, 2]);
    }
  });

  it('achieves first-order balance for n=4', () => {
    const square = generateBalancedLatinSquare(4);
    const n = 4;

    // Count how many times each condition follows each other condition
    const followCounts: number[][] = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => 0)
    );

    for (const row of square) {
      for (let i = 0; i < row.length - 1; i++) {
        followCounts[row[i]!]![row[i + 1]!]!++;
      }
    }

    // In a balanced Latin square, each pair should appear exactly once
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        if (a !== b) {
          expect(followCounts[a]![b]).toBe(1);
        }
      }
    }
  });
});

describe('generateFullCounterbalancing', () => {
  it('returns empty array for n=0', () => {
    expect(generateFullCounterbalancing(0)).toEqual([]);
  });

  it('returns [[0]] for n=1', () => {
    expect(generateFullCounterbalancing(1)).toEqual([[0]]);
  });

  it('generates 2 permutations for n=2', () => {
    const perms = generateFullCounterbalancing(2);
    expect(perms).toHaveLength(2);
    expect(perms).toContainEqual([0, 1]);
    expect(perms).toContainEqual([1, 0]);
  });

  it('generates 6 permutations for n=3', () => {
    const perms = generateFullCounterbalancing(3);
    expect(perms).toHaveLength(6);

    // All should be unique permutations
    const strings = perms.map((p) => p.join(','));
    expect(new Set(strings).size).toBe(6);
  });

  it('generates 24 permutations for n=4', () => {
    expect(generateFullCounterbalancing(4)).toHaveLength(24);
  });

  it('returns empty array for n > 8 (safety limit)', () => {
    expect(generateFullCounterbalancing(9)).toEqual([]);
  });
});

describe('getBlockOrder', () => {
  it('returns empty for 0 conditions', () => {
    expect(getBlockOrder(0, 0, 'latin-square')).toEqual([]);
  });

  it('returns [0] for 1 condition regardless of strategy', () => {
    expect(getBlockOrder(5, 1, 'latin-square')).toEqual([0]);
    expect(getBlockOrder(5, 1, 'full')).toEqual([0]);
    expect(getBlockOrder(5, 1, 'none')).toEqual([0]);
  });

  it('returns natural order for strategy "none"', () => {
    expect(getBlockOrder(0, 4, 'none')).toEqual([0, 1, 2, 3]);
    expect(getBlockOrder(99, 4, 'none')).toEqual([0, 1, 2, 3]);
  });

  it('cycles through Latin square rows', () => {
    const n = 3;
    const orders = new Set<string>();

    for (let p = 0; p < n; p++) {
      const order = getBlockOrder(p, n, 'latin-square');
      expect(order).toHaveLength(n);
      expect([...order].sort()).toEqual([0, 1, 2]);
      orders.add(order.join(','));
    }

    // All rows should be different
    expect(orders.size).toBe(n);
  });

  it('cycles through balanced Latin square rows', () => {
    const n = 4;
    const orders = new Set<string>();

    for (let p = 0; p < n; p++) {
      const order = getBlockOrder(p, n, 'balanced-latin-square');
      expect(order).toHaveLength(n);
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
      orders.add(order.join(','));
    }

    expect(orders.size).toBe(n);
  });

  it('wraps participant numbers for Latin square', () => {
    const n = 3;
    expect(getBlockOrder(0, n, 'latin-square')).toEqual(
      getBlockOrder(n, n, 'latin-square')
    );
    expect(getBlockOrder(1, n, 'latin-square')).toEqual(
      getBlockOrder(n + 1, n, 'latin-square')
    );
  });

  it('cycles through all permutations for full counterbalancing', () => {
    const n = 3; // 6 permutations
    const orders = new Set<string>();

    for (let p = 0; p < 6; p++) {
      const order = getBlockOrder(p, n, 'full');
      expect(order).toHaveLength(n);
      orders.add(order.join(','));
    }

    expect(orders.size).toBe(6);
  });
});
