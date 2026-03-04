/**
 * Missing Data Handler
 * Strategies for handling missing data in research datasets:
 * listwise/pairwise deletion, mean/median imputation, LOCF, multiple imputation,
 * and missing data report generation.
 */

export type ImputationMethod =
  | 'listwise'
  | 'pairwise'
  | 'mean'
  | 'median'
  | 'locf'
  | 'multiple';

export interface MissingDataReport {
  totalCells: number;
  missingCells: number;
  missingRate: number;
  /** Per-variable missing counts and rates */
  variables: VariableMissingInfo[];
  /** Per-case (row) missing counts */
  cases: CaseMissingInfo[];
  /** Pattern: which variables are jointly missing */
  patterns: MissingPattern[];
  /** Little's MCAR test approximation (chi-square, df, p) — null when < 2 variables with missingness */
  mcarTest: { chiSquare: number; df: number; pValue: number } | null;
}

export interface VariableMissingInfo {
  index: number;
  label: string;
  missingCount: number;
  missingRate: number;
}

export interface CaseMissingInfo {
  index: number;
  missingCount: number;
  missingRate: number;
}

export interface MissingPattern {
  /** Boolean per variable: true = present, false = missing */
  pattern: boolean[];
  count: number;
}

export interface MultipleImputationResult {
  /** Each element is one complete imputed dataset (same shape as input) */
  imputedDatasets: (number | null)[][];
  /** Number of imputations performed */
  m: number;
}

export class MissingDataHandler {
  private static instance: MissingDataHandler;

  private constructor() {}

  static getInstance(): MissingDataHandler {
    if (!MissingDataHandler.instance) {
      MissingDataHandler.instance = new MissingDataHandler();
    }
    return MissingDataHandler.instance;
  }

  // ============================================================================
  // Report Generation
  // ============================================================================

  /**
   * Generate a comprehensive missing data report for a columnar dataset.
   * @param variables Array of variable arrays (column-major). null/undefined/NaN = missing.
   * @param labels Optional variable labels.
   */
  generateReport(
    variables: (number | null | undefined)[],
    numVariables: number,
    labels?: string[]
  ): MissingDataReport;
  generateReport(
    variables: (number | null | undefined)[][],
    labels?: string[]
  ): MissingDataReport;
  generateReport(
    variables: (number | null | undefined)[] | (number | null | undefined)[][],
    numVariablesOrLabels?: number | string[],
    labels?: string[]
  ): MissingDataReport {
    let cols: (number | null | undefined)[][];
    let varLabels: string[];

    if (typeof numVariablesOrLabels === 'number') {
      // Flat array + numVariables overload
      const flat = variables as (number | null | undefined)[];
      const nVars = numVariablesOrLabels;
      const nCases = Math.floor(flat.length / nVars);
      cols = [];
      for (let v = 0; v < nVars; v++) {
        const col: (number | null | undefined)[] = [];
        for (let c = 0; c < nCases; c++) {
          col.push(flat[c * nVars + v] ?? null);
        }
        cols.push(col);
      }
      varLabels = labels ?? cols.map((_, i) => `Var${i + 1}`);
    } else {
      cols = variables as (number | null | undefined)[][];
      varLabels = (numVariablesOrLabels as string[] | undefined) ?? cols.map((_, i) => `Var${i + 1}`);
    }

    const nVars = cols.length;
    const nCases = cols[0]?.length ?? 0;
    const totalCells = nVars * nCases;

    // Per-variable
    const variableInfos: VariableMissingInfo[] = cols.map((col, i) => {
      const missingCount = col.filter(v => this.isMissing(v)).length;
      return {
        index: i,
        label: varLabels[i] ?? `Var${i + 1}`,
        missingCount,
        missingRate: nCases > 0 ? missingCount / nCases : 0
      };
    });

    // Per-case
    const caseInfos: CaseMissingInfo[] = [];
    let missingCells = 0;
    for (let c = 0; c < nCases; c++) {
      let caseMissing = 0;
      for (let v = 0; v < nVars; v++) {
        if (this.isMissing(cols[v]![c])) {
          caseMissing++;
          missingCells++;
        }
      }
      caseInfos.push({
        index: c,
        missingCount: caseMissing,
        missingRate: nVars > 0 ? caseMissing / nVars : 0
      });
    }

    // Missing patterns
    const patternMap = new Map<string, { pattern: boolean[]; count: number }>();
    for (let c = 0; c < nCases; c++) {
      const pattern = cols.map(col => !this.isMissing(col[c]));
      const key = pattern.map(b => (b ? '1' : '0')).join('');
      const existing = patternMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        patternMap.set(key, { pattern, count: 1 });
      }
    }
    const patterns = Array.from(patternMap.values()).sort((a, b) => b.count - a.count);

