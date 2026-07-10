import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import { createSeededRng, shuffle } from './random';
import { sampleTiming } from './timingSpec';

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
  /** Per-item study exposure (ADR 0025). SOTA default 400 ms. */
  encodingMs?: TimingSpec;
  /** Retention interval before the probe (ADR 0025). SOTA default 1000 ms. */
  retentionMs?: TimingSpec;
  isi?: TimingSpec;
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
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

    // Draw order (ADR 0025): fixation → study → retention → response timeout → ITI.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 500;
    const encodingMs = Math.max(0, sampleTiming(config.encodingMs, rng) ?? 400);
    const retentionMs = Math.max(0, sampleTiming(config.retentionMs, rng) ?? 1000);
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 3000;
    const interTrialIntervalMs = sampleTiming(config.isi, rng) ?? 500;

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
        durationMs: fixationMs,
      },
      // Study (setSize · encodingMs) + retention interval before the probe onset.
      preStimulusDelayMs: setSize * encodingMs + retentionMs,
      stimulus,
      responseTimeoutMs,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs,
    });
  }

  return trials;
}
