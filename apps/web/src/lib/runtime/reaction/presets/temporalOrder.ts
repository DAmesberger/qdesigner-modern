import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';
import { createSeededRng, shuffle } from './random';

/**
 * Temporal-order judgment task (E-REACT-2). Two lateralized flashes are
 * separated by a stimulus-onset asynchrony (SOA); the participant reports which
 * appeared first. The just-noticeable difference (JND) is recovered from the
 * psychometric function of "right-first" judgments across signed SOAs.
 *
 * Engine note: the engine draws one stimulus per trial, so a trial models the
 * leading flash as the rendered stimulus and the SOA as `preStimulusDelayMs`
 * (foreperiod to the leader). The signed SOA is carried in the condition label
 * (`soa:<ms>`, positive = right leads) for the scoring JND fit.
 */
export interface TemporalOrderPresetConfig {
  trialCount: number;
  /** Absolute SOAs (ms) sampled symmetrically for left/right leads. */
  soaSetMs?: number[];
  /** Key for a "left came first" judgment. */
  firstKey?: string;
  /** Key for a "right came first" judgment. */
  secondKey?: string;
  stimulusDuration?: number;
  isi?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export interface TemporalOrderTrialConfig extends ReactionTrialConfig {
  index: number;
  /** Signed SOA in ms; positive = right leads, negative = left leads. */
  soaMs: number;
  leadingSide: 'left' | 'right';
  /** `soa:<signedMs>` — parsed by scoring for the JND fit. */
  condition: string;
  expectedResponse: string;
}

const LEFT_POSITION = { x: 0.3, y: 0.5 };
const RIGHT_POSITION = { x: 0.7, y: 0.5 };

export function createTemporalOrderTrials(
  config: TemporalOrderPresetConfig
): TemporalOrderTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const soaSet =
    config.soaSetMs && config.soaSetMs.length > 0
      ? config.soaSetMs.map((s) => Math.max(1, Math.abs(Math.round(s))))
      : [17, 33, 67, 133, 267];
  if (soaSet.length === 0) {
    throw new Error('temporal-order task requires at least one SOA');
  }

  const rng = config.rng || createSeededRng(config.seed || 'temporal-order-default');
  const firstKey = (config.firstKey ?? 'f').toLowerCase();
  const secondKey = (config.secondKey ?? 'j').toLowerCase();

  // Build a balanced list: each |SOA| crossed with left-leads and right-leads.
  const signedSoas: number[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    const magnitude = soaSet[i % soaSet.length]!;
    const rightLeads = Math.floor(i / soaSet.length) % 2 === 0;
    signedSoas.push(rightLeads ? magnitude : -magnitude);
  }
  shuffle(signedSoas, rng);

  const trials: TemporalOrderTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const soaMs = signedSoas[i]!;
    const leadingSide: 'left' | 'right' = soaMs > 0 ? 'right' : 'left';
    // Veridical judgment: which side physically came first.
    const expectedResponse = leadingSide === 'left' ? firstKey : secondKey;
    const condition = `soa:${soaMs}`;

    const stimulus: ReactionStimulusConfig = {
      kind: 'shape',
      shape: 'circle',
      radiusPx: 40,
      color: [1, 1, 1, 1],
      position: leadingSide === 'left' ? LEFT_POSITION : RIGHT_POSITION,
    };

    trials.push({
      id: `toj-${i + 1}`,
      index: i,
      soaMs,
      leadingSide,
      condition,
      expectedResponse,
      responseMode: 'keyboard',
      validKeys: [firstKey, secondKey],
      requireCorrect: true,
      correctResponse: expectedResponse,
      fixation: {
        enabled: true,
        type: 'cross',
        durationMs: config.fixationMs ?? 500,
      },
      // Foreperiod to the leading flash; the lagging flash follows |SOA| later.
      preStimulusDelayMs: Math.abs(soaMs),
      stimulus,
      stimulusDurationMs: config.stimulusDuration,
      responseTimeoutMs: config.responseTimeoutMs ?? 3000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: config.isi ?? 500,
    });
  }

  return trials;
}
