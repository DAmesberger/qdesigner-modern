import type { Variable } from '$lib/shared/types/questionnaire';
import { VariableDependencyGraph } from './VariableDependencyGraph';

type ChangeListener = (newValue: unknown, oldValue: unknown) => void;

/**
 * Reactive variable engine that automatically recomputes dependent variables
 * when upstream values change. Built on a topologically-sorted dependency graph.
 */
export class ReactiveVariableEngine {
	private graph: VariableDependencyGraph;
	private values: Map<string, unknown>;
	private listeners: Map<string, Set<ChangeListener>>;
	private variables: Map<string, Variable>;
	private evaluateFormula: (formula: string, context: Record<string, unknown>) => unknown;

	constructor(
		variables: Variable[],
		evaluateFormula: (formula: string, context: Record<string, unknown>) => unknown
	) {
		this.graph = new VariableDependencyGraph(variables);
		this.values = new Map();
		this.listeners = new Map();
		this.variables = new Map(variables.map((v) => [v.name, v]));
		this.evaluateFormula = evaluateFormula;

		// Check for cycles before proceeding
		const cycles = this.graph.detectCycles();
		if (cycles) {
			throw new Error(
				`Circular dependency detected: ${cycles.map((c) => c.join(' -> ')).join('; ')}`
			);
		}

		// Initialize default values
		for (const v of variables) {
			if (v.defaultValue !== undefined) {
				this.values.set(v.name, v.defaultValue);
			}
		}

		// Compute initial values in topological order
		this.recomputeAll();
	}

	/**
	 * Set a variable's value and recompute all dependents.
	 * Returns a map of all variables that changed (including the set variable itself).
	 */
	setValue(variableId: string, value: unknown): Map<string, unknown> {
		const oldValue = this.values.get(variableId);
		this.values.set(variableId, value);
		this.notifyListeners(variableId, value, oldValue);

		// Recompute dependents
		const affected = this.graph.getAffectedVariables(variableId);
		const changes = new Map<string, unknown>();
		changes.set(variableId, value);

		for (const depId of affected) {
			const variable = this.variables.get(depId);
			if (variable?.formula) {
				const context = Object.fromEntries(this.values);
				const oldVal = this.values.get(depId);
				try {
					const newVal = this.evaluateFormula(variable.formula, context);
					this.values.set(depId, newVal);
					changes.set(depId, newVal);
					this.notifyListeners(depId, newVal, oldVal);
				} catch {
					// Formula evaluation error - keep old value
				}
			}
		}

		return changes;
	}

	/**
	 * Convenience method for recording a question response.
	 * Maps saveAs key to setValue.
	 */
	setResponse(_questionId: string, saveAs: string, value: unknown): Map<string, unknown> {
		return this.setValue(saveAs, value);
	}

	getValue(variableId: string): unknown {
		return this.values.get(variableId);
	}

	getAllValues(): Map<string, unknown> {
		return new Map(this.values);
	}

	/**
	 * Register a change listener for a specific variable.
	 * Returns an unsubscribe function.
	 */
	onChange(variableId: string, callback: ChangeListener): () => void {
		if (!this.listeners.has(variableId)) {
			this.listeners.set(variableId, new Set());
		}
		this.listeners.get(variableId)!.add(callback);
		return () => this.listeners.get(variableId)?.delete(callback);
	}

	/**
	 * Apply multiple value updates at once, minimizing recomputations.
	 * Returns a map of all variables that changed.
	 */
	batchUpdate(updates: Map<string, unknown>): Map<string, unknown> {
		// Collect all affected variables
		const allAffected = new Set<string>();
		for (const [id, value] of updates) {
			const old = this.values.get(id);
			this.values.set(id, value);
			this.notifyListeners(id, value, old);
			for (const dep of this.graph.getAffectedVariables(id)) {
				allAffected.add(dep);
			}
		}

		// Recompute all affected in topological order
		const evalOrder = this.graph.getEvaluationOrder();
		const changes = new Map(updates);

		for (const varId of evalOrder) {
			if (allAffected.has(varId)) {
				const variable = this.variables.get(varId);
				if (variable?.formula) {
					const context = Object.fromEntries(this.values);
					const oldVal = this.values.get(varId);
					try {
						const newVal = this.evaluateFormula(variable.formula, context);
						this.values.set(varId, newVal);
						changes.set(varId, newVal);
						this.notifyListeners(varId, newVal, oldVal);
					} catch {
						// Keep old value on error
					}
				}
			}
		}

		return changes;
	}

	/**
	 * Get the underlying dependency graph (for introspection/debugging).
	 */
	getGraph(): VariableDependencyGraph {
		return this.graph;
	}

	private recomputeAll(): void {
		const order = this.graph.getEvaluationOrder();
		for (const varId of order) {
			const variable = this.variables.get(varId);
			if (variable?.formula) {
				const context = Object.fromEntries(this.values);
				try {
					this.values.set(varId, this.evaluateFormula(variable.formula, context));
				} catch {
					// Keep default value on error
				}
			}
		}
	}

	private notifyListeners(variableId: string, newValue: unknown, oldValue: unknown): void {
		const listeners = this.listeners.get(variableId);
		if (listeners) {
			for (const listener of listeners) {
				try {
					listener(newValue, oldValue);
				} catch {
					// Ignore listener errors
				}
			}
		}
	}
}
