import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';
import { createSeededRng, shuffle } from './random';

/**
 * Visual search task (E-REACT-2). A target ("T") is present among a variable
 * number of distractors ("L"); the participant reports present/absent. RT scales
 * with set size, and the search slope (ms per item) separates efficient
 * ("feature"/pop-out) from inefficient ("conjunction") search.
 *
 * Engine note: the reaction engine draws one stimulus per trial, so the array is
 * composed into a single text line whose length is the set size (an honest
 * single-renderable approximation of a spatial array). A spatial-click variant
 * can be layered via the shared response mode + targetRegion (E-REACT-1).
 */
export interface VisualSearchPresetConfig {
  trialCount: number;
  /** Set sizes sampled across trials. SOTA default [4, 8, 16]. */
  setSizes?: number[];
  /** Proportion of target-present trials. SOTA default 0.5. */
  targetPresentRatio?: number;
  /** Feature (pop-out, homogeneous distractors) vs conjunction search. */
  featureSearch?: boolean;
  targetChar?: string;
  distractorChars?: string[];
  presentKey?: string;
  absentKey?: string;
  stimulusDuration?: number;
  isi?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export interface VisualSearchTrialConfig extends ReactionTrialConfig {
  index: number;
  setSize: number;
  targetPresent: boolean;
  /** `present-<n>` / `absent-<n>` — parsed by scoring for the search slope. */
  condition: string;
  expectedResponse: string;
}

export function createVisualSearchTrials(
  config: VisualSearchPresetConfig
): VisualSearchTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const setSizes =
    config.setSizes && config.setSizes.length > 0
      ? config.setSizes.filter((n) => n >= 1)
      : [4, 8, 16];
  if (setSizes.length === 0) {
    throw new Error('visual search requires at least one set size');
  }

  const presentRatio = Math.max(0, Math.min(1, config.targetPresentRatio ?? 0.5));
  const presentCount = Math.round(config.trialCount * presentRatio);
  const rng = config.rng || createSeededRng(config.seed || 'visual-search-default');
  const featureSearch = config.featureSearch ?? false;
  const targetChar = config.targetChar ?? 'T';
  const distractorChars =
    config.distractorChars && config.distractorChars.length > 0
      ? config.distractorChars
      : featureSearch
        ? ['L']
        : ['L', 'F', 'E'];
  const presentKey = (config.presentKey ?? 'j').toLowerCase();
  const absentKey = (config.absentKey ?? 'f').toLowerCase();

  const presentFlags: boolean[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    presentFlags.push(i < presentCount);
  }
  shuffle(presentFlags, rng);

  const trials: VisualSearchTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const targetPresent = presentFlags[i]!;
    const setSize = setSizes[i % setSizes.length]!;

    const items: string[] = [];
    for (let k = 0; k < setSize; k++) {
      items.push(distractorChars[Math.floor(rng() * distractorChars.length)]!);
    }
    if (targetPresent && setSize > 0) {
      items[Math.floor(rng() * setSize)] = targetChar;
    }

    const expectedResponse = targetPresent ? presentKey : absentKey;
    const condition = `${targetPresent ? 'present' : 'absent'}-${setSize}`;

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: items.join(' '),
      fontPx: 48,
      color: [1, 1, 1, 1],
    };

    trials.push({
      id: `search-${i + 1}`,
      index: i,
      setSize,
      targetPresent,
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
      stimulus,
      stimulusDurationMs: config.stimulusDuration,
      responseTimeoutMs: config.responseTimeoutMs ?? 3000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: config.isi ?? 500,
    });
  }

  return trials;
}
