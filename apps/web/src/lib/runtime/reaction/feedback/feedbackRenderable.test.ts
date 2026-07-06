import { describe, expect, it } from 'vitest';
import {
  resolveFeedbackRenderable,
  resolveFeedbackVerdict,
} from './feedbackRenderable';
import type { ReactionTrialFeedbackConfig } from '../types';

const base: ReactionTrialFeedbackConfig = { show: true, mode: 'accuracy', durationMs: 800 };

describe('resolveFeedbackVerdict', () => {
  it('maps a timeout to too-slow regardless of correctness', () => {
    expect(resolveFeedbackVerdict(true, true)).toBe('too-slow');
    expect(resolveFeedbackVerdict(null, true)).toBe('too-slow');
  });

  it('maps a scored-incorrect response to incorrect', () => {
    expect(resolveFeedbackVerdict(false, false)).toBe('incorrect');
  });

  it('treats correct or unscored responses as correct', () => {
    expect(resolveFeedbackVerdict(true, false)).toBe('correct');
    expect(resolveFeedbackVerdict(null, false)).toBe('correct');
  });
});

describe('resolveFeedbackRenderable', () => {
  it('accuracy mode shows the verdict text', () => {
    expect(resolveFeedbackRenderable(base, 'correct', 342)?.text).toBe('Correct');
    expect(resolveFeedbackRenderable(base, 'incorrect', null)?.text).toBe('Incorrect');
    expect(resolveFeedbackRenderable(base, 'too-slow', null)?.text).toBe('Too slow');
  });

  it('honours custom verdict text overrides', () => {
    const cfg: ReactionTrialFeedbackConfig = { ...base, correctText: 'Nice!' };
    expect(resolveFeedbackRenderable(cfg, 'correct', 100)?.text).toBe('Nice!');
  });

  it('rt mode shows the measured reaction time, rounded', () => {
    const cfg: ReactionTrialFeedbackConfig = { ...base, mode: 'rt' };
    expect(resolveFeedbackRenderable(cfg, 'correct', 342.7)?.text).toBe('343 ms');
  });

  it('rt mode falls back to too-slow text on a timeout with no measured time', () => {
    const cfg: ReactionTrialFeedbackConfig = { ...base, mode: 'rt' };
    expect(resolveFeedbackRenderable(cfg, 'too-slow', null)?.text).toBe('Too slow');
  });

  it('rt mode renders nothing when there is neither a time nor a too-slow verdict', () => {
    const cfg: ReactionTrialFeedbackConfig = { ...base, mode: 'rt' };
    expect(resolveFeedbackRenderable(cfg, 'correct', null)).toBeNull();
  });

  it('both mode combines the verdict and the reaction time', () => {
    const cfg: ReactionTrialFeedbackConfig = { ...base, mode: 'both' };
    expect(resolveFeedbackRenderable(cfg, 'correct', 250)?.text).toBe('Correct · 250 ms');
  });
});
