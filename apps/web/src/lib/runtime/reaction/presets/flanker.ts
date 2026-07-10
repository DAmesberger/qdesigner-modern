import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import { sampleTiming } from './timingSpec';

export interface FlankerPresetConfig {
  trialCount: number;
  stimulusSet?: [string, string];
  congruentRatio?: number;
  includeNeutral?: boolean;
  neutralRatio?: number;
  flankerCount?: number;
  /** Phase durations (ADR 0025): a fixed ms value or a per-trial `uniform` spec. */
  stimulusDuration?: TimingSpec;
  isi?: TimingSpec;
  fixationMs?: TimingSpec;
  responseTimeoutMs?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type FlankerCongruency = 'congruent' | 'incongruent' | 'neutral';

export interface FlankerTrialConfig extends ReactionTrialConfig {
  index: number;
  displayString: string;
  target: string;
  flanker: string;
  congruency: FlankerCongruency;
  expectedResponse: string;
}

export function createFlankerTrials(config: FlankerPresetConfig): FlankerTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const stimulusSet = config.stimulusSet ?? ['>', '<'];
  if (stimulusSet.length !== 2) {
    throw new Error('stimulusSet must contain exactly 2 characters');
  }

  const flankerCount = config.flankerCount ?? 2;
  if (flankerCount < 1) {
    throw new Error('flankerCount must be >= 1');
  }

  const includeNeutral = config.includeNeutral ?? false;
  const neutralChar = '-';

  // Compute counts for each condition
  let congruentCount: number;
  let incongruentCount: number;
  let neutralCount: number;

  if (includeNeutral) {
    const neutralRatio = Math.max(0, Math.min(1, config.neutralRatio ?? 0.2));
    neutralCount = Math.round(config.trialCount * neutralRatio);
    const remaining = config.trialCount - neutralCount;
    const congruentRatio = Math.max(0, Math.min(1, config.congruentRatio ?? 0.5));
    congruentCount = Math.round(remaining * congruentRatio);
    incongruentCount = remaining - congruentCount;
  } else {
    neutralCount = 0;
    const congruentRatio = Math.max(0, Math.min(1, config.congruentRatio ?? 0.5));
    congruentCount = Math.round(config.trialCount * congruentRatio);
    incongruentCount = config.trialCount - congruentCount;
  }

  const rng = config.rng || createSeededRng(config.seed || 'flanker-default');

  // Build condition list and shuffle
  const conditions: FlankerCongruency[] = [];
  for (let i = 0; i < congruentCount; i++) conditions.push('congruent');
  for (let i = 0; i < incongruentCount; i++) conditions.push('incongruent');
  for (let i = 0; i < neutralCount; i++) conditions.push('neutral');
  shuffle(conditions, rng);

  // Map each stimulus character to a response key
  const keyMap: Record<string, string> = {};
  keyMap[stimulusSet[0]] = stimulusSet[0] === '>' ? 'ArrowRight' : stimulusSet[0].toLowerCase();
  keyMap[stimulusSet[1]] = stimulusSet[1] === '<' ? 'ArrowLeft' : stimulusSet[1].toLowerCase();
  const validKeys = Object.values(keyMap);

  const trials: FlankerTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const congruency = conditions[i]!;

    // Pick target randomly
    const targetIndex = Math.floor(rng() * 2);
    const target = stimulusSet[targetIndex]!;

    let flanker: string;
    if (congruency === 'congruent') {
      flanker = target;
    } else if (congruency === 'incongruent') {
      flanker = stimulusSet[1 - targetIndex]!;
    } else {
      flanker = neutralChar;
    }

    const flankerString = flanker.repeat(flankerCount);
    const displayString = flankerString + target + flankerString;
    const correctKey = keyMap[target]!;

    // Draw order (ADR 0025): fixation → stimulus → response timeout → ITI.
    const fixationMs = sampleTiming(config.fixationMs, rng) ?? 500;
    const stimulusDurationMs = sampleTiming(config.stimulusDuration, rng);
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 1500;
    const interTrialIntervalMs = sampleTiming(config.isi, rng) ?? 250;

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: displayString,
      fontPx: 72,
      color: [1, 1, 1, 1],
    };

    trials.push({
      id: `flanker-${i + 1}`,
      index: i,
      displayString,
      target,
      flanker,
      congruency,
      expectedResponse: correctKey,
      responseMode: 'keyboard',
      validKeys,
      requireCorrect: true,
      correctResponse: correctKey,
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

function shuffle<T>(array: T[], rng: () => number): void {
  for (let index = array.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(rng() * (index + 1));
    const temp = array[index];
    array[index] = array[randomIndex]!;
    array[randomIndex] = temp!;
  }
}

function createSeededRng(seed: string): () => number {
  const hash = xmur3(seed);
  return mulberry32(hash());
}

function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index++) {
    h = Math.imul(h ^ input.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
