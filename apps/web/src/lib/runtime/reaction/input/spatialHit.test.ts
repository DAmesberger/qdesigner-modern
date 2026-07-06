import { describe, it, expect } from 'vitest';
import { pointInRegion } from './spatialHit';

describe('pointInRegion', () => {
  const region = { x: 0.5, y: 0.5, radius: 0.1 };

  it('returns true for a point at the exact centre', () => {
    expect(pointInRegion({ x: 0.5, y: 0.5 }, region)).toBe(true);
  });

  it('returns true for a point inside the radius', () => {
    expect(pointInRegion({ x: 0.55, y: 0.55 }, region)).toBe(true);
  });

  it('returns true for a point exactly on the boundary', () => {
    // Distance along x-axis == radius.
    expect(pointInRegion({ x: 0.6, y: 0.5 }, region)).toBe(true);
  });

  it('returns false for a point outside the radius', () => {
    expect(pointInRegion({ x: 0.7, y: 0.7 }, region)).toBe(false);
  });

  it('is viewport-independent: a right-edge region rejects a left-edge tap', () => {
    const rightProbe = { x: 0.75, y: 0.5, radius: 0.15 };
    expect(pointInRegion({ x: 0.75, y: 0.5 }, rightProbe)).toBe(true);
    expect(pointInRegion({ x: 0.25, y: 0.5 }, rightProbe)).toBe(false);
  });

  it('returns false for a zero or negative radius', () => {
    expect(pointInRegion({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5, radius: 0 })).toBe(false);
    expect(pointInRegion({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5, radius: -1 })).toBe(false);
  });
});
