import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';

export interface DotProbeStimulusPair {
  /** The "threat" or "salient" stimulus text/label */
  salient: string;
  /** The "neutral" stimulus text/label */
  neutral: string;
}

export interface DotProbePresetConfig {
  trialCount: number;
  cueDuration?: number;
  isi?: number;
  stimulusPairs: DotProbeStimulusPair[];
  probePositions?: ('left' | 'right')[];
  congruentRatio?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
  probeSymbol?: string;
  seed?: string;
  rng?: () => number;
}

export type DotProbeCongruency = 'congruent' | 'incongruent';

export interface DotProbeTrialConfig extends ReactionTrialConfig {
  index: number;
  pair: DotProbeStimulusPair;
  salientPosition: 'left' | 'right';
  probePosition: 'left' | 'right';
  congruency: DotProbeCongruency;
  expectedResponse: string;
}

const LEFT_KEY = 'f';
const RIGHT_KEY = 'j';

export function createDotProbeTrials(config: DotProbePresetConfig): DotProbeTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  if (!config.stimulusPairs.length) {
    throw new Error('stimulusPairs cannot be empty');
  }

  const congruentRatio = Math.max(0, Math.min(1, config.congruentRatio ?? 0.5));
  const congruentCount = Math.round(config.trialCount * congruentRatio);
  const rng = config.rng || createSeededRng(config.seed || 'dot-probe-default');
  const probeSymbol = config.probeSymbol ?? '*';

  // Build congruency list
  const congruencies: DotProbeCongruency[] = [];
  for (let i = 0; i < config.trialCount; i++) {
    congruencies.push(i < congruentCount ? 'congruent' : 'incongruent');
  }
  shuffle(congruencies, rng);

  const validKeys = [LEFT_KEY, RIGHT_KEY];
  const trials: DotProbeTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    const congruency = congruencies[i]!;
    const pairIndex = Math.floor(rng() * config.stimulusPairs.length);
    const pair = config.stimulusPairs[pairIndex]!;

    // Salient stimulus randomly assigned to left or right
    const salientPosition: 'left' | 'right' = rng() < 0.5 ? 'left' : 'right';

    // Probe position depends on congruency
    let probePosition: 'left' | 'right';
    if (congruency === 'congruent') {
      probePosition = salientPosition;
    } else {
      probePosition = salientPosition === 'left' ? 'right' : 'left';
    }

    const correctKey = probePosition === 'left' ? LEFT_KEY : RIGHT_KEY;

    // The stimulus shown is the probe dot/symbol at the probe position
    // The cue phase (showing both stimuli) is handled via the cueDuration
    // For the trial config, we represent the probe as the stimulus
    const stimulus: ReactionStimulusConfig = {
      kind: 'text',
      text: probeSymbol,
      fontPx: 72,
      color: [1, 1, 1, 1],
      position: probePosition === 'left' ? { x: 0.3, y: 0.5 } : { x: 0.7, y: 0.5 },
    };

    trials.push({
      id: `dotprobe-${i + 1}`,
      index: i,
      pair,
      salientPosition,
      probePosition,
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
      preStimulusDelayMs: config.cueDuration ?? 500,
      stimulus,
      responseTimeoutMs: config.responseTimeoutMs ?? 2000,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: config.isi ?? 500,
    });
  }

  return trials;
}

/**
 * Compute attentional bias score from dot-probe task results.
 *
 * Attentional bias = mean RT(incongruent) - mean RT(congruent)
 *
 * Positive values indicate vigilance toward the salient stimulus.
 * Negative values indicate avoidance.
 */
export interface AttentionalBiasResult {
  bias: number;
  congruentMean: number;
  incongruentMean: number;
  congruentCount: number;
  incongruentCount: number;
}

export function computeAttentionalBias(
  trials: DotProbeTrialConfig[],
  reactionTimesMs: Map<string, number>
): AttentionalBiasResult {
  const congruentRTs: number[] = [];
  const incongruentRTs: number[] = [];

  for (const trial of trials) {
    const rt = reactionTimesMs.get(trial.id);
    if (rt === undefined || rt > 10000 || rt < 100) continue;

    if (trial.congruency === 'congruent') {
      congruentRTs.push(rt);
    } else {
      incongruentRTs.push(rt);
    }
  }

  const congruentMean = mean(congruentRTs);
  const incongruentMean = mean(incongruentRTs);

  return {
    bias: incongruentMean - congruentMean,
    congruentMean,
    incongruentMean,
    congruentCount: congruentRTs.length,
    incongruentCount: incongruentRTs.length,
  };
}

// --- Internal helpers ---

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
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
