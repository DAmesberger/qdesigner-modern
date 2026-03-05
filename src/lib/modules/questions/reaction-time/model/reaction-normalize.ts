import type {
  ReactionStudyBlock,
  ReactionStudyTrialTemplate,
} from './reaction-schema';
import type { ScheduledPhase } from '$lib/runtime/reaction';
import type {
  DotProbeTaskConfig,
  DotProbeStimulusPair,
  FlankerTaskConfig,
  IATTaskConfig,
  NBackTaskConfig,
  NormalizedReactionConfig,
  ReactionCustomTrial,
  ReactionLegacyQuestionConfig,
  ReactionStudyConfig,
  ReactionTaskType,
  StroopTaskConfig,
} from './reaction-schema';

const DEFAULT_VALID_KEYS = ['f', 'j'];

const DEFAULT_NBACK: NBackTaskConfig = {
  n: 2,
  sequenceLength: 20,
  targetRate: 0.3,
  stimulusSet: ['A', 'B', 'C', 'D'],
  targetKey: 'j',
  nonTargetKey: 'f',
  fixationMs: 400,
  responseTimeoutMs: 1200,
};

export function normalizeReactionQuestionConfig(question: unknown): NormalizedReactionConfig {
  const questionPayload = toRecord(question);
  const root =
    toRecord(questionPayload?.config) ||
    toRecord(questionPayload?.display) ||
    (toRecord(question) as Record<string, unknown>) ||
    {};

  const source = pickNormalizationSource(root);
  const validKeys = normalizeValidKeys(source.response?.validKeys);
  const normalizedBlocks = normalizeStudyBlocks(source.blocks, validKeys);

  const taskType = normalizeTaskType(source.task?.type);
  const nBack: Partial<NBackTaskConfig> = source.task?.nBack ?? {};
  const stroop: Partial<StroopTaskConfig> = source.task?.stroop ?? {};
  const flanker: Partial<FlankerTaskConfig> = source.task?.flanker ?? {};
  const iat: Partial<IATTaskConfig> = source.task?.iat ?? {};
  const dotProbe: Partial<DotProbeTaskConfig> = source.task?.dotProbe ?? {};

  const dotProbePairs = Array.isArray(dotProbe.stimulusPairs)
    ? dotProbe.stimulusPairs
        .map((pair) => {
          if (!pair || typeof pair !== 'object') return null;
          const salient = ensureString((pair as DotProbeStimulusPair).salient);
          const neutral = ensureString((pair as DotProbeStimulusPair).neutral);
          if (!salient || !neutral) return null;
          return { salient, neutral };
        })
        .filter((pair): pair is DotProbeStimulusPair => Boolean(pair))
    : [];

  const customTrials = Array.isArray(source.task?.customTrials)
    ? source.task.customTrials.filter((trial): trial is ReactionCustomTrial =>
        Boolean(trial && typeof trial === 'object')
      )
    : [];

  const stimulusType = normalizeStimulusType(source.stimulus?.type);
  const stimulusContent = ensureString(source.stimulus?.content) || (stimulusType === 'shape' ? 'circle' : '');

  return {
    schemaVersion: 1,
    task: {
      type: taskType,
      nBack: {
        n: asInt(nBack.n, DEFAULT_NBACK.n, 1, 6),
        sequenceLength: asInt(
          nBack.sequenceLength,
          source.testTrials,
          3,
          1000,
          DEFAULT_NBACK.sequenceLength
        ),
        targetRate: asNumber(nBack.targetRate, DEFAULT_NBACK.targetRate, 0, 1),
        stimulusSet:
          Array.isArray(nBack.stimulusSet) && nBack.stimulusSet.length > 0
            ? nBack.stimulusSet
            : DEFAULT_NBACK.stimulusSet,
        targetKey: ensureString(nBack.targetKey) || validKeys[0] || DEFAULT_NBACK.targetKey,
        nonTargetKey:
          ensureString(nBack.nonTargetKey) || validKeys[1] || validKeys[0] || DEFAULT_NBACK.nonTargetKey,
        fixationMs: asInt(nBack.fixationMs, DEFAULT_NBACK.fixationMs, 0, 10000),
        responseTimeoutMs: asInt(
          nBack.responseTimeoutMs,
          DEFAULT_NBACK.responseTimeoutMs,
          100,
          20000
        ),
      },
      stroop: {
        trialCount: asInt(stroop.trialCount, 40, 1, 1000),
        colors:
          Array.isArray(stroop.colors) && stroop.colors.length >= 2
            ? stroop.colors
                .map((color) => ensureString(color).toLowerCase())
                .filter(Boolean)
            : ['red', 'blue', 'green', 'yellow'],
        congruentRatio: asNumber(stroop.congruentRatio, 0.5, 0, 1),
        stimulusDuration: asInt(stroop.stimulusDuration, 0, 0, 20000),
        isi: asInt(stroop.isi, 250, 0, 20000),
        fixationMs: asInt(stroop.fixationMs, 500, 0, 10000),
        responseTimeoutMs: asInt(stroop.responseTimeoutMs, 2000, 100, 20000),
      },
      flanker: {
        trialCount: asInt(flanker.trialCount, 40, 1, 1000),
        stimulusSet: normalizeFlankerStimulusSet(flanker.stimulusSet),
        congruentRatio: asNumber(flanker.congruentRatio, 0.5, 0, 1),
        includeNeutral: Boolean(flanker.includeNeutral),
        neutralRatio: asNumber(flanker.neutralRatio, 0.2, 0, 1),
        flankerCount: asInt(flanker.flankerCount, 2, 1, 8),
        stimulusDuration: asInt(flanker.stimulusDuration, 0, 0, 20000),
        isi: asInt(flanker.isi, 250, 0, 20000),
        fixationMs: asInt(flanker.fixationMs, 500, 0, 10000),
        responseTimeoutMs: asInt(flanker.responseTimeoutMs, 1500, 100, 20000),
      },
      iat: {
        category1Name: ensureString(iat.category1Name) || 'Flowers',
        category1Items: normalizeStringArray(iat.category1Items, ['Rose', 'Lily', 'Tulip', 'Daisy']),
        category2Name: ensureString(iat.category2Name) || 'Insects',
        category2Items: normalizeStringArray(iat.category2Items, ['Ant', 'Beetle', 'Wasp', 'Moth']),
        attribute1Name: ensureString(iat.attribute1Name) || 'Pleasant',
        attribute1Items: normalizeStringArray(iat.attribute1Items, ['Happy', 'Joyful', 'Love', 'Peace']),
        attribute2Name: ensureString(iat.attribute2Name) || 'Unpleasant',
        attribute2Items: normalizeStringArray(iat.attribute2Items, ['Ugly', 'Nasty', 'Evil', 'Hurt']),
        trialsPerBlock: asInt(iat.trialsPerBlock, 20, 1, 200),
        practiceTrialsPerBlock: asInt(iat.practiceTrialsPerBlock, 10, 1, 200),
        fixationMs: asInt(iat.fixationMs, 400, 0, 10000),
        responseTimeoutMs: asInt(iat.responseTimeoutMs, 3000, 100, 30000),
      },
      dotProbe: {
        trialCount: asInt(dotProbe.trialCount, 40, 1, 1000),
        cueDuration: asInt(dotProbe.cueDuration, 500, 0, 20000),
        isi: asInt(dotProbe.isi, 500, 0, 20000),
        congruentRatio: asNumber(dotProbe.congruentRatio, 0.5, 0, 1),
        probeSymbol: ensureString(dotProbe.probeSymbol) || '*',
        stimulusPairs: dotProbePairs.length > 0 ? dotProbePairs : [{ salient: 'THREAT', neutral: 'NEUTRAL' }],
        fixationMs: asInt(dotProbe.fixationMs, 500, 0, 10000),
        responseTimeoutMs: asInt(dotProbe.responseTimeoutMs, 2000, 100, 30000),
      },
      customTrials,
    },
    blocks: normalizedBlocks,
    stimulus: {
      type: stimulusType,
      content: stimulusContent,
      mediaRef: source.stimulus?.mediaRef,
      fixation: {
        type: source.stimulus?.fixation?.type === 'dot' ? 'dot' : 'cross',
        duration: asInt(source.stimulus?.fixation?.duration, 500, 0, 10000),
      },
    },
    response: {
      validKeys,
      timeout: asInt(source.response?.timeout, 2000, 100, 30000),
      requireCorrect: Boolean(source.response?.requireCorrect),
    },
    correctKey: ensureString(source.correctKey),
    feedback: source.feedback !== false,
    practice: Boolean(source.practice),
    practiceTrials: asInt(source.practiceTrials, 3, 0, 1000),
    testTrials: asInt(source.testTrials, 10, 1, 1000),
    targetFPS: asInt(source.targetFPS, 120, 30, 240),
  };
}

