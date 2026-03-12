import type { Variable } from '$lib/shared/types/questionnaire';

/**
 * Dependency graph for questionnaire variables.
 * Tracks which variables depend on which, supports topological sorting,
 * cycle detection, and efficient lookup of affected variables.
 */
export class VariableDependencyGraph {
	private adjacency: Map<string, Set<string>>; // variable -> variables it depends on
	private reverse: Map<string, Set<string>>; // variable -> variables that depend on it
	private formulas: Map<string, string>; // variable name -> formula string
	private allNames: Set<string>; // all known variable names

	constructor(variables: Variable[]) {
		this.adjacency = new Map();
		this.reverse = new Map();
		this.formulas = new Map();
		this.allNames = new Set();

		for (const v of variables) {
			this.allNames.add(v.name);
		}

		for (const v of variables) {
			if (v.formula) {
				this.formulas.set(v.name, v.formula);
				const deps = this.extractDependencies(v.formula);
				this.adjacency.set(v.name, new Set(deps));
			} else {
				this.adjacency.set(v.name, new Set());
			}
		}

		// Build reverse graph
		for (const name of this.allNames) {
			if (!this.reverse.has(name)) {
				this.reverse.set(name, new Set());
			}
		}

		for (const [name, deps] of this.adjacency) {
			for (const dep of deps) {
				if (!this.reverse.has(dep)) {
					this.reverse.set(dep, new Set());
				}
				this.reverse.get(dep)!.add(name);
			}
		}
	}

	extractDependencies(formula: string): string[] {
		const deps = new Set<string>();
		// Match word-boundary identifiers
		const identifierPattern = /\b([a-zA-Z_]\w*)\b/g;
		// Known function names to exclude
		const builtinFunctions = new Set([
			'IF', 'AND', 'OR', 'NOT', 'SUM', 'AVG', 'COUNT', 'MIN', 'MAX',
			'ABS', 'ROUND', 'SQRT', 'POW', 'CEIL', 'FLOOR', 'MOD',
			'CONCAT', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'SUBSTRING',
			'NOW', 'TIME_SINCE', 'RANDOM', 'RANDINT', 'RANGE', 'FOREACH',
			'STDEV', 'VARIANCE', 'MEDIAN', 'PERCENTILE', 'ZSCORE',
			'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
			'sin', 'cos', 'tan', 'log', 'exp', 'sqrt', 'abs', 'round',
			'ceil', 'floor', 'min', 'max', 'pow', 'mod',
		]);

		for (const match of formula.matchAll(identifierPattern)) {
			const name = match[1]!;
			if (this.allNames.has(name) && !builtinFunctions.has(name)) {
				deps.add(name);
			}
		}

		return Array.from(deps);
	}

	/**
	 * Topological sort for evaluation order using Kahn's algorithm.
	 * Returns only computed (formula) variables in dependency order.
	 */
	getEvaluationOrder(): string[] {
		const computed = new Set(this.formulas.keys());
		if (computed.size === 0) return [];

		// Build in-degree map considering only computed variables
		const inDegree = new Map<string, number>();
		const localAdj = new Map<string, Set<string>>();

		for (const name of computed) {
			inDegree.set(name, 0);
			localAdj.set(name, new Set());
		}

		for (const name of computed) {
			const deps = this.adjacency.get(name) || new Set();
			for (const dep of deps) {
				if (computed.has(dep)) {
					inDegree.set(name, (inDegree.get(name) || 0) + 1);
					if (!localAdj.has(dep)) {
						localAdj.set(dep, new Set());
					}
					localAdj.get(dep)!.add(name);
				}
			}
		}

		const queue: string[] = [];
		for (const [name, degree] of inDegree) {
			if (degree === 0) {
				queue.push(name);
			}
		}

		const order: string[] = [];
		while (queue.length > 0) {
			const current = queue.shift()!;
			order.push(current);

			const dependents = localAdj.get(current) || new Set();
			for (const dep of dependents) {
				const newDegree = (inDegree.get(dep) || 0) - 1;
				inDegree.set(dep, newDegree);
				if (newDegree === 0) {
					queue.push(dep);
				}
			}
		}

		return order;
	}

	/**
	 * Get all variables that transitively depend on the given variable.
	 */
	getDependents(variableId: string): string[] {
		const visited = new Set<string>();
		const result: string[] = [];
		const queue = [variableId];

		while (queue.length > 0) {
			const current = queue.shift()!;
			const dependents = this.reverse.get(current) || new Set();

			for (const dep of dependents) {
				if (!visited.has(dep)) {
					visited.add(dep);
					result.push(dep);
					queue.push(dep);
				}
			}
		}

		return result;
	}

	/**
	 * Get variables that need recomputation when variableId changes,
	 * returned in topological order.
	 */
	getAffectedVariables(changedVariableId: string): string[] {
		const affectedSet = new Set(this.getDependents(changedVariableId));
		if (affectedSet.size === 0) return [];

		// Filter evaluation order to only affected variables
		const evalOrder = this.getEvaluationOrder();
		return evalOrder.filter((name) => affectedSet.has(name));
	}

	/**
	 * Detect circular dependencies using DFS.
	 * Returns array of cycles, or null if no cycles exist.
	 */
	detectCycles(): string[][] | null {
		const WHITE = 0;
		const GRAY = 1;
		const BLACK = 2;

		const color = new Map<string, number>();
		const parent = new Map<string, string | null>();
		const cycles: string[][] = [];

		for (const name of this.allNames) {
			color.set(name, WHITE);
		}

		const dfs = (node: string): void => {
			color.set(node, GRAY);
			const deps = this.adjacency.get(node) || new Set();

			for (const dep of deps) {
				if (color.get(dep) === GRAY) {
					// Found a cycle - reconstruct it
					const cycle: string[] = [dep];
					let current = node;
					while (current !== dep) {
						cycle.push(current);
						current = parent.get(current) || dep;
					}
					cycle.push(dep);
					cycle.reverse();
					cycles.push(cycle);
				} else if (color.get(dep) === WHITE) {
					parent.set(dep, node);
					dfs(dep);
				}
			}

			color.set(node, BLACK);
		};

		for (const name of this.allNames) {
			if (color.get(name) === WHITE) {
				parent.set(name, null);
				dfs(name);
			}
		}

		return cycles.length > 0 ? cycles : null;
	}

	/**
	 * Check if a variable has a formula (is computed).
	 */
	isComputed(variableId: string): boolean {
		return this.formulas.has(variableId);
	}

	/**
	 * Get direct dependencies of a variable.
	 */
	getDirectDependencies(variableId: string): string[] {
		return Array.from(this.adjacency.get(variableId) || new Set());
	}
}
