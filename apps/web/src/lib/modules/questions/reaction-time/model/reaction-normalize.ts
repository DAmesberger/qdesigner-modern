import type {
  ReactionFeedbackSettings,
  ReactionPracticeCriterion,
  ReactionStudyBlock,
  ReactionStudyTrialTemplate,
} from './reaction-schema';
import type {
  Binding,
  CounterbalanceScheme,
  ResponseOption,
  ResponseSet,
  ScheduledPhase,
  TimingSpec,
} from '$lib/runtime/reaction';
import { isTimingSpec } from '$lib/runtime/reaction';
import type {
  DotProbeTaskConfig,
  DotProbeStimulusPair,
  FlankerTaskConfig,
  GoNoGoTaskConfig,
  IATTaskConfig,
  NBackTaskConfig,
  NormalizedReactionConfig,
  PosnerTaskConfig,
  PvtTaskConfig,
  ReactionCustomTrial,
  ReactionLegacyQuestionConfig,
  ReactionResponseMode,
  ReactionStudyConfig,
  ReactionTargetRegion,
  ReactionTaskType,
  RsvpTaskConfig,
  SartTaskConfig,
  SimonTaskConfig,
  SternbergTaskConfig,
  StroopTaskConfig,
  TemporalOrderTaskConfig,
  VisualSearchTaskConfig,
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

  // ResponseSet (ADR 0024): preserved verbatim (validated) only when the author
  // opened the Responses editor; absent ⇒ legacy fields compile at runtime. The
  // editor writes to the TOP-LEVEL `config.response`, so prefer that over the
  // picked source (which is the canonical `study` for standard/custom, whose
  // `response` is a stale starter snapshot that never re-syncs once it has blocks).
  const rootResponse = toRecord(root.response);
  const responseSet = normalizeResponseSet(
    rootResponse?.responseSet ?? source.response?.responseSet
  );
  const correctOptionIds = normalizeCorrectOptionIds(
    rootResponse?.correctOptionIds ?? source.response?.correctOptionIds,
    responseSet
  );

  const taskType = normalizeTaskType(source.task?.type);
  const nBack: Partial<NBackTaskConfig> = source.task?.nBack ?? {};
  const stroop: Partial<StroopTaskConfig> = source.task?.stroop ?? {};
  const flanker: Partial<FlankerTaskConfig> = source.task?.flanker ?? {};
  const iat: Partial<IATTaskConfig> = source.task?.iat ?? {};
  const dotProbe: Partial<DotProbeTaskConfig> = source.task?.dotProbe ?? {};
  const goNoGo: Partial<GoNoGoTaskConfig> = source.task?.goNoGo ?? {};
  const sart: Partial<SartTaskConfig> = source.task?.sart ?? {};
  const simon: Partial<SimonTaskConfig> = source.task?.simon ?? {};
  const posner: Partial<PosnerTaskConfig> = source.task?.posner ?? {};
  const visualSearch: Partial<VisualSearchTaskConfig> = source.task?.visualSearch ?? {};
  const sternberg: Partial<SternbergTaskConfig> = source.task?.sternberg ?? {};
  const pvt: Partial<PvtTaskConfig> = source.task?.pvt ?? {};
  const temporalOrder: Partial<TemporalOrderTaskConfig> = source.task?.temporalOrder ?? {};
  const rsvp: Partial<RsvpTaskConfig> = source.task?.rsvp ?? {};

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

  const counterbalance = normalizeCounterbalance(
    source.counterbalance ??
      root.counterbalance ??
      toRecord(root.study)?.counterbalance
  );

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
        fixationMs: normalizeTimingSpec(nBack.fixationMs, DEFAULT_NBACK.fixationMs as number, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(
          nBack.responseTimeoutMs,
          DEFAULT_NBACK.responseTimeoutMs as number,
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
        stimulusDuration: normalizeTimingSpec(stroop.stimulusDuration, 0, 0, 20000),
        isi: normalizeTimingSpec(stroop.isi, 250, 0, 20000),
        fixationMs: normalizeTimingSpec(stroop.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(stroop.responseTimeoutMs, 2000, 100, 20000),
      },
      flanker: {
        trialCount: asInt(flanker.trialCount, 40, 1, 1000),
        stimulusSet: normalizeFlankerStimulusSet(flanker.stimulusSet),
        congruentRatio: asNumber(flanker.congruentRatio, 0.5, 0, 1),
        includeNeutral: Boolean(flanker.includeNeutral),
        neutralRatio: asNumber(flanker.neutralRatio, 0.2, 0, 1),
        flankerCount: asInt(flanker.flankerCount, 2, 1, 8),
        stimulusDuration: normalizeTimingSpec(flanker.stimulusDuration, 0, 0, 20000),
        isi: normalizeTimingSpec(flanker.isi, 250, 0, 20000),
        fixationMs: normalizeTimingSpec(flanker.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(flanker.responseTimeoutMs, 1500, 100, 20000),
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
        fixationMs: normalizeTimingSpec(iat.fixationMs, 400, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(iat.responseTimeoutMs, 3000, 100, 30000),
      },
      dotProbe: {
        trialCount: asInt(dotProbe.trialCount, 40, 1, 1000),
        cueDuration: normalizeTimingSpec(dotProbe.cueDuration, 500, 0, 20000),
        isi: normalizeTimingSpec(dotProbe.isi, 500, 0, 20000),
        congruentRatio: asNumber(dotProbe.congruentRatio, 0.5, 0, 1),
        probeSymbol: ensureString(dotProbe.probeSymbol) || '*',
        stimulusPairs: dotProbePairs.length > 0 ? dotProbePairs : [{ salient: 'THREAT', neutral: 'NEUTRAL' }],
        fixationMs: normalizeTimingSpec(dotProbe.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(dotProbe.responseTimeoutMs, 2000, 100, 30000),
      },
      goNoGo: {
        trialCount: asInt(goNoGo.trialCount, 60, 1, 1000),
        goRatio: asNumber(goNoGo.goRatio, 0.75, 0, 1),
        goStimulus: ensureString(goNoGo.goStimulus) || 'GO',
        noGoStimulus: ensureString(goNoGo.noGoStimulus) || 'STOP',
        responseKey: ensureString(goNoGo.responseKey) || validKeys[0] || ' ',
        stimulusDuration: normalizeTimingSpec(goNoGo.stimulusDuration, 0, 0, 20000),
        isi: normalizeTimingSpec(goNoGo.isi, 500, 0, 20000),
        fixationMs: normalizeTimingSpec(goNoGo.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(goNoGo.responseTimeoutMs, 1000, 100, 20000),
      },
      sart: {
        trialCount: asInt(sart.trialCount, 90, 1, 2000),
        targetDigit: asInt(sart.targetDigit, 3, 0, 9),
        digits: normalizeNumberArray(sart.digits, [1, 2, 3, 4, 5, 6, 7, 8, 9], 0, 9),
        responseKey: ensureString(sart.responseKey) || validKeys[0] || ' ',
        stimulusDuration: normalizeTimingSpec(sart.stimulusDuration, 250, 0, 20000),
        isi: normalizeTimingSpec(sart.isi, 900, 0, 20000),
        fixationMs: normalizeTimingSpec(sart.fixationMs, 300, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(sart.responseTimeoutMs, 1150, 100, 20000),
      },
      simon: {
        trialCount: asInt(simon.trialCount, 60, 1, 1000),
        congruentRatio: asNumber(simon.congruentRatio, 0.5, 0, 1),
        leftColor: ensureString(simon.leftColor) || 'blue',
        rightColor: ensureString(simon.rightColor) || 'red',
        leftKey: ensureString(simon.leftKey) || validKeys[0] || 'f',
        rightKey: ensureString(simon.rightKey) || validKeys[1] || 'j',
        stimulusDuration: normalizeTimingSpec(simon.stimulusDuration, 0, 0, 20000),
        isi: normalizeTimingSpec(simon.isi, 500, 0, 20000),
        fixationMs: normalizeTimingSpec(simon.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(simon.responseTimeoutMs, 1500, 100, 20000),
      },
      posner: {
        trialCount: asInt(posner.trialCount, 60, 1, 1000),
        validRatio: asNumber(posner.validRatio, 0.8, 0, 1),
        cueDurationMs: normalizeTimingSpec(posner.cueDurationMs, 100, 0, 5000),
        soaMs: normalizeTimingSpec(posner.soaMs, 200, 0, 5000),
        leftKey: ensureString(posner.leftKey) || validKeys[0] || 'f',
        rightKey: ensureString(posner.rightKey) || validKeys[1] || 'j',
        isi: normalizeTimingSpec(posner.isi, 500, 0, 20000),
        fixationMs: normalizeTimingSpec(posner.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(posner.responseTimeoutMs, 1500, 100, 20000),
      },
      visualSearch: {
        trialCount: asInt(visualSearch.trialCount, 60, 1, 1000),
        setSizes: normalizeNumberArray(visualSearch.setSizes, [4, 8, 16], 1, 64),
        targetPresentRatio: asNumber(visualSearch.targetPresentRatio, 0.5, 0, 1),
        featureSearch: Boolean(visualSearch.featureSearch),
        targetChar: ensureString(visualSearch.targetChar) || 'T',
        distractorChars: normalizeStringArray(visualSearch.distractorChars, ['L', 'F', 'E']),
        presentKey: ensureString(visualSearch.presentKey) || validKeys[1] || 'j',
        absentKey: ensureString(visualSearch.absentKey) || validKeys[0] || 'f',
        stimulusDuration: normalizeTimingSpec(visualSearch.stimulusDuration, 0, 0, 20000),
        isi: normalizeTimingSpec(visualSearch.isi, 500, 0, 20000),
        fixationMs: normalizeTimingSpec(visualSearch.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(visualSearch.responseTimeoutMs, 3000, 100, 30000),
      },
      sternberg: {
        trialCount: asInt(sternberg.trialCount, 60, 1, 1000),
        setSizes: normalizeNumberArray(sternberg.setSizes, [2, 4, 6], 1, 12),
        targetPresentRatio: asNumber(sternberg.targetPresentRatio, 0.5, 0, 1),
        memoryItems: normalizeStringArray(sternberg.memoryItems, [
          'B',
          'C',
          'D',
          'F',
          'G',
          'H',
          'J',
          'K',
          'L',
          'M',
          'N',
          'P',
        ]),
        presentKey: ensureString(sternberg.presentKey) || validKeys[1] || 'j',
        absentKey: ensureString(sternberg.absentKey) || validKeys[0] || 'f',
        encodingMs: normalizeTimingSpec(sternberg.encodingMs, 400, 0, 10000),
        retentionMs: normalizeTimingSpec(sternberg.retentionMs, 1000, 0, 20000),
        isi: normalizeTimingSpec(sternberg.isi, 500, 0, 20000),
        fixationMs: normalizeTimingSpec(sternberg.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(sternberg.responseTimeoutMs, 3000, 100, 30000),
      },
      pvt: {
        trialCount: asInt(pvt.trialCount, 40, 1, 1000),
        isi: normalizePvtIsi(pvt),
        responseKey: ensureString(pvt.responseKey) || validKeys[0] || ' ',
        responseTimeoutMs: normalizeTimingSpec(pvt.responseTimeoutMs, 5000, 500, 60000),
      },
      temporalOrder: {
        trialCount: asInt(temporalOrder.trialCount, 60, 1, 1000),
        soaSetMs: normalizeNumberArray(temporalOrder.soaSetMs, [17, 33, 67, 133, 267], 1, 2000),
        firstKey: ensureString(temporalOrder.firstKey) || validKeys[0] || 'f',
        secondKey: ensureString(temporalOrder.secondKey) || validKeys[1] || 'j',
        stimulusDuration: normalizeTimingSpec(temporalOrder.stimulusDuration, 0, 0, 20000),
        isi: normalizeTimingSpec(temporalOrder.isi, 500, 0, 20000),
        fixationMs: normalizeTimingSpec(temporalOrder.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(temporalOrder.responseTimeoutMs, 3000, 100, 30000),
      },
      rsvp: {
        trialCount: asInt(rsvp.trialCount, 40, 1, 1000),
        streamLength: asInt(rsvp.streamLength, 12, 1, 100),
        itemDurationMs: normalizeTimingSpec(rsvp.itemDurationMs, 100, 10, 2000),
        targetKey: ensureString(rsvp.targetKey) || validKeys[0] || ' ',
        targetSet: normalizeStringArray(rsvp.targetSet, ['X', 'Z']),
        distractorSet: normalizeStringArray(rsvp.distractorSet, [
          'A',
          'B',
          'C',
          'D',
          'E',
          'F',
          'G',
          'H',
        ]),
        fixationMs: normalizeTimingSpec(rsvp.fixationMs, 500, 0, 10000),
        responseTimeoutMs: normalizeTimingSpec(rsvp.responseTimeoutMs, 2000, 100, 30000),
      },
      customTrials,
    },
    blocks: normalizedBlocks,
    ...(counterbalance ? { counterbalance } : {}),
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
      mode: normalizeResponseMode(source.response?.mode),
      targetRegion: normalizeTargetRegion(source.response?.targetRegion),
      gamepadButtonMap: normalizeGamepadButtonMap(source.response?.gamepadButtonMap),
      captureKeyUp: Boolean(source.response?.captureKeyUp),
      ...(responseSet ? { responseSet } : {}),
      ...(correctOptionIds ? { correctOptionIds } : {}),
    },
    correctKey: ensureString(source.correctKey),
    feedback: source.feedback !== false,
    feedbackSettings: normalizeFeedbackSettings(source.feedbackSettings),
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

const REACTION_TASK_TYPES: readonly ReactionTaskType[] = [
  'standard',
  'n-back',
  'stroop',
  'flanker',
  'iat',
  'dot-probe',
  'go-nogo',
  'sart',
  'simon',
  'posner',
  'visual-search',
  'sternberg',
  'pvt',
  'temporal-order',
  'rsvp',
  'custom',
];

function normalizeTaskType(value: unknown): ReactionTaskType {
  if (typeof value === 'string' && (REACTION_TASK_TYPES as readonly string[]).includes(value)) {
    return value as ReactionTaskType;
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

function normalizeResponseMode(value: unknown): ReactionResponseMode {
  if (value === 'keyboard' || value === 'mouse' || value === 'touch' || value === 'gamepad') {
    return value;
  }
  return 'keyboard';
}

/**
 * Validate a spatial-response target region. Every field must be a finite
 * number; `x`/`y` are clamped to normalized [0,1] canvas space and the radius
 * to (0,1]. Returns undefined when the input is absent or malformed.
 */
function normalizeTargetRegion(value: unknown): ReactionTargetRegion | undefined {
  const record = toRecord(value);
  if (!record) return undefined;

  const x = Number(record.x);
  const y = Number(record.y);
  const radius = Number(record.radius);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) {
    return undefined;
  }
  if (radius <= 0) return undefined;

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    radius: Math.min(1, radius),
  };
}

/**
 * Validate a gamepad button-map: keys must parse to non-negative integer button
 * indices and values must be non-empty strings. Returns undefined when empty.
 */
function normalizeGamepadButtonMap(value: unknown): Record<number, string> | undefined {
  const record = toRecord(value);
  if (!record) return undefined;

  const map: Record<number, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    const mapped = ensureString(raw).trim();
    if (!mapped) continue;
    map[index] = mapped;
  }

  return Object.keys(map).length > 0 ? map : undefined;
}

/**
 * Validate an authored ResponseSet (ADR 0024). Keeps options with a non-empty id
 * and their well-formed bindings (each binding validated by its `source`
 * discriminant; unknown/garbage bindings dropped). Returns undefined only when
 * the input is absent or not an object — an author who opened the editor but left
 * it empty still round-trips as `{ options: [] }`, so the "opened" state survives.
 */
function normalizeResponseSet(value: unknown): ResponseSet | undefined {
  const record = toRecord(value);
  if (!record) return undefined;

  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const options: ResponseOption[] = [];
  for (const rawOption of rawOptions) {
    const optionRecord = toRecord(rawOption);
    if (!optionRecord) continue;
    // A blank id is kept (not dropped): it's an in-progress option the editor
    // flags as "id required" — silently deleting the author's half-typed row on
    // the next hydrate would be worse than a flagged empty. Serializing preserves
    // the exact `{ id: '', label: '', bindings: [] }` an "Add option" click made.
    const id = ensureString(optionRecord.id).trim();
    const bindings = normalizeBindings(optionRecord.bindings);
    const label = ensureString(optionRecord.label);
    options.push({ id, ...(label ? { label } : {}), bindings });
  }

  const setId = ensureString(record.id).trim();
  return { ...(setId ? { id: setId } : {}), options };
}

function normalizeBindings(value: unknown): Binding[] {
  if (!Array.isArray(value)) return [];
  const bindings: Binding[] = [];
  for (const raw of value) {
    const binding = normalizeBinding(raw);
    if (binding) bindings.push(binding);
  }
  return bindings;
}

function normalizeBinding(value: unknown): Binding | null {
  const record = toRecord(value);
  if (!record) return null;

  const edge = record.on === 'up' ? 'up' : record.on === 'down' ? 'down' : undefined;

  switch (record.source) {
    case 'keyboard': {
      const key = ensureString(record.key).toLowerCase();
      if (!key) return null;
      return { source: 'keyboard', key, ...(edge ? { on: edge } : {}) };
    }
    case 'pointer': {
      const region = normalizeTargetRegion(record.region);
      return { source: 'pointer', ...(region ? { region } : {}) };
    }
    case 'touch': {
      const region = normalizeTargetRegion(record.region);
      return { source: 'touch', ...(region ? { region } : {}) };
    }
    case 'gamepad': {
      const button = Number(record.button);
      if (!Number.isInteger(button) || button < 0) return null;
      return { source: 'gamepad', button };
    }
    case 'hid': {
      const button = Number(record.button);
      if (!Number.isInteger(button) || button < 0) return null;
      return { source: 'hid', button, ...(edge ? { on: edge } : {}) };
    }
    default:
      return null;
  }
}

/**
 * Validate the correct-option ids (ADR 0024). Keeps non-empty string ids that
 * name an option in the (validated) set, de-duplicated. Returns undefined when
 * nothing valid remains so the study omits the field.
 */
function normalizeCorrectOptionIds(
  value: unknown,
  responseSet: ResponseSet | undefined
): string[] | undefined {
  if (!Array.isArray(value) || !responseSet) return undefined;
  const known = new Set(responseSet.options.map((option) => option.id));
  const ids: string[] = [];
  for (const raw of value) {
    const id = ensureString(raw).trim();
    if (id && known.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : undefined;
}

function normalizeFlankerStimulusSet(value: unknown): [string, string] {
  if (!Array.isArray(value)) {
    return ['>', '<'];
  }

  const left = ensureString(value[0]) || '>';
  const right = ensureString(value[1]) || '<';
  return [left.slice(0, 1), right.slice(0, 1)];
}

/**
 * Validate a numeric array (E-REACT-2). Each entry is coerced to a finite number
 * clamped to [min,max] and rounded; empties fall back to the default set.
 */
function normalizeNumberArray(
  value: unknown,
  fallback: number[],
  min: number,
  max: number
): number[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const values = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.round(Math.min(max, Math.max(min, entry))));

  return values.length > 0 ? values : [...fallback];
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

const COUNTERBALANCE_FACTORS: ReadonlyArray<CounterbalanceScheme['factor']> = [
  'block-order',
  'key-mapping',
  'stimulus-subset',
];
const COUNTERBALANCE_METHODS: ReadonlyArray<CounterbalanceScheme['method']> = [
  'latin-square',
  'round-robin',
  'random',
];

/**
 * Validate declared counterbalancing schemes (E-REACT-6). Keeps only schemes with
 * a known factor, a known method, and at least one non-empty level; drops the rest.
 * Returns undefined when nothing valid remains so the study omits the field.
 */
function normalizeCounterbalance(value: unknown): CounterbalanceScheme[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const schemes: CounterbalanceScheme[] = [];
  for (const entry of value) {
    const record = toRecord(entry);
    if (!record) continue;

    const factor = ensureString(record.factor) as CounterbalanceScheme['factor'];
    if (!COUNTERBALANCE_FACTORS.includes(factor)) continue;

    const rawMethod = ensureString(record.method) as CounterbalanceScheme['method'];
    const method = COUNTERBALANCE_METHODS.includes(rawMethod) ? rawMethod : 'round-robin';

    const levels = normalizeStringArray(record.levels, []).filter(Boolean);
    if (levels.length === 0) continue;

    schemes.push({ factor, method, levels });
  }

  return schemes.length > 0 ? schemes : undefined;
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
  const practiceCriterion = normalizePracticeCriterion(record.practiceCriterion);

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
    ...(practiceCriterion ? { practiceCriterion } : {}),
    trials,
  };
}

/**
 * Validate a practice criterion (E-REACT-4). `minAccuracy` is clamped to [0,1]
 * and `maxAttempts` to [1,20]. Returns undefined when the input is absent or the
 * accuracy target is not a finite number.
 */
function normalizePracticeCriterion(value: unknown): ReactionPracticeCriterion | undefined {
  const record = toRecord(value);
  if (!record) return undefined;

  const rawAccuracy = Number(record.minAccuracy);
  if (!Number.isFinite(rawAccuracy)) return undefined;

  return {
    minAccuracy: Math.min(1, Math.max(0, rawAccuracy)),
    maxAttempts: asInt(record.maxAttempts, 3, 1, 20, 3),
  };
}

/**
 * Validate feedback settings (E-REACT-4). Mode falls back to `accuracy`, the
 * duration is clamped to a sane [0, 10000] ms window, and the override texts are
 * kept only when non-empty. Returns undefined when nothing was supplied.
 */
function normalizeFeedbackSettings(value: unknown): ReactionFeedbackSettings | undefined {
  const record = toRecord(value);
  if (!record) return undefined;

  const rawMode = ensureString(record.mode);
  const mode: ReactionFeedbackSettings['mode'] =
    rawMode === 'rt' || rawMode === 'both' || rawMode === 'accuracy' ? rawMode : 'accuracy';

  const correctText = ensureString(record.correctText).trim();
  const incorrectText = ensureString(record.incorrectText).trim();
  const tooSlowText = ensureString(record.tooSlowText).trim();

  return {
    mode,
    durationMs: asInt(record.durationMs, 800, 0, 10000, 800),
    ...(correctText ? { correctText } : {}),
    ...(incorrectText ? { incorrectText } : {}),
    ...(tooSlowText ? { tooSlowText } : {}),
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

/**
 * Validate an authored phase duration (ADR 0025). A `uniform` distribution is
 * preserved (each bound clamped to [min,max]); anything else coerces to a fixed
 * ms integer exactly as `asInt` would. Bounds are NOT reordered — an inverted
 * min/max survives so the designer's scientific-validity rule can flag it.
 */
function normalizeTimingSpec(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): TimingSpec {
  if (isTimingSpec(value)) {
    return {
      dist: 'uniform',
      min: asInt(value.min, fallback, min, max, fallback),
      max: asInt(value.max, fallback, min, max, fallback),
    };
  }
  return asInt(value, fallback, min, max, fallback);
}

/**
 * Resolve the PVT foreperiod (ADR 0025). Prefers an explicit `isi` TimingSpec;
 * otherwise maps the legacy `minIsiMs`/`maxIsiMs` pair into a uniform spec
 * (ordered, so the legacy semantics of min ≤ max are preserved).
 */
function normalizePvtIsi(pvt: Partial<PvtTaskConfig>): TimingSpec {
  if (pvt.isi !== undefined) {
    return normalizeTimingSpec(pvt.isi, 2000, 0, 60000);
  }
  const lo = asInt(pvt.minIsiMs, 2000, 0, 60000, 2000);
  const hi = asInt(pvt.maxIsiMs, 10000, 0, 60000, 10000);
  return { dist: 'uniform', min: Math.min(lo, hi), max: Math.max(lo, hi) };
}
