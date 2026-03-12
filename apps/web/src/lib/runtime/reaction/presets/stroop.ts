import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';
import type { RGBAColor } from '$lib/shared';

export interface StroopColor {
  name: string;
  rgba: RGBAColor;
}

export interface StroopPresetConfig {
  trialCount: number;
  colors?: StroopColor[];
  congruentRatio?: number;
  stimulusDuration?: number;
  isi?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type StroopCongruency = 'congruent' | 'incongruent';

export interface StroopTrialConfig extends ReactionTrialConfig {
  index: number;
  word: string;
  inkColor: string;
  congruency: StroopCongruency;
  expectedResponse: string;
}

const DEFAULT_COLORS: StroopColor[] = [
  { name: 'red', rgba: [1, 0, 0, 1] },
  { name: 'blue', rgba: [0, 0, 1, 1] },
  { name: 'green', rgba: [0, 0.5, 0, 1] },
  { name: 'yellow', rgba: [1, 1, 0, 1] },
];

export function createStroopTrials(config: StroopPresetConfig): StroopTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const colors = config.colors ?? DEFAULT_COLORS;

  if (colors.length < 2) {
    throw new Error('Stroop task requires at least 2 colors');
  }

  const congruentRatio = Math.max(0, Math.min(1, config.congruentRatio ?? 0.5));
  const congruentCount = Math.round(config.trialCount * congruentRatio);
  const rng = config.rng || createSeededRng(config.seed || 'stroop-default');

  // Build a list of congruency assignments
  const congruencies: StroopCongruency[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    congruencies.push(i < congruentCount ? 'congruent' : 'incongruent');
  }
  shuffle(congruencies, rng);

  // Build valid keys from color names (first letter of each color)
  const validKeys = colors.map((c) => c.name[0]!.toLowerCase());

  const trials: StroopTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const congruency = congruencies[i]!;
    const wordIndex = Math.floor(rng() * colors.length);
    const wordColor = colors[wordIndex]!;

    let inkColor: StroopColor;
    if (congruency === 'congruent') {
      inkColor = wordColor;
    } else {
      // Pick a different color for the ink
      let inkIndex = Math.floor(rng() * (colors.length - 1));
      if (inkIndex >= wordIndex) inkIndex++;
      inkColor = colors[inkIndex]!;
    }

    // Correct response is the ink color (not the word)
    const correctKey = inkColor.name[0]!.toLowerCase();

    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: wordColor.name.toUpperCase(),
      color: inkColor.rgba,
      fontPx: 72,
    };

    trials.push({
      id: `stroop-${i + 1}`,
      index: i,
      word: wordColor.name,
      inkColor: inkColor.name,
      congruency,
      expectedResponse: correctKey,
      responseMode: 'keyboard',
      validKeys,
      requireCorrect: true,
      correctResponse: correctKey,
      fixation: {
        enabled: true,
        type: 'cross',
        durationMs: config.fixationMs ?? 500,
      },
      stimulus,
      stimulusDurationMs: config.stimulusDuration,
      responseTimeoutMs: config.responseTimeoutMs ?? 2000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: config.isi ?? 250,
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
