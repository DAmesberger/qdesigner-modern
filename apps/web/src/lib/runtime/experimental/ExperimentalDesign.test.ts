import { describe, it, expect } from 'vitest';
import { ConditionAssigner } from './ExperimentalDesign';

describe('ConditionAssigner', () => {
  const conditions = [
    { name: 'control', weight: 1 },
    { name: 'treatment-a', weight: 1 },
    { name: 'treatment-b', weight: 1 },
  ];

  describe('constructor', () => {
    it('throws when no conditions are provided', () => {
      expect(() => new ConditionAssigner([], 'random')).toThrow('At least one condition');
    });
  });

  describe('random strategy', () => {
    it('produces deterministic results for the same seed and participant', () => {
      const a = new ConditionAssigner(conditions, 'random', 42);
      const b = new ConditionAssigner(conditions, 'random', 42);

      for (let i = 0; i < 20; i++) {
        expect(a.assign(i)).toEqual(b.assign(i));
      }
    });

    it('assigns to valid conditions', () => {
      const assigner = new ConditionAssigner(conditions, 'random', 99);
      const names = new Set(conditions.map((c) => c.name));

      for (let i = 0; i < 100; i++) {
        const result = assigner.assign(i);
        expect(names.has(result.conditionName)).toBe(true);
        expect(result.conditionIndex).toBeGreaterThanOrEqual(0);
        expect(result.conditionIndex).toBeLessThan(conditions.length);
      }
    });

    it('respects weights over many assignments', () => {
      const weighted = [
        { name: 'heavy', weight: 9 },
        { name: 'light', weight: 1 },
      ];
      const assigner = new ConditionAssigner(weighted, 'random', 123);

      let heavyCount = 0;
      const n = 1000;
      for (let i = 0; i < n; i++) {
        if (assigner.assign(i).conditionName === 'heavy') heavyCount++;
      }

      // With 90/10 weight split, heavy should get most assignments
      expect(heavyCount).toBeGreaterThan(n * 0.7);
    });

    it('handles zero-weight conditions by falling back to uniform', () => {
      const zeroWeight = [
        { name: 'a', weight: 0 },
        { name: 'b', weight: 0 },
      ];
      const assigner = new ConditionAssigner(zeroWeight, 'random', 42);
      const result = assigner.assign(0);
      expect(['a', 'b']).toContain(result.conditionName);
    });
  });

  describe('sequential strategy', () => {
    it('assigns conditions in round-robin order', () => {
      const assigner = new ConditionAssigner(conditions, 'sequential');

      expect(assigner.assign(0).conditionName).toBe('control');
      expect(assigner.assign(1).conditionName).toBe('treatment-a');
      expect(assigner.assign(2).conditionName).toBe('treatment-b');
      expect(assigner.assign(3).conditionName).toBe('control');
      expect(assigner.assign(4).conditionName).toBe('treatment-a');
    });

    it('handles large participant numbers', () => {
      const assigner = new ConditionAssigner(conditions, 'sequential');
      const result = assigner.assign(999);
      expect(result.conditionIndex).toBe(999 % 3);
    });
  });

  describe('balanced strategy', () => {
    it('assigns to the least-represented condition', () => {
      const assigner = new ConditionAssigner(conditions, 'balanced');

      // control has 5, treatment-a has 3, treatment-b has 4
      const counts = [5, 3, 4];
      const result = assigner.assign(12, counts);
      expect(result.conditionName).toBe('treatment-a');
      expect(result.conditionIndex).toBe(1);
    });

    it('breaks ties by weight then index', () => {
      const weighted = [
        { name: 'a', weight: 1 },
        { name: 'b', weight: 3 },
        { name: 'c', weight: 2 },
      ];
      const assigner = new ConditionAssigner(weighted, 'balanced');

      // All equal counts: tie-break by highest weight -> b (weight 3)
      const result = assigner.assign(0, [2, 2, 2]);
      expect(result.conditionName).toBe('b');
    });

    it('falls back to sequential when no counts provided', () => {
      const assigner = new ConditionAssigner(conditions, 'balanced');
      const result = assigner.assign(1);
      expect(result.conditionName).toBe('treatment-a');
    });

    it('falls back to sequential when counts length mismatches', () => {
      const assigner = new ConditionAssigner(conditions, 'balanced');
      const result = assigner.assign(2, [1, 2]); // wrong length
      expect(result.conditionName).toBe('treatment-b');
    });
  });

  describe('single condition', () => {
    it('always assigns to the single condition', () => {
      const single = [{ name: 'only', weight: 1 }];
      const assigner = new ConditionAssigner(single, 'random', 42);

      for (let i = 0; i < 10; i++) {
        const result = assigner.assign(i);
        expect(result.conditionName).toBe('only');
        expect(result.conditionIndex).toBe(0);
      }
    });
  });
});
