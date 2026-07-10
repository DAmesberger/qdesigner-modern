import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import { createSeededRng, shuffle } from './random';
import { sampleTiming } from './timingSpec';

/**
 * Posner spatial-cueing task (E-REACT-2). A peripheral cue precedes a lateralized
 * target; on valid trials the cue predicts the target side, on invalid trials it
 * mis-predicts. The Posner cueing effect is the invalid−valid RT cost.
 *
 * Engine note (E-REACT-2): the reaction engine draws one stimulus per trial and
 * runs scheduled phases only AFTER the response window, so a distinct pre-target
 * cue phase cannot both render and re-mark onset. The target IS the trial
 * stimulus and the cue→target SOA is encoded as `preStimulusDelayMs`, so the
 * measured onset is the true target onset (the same abstraction dot-probe uses).
 */
export interface PosnerPresetConfig {
  trialCount: number;
  /** Proportion of validly-cued trials. SOTA default 0.8. */
  validRatio?: number;
  /** Cue exposure in ms (documented; folded into the SOA). SOTA default 100. */
  cueDurationMs?: TimingSpec;
  /** Cue-onset → target-onset asynchrony (ADR 0025). SOTA default 200 ms. */
  soaMs?: TimingSpec;
  leftKey?: string;
  rightKey?: string;
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
  isi?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type PosnerValidity = 'valid' | 'invalid';

export interface PosnerTrialConfig extends ReactionTrialConfig {
  index: number;
  validity: PosnerValidity;
  cueSide: 'left' | 'right';
  targetSide: 'left' | 'right';
  expectedResponse: string;
}

const LEFT_POSITION = { x: 0.2, y: 0.5 };
const RIGHT_POSITION = { x: 0.8, y: 0.5 };

export function createPosnerTrials(config: PosnerPresetConfig): PosnerTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const validRatio = Math.max(0, Math.min(1, config.validRatio ?? 0.8));
  const validCount = Math.round(config.trialCount * validRatio);
  const rng = config.rng || createSeededRng(config.seed || 'posner-default');
  const leftKey = (config.leftKey ?? 'f').toLowerCase();
  const rightKey = (config.rightKey ?? 'j').toLowerCase();

  const validities: PosnerValidity[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    validities.push(i < validCount ? 'valid' : 'invalid');
  }
  shuffle(validities, rng);

  const trials: PosnerTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const validity = validities[i]!;
    const cueSide: 'left' | 'right' = rng() < 0.5 ? 'left' : 'right';
    const targetSide: 'left' | 'right' =
      validity === 'valid' ? cueSide : cueSide === 'left' ? 'right' : 'left';
    const expectedResponse = targetSide === 'left' ? leftKey : rightKey;

    // Draw order (ADR 0025): fixation → cue→target SOA → response timeout → ITI.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 500;
    const soaMs = Math.max(0, sampleTiming(config.soaMs, rng) ?? 200);
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 1500;
    const interTrialIntervalMs = sampleTiming(config.isi, rng) ?? 500;

    const stimulus: ReactionStimulusConfig = {
      kind: 'shape',
      shape: 'square',
      widthPx: 90,
      heightPx: 90,
      color: [1, 1, 1, 1],
      position: targetSide === 'left' ? LEFT_POSITION : RIGHT_POSITION,
    };

    trials.push({
      id: `posner-${i + 1}`,
      index: i,
      validity,
      cueSide,
      targetSide,
      expectedResponse,
      responseMode: 'keyboard',
      validKeys: [leftKey, rightKey],
      requireCorrect: true,
      correctResponse: expectedResponse,
      fixation: {
        enabled: true,
        type: 'cross',
        durationMs: fixationMs,
      },
      // Cue → target SOA: the target onset (after this delay) is the RT reference.
      preStimulusDelayMs: soaMs,
      stimulus,
      responseTimeoutMs,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs,
    });
  }

  return trials;
}
