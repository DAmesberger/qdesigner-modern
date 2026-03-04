import type { FormulaFunction } from '../types';

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
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  const denom = Math.sqrt(ssXX * ssYY);
  if (denom === 0) return NaN;
  return ssXY / denom;
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
            evenSum += row[j];
          } else {
            oddSum += row[j];
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
        for (let j = 0; j < k; j++) s += row[j];
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
          correct += rows[i][j];
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
    description: "McDonald's omega (simplified, based on average inter-item correlation)",
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
        columns.push(rows.map(row => row[j]));
      }

      // Average inter-item correlation
      let sumR = 0;
      let count = 0;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          const r = pearsonCorrelation(columns[i], columns[j]);
          if (!isNaN(r)) {
            sumR += r;
            count++;
          }
        }
      }

      if (count === 0) return NaN;
      const rAvg = sumR / count;

      // omega = (k * rAvg) / (1 + (k-1) * rAvg)
      return (k * rAvg) / (1 + (k - 1) * rAvg);
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
