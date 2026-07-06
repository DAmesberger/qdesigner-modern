import { describe, it, expect } from 'vitest';
import {
  NORM_TABLES,
  CUSTOM_NORM_TABLE_ID,
  getNormTable,
  standardErrorOfMeasurement,
  reliableChangeIndex,
} from './normTables';

describe('normTables library', () => {
  it('ships a non-empty set of well-formed norms', () => {
    expect(NORM_TABLES.length).toBeGreaterThan(0);
    for (const norm of NORM_TABLES) {
      expect(norm.id).toBeTruthy();
      expect(norm.label).toBeTruthy();
      expect(Number.isFinite(norm.mean)).toBe(true);
      expect(norm.sd).toBeGreaterThan(0);
      expect(norm.citation).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = NORM_TABLES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getNormTable resolves a bundled id and rejects unknown/custom/empty', () => {
    const first = NORM_TABLES[0]!;
    expect(getNormTable(first.id)).toEqual(first);
    expect(getNormTable('does-not-exist')).toBeUndefined();
    expect(getNormTable(CUSTOM_NORM_TABLE_ID)).toBeUndefined();
    expect(getNormTable('')).toBeUndefined();
    expect(getNormTable(undefined)).toBeUndefined();
  });

  it('standardErrorOfMeasurement = SD * sqrt(1 - reliability)', () => {
    // SD 10, reliability 0.84 -> 10 * sqrt(0.16) = 4.
    expect(standardErrorOfMeasurement({ sd: 10, reliability: 0.84 })).toBeCloseTo(4, 6);
    // Perfect reliability -> zero SEM.
    expect(standardErrorOfMeasurement({ sd: 10, reliability: 1 })).toBe(0);
    // No reliability / out of range -> null.
    expect(standardErrorOfMeasurement({ sd: 10 })).toBeNull();
    expect(standardErrorOfMeasurement({ sd: 10, reliability: 1.5 })).toBeNull();
    expect(standardErrorOfMeasurement({ sd: 0, reliability: 0.8 })).toBeNull();
  });

  it('reliableChangeIndex: sign follows (post - pre) and null without reliability', () => {
    const norm = { sd: 10, reliability: 0.84 }; // SEM 4, Sdiff = sqrt(2)*4 ≈ 5.657
    // Improvement of +8 -> RCI ≈ 1.414.
    const up = reliableChangeIndex(20, 28, norm)!;
    expect(up).toBeGreaterThan(0);
    expect(up).toBeCloseTo(8 / (Math.SQRT2 * 4), 6);
    // Decline is negative and symmetric.
    const down = reliableChangeIndex(28, 20, norm)!;
    expect(down).toBeLessThan(0);
    expect(down).toBeCloseTo(-up, 6);
    // No reliability -> cannot derive SEM -> null (hide the arrow).
    expect(reliableChangeIndex(20, 28, { sd: 10 })).toBeNull();
  });
});
