import { describe, it, expect } from 'vitest';
import { irtFunctions } from './irt';

function getFunc(name: string) {
  const fn = irtFunctions.find(f => f.name === name);
  if (!fn) throw new Error(`Function ${name} not found`);
  return fn.implementation;
}

describe('IRT_1PL', () => {
  const irt1pl = getFunc('IRT_1PL');

  it('is registered', () => {
    expect(irtFunctions.find(f => f.name === 'IRT_1PL')).toBeDefined();
  });

  it('returns 0.5 when theta equals b', () => {
    expect(irt1pl(0, 0)).toBeCloseTo(0.5, 10);
    expect(irt1pl(1.5, 1.5)).toBeCloseTo(0.5, 10);
    expect(irt1pl(-2, -2)).toBeCloseTo(0.5, 10);
  });

  it('returns > 0.5 when theta > b', () => {
    expect(irt1pl(1, 0) as number).toBeGreaterThan(0.5);
    expect(irt1pl(2, -1) as number).toBeGreaterThan(0.5);
  });

  it('returns < 0.5 when theta < b', () => {
    expect(irt1pl(-1, 0) as number).toBeLessThan(0.5);
    expect(irt1pl(0, 2) as number).toBeLessThan(0.5);
  });

  it('approaches 1 for large positive theta - b', () => {
    expect(irt1pl(10, 0) as number).toBeGreaterThan(0.99);
  });

  it('approaches 0 for large negative theta - b', () => {
    expect(irt1pl(-10, 0) as number).toBeLessThan(0.01);
  });

  it('returns NaN for non-numeric inputs', () => {
    expect(irt1pl('a', 0)).toBeNaN();
    expect(irt1pl(0, 'b')).toBeNaN();
  });
});

describe('IRT_2PL', () => {
  const irt2pl = getFunc('IRT_2PL');

  it('returns 0.5 when theta equals b regardless of a', () => {
    expect(irt2pl(0, 1, 0)).toBeCloseTo(0.5, 10);
    expect(irt2pl(0, 2, 0)).toBeCloseTo(0.5, 10);
    expect(irt2pl(1, 0.5, 1)).toBeCloseTo(0.5, 10);
  });

  it('steeper discrimination means faster transition', () => {
    const pLowA = irt2pl(1, 0.5, 0) as number;
    const pHighA = irt2pl(1, 2.0, 0) as number;
    // Both > 0.5 since theta > b, but higher a -> further from 0.5
    expect(pHighA).toBeGreaterThan(pLowA);
  });

  it('returns NaN for non-numeric inputs', () => {
    expect(irt2pl('a', 1, 0)).toBeNaN();
  });
});

describe('IRT_3PL', () => {
  const irt3pl = getFunc('IRT_3PL');

  it('has lower asymptote at c', () => {
    // At very low theta, P should approach c
    const p = irt3pl(-20, 1, 0, 0.25) as number;
    expect(p).toBeCloseTo(0.25, 1);
  });

  it('returns 0.5 * (1 + c) when theta = b (for a=1)', () => {
    // P(b) = c + (1-c) * 0.5 = c + 0.5 - 0.5c = 0.5 + 0.5c
    const c = 0.2;
    const expected = 0.5 + 0.5 * c;
    expect(irt3pl(0, 1, 0, c)).toBeCloseTo(expected, 5);
  });

  it('approaches 1 for very high theta', () => {
    expect(irt3pl(20, 1, 0, 0.25) as number).toBeGreaterThan(0.99);
  });

  it('returns NaN for invalid c', () => {
    expect(irt3pl(0, 1, 0, -0.1)).toBeNaN();
    expect(irt3pl(0, 1, 0, 1)).toBeNaN();
  });
});

describe('IRT_INFO', () => {
  const irtInfo = getFunc('IRT_INFO');

  it('is registered', () => {
    expect(irtFunctions.find(f => f.name === 'IRT_INFO')).toBeDefined();
  });

  it('peaks near b for 2PL (c=0)', () => {
    // For 2PL, info is maximized at theta = b
    const infoAtB = irtInfo(0, 1, 0) as number;
    const infoAway = irtInfo(2, 1, 0) as number;
    expect(infoAtB).toBeGreaterThan(infoAway);
  });

  it('returns higher info for higher discrimination', () => {
    const infoLowA = irtInfo(0, 0.5, 0) as number;
    const infoHighA = irtInfo(0, 2.0, 0) as number;
    expect(infoHighA).toBeGreaterThan(infoLowA);
  });

  it('returns 0.25 for standard 1PL at theta = b', () => {
    // For 1PL at theta=b: P=0.5, Q=0.5, a=1. I = 1 * 0.5^2 * 0.5 / 0.5 = 0.25
    // Actually: I = a^2 * ((P-c)/(1-c))^2 * Q / P = 1 * (0.5)^2 * 0.5 / 0.5 = 0.25
    expect(irtInfo(0, 1, 0)).toBeCloseTo(0.25, 5);
  });

  it('returns NaN for non-numeric inputs', () => {
    expect(irtInfo('a', 1, 0)).toBeNaN();
  });
});

describe('IRT_THETA_MLE', () => {
  const thetaMLE = getFunc('IRT_THETA_MLE');

  it('is registered', () => {
    expect(irtFunctions.find(f => f.name === 'IRT_THETA_MLE')).toBeDefined();
  });

  it('estimates positive theta for mostly correct responses', () => {
    const responses = [1, 1, 1, 1, 0];
    const items = [
      { a: 1, b: -2 },
      { a: 1, b: -1 },
      { a: 1, b: 0 },
      { a: 1, b: 1 },
      { a: 1, b: 2 }
    ];
    const theta = thetaMLE(responses, items) as number;
    expect(theta).toBeGreaterThan(0);
  });

  it('estimates negative theta for mostly incorrect responses', () => {
    const responses = [0, 0, 0, 0, 1];
    const items = [
      { a: 1, b: -2 },
      { a: 1, b: -1 },
      { a: 1, b: 0 },
      { a: 1, b: 1 },
      { a: 1, b: 2 }
    ];
    const theta = thetaMLE(responses, items) as number;
    expect(theta).toBeLessThan(0);
  });

  it('returns bounded value for all-correct responses', () => {
    const responses = [1, 1, 1];
    const items = [{ a: 1, b: 0 }, { a: 1, b: 0 }, { a: 1, b: 0 }];
    const theta = thetaMLE(responses, items) as number;
    expect(theta).toBe(4);
  });

  it('returns bounded value for all-incorrect responses', () => {
    const responses = [0, 0, 0];
    const items = [{ a: 1, b: 0 }, { a: 1, b: 0 }, { a: 1, b: 0 }];
    const theta = thetaMLE(responses, items) as number;
    expect(theta).toBe(-4);
  });

  it('returns NaN for invalid inputs', () => {
    expect(thetaMLE('not array', [])).toBeNaN();
    expect(thetaMLE([], 'not array')).toBeNaN();
    expect(thetaMLE([], [])).toBeNaN();
    expect(thetaMLE([1], [{ a: 1, b: 0 }, { a: 1, b: 1 }])).toBeNaN();
  });

  it('handles items with guessing parameter', () => {
    const responses = [1, 0, 1, 0];
    const items = [
      { a: 1, b: -1, c: 0.25 },
      { a: 1, b: 0, c: 0.25 },
      { a: 1, b: 1, c: 0.25 },
      { a: 1, b: 2, c: 0.25 }
    ];
    const theta = thetaMLE(responses, items) as number;
    expect(typeof theta).toBe('number');
    expect(theta).not.toBeNaN();
  });
});
