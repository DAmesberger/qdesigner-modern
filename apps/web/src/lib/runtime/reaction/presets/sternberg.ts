import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';
import { createSeededRng, shuffle } from './random';

/**
 * Sternberg memory-search task (E-REACT-2). A memory set of a given size is
 * studied, then a single probe asks whether it was in the set. RT rises linearly
 * with set size; the Sternberg slope (ms per item) indexes the serial memory
 * scan rate.
 *
 * Engine note: the engine draws one stimulus per trial, so the probe IS the
 * trial stimulus and the study + retention interval is folded into
 * `preStimulusDelayMs` (setSize · encodingMs + retentionMs). Set size is carried
 * in the condition label so scoring can fit the slope.
 */
export interface SternbergPresetConfig {
  trialCount: number;
  /** Memory set sizes sampled across trials. SOTA default [2, 4, 6]. */
  setSizes?: number[];
  /** Proportion of "in-set" (present) probes. SOTA default 0.5. */
  targetPresentRatio?: number;
  /** Item pool the memory set + probes are drawn from. */
  memoryItems?: string[];
  presentKey?: string;
  absentKey?: string;
  /** Per-item study exposure. SOTA default 400 ms. */
  encodingMs?: number;
  /** Retention interval before the probe. SOTA default 1000 ms. */
  retentionMs?: number;
  isi?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export interface SternbergTrialConfig extends ReactionTrialConfig {
  index: number;
  setSize: number;
  inSet: boolean;
  memorySet: string[];
  probe: string;
  /** `in-<n>` / `out-<n>` — parsed by scoring for the Sternberg slope. */
  condition: string;
  expectedResponse: string;
}

const DEFAULT_ITEMS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P'];

export function createSternbergTrials(config: SternbergPresetConfig): SternbergTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const setSizes =
    config.setSizes && config.setSizes.length > 0
      ? config.setSizes.filter((n) => n >= 1)
      : [2, 4, 6];
  if (setSizes.length === 0) {
    throw new Error('Sternberg task requires at least one set size');
  }

  const pool =
    config.memoryItems && config.memoryItems.length > 0 ? config.memoryItems : DEFAULT_ITEMS;
  const maxSetSize = Math.max(...setSizes);
  if (pool.length < maxSetSize + 1) {
    throw new Error('memoryItems must be larger than the maximum set size');
  }

  const presentRatio = Math.max(0, Math.min(1, config.targetPresentRatio ?? 0.5));
  const presentCount = Math.round(config.trialCount * presentRatio);
  const rng = config.rng || createSeededRng(config.seed || 'sternberg-default');
  const presentKey = (config.presentKey ?? 'j').toLowerCase();
  const absentKey = (config.absentKey ?? 'f').toLowerCase();
  const encodingMs = Math.max(0, config.encodingMs ?? 400);
  const retentionMs = Math.max(0, config.retentionMs ?? 1000);

  const inSetFlags: boolean[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    inSetFlags.push(i < presentCount);
  }
  shuffle(inSetFlags, rng);

  const trials: SternbergTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const inSet = inSetFlags[i]!;
    const setSize = setSizes[i % setSizes.length]!;

    const shuffledPool = [...pool];
    shuffle(shuffledPool, rng);
    const memorySet = shuffledPool.slice(0, setSize);
    const probe = inSet
      ? memorySet[Math.floor(rng() * memorySet.length)]!
      : shuffledPool[setSize]!; // first item not in the memory set

    const expectedResponse = inSet ? presentKey : absentKey;
    const condition = `${inSet ? 'in' : 'out'}-${setSize}`;

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: probe,
      fontPx: 96,
      color: [1, 1, 1, 1],
    };

    trials.push({
      id: `sternberg-${i + 1}`,
      index: i,
      setSize,
      inSet,
      memorySet,
      probe,
      condition,
      expectedResponse,
      responseMode: 'keyboard',
      validKeys: [presentKey, absentKey],
      requireCorrect: true,
      correctResponse: expectedResponse,
      fixation: {
        enabled: true,
        type: 'cross',
        durationMs: config.fixationMs ?? 500,
      },
      // Study (setSize · encodingMs) + retention interval before the probe onset.
      preStimulusDelayMs: setSize * encodingMs + retentionMs,
      stimulus,
      responseTimeoutMs: config.responseTimeoutMs ?? 3000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: config.isi ?? 500,
    });
  }

  return trials;
}
