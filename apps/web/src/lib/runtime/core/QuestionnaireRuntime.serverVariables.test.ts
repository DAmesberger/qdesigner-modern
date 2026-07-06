import { beforeAll, describe, expect, it } from 'vitest';
import { QuestionnaireRuntime, type ServerVariableSnapshot } from './QuestionnaireRuntime';
import { ensureModulesRegistered } from '$lib/modules/register-all';
import type { Questionnaire, Variable } from '$lib/shared';
import type { ServerVariableStats } from '@qdesigner/questionnaire-core';

/**
 * SV-offline-sync-inject / E-FEEDBACK-3: the runtime's initializeVariables()
 * injection pass materializes the last-synced server aggregates into the ONE
 * VariableEngine as 'server-sync' values, falling back to defaultValue when a
 * snapshot is absent or a scalar stat is withheld below the anonymity floor.
 */

const stats: ServerVariableStats = {
	mean: 50,
	stdDev: 10,
	min: 10,
	max: 90,
	p10: 20,
	p25: 30,
	median: 48,
	p75: 65,
	p90: 80,
	p95: 85,
	p99: 88,
};

function serverVar(id: string, name: string, extra: Partial<Variable>): Variable {
	return {
		id,
		name,
		type: 'number',
		scope: 'global',
		...extra,
	} as Variable;
}

function buildQuestionnaire(variables: Variable[]): Questionnaire {
	return {
		id: 'qn-sv',
		name: 'Server variable fixture',
		version: '1.0.0',
		versionMajor: 1,
		versionMinor: 0,
		versionPatch: 0,
		created: new Date(),
		modified: new Date(),
		variables,
		questions: [],
		pages: [{ id: 'p1', name: 'Page 1', questions: [] }],
		flow: [],
		settings: {},
	} as unknown as Questionnaire;
}

function makeRuntime(
	variables: Variable[],
	serverVariables?: Record<string, ServerVariableSnapshot>
) {
	return new QuestionnaireRuntime({
		canvas: document.createElement('canvas'),
		questionnaire: buildQuestionnaire(variables),
		serverVariables,
	});
}

describe('QuestionnaireRuntime server-variable injection', () => {
	beforeAll(async () => {
		if (typeof (globalThis as { AudioContext?: unknown }).AudioContext === 'undefined') {
			(globalThis as { AudioContext?: unknown }).AudioContext = class {
				decodeAudioData() {
					return Promise.resolve({});
				}
				close() {
					return Promise.resolve();
				}
			};
		}
		await ensureModulesRegistered();
	});

	it('injects a scalar stat and an object bundle; leaves defaultValue where absent/below-floor', () => {
		const variables = [
			serverVar('sv_mean', 'cohortMean', {
				defaultValue: 0,
				server: { source: 'variable', key: 'score.anxiety', stat: 'mean' },
			}),
			serverVar('sv_bundle', 'cohortAnxiety', {
				type: 'object',
				defaultValue: {},
				server: { source: 'variable', key: 'score.anxiety' },
			}),
			serverVar('sv_absent', 'cohortAbsent', {
				defaultValue: 99,
				server: { source: 'variable', key: 'x', stat: 'mean' },
			}),
			serverVar('sv_floor', 'cohortFloor', {
				defaultValue: 7,
				server: { source: 'variable', key: 'y', stat: 'mean' },
			}),
		];

		const serverVariables: Record<string, ServerVariableSnapshot> = {
			sv_mean: { n: 42, stats, computedAt: '2026-01-02T00:00:00Z', stale: false },
			sv_bundle: { n: 42, stats, computedAt: '2026-01-01T00:00:00Z', stale: false },
			// Below the anonymity floor: scalar materializes to undefined → skipped.
			sv_floor: { n: 3, stats: null, computedAt: '2026-03-01T00:00:00Z', stale: false },
			// sv_absent intentionally omitted → never synced.
		};

		const runtime = makeRuntime(variables, serverVariables);
		const engine = runtime.getVariableEngine();

		// Scalar mean injected.
		expect(engine.getVariable('sv_mean')).toBe(50);

		// Object bundle injected, carrying n + computedAt + numeric fields.
		const bundle = engine.getVariable('sv_bundle') as Record<string, unknown>;
		expect(bundle.mean).toBe(50);
		expect(bundle.n).toBe(42);
		expect(bundle.computedAt).toBe('2026-01-01T00:00:00Z');
		// Dot access resolves through getAllVariables (piping / feedback path).
		expect(runtime.getVariableEngine().getAllVariables().cohortAnxiety).toBeTruthy();

		// Absent snapshot → defaultValue.
		expect(engine.getVariable('sv_absent')).toBe(99);
		// Below-floor scalar → defaultValue (materializeServerValue returned undefined).
		expect(engine.getVariable('sv_floor')).toBe(7);

		// _serverDataAsOf carries the OLDEST injected computedAt (sv_bundle, not sv_mean).
		expect(engine.getAllVariables().serverDataAsOf).toBe('2026-01-01T00:00:00Z');

		runtime.dispose();
	});

	it('injects an object bundle even below the floor so widgets can caption honestly', () => {
		const variables = [
			serverVar('sv_obj', 'cohortObj', {
				type: 'object',
				defaultValue: {},
				server: { source: 'variable', key: 'score.x' },
			}),
		];
		const runtime = makeRuntime(variables, {
			sv_obj: { n: 2, stats: null, computedAt: '2026-02-02T00:00:00Z', stale: true },
		});
		const bundle = runtime.getVariableEngine().getVariable('sv_obj') as Record<string, unknown>;
		expect(bundle.n).toBe(2);
		expect(bundle.computedAt).toBe('2026-02-02T00:00:00Z');
		expect(bundle.mean).toBeUndefined();
		runtime.dispose();
	});

	it('falls back to defaultValue for every server variable when no snapshots are supplied', () => {
		const variables = [
			serverVar('sv_a', 'cohortA', {
				defaultValue: 5,
				server: { source: 'variable', key: 'a', stat: 'mean' },
			}),
		];
		const runtime = makeRuntime(variables /* no serverVariables */);
		expect(runtime.getVariableEngine().getVariable('sv_a')).toBe(5);
		// No _serverDataAsOf registered when nothing was injected.
		expect(runtime.getVariableEngine().getAllVariables().serverDataAsOf).toBeUndefined();
		runtime.dispose();
	});
});
