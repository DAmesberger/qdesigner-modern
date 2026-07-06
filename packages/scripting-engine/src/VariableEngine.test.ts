import { describe, it, expect, beforeEach } from 'vitest';
import { VariableEngine } from './VariableEngine';
import type { Variable } from '@qdesigner/questionnaire-core';

describe('VariableEngine', () => {
  let engine: VariableEngine;

  beforeEach(() => {
    engine = new VariableEngine();
  });

  describe('Basic variable operations', () => {
    it('should register and retrieve a simple variable', () => {
      const variable: Variable = {
        id: 'var1',
        name: 'age',
        type: 'number',
        scope: 'global',
        defaultValue: 25
      };

      engine.registerVariable(variable);
      expect(engine.getVariable('var1')).toBe(25);
    });

    it('should set and get variable values', () => {
      const variable: Variable = {
        id: 'var1',
        name: 'score',
        type: 'number',
        scope: 'global'
      };

      engine.registerVariable(variable);
      engine.setVariable('var1', 100);
      expect(engine.getVariable('var1')).toBe(100);
    });

    it('should validate variable types', () => {
      const variable: Variable = {
        id: 'var1',
        name: 'count',
        type: 'number',
        scope: 'global'
      };

      engine.registerVariable(variable);
      expect(() => engine.setVariable('var1', 'not a number')).toThrow();
    });
  });

  describe('Formula evaluation', () => {
    it('should evaluate simple mathematical formulas', () => {
      const result = engine.evaluateFormula('2 + 2 * 3');
      expect(result.value).toBe(8);
      expect(result.error).toBeUndefined();
    });

    it('should evaluate formulas with variables', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'x',
        type: 'number',
        scope: 'global',
        defaultValue: 10
      };

      const var2: Variable = {
        id: 'var2',
        name: 'y',
        type: 'number',
        scope: 'global',
        formula: 'x * 2 + 5'
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);

      expect(engine.getVariable('var2')).toBe(25);
    });

    it('should handle dependencies correctly', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'base',
        type: 'number',
        scope: 'global',
        defaultValue: 10
      };

      const var2: Variable = {
        id: 'var2',
        name: 'multiplied',
        type: 'number',
        scope: 'global',
        formula: 'base * 3'
      };

      const var3: Variable = {
        id: 'var3',
        name: 'final',
        type: 'number',
        scope: 'global',
        formula: 'multiplied + base'
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);
      engine.registerVariable(var3);

      expect(engine.getVariable('var3')).toBe(40); // (10 * 3) + 10

      // Update base and check propagation
      engine.setVariable('var1', 20);
      expect(engine.getVariable('var2')).toBe(60); // 20 * 3
      expect(engine.getVariable('var3')).toBe(80); // 60 + 20
    });

    it('should detect circular dependencies', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'a',
        type: 'number',
        scope: 'global',
        formula: 'b + 1'
      };

      const var2: Variable = {
        id: 'var2',
        name: 'b',
        type: 'number',
        scope: 'global',
        formula: 'a + 1'
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);

      expect(() => engine.getVariable('var1')).toThrow('Circular dependency');
    });
  });

  describe('Custom functions', () => {
    it('should support IF function', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'score',
        type: 'number',
        scope: 'global',
        defaultValue: 85
      };

      const var2: Variable = {
        id: 'var2',
        name: 'grade',
        type: 'string',
        scope: 'global',
        formula: 'IF(score >= 90, "A", IF(score >= 80, "B", "C"))'
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);

      expect(engine.getVariable('var2')).toBe('B');
    });

    it('should support array functions', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'scores',
        type: 'array',
        scope: 'global',
        defaultValue: [10, 20, 30, 40, 50]
      };

      const var2: Variable = {
        id: 'var2',
        name: 'total',
        type: 'number',
        scope: 'global',
        formula: 'SUM(scores)'
      };

      const var3: Variable = {
        id: 'var3',
        name: 'average',
        type: 'number',
        scope: 'global',
        formula: 'AVG(scores)'
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);
      engine.registerVariable(var3);

      expect(engine.getVariable('var2')).toBe(150);
      expect(engine.getVariable('var3')).toBe(30);
    });

    it('should support string functions', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'firstName',
        type: 'string',
        scope: 'global',
        defaultValue: 'John'
      };

      const var2: Variable = {
        id: 'var2',
        name: 'lastName',
        type: 'string',
        scope: 'global',
        defaultValue: 'Doe'
      };

      const var3: Variable = {
        id: 'var3',
        name: 'fullName',
        type: 'string',
        scope: 'global',
        formula: 'CONCAT(firstName, " ", lastName)'
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);
      engine.registerVariable(var3);

      expect(engine.getVariable('var3')).toBe('John Doe');
    });
  });

  describe('State management', () => {
    it('should export and import state', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'counter',
        type: 'number',
        scope: 'global',
        defaultValue: 0
      };

      engine.registerVariable(var1);
      engine.setVariable('var1', 42);

      const state = engine.exportState();
      
      // Create new engine and import state
      const newEngine = new VariableEngine();
      newEngine.registerVariable(var1);
      newEngine.importState(state);

      expect(newEngine.getVariable('var1')).toBe(42);
    });

    it('should get all variables', () => {
      const var1: Variable = {
        id: 'var1',
        name: 'x',
        type: 'number',
        scope: 'global',
        defaultValue: 10
      };

      const var2: Variable = {
        id: 'var2',
        name: 'y',
        type: 'number',
        scope: 'global',
        defaultValue: 20
      };

      engine.registerVariable(var1);
      engine.registerVariable(var2);

      const allVars = engine.getAllVariables();
      expect(allVars).toEqual({
        x: 10,
        y: 20
      });
    });
  });

  // Guard tests for SERVER-COMPUTED VARIABLES (server-computed-variable /
  // E-FEEDBACK-3). These prove ADDRESSABILITY of an injected server value under
  // the P2-T2-hardened createSandboxedMath BEFORE the runtime/consumer story is
  // built on top of it. If the object-member-access test (a) ever regresses,
  // the runtime injection pass must pivot to auto-registered scalar companion
  // variables (cohortAnxiety_mean) instead of relying on dot access.
  describe('Server-computed variables (addressability gate)', () => {
    it('(a) object-valued variable set via setVariable supports member access in a formula', () => {
      const bundle: Variable = {
        id: 'cohortAnxiety',
        name: 'cohortAnxiety',
        type: 'object',
        scope: 'global',
        defaultValue: { mean: 0, sd: 0, n: 0 }
      };
      engine.registerVariable(bundle);
      engine.setVariable(
        'cohortAnxiety',
        { n: 142, mean: 42, sd: 5, median: 41, p25: 30, p75: 55 },
        'server-sync'
      );

      // Member access on the injected object resolves under the sandbox.
      expect(engine.evaluateFormula('cohortAnxiety.mean > 40').value).toBe(true);
      expect(engine.evaluateFormula('cohortAnxiety.mean > 50').value).toBe(false);
      // Nested through a built-in function (the piping AST path).
      expect(engine.evaluateFormula('round(cohortAnxiety.mean, 1)').value).toBe(42);
      // The injected value carries the documented 'server-sync' source.
      expect(engine.exportState().cohortAnxiety.source).toBe('server-sync');
    });

    it('(b) a scalar server variable participates directly in evaluateCondition', () => {
      const scalar: Variable = {
        id: 'cohortMeanAnxiety',
        name: 'cohortMeanAnxiety',
        type: 'number',
        scope: 'global',
        defaultValue: 0
      };
      const score: Variable = {
        id: 'score_total',
        name: 'score_total',
        type: 'number',
        scope: 'global',
        defaultValue: 0
      };
      engine.registerVariable(scalar);
      engine.registerVariable(score);
      engine.setVariable('cohortMeanAnxiety', 40, 'server-sync');
      engine.setVariable('score_total', 55);

      expect(engine.evaluateCondition('score_total > cohortMeanAnxiety')).toBe(true);
      engine.setVariable('score_total', 30);
      expect(engine.evaluateCondition('score_total > cohortMeanAnxiety')).toBe(false);
    });

    it('(c) an unset server variable falls back to its defaultValue', () => {
      const scalar: Variable = {
        id: 'cohortMeanAnxiety',
        name: 'cohortMeanAnxiety',
        type: 'number',
        scope: 'global',
        defaultValue: 25
      };
      engine.registerVariable(scalar);
      // Never setVariable'd (offline, never synced): resolves to defaultValue.
      expect(engine.getVariable('cohortMeanAnxiety')).toBe(25);
      expect(engine.evaluateCondition('cohortMeanAnxiety > 20')).toBe(true);
    });

    it('(d) importState/exportState round-trips an injected server value (resume path)', () => {
      const bundle: Variable = {
        id: 'cohortAnxiety',
        name: 'cohortAnxiety',
        type: 'object',
        scope: 'global'
      };
      engine.registerVariable(bundle);
      engine.setVariable('cohortAnxiety', { mean: 42, n: 10 }, 'server-sync');
      const state = engine.exportState();

      const resumed = new VariableEngine();
      resumed.registerVariable(bundle);
      resumed.importState(state);

      expect(resumed.evaluateFormula('cohortAnxiety.mean').value).toBe(42);
      expect(resumed.exportState().cohortAnxiety.source).toBe('server-sync');
    });
  });
});