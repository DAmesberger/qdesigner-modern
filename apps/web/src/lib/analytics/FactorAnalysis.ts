/**
 * Principal Component Analysis (PCA) with optional Varimax rotation.
 *
 * Implements the FactorAnalysis interface from types.ts.
 */

import type { FactorAnalysis } from './types';

export class PrincipalComponentAnalysis {
  /**
   * Run PCA on a data matrix (rows = observations, columns = variables).
   *
   * @param data       n x p matrix of raw scores
   * @param variableNames  names for the p variables
   * @param nComponents    number of components to extract (default: all)
   */
  analyze(
    data: number[][],
    variableNames: string[],
    nComponents?: number
  ): FactorAnalysis {
    const n = data.length;
    if (n < 2) throw new Error('Need at least 2 observations');

    const p = variableNames.length;
    if (p < 2) throw new Error('Need at least 2 variables');

    // 1. Standardize the data (z-scores)
    const means: number[] = new Array(p).fill(0);
    const sds: number[] = new Array(p).fill(0);

    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += data[i]![j]!;
      means[j] = sum / n;
    }

    for (let j = 0; j < p; j++) {
      let ssq = 0;
      for (let i = 0; i < n; i++) {
        ssq += (data[i]![j]! - means[j]!) ** 2;
      }
      sds[j] = Math.sqrt(ssq / (n - 1));
      if (sds[j] === 0) sds[j] = 1; // avoid division by zero
    }

    const Z: number[][] = data.map(row =>
      row.map((val, j) => (val - means[j]!) / sds[j]!)
    );

    // 2. Compute correlation matrix R = (1/(n-1)) * Z^T * Z
    const R = this.correlationMatrix(Z, p, n);

    // 3. Eigendecomposition via power iteration
    const k = Math.min(nComponents ?? p, p);
    const { eigenvalues, eigenvectors } = this.eigenDecomposition(R, k);

    // 4. Explained variance
    const totalVar = p; // trace of correlation matrix = p
    const explainedVariance = eigenvalues.map(ev => ev / totalVar);
    const cumulativeVariance: number[] = [];
    let cumSum = 0;
    for (const ev of explainedVariance) {
      cumSum += ev;
      cumulativeVariance.push(cumSum);
    }

    // 5. Factor loadings (eigenvector * sqrt(eigenvalue))
    const loadingsMatrix: number[][] = eigenvectors.map((vec, compIdx) =>
      vec.map(v => v * Math.sqrt(eigenvalues[compIdx]!))
    );

    // 6. Apply Varimax rotation if more than 1 component
    let rotatedLoadings = loadingsMatrix;
    let rotation: 'varimax' | undefined;
    if (k > 1) {
      rotatedLoadings = this.varimaxRotation(loadingsMatrix);
      rotation = 'varimax';
    }

    // 7. Build factor loadings record: variable -> array of loadings per component
    const factorLoadings: Record<string, number[]> = {};
    for (let j = 0; j < p; j++) {
      factorLoadings[variableNames[j]!] = rotatedLoadings.map(comp => comp[j]!);
    }

    // 8. Communalities: sum of squared loadings across components for each variable
    const communalities: Record<string, number> = {};
    for (let j = 0; j < p; j++) {
      let h2 = 0;
      for (let c = 0; c < k; c++) {
        h2 += rotatedLoadings[c]![j]! ** 2;
      }
      communalities[variableNames[j]!] = h2;
    }

    // 9. Factor scores (optional): Z * loadings_matrix^T (simplified)
    const factorScores: number[][] = Z.map(row => {
      const scores: number[] = [];
      for (let c = 0; c < k; c++) {
        let score = 0;
        for (let j = 0; j < p; j++) {
          score += row[j]! * rotatedLoadings[c]![j]!;
        }
        scores.push(score);
      }
      return scores;
    });

