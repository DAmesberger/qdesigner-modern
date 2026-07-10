import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import { createSeededRng, shuffle } from './random';
import { sampleTiming } from './timingSpec';

/**
 * SART — Sustained Attention to Response Task (E-REACT-2). The inverse of a
 * classic Go/No-Go: the participant responds to a frequent stream of digits and
 * must withhold on a single rare target digit (default "3"). Scored for
 * commission errors (responding to the target) and omission errors, using the
 * same go/nogo condition labels as Go/No-Go so SSRT scoring is shared.
 */
export interface SartPresetConfig {
  trialCount: number;
  /** The withhold ("no-go") digit. SOTA default 3. */
  targetDigit?: number;
  /** Digit pool presented (SOTA default 1–9). */
  digits?: number[];
  /** Single response key pressed on non-target digits. */
  responseKey?: string;
  /** Per-digit exposure (ADR 0025). SOTA default 250 ms. */
  stimulusDuration?: TimingSpec;
  /** Post-digit mask/blank interval. SOTA default 900 ms (→ 1150 ms SOA). */
  isi?: TimingSpec;
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type SartCondition = 'go' | 'nogo';

export interface SartTrialConfig extends ReactionTrialConfig {
  index: number;
  digit: number;
  condition: SartCondition;
  expectedResponse: string;
  isTarget: boolean;
}

export function createSartTrials(config: SartPresetConfig): SartTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const targetDigit = config.targetDigit ?? 3;
  const digits =
    config.digits && config.digits.length > 0 ? config.digits : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (!digits.includes(targetDigit)) {
    throw new Error('digits must include the targetDigit');
  }
  const nonTargets = digits.filter((d) => d !== targetDigit);
  if (nonTargets.length === 0) {
    throw new Error('SART requires at least one non-target digit');
  }

  const rng = config.rng || createSeededRng(config.seed || 'sart-default');
  const responseKey = (config.responseKey ?? ' ').toLowerCase();

  // Target appears at the natural 1-in-N rate (each digit equiprobable), so with
  // digits 1–9 the target rate is ~1/9 (≈11%), matching the SART literature.
  const isTargetFlags: boolean[] = [];
  const targetCount = Math.max(1, Math.round(config.trialCount / digits.length));
  for (let i = 0; i < config.trialCount; i++) {
    isTargetFlags.push(i < targetCount);
  }
  shuffle(isTargetFlags, rng);

  const trials: SartTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const isNoGo = isTargetFlags[i]!;
    const digit = isNoGo ? targetDigit : nonTargets[Math.floor(rng() * nonTargets.length)]!;
    const condition: SartCondition = isNoGo ? 'nogo' : 'go';

    // Draw order (ADR 0025): fixation → stimulus → response timeout → ITI.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 300;
    const stimulusDurationMs = sampleTiming(config.stimulusDuration, rng) ?? 250;
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 1150;
    const interTrialIntervalMs = sampleTiming(config.isi, rng) ?? 900;

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: String(digit),
      fontPx: 96,
      color: [1, 1, 1, 1],
    };

    trials.push({
      id: `sart-${i + 1}`,
      index: i,
      digit,
      condition,
      isTarget: isNoGo,
      expectedResponse: isNoGo ? '' : responseKey,
      responseMode: 'keyboard',
      validKeys: [responseKey],
      requireCorrect: !isNoGo,
      correctResponse: isNoGo ? undefined : responseKey,
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
