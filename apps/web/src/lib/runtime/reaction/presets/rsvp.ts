import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import { createSeededRng } from './random';
import { sampleTiming } from './timingSpec';

/**
 * RSVP — Rapid Serial Visual Presentation (E-REACT-2). Items stream at a fixed
 * rapid rate and the participant detects an embedded target. Trustworthy RSVP
 * timing needs frame-accurate brief exposure, so each item duration is scheduled
 * on the presented-frame counter (`stimulusDurationMs` → the engine's calibrated
 * ms→frames offset) rather than a drifting timeout.
 *
 * Engine note: the engine draws one stimulus per trial, so a trial models the
 * target item as the rendered stimulus and the preceding distractor stream as
 * `preStimulusDelayMs` (streamLead · itemDurationMs). Detection RT is measured
 * from the target onset.
 */
export interface RsvpPresetConfig {
  trialCount: number;
  /** Items per stream (drives the pre-target lead). SOTA default 12. */
  streamLength?: number;
  /** Per-item exposure (ADR 0025). SOTA default 100 ms (10 Hz). */
  itemDurationMs?: TimingSpec;
  targetKey?: string;
  targetSet?: string[];
  distractorSet?: string[];
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export interface RsvpTrialConfig extends ReactionTrialConfig {
  index: number;
  target: string;
  /** 1-based serial position of the target within the stream. */
  targetPosition: number;
  condition: 'rsvp';
  expectedResponse: string;
}

const DEFAULT_TARGETS = ['X', 'Z'];
const DEFAULT_DISTRACTORS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function createRsvpTrials(config: RsvpPresetConfig): RsvpTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const streamLength = Math.max(1, Math.round(config.streamLength ?? 12));
  const rng = config.rng || createSeededRng(config.seed || 'rsvp-default');
  const targetKey = (config.targetKey ?? ' ').toLowerCase();
  const targetSet =
    config.targetSet && config.targetSet.length > 0 ? config.targetSet : DEFAULT_TARGETS;
  const distractorSet =
    config.distractorSet && config.distractorSet.length > 0
      ? config.distractorSet
      : DEFAULT_DISTRACTORS;

  const trials: RsvpTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    // Target lands somewhere in the back half of the stream (after a lead-in).
    const minPosition = Math.max(1, Math.floor(streamLength / 2));
    const targetPosition =
      minPosition + Math.floor(rng() * Math.max(1, streamLength - minPosition + 1));
    const target = targetSet[Math.floor(rng() * targetSet.length)]!;

    // Draw order (ADR 0025): fixation → item exposure → response timeout. The
    // sampled item duration drives BOTH the pre-target stream lead and the
    // (frame-scheduled) target exposure for this trial.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 500;
    const itemDurationMs = Math.max(1, Math.round(sampleTiming(config.itemDurationMs, rng) ?? 100));
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 2000;

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: target,
      fontPx: 96,
      color: [1, 1, 1, 1],
    };

    trials.push({
      id: `rsvp-${i + 1}`,
      index: i,
      target,
      targetPosition,
      condition: 'rsvp',
      expectedResponse: targetKey,
      responseMode: 'keyboard',
      validKeys: [targetKey],
      requireCorrect: true,
      correctResponse: targetKey,
      fixation: {
        enabled: true,
        type: 'cross',
        durationMs: fixationMs,
      },
      // Preceding distractor stream before the target frame.
      preStimulusDelayMs: (targetPosition - 1) * itemDurationMs,
      stimulus,
      // Brief, frame-scheduled target exposure — the RSVP timing use case.
      stimulusDurationMs: itemDurationMs,
      responseTimeoutMs,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: 700,
      // Distractor pool retained for provenance / designer preview.
      metadata: { distractorSet },
    });
  }

  return trials;
}