    return {
      eigenvalues,
      explainedVariance,
      cumulativeVariance,
      factorLoadings,
      communalities,
      factorScores,
      method: 'pca',
      rotation
    };
  }

  /**
   * Data for a scree plot.
   */
  getScreePlotData(result: FactorAnalysis): { component: number; eigenvalue: number }[] {
    return result.eigenvalues.map((ev, i) => ({
      component: i + 1,
      eigenvalue: ev
    }));
  }

  /**
   * Compute correlation matrix from standardized data Z (n x p).
   */
  private correlationMatrix(Z: number[][], p: number, n: number): number[][] {
    const R: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let i = 0; i < p; i++) {
      for (let j = i; j < p; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += Z[k]![i]! * Z[k]![j]!;
        }
        const r = sum / (n - 1);
        R[i]![j] = r;
        R[j]![i] = r;
      }
    }
    return R;
  }

  /**
   * Extract top-k eigenvalues/vectors via deflated power iteration.
   */
  private eigenDecomposition(
    matrix: number[][],
    k: number
  ): { eigenvalues: number[]; eigenvectors: number[][] } {
    const p = matrix.length;
    const eigenvalues: number[] = [];
    const eigenvectors: number[][] = [];

    // Work on a copy so we can deflate
    const A: number[][] = matrix.map(row => [...row]);

    for (let comp = 0; comp < k; comp++) {
      // Power iteration for dominant eigenvector
      let v = new Array(p).fill(0).map(() => Math.random() - 0.5);
      v = this.normalize(v);

      let eigenvalue = 0;
      const maxIter = 200;

      for (let iter = 0; iter < maxIter; iter++) {
        // Multiply: w = A * v
        const w: number[] = new Array(p).fill(0);
        for (let i = 0; i < p; i++) {
          for (let j = 0; j < p; j++) {
            w[i] = (w[i] ?? 0) + A[i]![j]! * v[j]!;
          }
        }

        // Eigenvalue estimate (Rayleigh quotient)
        const newEigenvalue = this.dot(v, w);

        // Normalize
        const norm = Math.sqrt(this.dot(w, w));
        if (norm === 0) break;

        for (let i = 0; i < p; i++) v[i] = w[i]! / norm;

        if (Math.abs(newEigenvalue - eigenvalue) < 1e-10) {
          eigenvalue = newEigenvalue;
          break;
        }
        eigenvalue = newEigenvalue;
      }

      eigenvalues.push(Math.max(0, eigenvalue));
      eigenvectors.push([...v]);

      // Deflate: A = A - eigenvalue * v * v^T
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          A[i]![j] = A[i]![j]! - eigenvalue * v[i]! * v[j]!;
        }
      }
    }

    return { eigenvalues, eigenvectors };
  }

  /**
   * Varimax rotation on a loadings matrix (k components x p variables).
   * Returns rotated loadings in the same shape.
   */
  private varimaxRotation(loadings: number[][], maxIter = 50, tol = 1e-6): number[][] {
    const k = loadings.length;
    const p = loadings[0]!.length;

    // Transpose to p x k for easier manipulation
    let L: number[][] = Array.from({ length: p }, (_, j) =>
      loadings.map(comp => comp[j]!)
    );

    for (let iter = 0; iter < maxIter; iter++) {
      let maxRotation = 0;

      // Rotate each pair of components
      for (let c1 = 0; c1 < k; c1++) {
        for (let c2 = c1 + 1; c2 < k; c2++) {
          // Compute rotation angle
          let A_val = 0, B_val = 0, C_val = 0, D_val = 0;

          for (let j = 0; j < p; j++) {
            const x = L[j]![c1]!;
            const y = L[j]![c2]!;
            const u = x * x - y * y;
            const v = 2 * x * y;
            A_val += u;
            B_val += v;
            C_val += u * u - v * v;
            D_val += 2 * u * v;
          }

          const num = D_val - 2 * A_val * B_val / p;
          const den = C_val - (A_val * A_val - B_val * B_val) / p;
          const phi = 0.25 * Math.atan2(num, den);

          if (Math.abs(phi) > maxRotation) maxRotation = Math.abs(phi);

          // Apply rotation
          const cos = Math.cos(phi);
          const sin = Math.sin(phi);
          for (let j = 0; j < p; j++) {
            const row = L[j]!;
            const x = row[c1]!;
            const y = row[c2]!;
            row[c1] = x * cos + y * sin;
            row[c2] = -x * sin + y * cos;
          }
        }
      }

      if (maxRotation < tol) break;
    }

    // Transpose back to k x p
    return Array.from({ length: k }, (_, c) =>
      L.map(row => row[c]!)
    );
  }

  private dot(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
    return sum;
  }

  private normalize(v: number[]): number[] {
    const norm = Math.sqrt(this.dot(v, v));
    if (norm === 0) return v;
    return v.map(x => x / norm);
  }
}