function pickNormalizationSource(root: Record<string, unknown>): ReactionLegacyQuestionConfig {
  const typedRoot = root as ReactionLegacyQuestionConfig;

  if (typedRoot.study && typeof typedRoot.study === 'object') {
    const study = typedRoot.study as ReactionLegacyQuestionConfig;
    if (Array.isArray(study.blocks) && study.blocks.length > 0) {
      return study;
    }
    if (!typedRoot.task || typeof typedRoot.task !== 'object') {
      return study;
    }
  }

  if (typedRoot.task && typeof typedRoot.task === 'object') {
    return typedRoot;
  }

  if (typedRoot.study && typeof typedRoot.study === 'object') {
    return typedRoot.study as ReactionLegacyQuestionConfig;
  }

  return typedRoot;
}

function normalizeTaskType(value: unknown): ReactionTaskType {
  if (
    value === 'standard' ||
    value === 'n-back' ||
    value === 'stroop' ||
    value === 'flanker' ||
    value === 'iat' ||
    value === 'dot-probe' ||
    value === 'custom'
  ) {
    return value;
  }

  return 'standard';
}

function normalizeStimulusType(value: unknown): ReactionStudyConfig['stimulus']['type'] {
  if (value === 'text' || value === 'shape' || value === 'image' || value === 'video' || value === 'audio') {
    return value;
  }

  return 'shape';
}