    // MCAR test approximation (simplified)
    const mcarTest = this.approximateMCARTest(cols);

    return {
      totalCells,
      missingCells,
      missingRate: totalCells > 0 ? missingCells / totalCells : 0,
      variables: variableInfos,
      cases: caseInfos,
      patterns,
      mcarTest
    };
  }

  // ============================================================================
  // Deletion Methods
  // ============================================================================

  /**
   * Listwise deletion: remove entire cases (rows) that have any missing value.
   * Returns a new column-major array with complete cases only.
   */
  listwiseDeletion(variables: (number | null | undefined)[][]): number[][] {
    const nVars = variables.length;
    const nCases = variables[0]?.length ?? 0;

    const completeCaseIndices: number[] = [];
    for (let c = 0; c < nCases; c++) {
      let complete = true;
      for (let v = 0; v < nVars; v++) {
        if (this.isMissing(variables[v]![c])) {
          complete = false;
          break;
        }
      }
      if (complete) completeCaseIndices.push(c);
    }

    return variables.map(col =>
      completeCaseIndices.map(i => col[i] as number)
    );
  }

  /**
   * Pairwise deletion for correlation: return only cases where both variables are present.
   */
  pairwiseDeletion(
    x: (number | null | undefined)[],
    y: (number | null | undefined)[]
  ): { x: number[]; y: number[] } {
    const xOut: number[] = [];
    const yOut: number[] = [];
    const n = Math.min(x.length, y.length);

    for (let i = 0; i < n; i++) {
      if (!this.isMissing(x[i]) && !this.isMissing(y[i])) {
        xOut.push(x[i] as number);
        yOut.push(y[i] as number);
      }
    }

    return { x: xOut, y: yOut };
  }

  // ============================================================================
  // Imputation Methods
  // ============================================================================

  /**
   * Mean imputation: replace missing values with the variable mean.
   */
  meanImputation(variables: (number | null | undefined)[][]): number[][] {
    return variables.map(col => {
      const validValues = col.filter(v => !this.isMissing(v)) as number[];
      if (validValues.length === 0) return col.map(() => 0);
      const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length;
      return col.map(v => (this.isMissing(v) ? mean : (v as number)));
    });
  }

  /**
   * Median imputation: replace missing values with the variable median.
   */
  medianImputation(variables: (number | null | undefined)[][]): number[][] {
    return variables.map(col => {
      const validValues = col.filter(v => !this.isMissing(v)) as number[];
      if (validValues.length === 0) return col.map(() => 0);
      const sorted = [...validValues].sort((a, b) => a - b);
      const n = sorted.length;
      const median = n % 2 === 0
        ? ((sorted[n / 2 - 1]! + sorted[n / 2]!) / 2)
        : sorted[Math.floor(n / 2)]!;
      return col.map(v => (this.isMissing(v) ? median : (v as number)));
    });
  }

  /**
   * LOCF (Last Observation Carried Forward): replace missing values
   * with the last non-missing value in the same variable.
   * If the first value(s) are missing, uses the next available observation (NOCB fallback).
   */
  locfImputation(variables: (number | null | undefined)[][]): number[][] {
    return variables.map(col => {
      const result: number[] = new Array(col.length);

      // Forward pass: LOCF
      let lastValid: number | null = null;
      for (let i = 0; i < col.length; i++) {
        if (!this.isMissing(col[i])) {
          lastValid = col[i] as number;
          result[i] = lastValid;
        } else if (lastValid !== null) {
          result[i] = lastValid;
        } else {
          result[i] = NaN; // temporary marker
        }
      }

      // Backward pass: NOCB for leading missing values
      let nextValid: number | null = null;
      for (let i = col.length - 1; i >= 0; i--) {
        if (!isNaN(result[i]!)) {
          nextValid = result[i]!;
        } else if (nextValid !== null) {
          result[i] = nextValid;
        } else {
          result[i] = 0; // No data at all, fallback to 0
        }
      }

      return result;
    });
  }

  /**
   * Multiple imputation using predictive mean matching (simplified).
   * Generates m complete datasets by adding noise proportional to the
   * observed standard deviation around the mean.
   *
   * @param variables Column-major dataset with possible missing values
   * @param m Number of imputations (default 5)
   * @param seed Optional seed for reproducibility (simple LCG)
   */
  multipleImputation(
    variables: (number | null | undefined)[][],
    m: number = 5,
    seed?: number
  ): MultipleImputationResult {
    const rng = this.createRNG(seed);
    const imputedDatasets: (number | null)[][] = [];

    for (let imp = 0; imp < m; imp++) {
      const imputed = variables.map(col => {
        const validValues = col.filter(v => !this.isMissing(v)) as number[];
        if (validValues.length === 0) {
          return col.map(() => null as number | null);
        }

        const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length;
        const variance = validValues.length > 1
          ? validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (validValues.length - 1)
          : 0;
        const sd = Math.sqrt(variance);

        return col.map(v => {
          if (this.isMissing(v)) {
            // Draw from normal distribution centered on mean
            return mean + sd * this.normalRandom(rng);
          }
          return v as number;
        });
      });

      // Flatten column-major to row-major interleaved
      const nCases = variables[0]?.length ?? 0;
      const nVars = variables.length;
      const flat: (number | null)[] = [];
      for (let c = 0; c < nCases; c++) {
        for (let v = 0; v < nVars; v++) {
          flat.push(imputed[v]![c]!);
        }
      }
      imputedDatasets.push(flat);
    }

    return { imputedDatasets, m };
  }

  // ============================================================================
  // Convenience: Apply Strategy
  // ============================================================================

  /**
   * Apply a named imputation/deletion strategy to a column-major dataset.
   */
  apply(
    variables: (number | null | undefined)[][],
    method: ImputationMethod
  ): number[][] {
    switch (method) {
      case 'listwise':
        return this.listwiseDeletion(variables);
      case 'pairwise':
        // Pairwise only makes sense for pairs; for a full dataset use listwise
        return this.listwiseDeletion(variables);
      case 'mean':
        return this.meanImputation(variables);
      case 'median':
        return this.medianImputation(variables);
      case 'locf':
        return this.locfImputation(variables);
      case 'multiple':
        // Return first imputed dataset as the "point estimate"
        return this.multipleImputationAsColumns(variables);
      default:
        throw new Error(`Unknown imputation method: ${method}`);
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private multipleImputationAsColumns(
    variables: (number | null | undefined)[][]
  ): number[][] {
    const result = this.multipleImputation(variables, 5);
    // Use first imputation, reshape back to column-major
    const flat = result.imputedDatasets[0]!;
    const nVars = variables.length;
    const nCases = variables[0]?.length ?? 0;
    const cols: number[][] = Array.from({ length: nVars }, () => []);
    for (let c = 0; c < nCases; c++) {
      for (let v = 0; v < nVars; v++) {
        cols[v]!.push(flat[c * nVars + v] ?? 0);
      }
    }
    return cols;
  }

  private isMissing(value: number | null | undefined): boolean {
    return value === null || value === undefined || (typeof value === 'number' && isNaN(value));
  }

  /**
   * Approximate Little's MCAR test using a simplified chi-square approach.
   * Groups cases by missing data pattern and compares group means.
   */
  private approximateMCARTest(
    cols: (number | null | undefined)[][]
  ): { chiSquare: number; df: number; pValue: number } | null {
    const nVars = cols.length;
    const nCases = cols[0]?.length ?? 0;
    if (nCases < 3 || nVars < 2) return null;

    // Check if there are at least 2 variables with missing data
    const varsWithMissing = cols.filter(col =>
      col.some(v => this.isMissing(v))
    );
    if (varsWithMissing.length < 2) return null;

    // Group cases by missing pattern
    const patternGroups = new Map<string, number[]>();
    for (let c = 0; c < nCases; c++) {
      const pattern = cols.map(col => (this.isMissing(col[c]) ? '0' : '1')).join('');
      if (!patternGroups.has(pattern)) {
        patternGroups.set(pattern, []);
      }
      patternGroups.get(pattern)!.push(c);
    }

    // Need at least 2 patterns to test
    if (patternGroups.size < 2) return null;

    // Overall mean for each variable (observed values only)
    const overallMeans: number[] = cols.map(col => {
      const valid = col.filter(v => !this.isMissing(v)) as number[];
      return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
    });

    // Overall variance for each variable
    const overallVars: number[] = cols.map((col, vi) => {
      const valid = col.filter(v => !this.isMissing(v)) as number[];
      if (valid.length < 2) return 1;
      return valid.reduce((s, v) => s + (v - overallMeans[vi]!) ** 2, 0) / (valid.length - 1);
    });

    // Compute chi-square: sum over patterns and variables of
    // n_g * (mean_gv - mean_v)^2 / var_v for observed cells
    let chiSquare = 0;
    let df = 0;

    for (const [pattern, indices] of Array.from(patternGroups.entries())) {
      if (indices.length < 2) continue;
      for (let v = 0; v < nVars; v++) {
        // Only consider observed values in this pattern
        if (pattern[v] === '0') continue;
        const groupValues = indices
          .map(i => cols[v]![i])
          .filter(val => !this.isMissing(val)) as number[];
        if (groupValues.length < 2) continue;

        const groupMean = groupValues.reduce((s, x) => s + x, 0) / groupValues.length;
        const varV = overallVars[v]!;
        if (varV > 0) {
          chiSquare += groupValues.length * (groupMean - overallMeans[v]!) ** 2 / varV;
          df++;
        }
      }
    }

    // Subtract nVars to adjust df (one mean estimated per variable)
    df = Math.max(1, df - nVars);

    // Approximate p-value via chi-square distribution
    const pValue = 1 - this.chiSquareCDF(chiSquare, df);

    return { chiSquare, df, pValue };
  }

  /**
   * Chi-square CDF via regularized incomplete gamma function
   */
  private chiSquareCDF(x: number, df: number): number {
    if (x <= 0) return 0;
    return this.regularizedGammaP(df / 2, x / 2);
  }

  private regularizedGammaP(a: number, x: number): number {
    if (x <= 0) return 0;
    if (x < a + 1) {
      return this.gammaPSeries(a, x);
    } else {
      return 1 - this.gammaQCF(a, x);
    }
  }

  private gammaPSeries(a: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < maxIter; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < eps * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  private gammaQCF(a: number, x: number): number {
    const maxIter = 200;
    const eps = 1e-15;
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= maxIter; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      c = b + an / c;
      if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return h * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  private logGamma(z: number): number {
    // Lanczos approximation
    const g = 7;
    const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * z)) - this.logGamma(1 - z);
    }
    z -= 1;
    let x = C[0]!;
    for (let i = 1; i < g + 2; i++) {
      x += C[i]! / (z + i);
    }
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  /**
   * Simple LCG-based PRNG
   */
  private createRNG(seed?: number): () => number {
    let state = seed ?? Math.floor(Math.random() * 2147483647);
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  /**
   * Box-Muller transform for normal random variates
   */
  private normalRandom(rng: () => number): number {
    let u1 = rng();
    let u2 = rng();
    // Avoid log(0)
    while (u1 === 0) u1 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
