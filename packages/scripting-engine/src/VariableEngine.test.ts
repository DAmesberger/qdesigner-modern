import { describe, it, expect, beforeEach } from 'vitest';
import { VariableEngine } from './VariableEngine';
import type { Variable } from '../types/questionnaire';

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
});