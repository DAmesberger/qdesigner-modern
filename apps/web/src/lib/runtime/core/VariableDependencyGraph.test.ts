import { describe, it, expect } from 'vitest';
import { VariableDependencyGraph } from './VariableDependencyGraph';
import type { Variable } from '$lib/shared/types/questionnaire';

function makeVar(name: string, formula?: string, defaultValue?: unknown): Variable {
	return {
		id: name,
		name,
		type: 'number',
		scope: 'global',
		defaultValue,
		formula,
	};
}

describe('VariableDependencyGraph', () => {
	describe('extractDependencies', () => {
		it('extracts variable references from a simple formula', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a'),
				makeVar('b'),
				makeVar('c', 'a + b'),
			]);

			const deps = graph.extractDependencies('a + b');
			expect(deps).toContain('a');
			expect(deps).toContain('b');
			expect(deps).toHaveLength(2);
		});

		it('excludes built-in function names', () => {
			const graph = new VariableDependencyGraph([
				makeVar('x'),
				makeVar('y', 'SUM(x, 10)'),
			]);

			const deps = graph.extractDependencies('SUM(x, 10)');
			expect(deps).toContain('x');
			expect(deps).not.toContain('SUM');
		});

		it('excludes reserved words', () => {
			const graph = new VariableDependencyGraph([
				makeVar('x'),
				makeVar('y', 'IF(true, x, null)'),
			]);

			const deps = graph.extractDependencies('IF(true, x, null)');
			expect(deps).toContain('x');
			expect(deps).not.toContain('true');
			expect(deps).not.toContain('null');
			expect(deps).not.toContain('IF');
		});

		it('handles complex formulas with multiple references', () => {
			const graph = new VariableDependencyGraph([
				makeVar('score1'),
				makeVar('score2'),
				makeVar('score3'),
				makeVar('total', '(score1 + score2 + score3) / 3'),
			]);

			const deps = graph.extractDependencies('(score1 + score2 + score3) / 3');
			expect(deps).toContain('score1');
			expect(deps).toContain('score2');
			expect(deps).toContain('score3');
			expect(deps).toHaveLength(3);
		});

		it('returns empty array for formulas with no variable references', () => {
			const graph = new VariableDependencyGraph([
				makeVar('x', '42 + 10'),
			]);

			const deps = graph.extractDependencies('42 + 10');
			expect(deps).toHaveLength(0);
		});
	});

	describe('getEvaluationOrder', () => {
		it('returns empty array when no computed variables exist', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', undefined, 2),
			]);

			expect(graph.getEvaluationOrder()).toEqual([]);
		});

		it('orders a simple linear chain correctly', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'b + 1'),
			]);

			const order = graph.getEvaluationOrder();
			expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
		});

		it('orders a diamond dependency correctly', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'a + 3'),
				makeVar('d', 'b + c'),
			]);

			const order = graph.getEvaluationOrder();
			expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
			expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
		});

		it('includes all computed variables', () => {
			const graph = new VariableDependencyGraph([
				makeVar('x', undefined, 10),
				makeVar('y', 'x * 2'),
				makeVar('z', 'x + 5'),
			]);

			const order = graph.getEvaluationOrder();
			expect(order).toContain('y');
			expect(order).toContain('z');
			expect(order).not.toContain('x');
		});
	});

	describe('getDependents', () => {
		it('returns direct dependents', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'a + 3'),
			]);

			const dependents = graph.getDependents('a');
			expect(dependents).toContain('b');
			expect(dependents).toContain('c');
		});

		it('returns transitive dependents', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'b + 1'),
			]);

			const dependents = graph.getDependents('a');
			expect(dependents).toContain('b');
			expect(dependents).toContain('c');
		});

		it('returns empty for leaf variables with no dependents', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
			]);

			expect(graph.getDependents('b')).toEqual([]);
		});

		it('returns empty for unknown variables', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
			]);

			expect(graph.getDependents('nonexistent')).toEqual([]);
		});
	});

	describe('getAffectedVariables', () => {
		it('returns affected variables in topological order', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'b + 1'),
			]);

			const affected = graph.getAffectedVariables('a');
			expect(affected).toEqual(['b', 'c']);
		});

		it('handles diamond dependencies', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'a + 3'),
				makeVar('d', 'b + c'),
			]);

			const affected = graph.getAffectedVariables('a');
			expect(affected).toContain('b');
			expect(affected).toContain('c');
			expect(affected).toContain('d');
			expect(affected.indexOf('d')).toBeGreaterThan(affected.indexOf('b'));
			expect(affected.indexOf('d')).toBeGreaterThan(affected.indexOf('c'));
		});

		it('returns empty when no variables are affected', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', undefined, 2),
			]);

			expect(graph.getAffectedVariables('a')).toEqual([]);
		});
	});

	describe('detectCycles', () => {
		it('returns null when no cycles exist', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
				makeVar('c', 'b + 1'),
			]);

			expect(graph.detectCycles()).toBeNull();
		});

		it('detects a simple two-variable cycle', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', 'b + 1'),
				makeVar('b', 'a + 1'),
			]);

			const cycles = graph.detectCycles();
			expect(cycles).not.toBeNull();
			expect(cycles!.length).toBeGreaterThan(0);
		});

		it('detects a self-referencing variable', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', 'a + 1'),
			]);

			const cycles = graph.detectCycles();
			expect(cycles).not.toBeNull();
			expect(cycles!.length).toBeGreaterThan(0);
		});

		it('detects a three-variable cycle', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', 'c + 1'),
				makeVar('b', 'a + 1'),
				makeVar('c', 'b + 1'),
			]);

			const cycles = graph.detectCycles();
			expect(cycles).not.toBeNull();
		});

		it('returns null for independent variables', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', undefined, 2),
				makeVar('c', undefined, 3),
			]);

			expect(graph.detectCycles()).toBeNull();
		});
	});

	describe('isComputed', () => {
		it('returns true for variables with formulas', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', 'a * 2'),
			]);

			expect(graph.isComputed('b')).toBe(true);
		});

		it('returns false for variables without formulas', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
			]);

			expect(graph.isComputed('a')).toBe(false);
		});

		it('returns false for unknown variables', () => {
			const graph = new VariableDependencyGraph([]);
			expect(graph.isComputed('nonexistent')).toBe(false);
		});
	});

	describe('getDirectDependencies', () => {
		it('returns direct dependencies of a computed variable', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
				makeVar('b', undefined, 2),
				makeVar('c', 'a + b'),
			]);

			const deps = graph.getDirectDependencies('c');
			expect(deps).toContain('a');
			expect(deps).toContain('b');
			expect(deps).toHaveLength(2);
		});

		it('returns empty for non-computed variables', () => {
			const graph = new VariableDependencyGraph([
				makeVar('a', undefined, 1),
			]);

			expect(graph.getDirectDependencies('a')).toEqual([]);
		});
	});
});
