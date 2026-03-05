import { describe, it, expect, vi } from 'vitest';
import { ReactiveVariableEngine } from './ReactiveVariableEngine';
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

/**
 * Simple formula evaluator for testing.
 * Supports basic arithmetic using variable substitution.
 */
function simpleEvaluator(formula: string, context: Record<string, unknown>): unknown {
	// Replace variable names with their values in the expression
	let expr = formula;
	// Sort by length descending to avoid partial replacements (e.g. "score1" before "score")
	const names = Object.keys(context).sort((a, b) => b.length - a.length);
	for (const name of names) {
		const value = context[name];
		const numVal = typeof value === 'number' ? value : 0;
		expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(numVal));
	}
	// eslint-disable-next-line no-eval
	return eval(expr);
}

describe('ReactiveVariableEngine', () => {
	describe('construction', () => {
		it('initializes default values', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 10), makeVar('b', undefined, 20)],
				simpleEvaluator
			);

			expect(engine.getValue('a')).toBe(10);
			expect(engine.getValue('b')).toBe(20);
		});

		it('computes initial formula values', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 5), makeVar('b', 'a * 2')],
				simpleEvaluator
			);

			expect(engine.getValue('a')).toBe(5);
			expect(engine.getValue('b')).toBe(10);
		});

		it('computes chained formulas in correct order', () => {
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 3),
					makeVar('b', 'a * 2'),
					makeVar('c', 'b + 1'),
				],
				simpleEvaluator
			);

			expect(engine.getValue('a')).toBe(3);
			expect(engine.getValue('b')).toBe(6);
			expect(engine.getValue('c')).toBe(7);
		});

		it('throws on circular dependency', () => {
			expect(() => {
				new ReactiveVariableEngine(
					[makeVar('a', 'b + 1'), makeVar('b', 'a + 1')],
					simpleEvaluator
				);
			}).toThrow('Circular dependency');
		});

		it('throws on self-referencing variable', () => {
			expect(() => {
				new ReactiveVariableEngine(
					[makeVar('a', 'a + 1')],
					simpleEvaluator
				);
			}).toThrow('Circular dependency');
		});
	});

	describe('setValue', () => {
		it('updates the variable value', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1)],
				simpleEvaluator
			);

			engine.setValue('a', 42);
			expect(engine.getValue('a')).toBe(42);
		});

		it('triggers recomputation of direct dependents', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 5), makeVar('b', 'a * 2')],
				simpleEvaluator
			);

			expect(engine.getValue('b')).toBe(10);
			engine.setValue('a', 10);
			expect(engine.getValue('b')).toBe(20);
		});

		it('triggers chain recomputation: A -> B -> C', () => {
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 1),
					makeVar('b', 'a * 2'),
					makeVar('c', 'b + 10'),
				],
				simpleEvaluator
			);

			expect(engine.getValue('c')).toBe(12); // 1*2 + 10
			engine.setValue('a', 5);
			expect(engine.getValue('b')).toBe(10); // 5*2
			expect(engine.getValue('c')).toBe(20); // 10 + 10
		});

		it('returns a map of all changed variables', () => {
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 1),
					makeVar('b', 'a * 2'),
					makeVar('c', 'b + 1'),
				],
				simpleEvaluator
			);

			const changes = engine.setValue('a', 5);
			expect(changes.get('a')).toBe(5);
			expect(changes.get('b')).toBe(10);
			expect(changes.get('c')).toBe(11);
			expect(changes.size).toBe(3);
		});

		it('handles diamond dependency correctly', () => {
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 2),
					makeVar('b', 'a * 3'),
					makeVar('c', 'a + 1'),
					makeVar('d', 'b + c'),
				],
				simpleEvaluator
			);

			expect(engine.getValue('d')).toBe(9); // (2*3) + (2+1) = 6+3
			engine.setValue('a', 4);
			expect(engine.getValue('b')).toBe(12); // 4*3
			expect(engine.getValue('c')).toBe(5); // 4+1
			expect(engine.getValue('d')).toBe(17); // 12+5
		});

		it('does not affect unrelated variables', () => {
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 1),
					makeVar('b', 'a * 2'),
					makeVar('c', undefined, 100),
				],
				simpleEvaluator
			);

			engine.setValue('a', 5);
			expect(engine.getValue('c')).toBe(100);
		});
	});

	describe('setResponse', () => {
		it('maps to setValue correctly', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('q1_answer', undefined, 0), makeVar('score', 'q1_answer * 10')],
				simpleEvaluator
			);

			const changes = engine.setResponse('q1', 'q1_answer', 7);
			expect(engine.getValue('q1_answer')).toBe(7);
			expect(engine.getValue('score')).toBe(70);
			expect(changes.get('q1_answer')).toBe(7);
			expect(changes.get('score')).toBe(70);
		});
	});

	describe('getAllValues', () => {
		it('returns a snapshot of all variable values', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1), makeVar('b', 'a + 1')],
				simpleEvaluator
			);

			const values = engine.getAllValues();
			expect(values.get('a')).toBe(1);
			expect(values.get('b')).toBe(2);
		});

		it('returns an independent copy (mutations do not affect engine)', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1)],
				simpleEvaluator
			);

			const values = engine.getAllValues();
			values.set('a', 999);
			expect(engine.getValue('a')).toBe(1);
		});
	});

	describe('onChange', () => {
		it('fires listener when variable changes', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1)],
				simpleEvaluator
			);

			const listener = vi.fn();
			engine.onChange('a', listener);

			engine.setValue('a', 42);
			expect(listener).toHaveBeenCalledWith(42, 1);
		});

		it('fires listener for computed variables when dependency changes', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1), makeVar('b', 'a * 2')],
				simpleEvaluator
			);

			const listener = vi.fn();
			engine.onChange('b', listener);

			engine.setValue('a', 5);
			expect(listener).toHaveBeenCalledWith(10, 2);
		});

		it('unsubscribe prevents further notifications', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1)],
				simpleEvaluator
			);

			const listener = vi.fn();
			const unsubscribe = engine.onChange('a', listener);

			engine.setValue('a', 2);
			expect(listener).toHaveBeenCalledTimes(1);

			unsubscribe();
			engine.setValue('a', 3);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('supports multiple listeners on the same variable', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1)],
				simpleEvaluator
			);

			const listener1 = vi.fn();
			const listener2 = vi.fn();
			engine.onChange('a', listener1);
			engine.onChange('a', listener2);

			engine.setValue('a', 10);
			expect(listener1).toHaveBeenCalledWith(10, 1);
			expect(listener2).toHaveBeenCalledWith(10, 1);
		});

		it('listener errors do not crash the engine', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1)],
				simpleEvaluator
			);

			const badListener = vi.fn(() => {
				throw new Error('listener error');
			});
			const goodListener = vi.fn();

			engine.onChange('a', badListener);
			engine.onChange('a', goodListener);

			expect(() => engine.setValue('a', 5)).not.toThrow();
			expect(goodListener).toHaveBeenCalledWith(5, 1);
		});
	});

	describe('batchUpdate', () => {
		it('updates multiple variables at once', () => {
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 1),
					makeVar('b', undefined, 2),
					makeVar('c', 'a + b'),
				],
				simpleEvaluator
			);

			expect(engine.getValue('c')).toBe(3);

			const changes = engine.batchUpdate(
				new Map([
					['a', 10],
					['b', 20],
				])
			);

			expect(engine.getValue('a')).toBe(10);
			expect(engine.getValue('b')).toBe(20);
			expect(engine.getValue('c')).toBe(30);
			expect(changes.get('c')).toBe(30);
		});

		it('recomputes each affected variable only once per batch', () => {
			const evaluator = vi.fn(simpleEvaluator);
			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 1),
					makeVar('b', undefined, 2),
					makeVar('c', 'a + b'),
				],
				evaluator
			);

			// Reset after initial computation
			evaluator.mockClear();

			engine.batchUpdate(
				new Map([
					['a', 10],
					['b', 20],
				])
			);

			// c should be evaluated exactly once (not once per input change)
			const cCalls = evaluator.mock.calls.filter((call) => call[0] === 'a + b');
			expect(cCalls).toHaveLength(1);
		});
	});

	describe('formula error handling', () => {
		it('gracefully handles formula evaluation errors', () => {
			const brokenEvaluator = (formula: string, _context: Record<string, unknown>): unknown => {
				if (formula.includes('broken')) throw new Error('eval error');
				return simpleEvaluator(formula, _context);
			};

			const engine = new ReactiveVariableEngine(
				[
					makeVar('a', undefined, 5),
					makeVar('b', 'a * 2'),
					makeVar('bad', 'broken()'),
				],
				brokenEvaluator
			);

			// Good formula still works
			expect(engine.getValue('b')).toBe(10);
			// Bad formula defaults to undefined (no default set)
			expect(engine.getValue('bad')).toBeUndefined();
		});

		it('keeps old value when recomputation fails', () => {
			let shouldFail = false;
			const conditionalEvaluator = (formula: string, context: Record<string, unknown>): unknown => {
				if (shouldFail) throw new Error('eval error');
				return simpleEvaluator(formula, context);
			};

			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 5), makeVar('b', 'a * 2')],
				conditionalEvaluator
			);

			expect(engine.getValue('b')).toBe(10);

			shouldFail = true;
			engine.setValue('a', 100);

			// b should keep its old value since recomputation failed
			expect(engine.getValue('b')).toBe(10);
		});
	});

	describe('getGraph', () => {
		it('exposes the dependency graph', () => {
			const engine = new ReactiveVariableEngine(
				[makeVar('a', undefined, 1), makeVar('b', 'a * 2')],
				simpleEvaluator
			);

			const graph = engine.getGraph();
			expect(graph.isComputed('b')).toBe(true);
			expect(graph.isComputed('a')).toBe(false);
			expect(graph.getDependents('a')).toContain('b');
		});
	});
});
