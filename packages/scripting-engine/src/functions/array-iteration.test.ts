import { describe, it, expect } from 'vitest';
import { arrayFunctions } from './array';

describe('FOREACH', () => {
  const foreach = arrayFunctions.find(f => f.name === 'FOREACH')!;

  it('is registered', () => {
    expect(foreach).toBeDefined();
  });

  it('calls callback for each element', () => {
    const collected: unknown[] = [];
    const result = foreach.implementation([10, 20, 30], (item: unknown) => collected.push(item));
    expect(collected).toEqual([10, 20, 30]);
    expect(result).toBe(3);
  });

  it('passes index as second argument', () => {
    const indices: number[] = [];
    foreach.implementation(['a', 'b', 'c'], (_item: unknown, index: number) => indices.push(index));
    expect(indices).toEqual([0, 1, 2]);
  });

  it('returns 0 for non-array input', () => {
    expect(foreach.implementation('not an array' as unknown, () => {})).toBe(0);
  });

  it('returns array length when callback is not a function', () => {
    expect(foreach.implementation([1, 2, 3], 'not a function')).toBe(3);
  });

  it('handles empty array', () => {
    const collected: unknown[] = [];
    const result = foreach.implementation([], (item: unknown) => collected.push(item));
    expect(collected).toEqual([]);
    expect(result).toBe(0);
  });
});

describe('RANGE', () => {
  const range = arrayFunctions.find(f => f.name === 'RANGE')!;

  it('is registered', () => {
    expect(range).toBeDefined();
  });

  it('generates ascending range', () => {
    expect(range.implementation(1, 5)).toEqual([1, 2, 3, 4]);
  });

  it('generates range with custom step', () => {
    expect(range.implementation(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
  });

  it('generates descending range', () => {
    expect(range.implementation(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });

  it('returns empty array for zero step', () => {
    expect(range.implementation(1, 5, 0)).toEqual([]);
  });

  it('returns empty array for non-number inputs', () => {
    expect(range.implementation('a' as unknown, 5)).toEqual([]);
  });

  it('returns empty array when start equals end', () => {
    expect(range.implementation(5, 5)).toEqual([]);
  });

  it('returns empty array when step direction is wrong', () => {
    expect(range.implementation(1, 5, -1)).toEqual([]);
  });

  it('limits output to prevent runaway generation', () => {
    const result = range.implementation(0, 100000, 1);
    expect(result.length).toBeLessThanOrEqual(10000);
  });

  it('generates single-element range', () => {
    expect(range.implementation(3, 4)).toEqual([3]);
  });

  it('handles fractional steps', () => {
    const result = range.implementation(0, 1, 0.25);
    expect(result).toEqual([0, 0.25, 0.5, 0.75]);
  });
});
