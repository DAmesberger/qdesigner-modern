import { describe, expect, it } from 'vitest';
import { buildRuntimeTrialEvent, type TrialEventSource } from './trialEvent';

function source(overrides: Partial<TrialEventSource> = {}): TrialEventSource {
	return {
		trialNumber: 3,
		taskType: 'stroop',
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
