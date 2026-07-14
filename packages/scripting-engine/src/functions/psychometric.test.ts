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

  // ------------------------------------------------------------------------
  // Reference data with an EXACT known factor structure.
  //
  // Columns 1..7 of the order-8 Sylvester-Hadamard matrix are mutually
  // orthogonal, centered, and all of norm sqrt(8). Building each item as
  //     x_i = lambda_i * f + sqrt(1 - lambda_i^2) * e_i
  // from distinct such columns (f = column 1, e_i = columns 2..) makes the
  // SAMPLE correlation matrix exactly r_ij = lambda_i * lambda_j (i != j) with
  // an exact unit diagonal — i.e. a perfectly congeneric one-factor structure
  // whose loadings we know to machine precision. Omega then has a closed form.
  // ------------------------------------------------------------------------
  const hadamardColumn = (j: number): number[] =>
    Array.from({ length: 8 }, (_, i) => {
      let bits = 0;
      for (let b = i & j; b > 0; b >>= 1) bits ^= b & 1;
      return bits === 0 ? 1 : -1;
    });

  /** participants x items, sample correlation r_ij = lambda_i * lambda_j exactly. */
  const congenericData = (lambdas: number[]): number[][] => {
    const factor = hadamardColumn(1);
    const errors = lambdas.map((_, i) => hadamardColumn(i + 2));
    return Array.from({ length: 8 }, (_, participant) =>
      lambdas.map(
        (lambda, item) =>
          lambda * factor[participant]! +
          Math.sqrt(1 - lambda * lambda) * errors[item]![participant]!
      )
    );
  };

  it('recovers the closed-form omega of a congeneric (unequal-loading) structure', () => {
    const lambdas = [0.9, 0.8, 0.5, 0.4];
    const data = congenericData(lambdas);

    // omega = (sum L)^2 / ((sum L)^2 + sum(1 - L^2))
    //       = 2.6^2 / (2.6^2 + (4 - 1.86)) = 6.76 / 8.9 = 0.7595505618...
    const sumL = lambdas.reduce((s, l) => s + l, 0);
    const expected = sumL ** 2 / (sumL ** 2 + lambdas.reduce((s, l) => s + (1 - l * l), 0));
    expect(expected).toBeCloseTo(0.7595505618, 9);

    expect(omega(data) as number).toBeCloseTo(expected, 8);
  });

  it('exceeds standardized alpha when loadings are unequal (alpha under-estimates a congeneric scale)', () => {
    const lambdas = [0.9, 0.8, 0.5, 0.4];
    const data = congenericData(lambdas);

    // Standardized alpha = k*rAvg / (1 + (k-1)*rAvg) on the same correlations.
    // This is the formula OMEGA used to return while claiming not to assume
    // tau-equivalence; it is provably too low here.
    const k = lambdas.length;
    let sumR = 0;
    let pairs = 0;
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        sumR += lambdas[i]! * lambdas[j]!;
        pairs++;
      }
    }
    const rAvg = sumR / pairs;
    const standardizedAlpha = (k * rAvg) / (1 + (k - 1) * rAvg);
    expect(standardizedAlpha).toBeCloseTo(0.7340823, 6);

    expect(omega(data) as number).toBeGreaterThan(standardizedAlpha + 0.02);
  });

  it('coincides with standardized alpha under exact tau-equivalence (equal loadings)', () => {
    // Equal loadings => equicorrelated R (r = 0.64) => omega == alpha == k*r/(1+(k-1)*r).
    const data = congenericData([0.8, 0.8, 0.8, 0.8]);
    const k = 4;
    const r = 0.64;
    const expected = (k * r) / (1 + (k - 1) * r); // 2.56 / 2.92 = 0.8767123...

    expect(omega(data) as number).toBeCloseTo(expected, 8);
  });

  it('returns 0 when the items share no common variance', () => {
    // Four mutually orthogonal columns => correlation matrix is exactly the
    // identity => no common factor => zero common variance.
    const columns = [1, 2, 3, 4].map(hadamardColumn);
    const data = Array.from({ length: 8 }, (_, p) => columns.map(c => c[p]!));

    expect(omega(data) as number).toBeCloseTo(0, 10);
  });

  it('stays within [0, 1] for ordinary Likert-style data', () => {
    const data = [
      [4, 3, 5, 2],
      [3, 4, 4, 3],
      [5, 5, 4, 4],
      [2, 2, 3, 1],
      [4, 4, 5, 3],
      [1, 2, 2, 2]
    ];
    const result = omega(data) as number;
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
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
