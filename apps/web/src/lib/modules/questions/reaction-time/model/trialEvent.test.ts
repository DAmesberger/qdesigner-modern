import { describe, expect, it } from 'vitest';
import {
	buildRuntimeTrialEvent,
	materializedPhasesFromTrial,
	type TrialEventSource,
} from './trialEvent';
import type { ReactionTrialConfig } from '$lib/runtime/reaction';

function source(overrides: Partial<TrialEventSource> = {}): TrialEventSource {
	return {
		trialNumber: 3,
		taskType: 'stroop',
		isPractice: false,
		optionId: 'congruent',
		responseSource: 'keyboard',
		reactionTime: 421.7,
		isCorrect: true,
		rawRtMs: 421.7,
		anticipatory: false,
		displayLatencyMs: 8,
		outputLatencyMs: null,
		stimulusTimingMethod: 'raf',
		responseTimingMethod: 'event.timeStamp',
		frameStats: { fps: 60, droppedFrames: 0, jitter: 1 },
		crossOriginIsolated: true,
		timerResolutionMs: 0.005,
		measuredRefreshRateHz: 60,
		phaseTimeline: [],
		visibilityInvalidated: false,
		invalid: false,
		invalidReason: null,
		...overrides,
	};
}

describe('buildRuntimeTrialEvent', () => {
	it('floors reactionTime ms into microseconds', () => {
		const event = buildRuntimeTrialEvent('q-1', source({ reactionTime: 421.7 }), []);
		expect(event.rtUs).toBe(421_700);
	});

	it('maps a null reactionTime to a null rtUs (no NaN)', () => {
		const event = buildRuntimeTrialEvent('q-1', source({ reactionTime: null }), []);
		expect(event.rtUs).toBeNull();
	});

	it('stamps the W-3 visibility invalidation', () => {
		const event = buildRuntimeTrialEvent('q-1', source({ visibilityInvalidated: true }), []);
		expect(event.invalidated).toBe('visibility');
	});

	it('falls back to the render-invalidation reason when not a clean trial', () => {
		const event = buildRuntimeTrialEvent(
			'q-1',
			source({ invalid: true, invalidReason: 'stimulus-render-failed' }),
			[]
		);
		expect(event.invalidated).toBe('stimulus-render-failed');
	});

	it('leaves a clean trial uninvalidated', () => {
		const event = buildRuntimeTrialEvent('q-1', source(), []);
		expect(event.invalidated).toBeNull();
	});

	// The live path used to drop `anticipatory` on the floor while the 00048
	// BACKFILL mapped it to `invalidated = 'anticipatory'`. The same false start was
	// therefore excluded from cohort aggregates when it arrived by backfill and
	// pooled into them when it arrived live. An anticipatory response is timed
	// against a stimulus that had not yet appeared — it is not a reaction time.
	it('invalidates an anticipatory (false-start) trial, agreeing with the 00048 backfill', () => {
		const event = buildRuntimeTrialEvent('q-1', source({ anticipatory: true }), []);
		expect(event.invalidated).toBe('anticipatory');
	});

	it('ranks visibility above a render failure above a false start', () => {
		const all = source({
			visibilityInvalidated: true,
			invalid: true,
			invalidReason: 'stimulus-render-failed',
			anticipatory: true,
		});
		expect(buildRuntimeTrialEvent('q-1', all, []).invalidated).toBe('visibility');

		const renderAndFalseStart = source({
			invalid: true,
			invalidReason: 'stimulus-render-failed',
			anticipatory: true,
		});
		expect(buildRuntimeTrialEvent('q-1', renderAndFalseStart, []).invalidated).toBe(
			'stimulus-render-failed'
		);
	});

	// Practice RTs are systematically slower — that is what a warm-up is for. The
	// flag was computed by the compiler, carried on the runtime's TrialResponse, and
	// then silently dropped here, so warm-up trials entered the cohort quartiles
	// participants are shown (ADR 0028).
	it('carries the practice flag through to the persisted trial event', () => {
		expect(buildRuntimeTrialEvent('q-1', source({ isPractice: true }), []).isPractice).toBe(true);
		expect(buildRuntimeTrialEvent('q-1', source({ isPractice: false }), []).isPractice).toBe(false);
	});

	// `invalidated: 'visibility'` is a verdict; these are the evidence for it.
	// Recording them costs nothing (jsonb) and lets a reviewer see how bad the
	// interruption was and which phase it landed in (ADR 0027, record-by-default).
	it('records the visibility-loss evidence in provenance, not just the verdict', () => {
		const event = buildRuntimeTrialEvent(
			'q-1',
			source({
				visibilityInvalidated: true,
				visibilityLossCount: 2,
				visibilityLossPhases: [{ phase: 'stimulus', phaseElapsedMs: 120 }],
			}),
			[]
		);
		expect(event.provenance).toMatchObject({
			visibilityLossCount: 2,
			visibilityLossPhases: [{ phase: 'stimulus', phaseElapsedMs: 120 }],
		});
	});

	it('records a clean trial as having lost visibility zero times', () => {
		expect(buildRuntimeTrialEvent('q-1', source(), []).provenance).toMatchObject({
			visibilityLossCount: 0,
			visibilityLossPhases: [],
		});
	});

	it('captures the materialized phase plan as sampledTimings', () => {
		const event = buildRuntimeTrialEvent('q-1', source(), [
			{ name: 'stimulus', durationMs: 500 },
			{ name: 'blank', durationMs: 250, durationFrames: 15 },
		]);
		expect(event.sampledTimings).toEqual({
			phases: [
				{ name: 'stimulus', durationMs: 500, durationFrames: null },
				{ name: 'blank', durationMs: 250, durationFrames: 15 },
			],
		});
	});

	it('carries the question id, trial index, paradigm, and answer through', () => {
		const event = buildRuntimeTrialEvent('q-42', source({ trialNumber: 7 }), []);
		expect(event).toMatchObject({
			questionId: 'q-42',
			trialIndex: 7,
			paradigm: 'stroop',
			optionId: 'congruent',
			source: 'keyboard',
			correct: true,
		});
	});
});

