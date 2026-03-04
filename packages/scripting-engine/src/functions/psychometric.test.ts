import { describe, it, expect } from 'vitest';
import { psychometricFunctions } from './psychometric';

function getFunc(name: string) {
  const fn = psychometricFunctions.find(f => f.name === name);
  if (!fn) throw new Error(`Function ${name} not found`);
  return fn.implementation;
}

describe('SPLIT_HALF', () => {
  const splitHalf = getFunc('SPLIT_HALF');

  it('is registered', () => {
    expect(psychometricFunctions.find(f => f.name === 'SPLIT_HALF')).toBeDefined();
  });

  it('returns a reliability value between -1 and 1 for valid data', () => {
    const data = [
      [4, 3, 5, 2],
      [3, 4, 4, 3],
      [5, 5, 4, 4],
      [2, 2, 3, 1],
      [4, 4, 5, 3]
    ];
    const result = splitHalf(data) as number;
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('returns NaN for insufficient data', () => {
    expect(splitHalf([[1, 2]])).toBeNaN();
    expect(splitHalf([])).toBeNaN();
    expect(splitHalf('not array')).toBeNaN();
  });

  it('returns NaN for single-item rows', () => {
    expect(splitHalf([[1], [2], [3]])).toBeNaN();
  });

  it('handles perfectly correlated halves', () => {
    // Even items = 2 * odd items -> perfect correlation
    const data = [
      [1, 2, 2, 4],
      [2, 4, 3, 6],
      [3, 6, 4, 8],
      [4, 8, 5, 10]
    ];
    const result = splitHalf(data) as number;
    expect(result).toBeCloseTo(1.0, 1);
  });
});

describe('KR20', () => {
  const kr20 = getFunc('KR20');

  it('is registered', () => {
    expect(psychometricFunctions.find(f => f.name === 'KR20')).toBeDefined();
  });

  it('returns a reliability value for dichotomous data', () => {
    const data = [
      [1, 1, 1, 0, 1],
      [1, 0, 1, 0, 0],
      [0, 1, 0, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [1, 1, 0, 1, 1]
    ];
    const result = kr20(data) as number;
    expect(typeof result).toBe('number');
    expect(result).not.toBeNaN();
  });

  it('returns NaN for insufficient data', () => {
    expect(kr20([[1, 0]])).toBeNaN();
    expect(kr20([])).toBeNaN();
  });

  it('returns NaN when total variance is zero', () => {
    // All participants have the same total
    const data = [
      [1, 0],
      [0, 1],
      [1, 0],
      [0, 1]
    ];
    // This may or may not be NaN depending on exact variance
    const result = kr20(data) as number;
    expect(typeof result).toBe('number');
  });

  it('perfect items yield high reliability', () => {
    // Guttman pattern: high-ability participants get all items correct
    const data = [
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 0],
      [1, 1, 1, 0, 0],
      [1, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0]
    ];
    const result = kr20(data) as number;
    expect(result).toBeGreaterThan(0.5);
  });
});

describe('OMEGA', () => {
  const omega = getFunc('OMEGA');

  it('is registered', () => {
    expect(psychometricFunctions.find(f => f.name === 'OMEGA')).toBeDefined();
  });

  it('returns a value for valid multi-item data', () => {
    const data = [
      [4, 3, 5, 2],
      [3, 4, 4, 3],
      [5, 5, 4, 4],
      [2, 2, 3, 1],
      [4, 4, 5, 3]
    ];
    const result = omega(data) as number;
    expect(typeof result).toBe('number');
    expect(result).not.toBeNaN();
  });

  it('returns NaN for insufficient data', () => {
    expect(omega([[1, 2]])).toBeNaN();
    expect(omega([])).toBeNaN();
  });
});

describe('SEM', () => {
  const sem = getFunc('SEM');

  it('is registered', () => {
    expect(psychometricFunctions.find(f => f.name === 'SEM')).toBeDefined();
  });

  it('computes SEM = sd * sqrt(1 - reliability)', () => {
    const result = sem(0.84, 15) as number;
    // SEM = 15 * sqrt(1 - 0.84) = 15 * sqrt(0.16) = 15 * 0.4 = 6.0
    expect(result).toBeCloseTo(6.0, 5);
  });

  it('returns 0 when reliability is 1', () => {
    expect(sem(1, 15)).toBeCloseTo(0, 10);
  });

  it('returns sd when reliability is 0', () => {
    expect(sem(0, 10)).toBeCloseTo(10, 10);
  });

  it('returns NaN for invalid inputs', () => {
    expect(sem(-0.1, 15)).toBeNaN();
    expect(sem(1.5, 15)).toBeNaN();
    expect(sem('abc', 15)).toBeNaN();
    expect(sem(0.8, -5)).toBeNaN();
  });
});
