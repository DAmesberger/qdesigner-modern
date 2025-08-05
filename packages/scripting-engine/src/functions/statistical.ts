import type { FormulaFunction } from '../types';

// Statistical Functions
export const statisticalFunctions: FormulaFunction[] = [
  {
    name: 'MEAN',
    category: 'stat',
    description: 'Calculate the arithmetic mean of numbers',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of numbers or individual numbers' }
    ],
    returns: 'number',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      if (numbers.length === 0) return NaN;
      return numbers.reduce((sum: number, val: number) => sum + val, 0) / numbers.length;
    },
    examples: ['MEAN(1, 2, 3, 4, 5)', 'MEAN([10, 20, 30])']
  },
  
  {
    name: 'MEDIAN',
    category: 'stat',
    description: 'Calculate the median value',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of numbers or individual numbers' }
    ],
    returns: 'number',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const numbers = values
        .filter((v: any) => typeof v === 'number' && !isNaN(v))
        .sort((a: number, b: number) => a - b);
      
      if (numbers.length === 0) return NaN;
      
      const mid = Math.floor(numbers.length / 2);
      return numbers.length % 2 === 0
        ? (numbers[mid - 1] + numbers[mid]) / 2
        : numbers[mid];
    },
    examples: ['MEDIAN(1, 3, 5, 7, 9)', 'MEDIAN([2, 4, 6, 8])']
  },
  
  {
    name: 'MODE',
    category: 'stat',
    description: 'Find the most frequent value(s)',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of values' }
    ],
    returns: 'any|array',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const frequency = new Map<any, number>();
      
      values.forEach((val: any) => {
        frequency.set(val, (frequency.get(val) || 0) + 1);
      });
      
      const maxFreq = Math.max(...frequency.values());
      const modes = Array.from(frequency.entries())
        .filter(([_, freq]) => freq === maxFreq)
        .map(([val, _]) => val);
      
      return modes.length === 1 ? modes[0] : modes;
    },
    examples: ['MODE(1, 2, 2, 3, 3, 3)', 'MODE(["A", "B", "B", "C"])']
  },
  
  {
    name: 'STDEV',
    category: 'stat',
    description: 'Calculate standard deviation (sample)',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of numbers or individual numbers' }
    ],
    returns: 'number',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      
      if (numbers.length < 2) return NaN;
      
      const mean = numbers.reduce((sum: number, val: number) => sum + val, 0) / numbers.length;
      const squaredDiffs = numbers.map((val: number) => Math.pow(val - mean, 2));
      const variance = squaredDiffs.reduce((sum: number, val: number) => sum + val, 0) / (numbers.length - 1);
      
      return Math.sqrt(variance);
    },
    examples: ['STDEV(1, 2, 3, 4, 5)', 'STDEV([10, 12, 15, 18, 20])']
  },
  
  {
    name: 'VARIANCE',
    category: 'stat',
    description: 'Calculate variance (sample)',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of numbers or individual numbers' }
    ],
    returns: 'number',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      
      if (numbers.length < 2) return NaN;
      
      const mean = numbers.reduce((sum: number, val: number) => sum + val, 0) / numbers.length;
      const squaredDiffs = numbers.map((val: number) => Math.pow(val - mean, 2));
      
      return squaredDiffs.reduce((sum: number, val: number) => sum + val, 0) / (numbers.length - 1);
    },
    examples: ['VARIANCE(1, 2, 3, 4, 5)', 'VARIANCE([5, 10, 15, 20])']
  },
  
  {
    name: 'PERCENTILE',
    category: 'stat',
    description: 'Calculate the nth percentile',
    parameters: [
      { name: 'values', type: 'array', description: 'Array of numbers' },
      { name: 'percentile', type: 'number', description: 'Percentile (0-1 or 0-100)' }
    ],
    returns: 'number',
    implementation: (values: any[], percentile: number) => {
      const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v)).sort((a: number, b: number) => a - b);
      
      if (numbers.length === 0) return NaN;
      
      // Convert to 0-1 range if needed
      const p = percentile > 1 ? percentile / 100 : percentile;
      
      if (p < 0 || p > 1) return NaN;
      
      const index = (numbers.length - 1) * p;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index % 1;
      
      return lower === upper ? numbers[lower] : numbers[lower] * (1 - weight) + numbers[upper] * weight;
    },
    examples: ['PERCENTILE([1, 2, 3, 4, 5], 0.5)', 'PERCENTILE([10, 20, 30, 40], 75)']
  },
  
  {
    name: 'CORRELATION',
    category: 'stat',
    description: 'Calculate Pearson correlation coefficient',
    parameters: [
      { name: 'x', type: 'array', description: 'First array of numbers' },
      { name: 'y', type: 'array', description: 'Second array of numbers' }
    ],
    returns: 'number',
    implementation: (x: any[], y: any[]) => {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return NaN;
      
      const n = x.length;
      if (n < 2) return NaN;
      
      const xNum = x.filter((v: any) => typeof v === 'number' && !isNaN(v));
      const yNum = y.filter((v: any) => typeof v === 'number' && !isNaN(v));
      
      if (xNum.length !== n || yNum.length !== n) return NaN;
      
      const meanX = xNum.reduce((sum: number, val: number) => sum + val, 0) / n;
      const meanY = yNum.reduce((sum: number, val: number) => sum + val, 0) / n;
      
      let ssXX = 0, ssYY = 0, ssXY = 0;
      for (let i = 0; i < n; i++) {
        const dx = xNum[i] - meanX;
        const dy = yNum[i] - meanY;
        ssXX += dx * dx;
        ssYY += dy * dy;
        ssXY += dx * dy;
      }
      
      return ssXY / Math.sqrt(ssXX * ssYY);
    },
    examples: ['CORRELATION([1, 2, 3], [2, 4, 6])', 'CORRELATION([10, 20, 30], [5, 10, 15])']
  },
  
  {
    name: 'ZSCORE',
    category: 'stat',
    description: 'Calculate z-score (standard score)',
    parameters: [
      { name: 'value', type: 'number', description: 'Value to standardize' },
      { name: 'mean', type: 'number', description: 'Population mean' },
      { name: 'stdev', type: 'number', description: 'Population standard deviation' }
    ],
    returns: 'number',
    implementation: (value: number, mean: number, stdev: number) => {
      if (typeof value !== 'number' || typeof mean !== 'number' || typeof stdev !== 'number') return NaN;
      if (stdev === 0) return NaN;
      return (value - mean) / stdev;
    },
    examples: ['ZSCORE(85, 80, 10)', 'ZSCORE(120, 100, 15)']
  },
  
  {
    name: 'TTEST',
    category: 'stat',
    description: 'Perform independent samples t-test',
    parameters: [
      { name: 'group1', type: 'array', description: 'First group of values' },
      { name: 'group2', type: 'array', description: 'Second group of values' },
      { name: 'tails', type: 'number', description: 'Number of tails (1 or 2)', optional: true, default: 2 }
    ],
    returns: 'object',
    implementation: (group1: any[], group2: any[], tails: number = 2) => {
      const g1 = group1.filter((v: any) => typeof v === 'number' && !isNaN(v));
      const g2 = group2.filter((v: any) => typeof v === 'number' && !isNaN(v));
      
      const n1 = g1.length;
      const n2 = g2.length;
      
      if (n1 < 2 || n2 < 2) return { error: 'Insufficient data' };
      
      const mean1 = g1.reduce((sum: number, val: number) => sum + val, 0) / n1;
      const mean2 = g2.reduce((sum: number, val: number) => sum + val, 0) / n2;
      
      const var1 = g1.reduce((sum: number, val: number) => sum + Math.pow(val - mean1, 2), 0) / (n1 - 1);
      const var2 = g2.reduce((sum: number, val: number) => sum + Math.pow(val - mean2, 2), 0) / (n2 - 1);
      
      const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
      const se = Math.sqrt(pooledVar * (1/n1 + 1/n2));
      const t = (mean1 - mean2) / se;
      const df = n1 + n2 - 2;
      
      return {
        t,
        df,
        mean1,
        mean2,
        meanDiff: mean1 - mean2,
        se,
        effectSize: (mean1 - mean2) / Math.sqrt(pooledVar)
      };
    },
    examples: ['TTEST([80, 85, 90], [75, 78, 82])', 'TTEST([1, 2, 3], [4, 5, 6], 1)']
  },
  
  {
    name: 'SKEWNESS',
    category: 'stat',
    description: 'Calculate skewness of distribution',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of numbers or individual numbers' }
    ],
    returns: 'number',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      
      const n = numbers.length;
      if (n < 3) return NaN;
      
      const mean = numbers.reduce((sum: number, val: number) => sum + val, 0) / n;
      const m2 = numbers.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / n;
      const m3 = numbers.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 3), 0) / n;
      
      const std = Math.sqrt(m2);
      if (std === 0) return NaN;
      
      return m3 / Math.pow(std, 3);
    },
    examples: ['SKEWNESS(1, 2, 3, 4, 5)', 'SKEWNESS([10, 20, 30, 40, 50])']
  },
  
  {
    name: 'KURTOSIS',
    category: 'stat',
    description: 'Calculate kurtosis (excess) of distribution',
    parameters: [
      { name: 'values', type: 'array|...number', description: 'Array of numbers or individual numbers' }
    ],
    returns: 'number',
    implementation: (...args: any[]) => {
      const values = Array.isArray(args[0]) ? args[0] : args;
      const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
      
      const n = numbers.length;
      if (n < 4) return NaN;
      
      const mean = numbers.reduce((sum: number, val: number) => sum + val, 0) / n;
      const m2 = numbers.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / n;
      const m4 = numbers.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 4), 0) / n;
      
      if (m2 === 0) return NaN;
      
      return m4 / Math.pow(m2, 2) - 3; // Excess kurtosis
    },
    examples: ['KURTOSIS(1, 2, 3, 4, 5)', 'KURTOSIS([10, 20, 30, 40, 50])']
  }
];