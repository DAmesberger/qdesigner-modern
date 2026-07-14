import { describe, it, expect } from 'vitest';
import { jacobiEigen } from './eigen';

/** Matrix-vector product, for the A·v = λ·v check. */
function matVec(a: number[][], v: number[]): number[] {
  return a.map(row => row.reduce((sum, x, j) => sum + x * v[j]!, 0));
}

function dot(x: number[], y: number[]): number {
  return x.reduce((sum, xi, i) => sum + xi * y[i]!, 0);
}

/** Every returned pair satisfies A·v = λ·v, and the basis is orthonormal. */
function expectValidDecomposition(a: number[][], tol = 1e-9): void {
  const { values, vectors } = jacobiEigen(a);

  values.forEach((lambda, k) => {
    const v = vectors[k]!;
    const av = matVec(a, v);
    av.forEach((component, i) => {
      expect(component).toBeCloseTo(lambda * v[i]!, 9);
    });
    expect(Math.sqrt(dot(v, v))).toBeCloseTo(1, 9);
  });

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      expect(Math.abs(dot(vectors[i]!, vectors[j]!))).toBeLessThan(tol);
    }
  }
}

describe('jacobiEigen', () => {
  describe('closed-form decompositions', () => {
    it('handles the 1x1 case', () => {
      const result = jacobiEigen([[7]]);
      expect(result.values).toEqual([7]);
      expect(result.vectors).toEqual([[1]]);
      expect(result.converged).toBe(true);
    });

    it('matches the analytic 2x2 [[2,1],[1,2]] -> eigenvalues 3, 1', () => {
      const a = [
        [2, 1],
        [1, 2]
      ];
      const { values, vectors } = jacobiEigen(a);

      expect(values[0]).toBeCloseTo(3, 12);
      expect(values[1]).toBeCloseTo(1, 12);

      // v1 = [1,1]/sqrt(2), v2 = [1,-1]/sqrt(2)
      const s = Math.SQRT1_2;
      expect(Math.abs(vectors[0]![0]!)).toBeCloseTo(s, 12);
      expect(Math.abs(vectors[0]![1]!)).toBeCloseTo(s, 12);
      expect(vectors[0]![0]! * vectors[0]![1]!).toBeGreaterThan(0); // same sign
      expect(vectors[1]![0]! * vectors[1]![1]!).toBeLessThan(0); // opposite sign

      expectValidDecomposition(a);
    });

    it('matches the analytic 2x2 [[2,1],[1,3]] -> eigenvalues (5 +/- sqrt(5))/2', () => {
      const a = [
        [2, 1],
        [1, 3]
      ];
      const { values } = jacobiEigen(a);

      expect(values[0]).toBeCloseTo((5 + Math.sqrt(5)) / 2, 12); // 3.618033988...
      expect(values[1]).toBeCloseTo((5 - Math.sqrt(5)) / 2, 12); // 1.381966011...

      expectValidDecomposition(a);
    });

    it('matches the textbook 3x3 [[2,1,1],[1,2,1],[1,1,2]] -> eigenvalues 4, 1, 1', () => {
      const a = [
        [2, 1, 1],
        [1, 2, 1],
        [1, 1, 2]
      ];
      const { values, vectors } = jacobiEigen(a);

      expect(values[0]).toBeCloseTo(4, 12);
      expect(values[1]).toBeCloseTo(1, 12);
      expect(values[2]).toBeCloseTo(1, 12);

      // The eigenvector for 4 is [1,1,1]/sqrt(3) (the repeated eigenvalue 1
      // has a 2D eigenspace, so its basis is not unique — only the top one is
      // pinned down).
      const t = 1 / Math.sqrt(3);
      vectors[0]!.forEach(component => expect(component).toBeCloseTo(t, 10));

      expectValidDecomposition(a);
    });

    it('matches the textbook 3x3 [[6,-2,-1],[-2,6,-1],[-1,-1,5]] -> eigenvalues 8, 6, 3', () => {
      const a = [
        [6, -2, -1],
        [-2, 6, -1],
        [-1, -1, 5]
      ];
      const { values } = jacobiEigen(a);

      expect(values[0]).toBeCloseTo(8, 12);
      expect(values[1]).toBeCloseTo(6, 12);
      expect(values[2]).toBeCloseTo(3, 12);

      expectValidDecomposition(a);
    });

    it('matches the analytic spectrum of an equicorrelated correlation matrix', () => {
      // R = (1-r)I + r*J with r = 0.64, k = 4 has eigenvalues
      // 1 + (k-1)r = 2.92 (eigenvector [1,1,1,1]/2) and 1 - r = 0.36 (x3).
      const r = 0.64;
      const k = 4;
      const a = Array.from({ length: k }, (_, i) =>
        Array.from({ length: k }, (_, j) => (i === j ? 1 : r))
      );

      const { values, vectors } = jacobiEigen(a);

      expect(values[0]).toBeCloseTo(1 + (k - 1) * r, 12); // 2.92
      expect(values[1]).toBeCloseTo(1 - r, 12); // 0.36
      expect(values[2]).toBeCloseTo(1 - r, 12);
      expect(values[3]).toBeCloseTo(1 - r, 12);

      vectors[0]!.forEach(component => expect(component).toBeCloseTo(0.5, 10));

      // Eigenvalues of a correlation matrix sum to k (its trace).
      expect(values.reduce((s, v) => s + v, 0)).toBeCloseTo(k, 10);

      expectValidDecomposition(a);
    });

    it('is exact on an already-diagonal matrix', () => {
      const { values, vectors, sweeps } = jacobiEigen([
        [3, 0, 0],
        [0, 9, 0],
        [0, 0, 1]
      ]);

      expect(values).toEqual([9, 3, 1]);
      expect(vectors[0]).toEqual([0, 1, 0]);
      expect(sweeps).toBe(0);
    });
  });

  describe('properties', () => {
    it('returns eigenvalues in descending order', () => {
      const { values } = jacobiEigen([
        [1, 0.3, 0.5, 0.1],
        [0.3, 1, 0.2, 0.4],
        [0.5, 0.2, 1, 0.6],
        [0.1, 0.4, 0.6, 1]
      ]);

      for (let i = 1; i < values.length; i++) {
        expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
      }
    });

    it('satisfies A.v = lambda.v with an orthonormal basis for random symmetric matrices', () => {
      // Deterministic LCG — a failure must be reproducible.
      let seed = 20260714;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648 - 0.5;
      };

      for (let trial = 0; trial < 20; trial++) {
        const n = 2 + (trial % 5);
        const a: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
        for (let i = 0; i < n; i++) {
          for (let j = i; j < n; j++) {
            const value = rand() * 10;
            a[i]![j] = value;
            a[j]![i] = value;
          }
        }
        expectValidDecomposition(a);
      }
    });

    it('preserves the trace (sum of eigenvalues = sum of the diagonal)', () => {
      const a = [
        [4, 1, -2],
        [1, 2, 0],
        [-2, 0, 3]
      ];
      const { values } = jacobiEigen(a);
      expect(values.reduce((s, v) => s + v, 0)).toBeCloseTo(4 + 2 + 3, 10);
    });
  });

  describe('rejections and limits', () => {
    it('rejects a non-square matrix', () => {
      expect(() => jacobiEigen([[1, 2, 3], [4, 5, 6]])).toThrow(/square/);
    });

    it('rejects a ragged matrix', () => {
      expect(() => jacobiEigen([[1, 2], [3]])).toThrow(/square/);
    });

    it('rejects an empty matrix', () => {
      expect(() => jacobiEigen([])).toThrow(/non-empty/);
    });

    it('rejects a non-symmetric matrix', () => {
      expect(() =>
        jacobiEigen([
          [1, 2],
          [3, 1]
        ])
      ).toThrow(/symmetric/);
    });

    it('rejects non-finite entries', () => {
      expect(() => jacobiEigen([[1, NaN], [NaN, 1]])).toThrow(/non-finite/);
      expect(() => jacobiEigen([[Infinity, 0], [0, 1]])).toThrow(/non-finite/);
    });

    it('tolerates the float noise of a symmetric matrix built in two passes', () => {
      const a = [
        [1, 0.5],
        [0.5 + 1e-14, 1]
      ];
      expect(() => jacobiEigen(a)).not.toThrow();
    });

    it('returns best-so-far rather than looping forever when the sweep cap is hit', () => {
      const a = [
        [4, 1, -2, 0.5],
        [1, 2, 0, -1],
        [-2, 0, 3, 0.25],
        [0.5, -1, 0.25, 5]
      ];

      const capped = jacobiEigen(a, { maxSweeps: 1, tolerance: 1e-15 });

      expect(capped.converged).toBe(false);
      expect(capped.sweeps).toBe(1);
      expect(capped.values).toHaveLength(4);
      capped.values.forEach(v => expect(Number.isFinite(v)).toBe(true));
      // Even one sweep gets the trace right (Jacobi rotations are orthogonal).
      expect(capped.values.reduce((s, v) => s + v, 0)).toBeCloseTo(14, 8);
    });
  });
});
