import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';
import { createSeededRng } from './random';

/**
 * PVT — Psychomotor Vigilance Task (E-REACT-2). After a random inter-stimulus
 * interval (SOTA 2–10 s) a salient target appears and the participant responds
 * as fast as possible. The random foreperiod defeats anticipation; responses
 * during the wait are discarded as anticipatory false starts by the engine.
 * Scored for lapses (RT ≥ 500 ms or a miss) and mean 1/RT (response speed).
 */
export interface PvtPresetConfig {
  trialCount: number;
  /** Minimum random ISI before the target. SOTA default 2000 ms. */
  minIsiMs?: number;
  /** Maximum random ISI before the target. SOTA default 10000 ms. */
  maxIsiMs?: number;
  responseKey?: string;
  responseTimeoutMs?: number;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export interface PvtTrialConfig extends ReactionTrialConfig {
  index: number;
  /** The randomly-sampled foreperiod for this trial (ms). */
  isiMs: number;
  condition: 'pvt';
}

export function createPvtTrials(config: PvtPresetConfig): PvtTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const minIsi = Math.max(0, config.minIsiMs ?? 2000);
  const maxIsi = Math.max(minIsi, config.maxIsiMs ?? 10000);
  const rng = config.rng || createSeededRng(config.seed || 'pvt-default');
  const responseKey = (config.responseKey ?? ' ').toLowerCase();

  const trials: PvtTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const isiMs = Math.round(minIsi + rng() * (maxIsi - minIsi));

    const stimulus: ReactionStimulusConfig = {
      kind: 'shape',
      shape: 'circle',
      radiusPx: 80,
      color: [0.95, 0.85, 0.2, 1],
    };

    trials.push({
      id: `pvt-${i + 1}`,
      index: i,
      isiMs,
      condition: 'pvt',
      responseMode: 'keyboard',
      validKeys: [responseKey],
      // RT-only: any keypress after onset is a valid response.
      requireCorrect: false,
      // No fixation; the random foreperiod is the pre-stimulus wait.
      fixation: { enabled: false, type: 'dot', durationMs: 0 },
      preStimulusDelayMs: isiMs,
      stimulus,
      responseTimeoutMs: config.responseTimeoutMs ?? 5000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: 500,
    });
  }

  return trials;
}
