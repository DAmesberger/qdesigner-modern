import type { ReactionStimulusConfig, ReactionTrialConfig } from '../types';

export interface NBackPresetConfig {
  n: number;
  sequenceLength: number;
  stimulusSet: ReactionStimulusConfig[];
  targetRate?: number;
  validKeys?: string[];
  targetKey?: string;
  nonTargetKey?: string;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
}

export interface NBackTrialConfig extends ReactionTrialConfig {
  index: number;
  isTarget: boolean;
  expectedResponse: string;
}

export function createNBackTrials(config: NBackPresetConfig): NBackTrialConfig[] {
  if (config.n < 1) {
    throw new Error('n-back requires n >= 1');
  }

  if (config.sequenceLength <= config.n) {
    throw new Error('sequenceLength must be larger than n');
  }

  if (!config.stimulusSet.length) {
    throw new Error('stimulusSet cannot be empty');
  }

  const targetRate = Math.max(0, Math.min(1, config.targetRate ?? 0.3));
  const trialCount = config.sequenceLength;
  const targetCount = Math.round((trialCount - config.n) * targetRate);
  const targetPositions = chooseTargetPositions(config.n, trialCount, targetCount);

  const sequence: ReactionStimulusConfig[] = [];

  for (let i = 0; i < trialCount; i++) {
    if (i < config.n) {
      sequence.push(sampleStimulus(config.stimulusSet));
      continue;
    }

    if (targetPositions.has(i)) {
      sequence.push(structuredClone(sequence[i - config.n]!));
      continue;
    }

    const previousTarget = sequence[i - config.n]!;
    sequence.push(sampleStimulus(config.stimulusSet, previousTarget));
  }

  const validKeys = config.validKeys || ['f', 'j'];
  const targetKey = config.targetKey || validKeys[0] || 'f';
  const nonTargetKey = config.nonTargetKey || validKeys[1] || validKeys[0] || 'j';

  return sequence.map((stimulus, index) => {
    const isTarget = targetPositions.has(index);

    return {
      id: `nback-${index + 1}`,
      index,
      isTarget,
      expectedResponse: isTarget ? targetKey : nonTargetKey,
      responseMode: 'keyboard',
      validKeys,
      requireCorrect: true,
      correctResponse: isTarget ? targetKey : nonTargetKey,
      fixation: {
        enabled: true,
        type: 'cross',
        durationMs: config.fixationMs || 400,
      },
      stimulus,
      responseTimeoutMs: config.responseTimeoutMs || 1200,
      targetFPS: config.targetFPS || 120,
      interTrialIntervalMs: 250,
    };
  });
}

function chooseTargetPositions(
  n: number,
  sequenceLength: number,
  targetCount: number
): Set<number> {
  const candidatePositions: number[] = [];
  for (let index = n; index < sequenceLength; index++) {
    candidatePositions.push(index);
  }

  shuffle(candidatePositions);
  return new Set(candidatePositions.slice(0, targetCount));
}

function sampleStimulus(
  stimulusSet: ReactionStimulusConfig[],
  notEqualTo?: ReactionStimulusConfig
): ReactionStimulusConfig {
  if (stimulusSet.length === 1) {
    return structuredClone(stimulusSet[0]!);
  }

  let selected = stimulusSet[Math.floor(Math.random() * stimulusSet.length)]!;
  if (notEqualTo) {
    let guard = 0;
    while (guard < 10 && stimuliEqual(selected, notEqualTo)) {
      selected = stimulusSet[Math.floor(Math.random() * stimulusSet.length)]!;
      guard++;
    }
  }

  return structuredClone(selected);
}

function stimuliEqual(a: ReactionStimulusConfig, b: ReactionStimulusConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function shuffle<T>(array: T[]): void {
  for (let index = array.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = array[index];
    array[index] = array[randomIndex]!;
    array[randomIndex] = temp!;
  }
}
