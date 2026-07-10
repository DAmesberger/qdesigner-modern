import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import type { RGBAColor } from '$lib/shared';
import { createSeededRng, shuffle } from './random';
import { sampleTiming } from './timingSpec';

/**
 * Simon spatial-conflict task (E-REACT-2). A colour cues a left/right key while
 * the stimulus itself appears on the left or right. On congruent trials the
 * stimulus side matches the response side; on incongruent trials it conflicts.
 * The Simon effect is the incongruent−congruent RT cost.
 */
export interface SimonColor {
  name: string;
  rgba: RGBAColor;
  /** Side this colour maps to (which response key). */
  side: 'left' | 'right';
}

export interface SimonPresetConfig {
  trialCount: number;
  congruentRatio?: number;
  /** Exactly two colours, one mapped to each response side. */
  colors?: [SimonColor, SimonColor];
  leftKey?: string;
  rightKey?: string;
  /** Phase durations (ADR 0025): a fixed ms value or a per-trial `uniform` spec. */
  stimulusDuration?: TimingSpec;
  isi?: TimingSpec;
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type SimonCongruency = 'congruent' | 'incongruent';

export interface SimonTrialConfig extends ReactionTrialConfig {
  index: number;
  congruency: SimonCongruency;
  stimulusSide: 'left' | 'right';
  responseSide: 'left' | 'right';
  expectedResponse: string;
}

const DEFAULT_COLORS: [SimonColor, SimonColor] = [
  { name: 'blue', rgba: [0.2, 0.4, 0.95, 1], side: 'left' },
  { name: 'red', rgba: [0.9, 0.2, 0.2, 1], side: 'right' },
];

const LEFT_POSITION = { x: 0.25, y: 0.5 };
const RIGHT_POSITION = { x: 0.75, y: 0.5 };

export function createSimonTrials(config: SimonPresetConfig): SimonTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const colors = config.colors ?? DEFAULT_COLORS;
  if (colors.length !== 2) {
    throw new Error('Simon task requires exactly 2 colours');
  }

  const congruentRatio = Math.max(0, Math.min(1, config.congruentRatio ?? 0.5));
  const congruentCount = Math.round(config.trialCount * congruentRatio);
  const rng = config.rng || createSeededRng(config.seed || 'simon-default');
  const leftKey = (config.leftKey ?? 'f').toLowerCase();
  const rightKey = (config.rightKey ?? 'j').toLowerCase();

  const congruencies: SimonCongruency[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    congruencies.push(i < congruentCount ? 'congruent' : 'incongruent');
  }
  shuffle(congruencies, rng);

  const trials: SimonTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const congruency = congruencies[i]!;
    const color = colors[Math.floor(rng() * colors.length)]!;
    const responseSide = color.side;
    const stimulusSide: 'left' | 'right' =
      congruency === 'congruent' ? responseSide : responseSide === 'left' ? 'right' : 'left';
    const expectedResponse = responseSide === 'left' ? leftKey : rightKey;

    // Draw order (ADR 0025): fixation → stimulus → response timeout → ITI.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 500;
    const stimulusDurationMs = sampleTiming(config.stimulusDuration, rng);
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 1500;
    const interTrialIntervalMs = sampleTiming(config.isi, rng) ?? 500;

    const stimulus: ReactionStimulusConfig = {
      kind: 'shape',
      shape: 'circle',
      radiusPx: 60,
      color: color.rgba,
      position: stimulusSide === 'left' ? LEFT_POSITION : RIGHT_POSITION,
    };

    trials.push({
      id: `simon-${i + 1}`,
      index: i,
      congruency,
      stimulusSide,
      responseSide,
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
      stimulus,
      stimulusDurationMs,
      responseTimeoutMs,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs,
    });
  }

  return trials;
}
