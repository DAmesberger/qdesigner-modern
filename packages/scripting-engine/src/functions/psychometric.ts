import type { FormulaFunction } from '../types';
import { jacobiEigen } from '../math/eigen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- formula functions operate on dynamic values
type DynamicValue = any;

/**
 * Helper: compute Pearson correlation between two arrays of numbers.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2 || n !== y.length) return NaN;

  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let ssXX = 0, ssYY = 0, ssXY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  const denom = Math.sqrt(ssXX * ssYY);
  if (denom === 0) return NaN;
  return ssXY / denom;
}

/**
 * Helper: correlation matrix of a set of item columns. Returns null if any
 * pair is undefined (a zero-variance item, typically).
 */
function correlationMatrix(columns: number[][]): number[][] | null {
  const k = columns.length;
  const r: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));

  for (let i = 0; i < k; i++) {
    r[i]![i] = 1;
    for (let j = i + 1; j < k; j++) {
      const rij = pearsonCorrelation(columns[i]!, columns[j]!);
      if (isNaN(rij)) return null;
      r[i]![j] = rij;
      r[j]![i] = rij;
    }
  }

  return r;
}

/**
 * Helper: standardized loadings of a single common factor, by iterated
 * principal-axis factoring (PAF) of the correlation matrix.
 *
 * PAF replaces the unit diagonal of R with communality estimates h_i (the
 * variance of item i explained by the common factor), extracts the leading
 * eigenpair of that *reduced* matrix, and re-estimates h_i = λ_i². Iterating
 * to a fixed point separates common variance from item-specific variance —
 * which is exactly what a reliability coefficient has to do, and what a plain
 * PCA of the unreduced R does not (PCA pushes unique variance into the
 * component, inflating the loadings).
 *
 * Unlike a tau-equivalent estimate (Cronbach's alpha, the Spearman-Brown
 * formula), the loadings are free to differ across items — that is the whole
 * point of omega.
 *
 * Returns all-zero loadings when the reduced matrix has no positive leading
 * eigenvalue — the items share no common variance, so the common factor
 * explains nothing and omega is 0.
 */
function singleFactorLoadings(r: number[][]): number[] {
  const k = r.length;
  const maxIterations = 200;
  const tolerance = 1e-10;

  // Initial communality estimate: the largest absolute correlation in the row.
  // (The textbook alternative is the squared multiple correlation, which needs
  // a matrix inverse; for a one-factor extraction both converge to the same
  // fixed point and this one cannot fail on a singular R.)
  let communalities = r.map((row, i) =>
    row.reduce((max, value, j) => (i === j ? max : Math.max(max, Math.abs(value))), 0)
  );

  let loadings: number[] = Array<number>(k).fill(0);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const reduced = r.map((row, i) =>
      row.map((value, j) => (i === j ? communalities[i]! : value))
    );

    const { values, vectors } = jacobiEigen(reduced);
    const eigenvalue = values[0]!;
    if (!(eigenvalue > 0)) return loadings; // no common factor left to extract

    const eigenvector = vectors[0]!;
    const scale = Math.sqrt(eigenvalue);
    loadings = eigenvector.map(component => component * scale);

    // Heywood cases (h > 1) are not admissible: an item cannot have more
    // common variance than total variance. Clamp instead of diverging.
    const next = loadings.map(lambda => Math.min(1, lambda * lambda));

    const delta = next.reduce((max, h, i) => Math.max(max, Math.abs(h - communalities[i]!)), 0);
    communalities = next;
    if (delta < tolerance) break;
  }

  return loadings;
}

