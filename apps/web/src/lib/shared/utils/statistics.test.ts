import { describe, expect, it } from 'vitest';
import { normalCDF, mean, parseNumeric } from './statistics';

describe('normalCDF', () => {
  it('returns 0.5 at z = 0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 6);
  });

  it('is symmetric: CDF(-z) = 1 - CDF(z)', () => {
    expect(normalCDF(-1.5)).toBeCloseTo(1 - normalCDF(1.5), 6);
  });

  it('matches known values within the approximation error', () => {
    expect(normalCDF(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCDF(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe('mean', () => {
  it('returns 0 for an empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('computes the arithmetic mean', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('parseNumeric', () => {
  it('returns finite numbers as-is', () => {
    expect(parseNumeric(3.5)).toBe(3.5);
    expect(parseNumeric(0)).toBe(0);
  });

  it('rejects non-finite numbers', () => {
    expect(parseNumeric(NaN)).toBeNull();
    expect(parseNumeric(Infinity)).toBeNull();
  });

  it('parses numeric strings', () => {
    expect(parseNumeric('3.5')).toBe(3.5);
    expect(parseNumeric(' 42 ')).toBe(42);
  });

  it('returns null for empty or whitespace-only strings', () => {
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('  ')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseNumeric('abc')).toBeNull();
  });

  it('maps booleans to 1/0', () => {
    expect(parseNumeric(true)).toBe(1);
    expect(parseNumeric(false)).toBe(0);
  });

  it('returns null for null, undefined, and objects', () => {
    expect(parseNumeric(null)).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
    expect(parseNumeric({})).toBeNull();
  });
});