describe('materializedPhasesFromTrial (ADR 0025 — sampled durations reach sampledTimings)', () => {
	function trial(overrides: Partial<ReactionTrialConfig> = {}): ReactionTrialConfig {
		return {
			id: 't1',
			stimulus: { kind: 'shape', shape: 'circle', radiusPx: 80 },
			...overrides,
		} as ReactionTrialConfig;
	}

	it('surfaces a sampled foreperiod (e.g. the PVT ISI) as a phase', () => {
		const phases = materializedPhasesFromTrial(trial({ preStimulusDelayMs: 6234, responseTimeoutMs: 5000 }));
		expect(phases).toContainEqual({ name: 'foreperiod', durationMs: 6234, durationFrames: undefined });
		expect(phases).toContainEqual({ name: 'response-window', durationMs: 5000 });
	});

	it('emits the fixation / stimulus / inter-trial phases when present and positive', () => {
		const phases = materializedPhasesFromTrial(
			trial({
				fixation: { enabled: true, durationMs: 500 },
				stimulusDurationMs: 250,
				interTrialIntervalMs: 700,
			})
		);
		const names = phases.map((p) => p.name);
		expect(names).toEqual(['fixation', 'stimulus', 'inter-trial']);
	});

	it('omits zero / disabled phases', () => {
		const phases = materializedPhasesFromTrial(
			trial({ fixation: { enabled: false, durationMs: 0 }, preStimulusDelayMs: 0, stimulusDurationMs: 0 })
		);
		expect(phases).toEqual([]);
	});

	it('flows into sampledTimings when passed through buildRuntimeTrialEvent', () => {
		const event = buildRuntimeTrialEvent('q-1', source(), [
			...materializedPhasesFromTrial(trial({ preStimulusDelayMs: 2000 })),
		]);
		expect(event.sampledTimings).toEqual({
			phases: [{ name: 'foreperiod', durationMs: 2000, durationFrames: null }],
		});
	});
});
