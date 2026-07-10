import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import type { RGBAColor } from '$lib/shared';
import { createSeededRng, shuffle } from './random';
import { sampleTiming } from './timingSpec';

/**
 * Go/No-Go inhibition task (E-REACT-2). A prepotent "go" response is built up by
 * a high proportion of go trials; the participant must withhold on the rarer
 * no-go signal. Yields commission errors (responded on no-go) and omission
 * errors (missed a go), plus a stop-signal-style SSRT estimate in scoring.
 */
export interface GoNoGoPresetConfig {
  trialCount: number;
  /** Proportion of trials that are "go" (respond). SOTA default 0.75. */
  goRatio?: number;
  /** Text/label shown on a go trial (respond). */
  goStimulus?: string;
  /** Text/label shown on a no-go trial (withhold). */
  noGoStimulus?: string;
  /** Colour of the go stimulus (SOTA green). */
  goColor?: RGBAColor;
  /** Colour of the no-go stimulus (SOTA red). */
  noGoColor?: RGBAColor;
  /** Single response key pressed on go trials. */
  responseKey?: string;
  /** Phase durations (ADR 0025): a fixed ms value or a per-trial `uniform` spec. */
  stimulusDuration?: TimingSpec;
  isi?: TimingSpec;
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type GoNoGoCondition = 'go' | 'nogo';

export interface GoNoGoTrialConfig extends ReactionTrialConfig {
  index: number;
  condition: GoNoGoCondition;
  /** The key expected on a go trial; empty string on a no-go (withhold) trial. */
  expectedResponse: string;
  /** No-go trials are the salient/rare target of the inhibition. */
  isTarget: boolean;
}

const GO_COLOR: RGBAColor = [0.2, 0.8, 0.3, 1];
const NOGO_COLOR: RGBAColor = [0.9, 0.2, 0.2, 1];

export function createGoNoGoTrials(config: GoNoGoPresetConfig): GoNoGoTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const goRatio = Math.max(0, Math.min(1, config.goRatio ?? 0.75));
  const goCount = Math.round(config.trialCount * goRatio);
  const rng = config.rng || createSeededRng(config.seed || 'go-nogo-default');
  const responseKey = (config.responseKey ?? ' ').toLowerCase();

  const conditions: GoNoGoCondition[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    conditions.push(i < goCount ? 'go' : 'nogo');
  }
  shuffle(conditions, rng);

  const goLabel = config.goStimulus ?? 'GO';
  const noGoLabel = config.noGoStimulus ?? 'STOP';
  const goColor = config.goColor ?? GO_COLOR;
  const noGoColor = config.noGoColor ?? NOGO_COLOR;

  const trials: GoNoGoTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const condition = conditions[i]!;
    const isGo = condition === 'go';

    // Draw order (ADR 0025): fixation → stimulus → response timeout → ITI.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 500;
    const stimulusDurationMs = sampleTiming(config.stimulusDuration, rng);
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 1000;
    const interTrialIntervalMs = sampleTiming(config.isi, rng) ?? 500;

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: isGo ? goLabel : noGoLabel,
      fontPx: 84,
      color: isGo ? goColor : noGoColor,
    };

    trials.push({
      id: `gonogo-${i + 1}`,
      index: i,
      condition,
      isTarget: !isGo,
      expectedResponse: isGo ? responseKey : '',
      responseMode: 'keyboard',
      validKeys: [responseKey],
      // Only go trials are scored for correctness at the engine level; no-go
      // "correct withholding" is derived in scoring (a no-go with no response),
      // since the engine cannot express "correct iff no response".
      requireCorrect: isGo,
      correctResponse: isGo ? responseKey : undefined,
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
