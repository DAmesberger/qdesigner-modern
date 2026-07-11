import { describe, it, expect } from 'vitest';
import { buildReactionCohortBox, type ReactionCohort, type LocalTrial } from './reactionBox';

// Cohort RT quartiles are in MICROSECONDS (server aggregates trials.rt_us);
// the builder converts to ms for display. 300_000µs = 300ms.
const cohort = (over: Partial<ReactionCohort> = {}): ReactionCohort => ({
  n: 40,
  min: 250_000,
  p25: 300_000,
  median: 350_000,
  p75: 420_000,
  max: 600_000,
  minN: 5,
  belowFloor: 'hide',
  computedAt: '2026-07-10T12:00:00Z',
  ...over,
});

const trial = (rtUs: number | null, over: Partial<LocalTrial> = {}): LocalTrial => ({
  rtUs,
  correct: true,
  invalidated: null,
  ...over,
});

describe('buildReactionCohortBox', () => {
  it('renders a chart with cohort quartiles (ms) and the participant median marker', () => {
    const result = buildReactionCohortBox({
      cohort: cohort(),
      participantTrials: [trial(400_000), trial(300_000), trial(500_000)],
      stat: 'median',
    });
    expect(result.kind).toBe('chart');
    if (result.kind !== 'chart') return;
    // µs → ms conversion on both sides.
    expect(result.box).toEqual({ min: 250, q1: 300, median: 350, q3: 420, max: 600 });
    expect(result.participantValue).toBe(400); // median of 300/400/500 ms
    expect(result.n).toBe(40);
    expect(result.unit).toBe('ms');
  });

  it('always discloses the cohort n in the caption', () => {
    const result = buildReactionCohortBox({
      cohort: cohort({ n: 142 }),
      participantTrials: [trial(400_000)],
    });
    expect(result.kind).toBe('chart');
    if (result.kind !== 'chart') return;
    expect(result.caption).toContain('n=142');
    expect(result.caption).toContain('as of');
  });

  it('excludes invalidated trials from the participant stat by default', () => {
    const result = buildReactionCohortBox({
      cohort: cohort(),
      participantTrials: [
        trial(400_000),
        trial(10_000, { invalidated: 'anticipatory' }), // must be dropped
      ],
      stat: 'mean',
    });
    if (result.kind !== 'chart') throw new Error('expected chart');
    expect(result.participantValue).toBe(400); // only the valid 400ms trial
    expect(result.participantTrialCount).toBe(1);
  });

  it('includes invalidated trials when includeInvalidated is set', () => {
    const result = buildReactionCohortBox({
      cohort: cohort(),
      participantTrials: [trial(400_000), trial(200_000, { invalidated: 'visibility' })],
      stat: 'mean',
      includeInvalidated: true,
    });
    if (result.kind !== 'chart') throw new Error('expected chart');
    expect(result.participantValue).toBe(300); // mean of 400 and 200
    expect(result.participantTrialCount).toBe(2);
  });

  it('hides the widget below the disclosure floor when belowFloor=hide', () => {
    const result = buildReactionCohortBox({
      cohort: cohort({ n: 3, minN: 5, belowFloor: 'hide' }),
      participantTrials: [trial(400_000)],
    });
    expect(result.kind).toBe('hidden');
  });

  it('shows a "still forming" placeholder below the floor when belowFloor=placeholder', () => {
    const result = buildReactionCohortBox({
      cohort: cohort({ n: 3, minN: 5, belowFloor: 'placeholder' }),
      participantTrials: [trial(400_000)],
    });
    expect(result.kind).toBe('placeholder');
    if (result.kind !== 'placeholder') return;
    expect(result.n).toBe(3);
    expect(result.minN).toBe(5);
    expect(result.message).toContain('n=3 of 5');
  });

  it('hides when no cohort has synced yet (defaults to hide)', () => {
    const result = buildReactionCohortBox({ cohort: null, participantTrials: [trial(400_000)] });
    expect(result.kind).toBe('hidden');
  });

  it('renders the cohort box even when the participant has no valid trials', () => {
    const result = buildReactionCohortBox({
      cohort: cohort(),
      participantTrials: [trial(null, { rtUs: null })],
    });
    if (result.kind !== 'chart') throw new Error('expected chart');
    expect(result.participantValue).toBeNull();
    expect(result.box.median).toBe(350);
  });

  it('aggregates accuracy as a proportion in [0,1]', () => {
    const result = buildReactionCohortBox({
      cohort: cohort({ min: 0, p25: 0.5, median: 0.8, p75: 0.9, max: 1 }),
      participantTrials: [
        trial(400_000, { correct: true }),
        trial(400_000, { correct: false }),
        trial(400_000, { correct: true }),
      ],
      metric: 'accuracy',
    });
    if (result.kind !== 'chart') throw new Error('expected chart');
    // No µs→ms conversion for accuracy.
    expect(result.box.median).toBe(0.8);
    expect(result.participantValue).toBeCloseTo(2 / 3, 5);
    expect(result.unit).toBe('%');
  });
});
