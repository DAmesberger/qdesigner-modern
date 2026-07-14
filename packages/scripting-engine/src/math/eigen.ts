/**
 * Symmetric eigensolver (cyclic Jacobi).
 *
 * The one linear-algebra primitive the statistics stack needs: a real
 * symmetric eigendecomposition. Used by PCA (correlation-matrix
 * decomposition) and by McDonald's omega (single-factor extraction).
 *
 * Cyclic Jacobi is O(n^3) per sweep and converges quadratically once the
 * off-diagonal mass is small. It is slow for large n but exact-to-machine
 * precision for the small matrices we decompose (k items, k typically < 50),
 * and — unlike power iteration — it returns the *full* spectrum, which is
 * what explained-variance and communality figures need.
 */

export interface EigenResult {
  /** Eigenvalues, sorted descending. */
  values: number[];
  /**
   * Eigenvectors, aligned with `values`: `vectors[k]` is the unit-length
   * eigenvector for `values[k]`, and `vectors[k][i]` is its i-th component.
   * Sign is fixed deterministically (see `fixSigns`).
   */
  vectors: number[][];
  /** False when the sweep cap was hit before the off-diagonal mass vanished. */
  converged: boolean;
  /** Sweeps actually performed. */
  sweeps: number;
}

export interface JacobiOptions {
  /**
   * Absolute tolerance on the largest remaining off-diagonal magnitude,
   * relative to the matrix scale. Default 1e-12.
   */
  tolerance?: number;
  /** Maximum sweeps before giving up and returning the best-so-far. Default 100. */
  maxSweeps?: number;
  /**
   * Tolerance for the symmetry check on the input, relative to the matrix
   * scale. Default 1e-9 — loose enough for a correlation matrix assembled
   * from two separate floating-point passes, tight enough to catch a genuinely
   * asymmetric matrix.
   */
  symmetryTolerance?: number;
}

/**
 * Eigendecomposition of a real symmetric matrix.
 *
 * @throws if the matrix is empty, ragged, non-square, contains a non-finite
 *         entry, or is not symmetric within `symmetryTolerance`.
 */
export function jacobiEigen(matrix: number[][], options: JacobiOptions = {}): EigenResult {
  const {
    tolerance = 1e-12,
    maxSweeps = 100,
    symmetryTolerance = 1e-9,
  } = options;

  const n = validate(matrix, symmetryTolerance);

  // Working copy — Jacobi rotates `a` towards diagonal form in place.
  const a: number[][] = matrix.map(row => row.slice(0, n));
  // Accumulated rotations; column j of v is the eigenvector of a[j][j].
  const v: number[][] = identity(n);

  if (n === 1) {
    return { values: [a[0]![0]!], vectors: [[1]], converged: true, sweeps: 0 };
  }

  const scale = matrixScale(a);
  const threshold = Math.max(tolerance, tolerance * scale);

  let sweeps = 0;
  let converged = false;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    sweeps = sweep + 1;

    if (offDiagonalMax(a) <= threshold) {
      converged = true;
      sweeps = sweep;
      break;
    }

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        rotate(a, v, p, q, threshold);
      }
    }

    if (offDiagonalMax(a) <= threshold) {
      converged = true;
      break;
    }
  }

  // Eigenvalues sit on the diagonal; eigenvector k is column k of v.
  const pairs = Array.from({ length: n }, (_, k) => ({
    value: a[k]![k]!,
    vector: normalize(Array.from({ length: n }, (_, i) => v[i]![k]!)),
  }));

  pairs.sort((x, y) => y.value - x.value);

  return {
    values: pairs.map(p => p.value),
    vectors: pairs.map(p => fixSign(p.vector)),
    converged,
    sweeps,
  };
}

/**
 * One Jacobi rotation annihilating a[p][q] (and a[q][p]), applied to both the
 * matrix and the accumulated eigenvector basis.
 */
function rotate(a: number[][], v: number[][], p: number, q: number, threshold: number): void {
  const apq = a[p]![q]!;
  if (Math.abs(apq) <= threshold) return;

  const app = a[p]![p]!;
  const aqq = a[q]![q]!;

  // tan(2θ) = 2·a_pq / (a_qq - a_pp); solved in the numerically stable form
  // that avoids cancellation when a_qq ≈ a_pp (Numerical Recipes §11.1).
  const theta = (aqq - app) / (2 * apq);
  const t =
    Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
  const c = 1 / Math.sqrt(t * t + 1);
  const s = t * c;

  const n = a.length;

  a[p]![p] = app - t * apq;
  a[q]![q] = aqq + t * apq;
  a[p]![q] = 0;
  a[q]![p] = 0;

  for (let i = 0; i < n; i++) {
    if (i !== p && i !== q) {
      const aip = a[i]![p]!;
      const aiq = a[i]![q]!;
      a[i]![p] = c * aip - s * aiq;
      a[p]![i] = a[i]![p]!;
      a[i]![q] = s * aip + c * aiq;
      a[q]![i] = a[i]![q]!;
    }

    const vip = v[i]![p]!;
    const viq = v[i]![q]!;
    v[i]![p] = c * vip - s * viq;
    v[i]![q] = s * vip + c * viq;
  }
}

function validate(matrix: number[][], symmetryTolerance: number): number {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('jacobiEigen: matrix must be a non-empty 2D array');
  }

  const n = matrix.length;

  for (let i = 0; i < n; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length !== n) {
      throw new Error(`jacobiEigen: matrix must be square (row ${i} has length ${row?.length ?? 'none'}, expected ${n})`);
    }
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(row[j])) {
        throw new Error(`jacobiEigen: matrix contains a non-finite entry at [${i}][${j}]`);
      }
    }
  }

  const scale = matrixScale(matrix);
  const tol = Math.max(symmetryTolerance, symmetryTolerance * scale);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[i]![j]! - matrix[j]![i]!) > tol) {
        throw new Error(
          `jacobiEigen: matrix must be symmetric ([${i}][${j}]=${matrix[i]![j]} vs [${j}][${i}]=${matrix[j]![i]})`
        );
      }
    }
  }

  return n;
}

/** Largest absolute entry — the scale the tolerances are measured against. */
function matrixScale(a: number[][]): number {
  let max = 0;
  for (const row of a) {
    for (const value of row) {
      const abs = Math.abs(value);
      if (abs > max) max = abs;
    }
  }
  return max;
}

function offDiagonalMax(a: number[][]): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const abs = Math.abs(a[i]![j]!);
      if (abs > max) max = abs;
    }
  }
  return max;
}

function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return vector;
  return vector.map(x => x / norm);
}

/**
 * An eigenvector is only defined up to sign. Pick one deterministically —
 * otherwise PCA loadings flip sign between runs on the same data. Convention:
 * the component of largest magnitude is positive.
 */
function fixSign(vector: number[]): number[] {
  let maxIndex = 0;
  let maxAbs = 0;
  for (let i = 0; i < vector.length; i++) {
    const abs = Math.abs(vector[i]!);
    if (abs > maxAbs + 1e-12) {
      maxAbs = abs;
      maxIndex = i;
    }
  }
  return vector[maxIndex]! < 0 ? vector.map(x => (x === 0 ? 0 : -x)) : vector;
}