// Psychometric Reliability Functions
export const psychometricFunctions: FormulaFunction[] = [
  {
    name: 'SPLIT_HALF',
    category: 'stat',
    description: 'Split-half reliability with Spearman-Brown correction',
    parameters: [
      { name: 'items', type: 'array', description: '2D array (participants x items) of item scores' }
    ],
    returns: 'number',
    implementation: (items: DynamicValue) => {
      if (!Array.isArray(items) || items.length < 2) return NaN;

      // items is participants x items (each row is a participant)
      const rows: number[][] = items
        .filter((row: DynamicValue) => Array.isArray(row))
        .map((row: DynamicValue[]) => row.map(Number).filter((v: number) => !isNaN(v)));

      if (rows.length < 2) return NaN;

      const nItems = Math.min(...rows.map(r => r.length));
      if (nItems < 2) return NaN;

      // Split odd/even items
      const oddSums: number[] = [];
      const evenSums: number[] = [];

      for (const row of rows) {
        let oddSum = 0, evenSum = 0;
        for (let j = 0; j < nItems; j++) {
          if (j % 2 === 0) {
            evenSum += row[j]!;
          } else {
            oddSum += row[j]!;
          }
        }
        oddSums.push(oddSum);
        evenSums.push(evenSum);
      }

      const r = pearsonCorrelation(oddSums, evenSums);
      if (isNaN(r)) return NaN;

      // Spearman-Brown correction: r_sb = (2 * r) / (1 + r)
      return (2 * r) / (1 + r);
    },
    examples: ['SPLIT_HALF([[4,3,5,2],[3,4,4,3],[5,5,4,4]])']
  },

  {
    name: 'KR20',
    category: 'stat',
    description: 'Kuder-Richardson Formula 20 for dichotomous (0/1) items',
    parameters: [
      { name: 'items', type: 'array', description: '2D array (participants x items) of 0/1 scores' }
    ],
    returns: 'number',
    implementation: (items: DynamicValue) => {
      if (!Array.isArray(items) || items.length < 2) return NaN;

      const rows: number[][] = items
        .filter((row: DynamicValue) => Array.isArray(row))
        .map((row: DynamicValue[]) => row.map(Number).filter((v: number) => !isNaN(v)));

      if (rows.length < 2) return NaN;

      const nItems = Math.min(...rows.map(r => r.length));
      if (nItems < 2) return NaN;

      const n = rows.length;
      const k = nItems;

      // Calculate total scores for each participant
      const totals = rows.map(row => {
        let s = 0;
        for (let j = 0; j < k; j++) s += row[j]!;
        return s;
      });

      // Variance of total scores
      const meanTotal = totals.reduce((s, v) => s + v, 0) / n;
      const varTotal = totals.reduce((s, v) => s + (v - meanTotal) ** 2, 0) / (n - 1);

      if (varTotal === 0) return NaN;

      // Sum of p*q for each item
      let sumPQ = 0;
      for (let j = 0; j < k; j++) {
        let correct = 0;
        for (let i = 0; i < n; i++) {
          correct += rows[i]![j]!;
        }
        const p = correct / n;
        const q = 1 - p;
        sumPQ += p * q;
      }

      // KR20 = (k/(k-1)) * (1 - sumPQ / varTotal)
      return (k / (k - 1)) * (1 - sumPQ / varTotal);
    },
    examples: ['KR20([[1,0,1,1],[1,1,0,1],[0,1,1,0]])']
  },

  {
    name: 'OMEGA',
    category: 'stat',
    description:
      "McDonald's omega (total) from a single-factor solution — does not assume tau-equivalence",
    parameters: [
      { name: 'items', type: 'array', description: '2D array (participants x items) of item scores' }
    ],
    returns: 'number',
    implementation: (items: DynamicValue) => {
      if (!Array.isArray(items) || items.length < 2) return NaN;

      const rows: number[][] = items
        .filter((row: DynamicValue) => Array.isArray(row))
        .map((row: DynamicValue[]) => row.map(Number).filter((v: number) => !isNaN(v)));

      if (rows.length < 2) return NaN;

      const nItems = Math.min(...rows.map(r => r.length));
      if (nItems < 2) return NaN;

      const k = nItems;

      // Extract item columns
      const columns: number[][] = [];
      for (let j = 0; j < k; j++) {
        columns.push(rows.map(row => row[j]!));
      }

      const r = correlationMatrix(columns);
      if (!r) return NaN; // a zero-variance item leaves omega undefined

      const loadings = singleFactorLoadings(r);

      // omega = (sum lambda)^2 / ((sum lambda)^2 + sum(1 - lambda_i^2))
      //
      // Numerator: variance of the sum score attributable to the common factor.
      // Denominator: that plus the summed uniquenesses — i.e. the total variance
      // of the sum score under the one-factor model. Because each lambda_i enters
      // separately, items are allowed to load unequally (congeneric); the
      // tau-equivalent case (all lambda equal) is the special case where omega
      // coincides with standardized alpha.
      const sumLoadings = loadings.reduce((sum, lambda) => sum + lambda, 0);
      const commonVariance = sumLoadings * sumLoadings;

      // A loading is a standardized correlation with the factor, so |lambda| <= 1;
      // clamp before squaring so a Heywood case cannot produce a negative uniqueness.
      const uniqueVariance = loadings.reduce(
        (sum, lambda) => sum + Math.max(0, 1 - Math.min(1, lambda * lambda)),
        0
      );

      const total = commonVariance + uniqueVariance;
      if (total === 0) return NaN;

      return commonVariance / total;
    },
    examples: ['OMEGA([[4,3,5,2],[3,4,4,3],[5,5,4,4]])']
  },

  {
    name: 'SEM',
    category: 'stat',
    description: 'Standard Error of Measurement',
    parameters: [
      { name: 'reliability', type: 'number', description: 'Reliability coefficient (0-1)' },
      { name: 'sd', type: 'number', description: 'Standard deviation of scores' }
    ],
    returns: 'number',
    implementation: (reliability: number, sd: number) => {
      if (typeof reliability !== 'number' || typeof sd !== 'number') return NaN;
      if (reliability < 0 || reliability > 1) return NaN;
      if (sd < 0) return NaN;

      // SEM = sd * sqrt(1 - reliability)
      return sd * Math.sqrt(1 - reliability);
    },
    examples: ['SEM(0.85, 15)', 'SEM(0.9, 10)']
  }
];