function normalizeValidKeys(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_VALID_KEYS];
  }

  const keys = value
    .map((key) => ensureString(key))
    .filter(Boolean)
    .map((key) => key.trim());

  return keys.length > 0 ? keys : [...DEFAULT_VALID_KEYS];
}

function normalizeFlankerStimulusSet(value: unknown): [string, string] {
  if (!Array.isArray(value)) {
    return ['>', '<'];
  }

  const left = ensureString(value[0]) || '>';
  const right = ensureString(value[1]) || '<';
  return [left.slice(0, 1), right.slice(0, 1)];
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const values = value
    .map((entry) => ensureString(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : [...fallback];
}

function normalizeStudyBlocks(value: unknown, defaultValidKeys: string[]): ReactionStudyBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((block, index) => normalizeStudyBlock(block, index, defaultValidKeys))
    .filter((block): block is ReactionStudyBlock => Boolean(block));
}

function normalizeStudyBlock(
  value: unknown,
  index: number,
  defaultValidKeys: string[]
): ReactionStudyBlock | null {
  const record = toRecord(value);
  if (!record) return null;

  const id = ensureString(record.id) || `block-${index + 1}`;
  const rawKind = ensureString(record.kind);
  const kind: ReactionStudyBlock['kind'] =
    rawKind === 'practice' || rawKind === 'test' || rawKind === 'custom' ? rawKind : 'custom';
  const name = ensureString(record.name) || `Block ${index + 1}`;
  const randomizeOrder = Boolean(record.randomizeOrder);
  const repetitions = asInt(record.repetitions, 1, 1, 50, 1);

  const trialsValue = Array.isArray(record.trials) ? record.trials : [];
  const trials = trialsValue
    .map((trial, trialIndex) => normalizeStudyTrialTemplate(trial, trialIndex, defaultValidKeys))
    .filter((trial): trial is ReactionStudyTrialTemplate => Boolean(trial));

  return {
    id,
    name,
    kind,
    randomizeOrder,
    repetitions,
    trials,
  };
}

function normalizeStudyTrialTemplate(
  value: unknown,
  index: number,
  defaultValidKeys: string[]
): ReactionStudyTrialTemplate | null {
  const record = toRecord(value);
  if (!record) return null;

  const id = ensureString(record.id) || `trial-${index + 1}`;
  const name = ensureString(record.name) || '';
  const condition = ensureString(record.condition) || undefined;
  const isTarget = typeof record.isTarget === 'boolean' ? record.isTarget : undefined;
  const isPractice = typeof record.isPractice === 'boolean' ? record.isPractice : undefined;
  const repeat = asInt(record.repeat, 1, 1, 500, 1);

  const rawStimulus = record.stimulus;
  const stimulus =
    typeof rawStimulus === 'string'
      ? rawStimulus
      : toRecord(rawStimulus)
        ? (rawStimulus as ReactionStudyTrialTemplate['stimulus'])
        : undefined;

  const validKeys = normalizeValidKeys(record.validKeys) || defaultValidKeys;
  const correctResponse = ensureString(record.correctResponse) || undefined;
  const requireCorrect = typeof record.requireCorrect === 'boolean' ? record.requireCorrect : undefined;
  const fixationMs = asInt(record.fixationMs, undefined, 0, 30000, 0);
  const fixationType = record.fixationType === 'dot' ? 'dot' : record.fixationType === 'cross' ? 'cross' : undefined;
  const preStimulusDelayMs = asInt(record.preStimulusDelayMs, undefined, 0, 30000, 0);
  const stimulusDurationMs = asInt(record.stimulusDurationMs, undefined, 0, 30000, 0);
  const responseTimeoutMs = asInt(record.responseTimeoutMs, undefined, 1, 30000, 2000);
  const interTrialIntervalMs = asInt(record.interTrialIntervalMs, undefined, 0, 30000, 0);
  const targetFPS = asInt(record.targetFPS, undefined, 30, 240, 120);
  const backgroundColor = Array.isArray(record.backgroundColor)
    ? (record.backgroundColor as [number, number, number, number])
    : undefined;

  const phases = normalizePhases(record.phases);

  return {
    id,
    name,
    condition,
    isTarget,
    isPractice,
    repeat,
    stimulus,
    validKeys: validKeys.length > 0 ? validKeys : [...defaultValidKeys],
    correctResponse,
    requireCorrect,
    fixationMs,
    fixationType,
    preStimulusDelayMs,
    stimulusDurationMs,
    responseTimeoutMs,
    interTrialIntervalMs,
    targetFPS,
    backgroundColor,
    phases,
  };
}

function normalizePhases(value: unknown): ScheduledPhase[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const phases: ScheduledPhase[] = [];
  value.forEach((phase) => {
    const record = toRecord(phase);
    if (!record) return;

    const name = ensureString(record.name) || 'phase';
    if (!name) return;

    phases.push({
      name,
      durationMs: asInt(record.durationMs, 0, 0, 30000, 0),
      allowResponse: typeof record.allowResponse === 'boolean' ? record.allowResponse : undefined,
      marksStimulusOnset:
        typeof record.marksStimulusOnset === 'boolean' ? record.marksStimulusOnset : undefined,
    });
  });

  return phases;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function ensureString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(
  value: unknown,
  fallback: number | undefined,
  min: number,
  max: number,
  defaultValue = 0
): number {
  const fallbackValue = typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : defaultValue;
  const source =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.isFinite(Number(value))
        ? Number(value)
        : fallbackValue;
  return Math.min(max, Math.max(min, source));
}

function asInt(
  value: unknown,
  fallback: number | undefined,
  min: number,
  max: number,
  defaultValue = 0
): number {
  const bounded = asNumber(value, fallback, min, max, defaultValue);
  return Math.round(bounded);
}
