import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';
import type { RGBAColor } from '$lib/shared';
import { createSeededRng, shuffle } from './random';

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
  stimulusDuration?: number;
  isi?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
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
        durationMs: config.fixationMs ?? 500,
      },
      stimulus,
      stimulusDurationMs: config.stimulusDuration,
      responseTimeoutMs: config.responseTimeoutMs ?? 1500,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: config.isi ?? 500,
    });
  }

  return trials;
}
