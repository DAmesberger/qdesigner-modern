import {
  createDotProbeTrials,
  createFlankerTrials,
  createIATBlocks,
  createNBackTrials,
  createStroopTrials,
  flattenIATTrials,
} from '$lib/runtime/reaction';
import type { RGBAColor } from '$lib/shared';
import type {
  ReactionStimulusConfig,
  ReactionTrialConfig,
  ScheduledPhase,
} from '$lib/runtime/reaction';
import type { QuestionRuntimeContext } from '$lib/runtime/core/question-runtime';
import type { PlannedReactionTrial } from './reaction-plan-types';
import type {
  NormalizedReactionConfig,
  ReactionCustomTrial,
  ReactionStudyBlock,
  ReactionStudyTrialTemplate,
} from './reaction-schema';

export function compileReactionPlan(
  config: NormalizedReactionConfig,
  context: Pick<QuestionRuntimeContext, 'questionnaire' | 'question'>
): PlannedReactionTrial[] {
  const seedRoot =
    context.questionnaire?.settings?.randomizationSeed ||
    context.question?.id ||
    'reaction-time';

  if (config.blocks.length > 0) {
    return buildStudyBlocksPlan(config, seedRoot);
  }

  if (config.task.type === 'n-back') {
    return buildNBackPlan(config, seedRoot);
  }

  if (config.task.type === 'stroop') {
    return buildStroopPlan(config, seedRoot);
  }

  if (config.task.type === 'flanker') {
    return buildFlankerPlan(config, seedRoot);
  }

  if (config.task.type === 'iat') {
    return buildIATPlan(config, seedRoot);
  }

  if (config.task.type === 'dot-probe') {
    return buildDotProbePlan(config, seedRoot);
  }

  if (config.task.type === 'custom') {
    const customPlan = buildCustomPlan(config);
    if (customPlan.length > 0) {
      return customPlan;
    }
  }

  return buildStandardPlan(config);
}

function buildStudyBlocksPlan(
  config: NormalizedReactionConfig,
  seedRoot: string
): PlannedReactionTrial[] {
  const plan: PlannedReactionTrial[] = [];

  config.blocks.forEach((block, blockIndex) => {
    const blockRepeats = Math.max(1, block.repetitions || 1);

    for (let repeatIndex = 0; repeatIndex < blockRepeats; repeatIndex++) {
      const blockTrials = expandBlockTrials(config, block, blockIndex, repeatIndex);
      if (block.randomizeOrder) {
        const rng = createSeededRng(`${seedRoot}:block:${block.id}:${repeatIndex + 1}`);
        shuffle(blockTrials, rng);
      }
      plan.push(...blockTrials);
    }
  });

  return plan;
}

function expandBlockTrials(
  config: NormalizedReactionConfig,
  block: ReactionStudyBlock,
  blockIndex: number,
  repeatIndex: number
): PlannedReactionTrial[] {
  const plan: PlannedReactionTrial[] = [];

  block.trials.forEach((trialTemplate, trialTemplateIndex) => {
    const trialRepeats = Math.max(1, trialTemplate.repeat || 1);

    for (let trialRepeatIndex = 0; trialRepeatIndex < trialRepeats; trialRepeatIndex++) {
      const trialNumberSuffix =
        blockIndex + 1 + '-' + (repeatIndex + 1) + '-' + (trialTemplateIndex + 1) + '-' + (trialRepeatIndex + 1);

      const normalized = trialFromTemplate(config, trialTemplate, trialNumberSuffix);
      if (!normalized) continue;

      plan.push({
        trial: normalized,
        metadata: {
          taskType: config.task.type,
          blockId: block.id,
          isPractice: trialTemplate.isPractice ?? block.kind === 'practice',
          expectedResponse: trialTemplate.correctResponse || normalized.correctResponse,
          isTarget: trialTemplate.isTarget,
          condition: trialTemplate.condition,
          trialTemplateId: trialTemplate.id,
          scheduledPhases: trialTemplate.phases,
        },
      });
    }
  });

  return plan;
}

function trialFromTemplate(
  config: NormalizedReactionConfig,
  template: ReactionStudyTrialTemplate,
  trialNumberSuffix: string
): ReactionTrialConfig | null {
  const stimulus = normalizeStimulusCandidate(template.stimulus) || defaultStimulusFromConfig(config);
  if (!stimulus) return null;

  const validKeys = template.validKeys && template.validKeys.length > 0 ? template.validKeys : config.response.validKeys;
  const fixationDurationMs =
    typeof template.fixationMs === 'number' ? Math.max(0, template.fixationMs) : config.stimulus.fixation.duration;

  const scheduledCueDelay = extractPhaseDuration(template.phases, 'cue');
  const scheduledIti = extractPhaseDuration(template.phases, 'iti');
  const scheduledStimulusDuration = extractPhaseDuration(template.phases, 'stimulus');

  return {
    id: `${template.id}-${trialNumberSuffix}`,
    responseMode: 'keyboard',
    validKeys,
    correctResponse: template.correctResponse || config.correctKey || undefined,
    requireCorrect: template.requireCorrect ?? config.response.requireCorrect,
    fixation: {
      enabled: fixationDurationMs > 0,
      type: template.fixationType || config.stimulus.fixation.type,
      durationMs: fixationDurationMs,
    },
    preStimulusDelayMs: template.preStimulusDelayMs ?? scheduledCueDelay,
    stimulus,
    stimulusDurationMs: template.stimulusDurationMs ?? scheduledStimulusDuration,
    responseTimeoutMs: template.responseTimeoutMs ?? config.response.timeout,
    interTrialIntervalMs: template.interTrialIntervalMs ?? scheduledIti ?? 300,
    targetFPS: template.targetFPS ?? config.targetFPS,
    backgroundColor: template.backgroundColor,
    metadata: {
      trialTemplateId: template.id,
      phases: template.phases,
    },
  };
}

function buildStandardPlan(config: NormalizedReactionConfig): PlannedReactionTrial[] {
  const practiceTrials = config.practice ? config.practiceTrials : 0;
  const total = practiceTrials + config.testTrials;
  const plan: PlannedReactionTrial[] = [];

  for (let trial = 0; trial < total; trial++) {
    const isPractice = trial < practiceTrials;
    plan.push({
      trial: toStandardTrialConfig(config, trial + 1, isPractice),
      metadata: {
        taskType: 'standard',
        blockId: isPractice ? 'practice' : 'test',
        isPractice,
        expectedResponse: config.correctKey || undefined,
      },
    });
  }

  return plan;
}

function buildNBackPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const nBack = config.task.nBack;
  const stimulusSet = toNBackStimulusSet(nBack.stimulusSet);
  const practiceLength = Math.max(nBack.n + 2, config.practiceTrials);

  const practiceTrials =
    config.practice && config.practiceTrials > 0
      ? createNBackTrials({
          n: nBack.n,
          sequenceLength: practiceLength,
          targetRate: nBack.targetRate,
          stimulusSet,
          validKeys: config.response.validKeys,
          targetKey: nBack.targetKey,
          nonTargetKey: nBack.nonTargetKey,
          fixationMs: nBack.fixationMs,
          responseTimeoutMs: nBack.responseTimeoutMs,
          targetFPS: config.targetFPS,
          seed: `${seedRoot}:nback:practice`,
        }).slice(0, config.practiceTrials)
      : [];

  const testTrials = createNBackTrials({
    n: nBack.n,
    sequenceLength: nBack.sequenceLength,
    targetRate: nBack.targetRate,
    stimulusSet,
    validKeys: config.response.validKeys,
    targetKey: nBack.targetKey,
    nonTargetKey: nBack.nonTargetKey,
    fixationMs: nBack.fixationMs,
    responseTimeoutMs: nBack.responseTimeoutMs,
    targetFPS: config.targetFPS,
    seed: `${seedRoot}:nback:test`,
  });

  const plan: PlannedReactionTrial[] = [];

  practiceTrials.forEach((trial) => {
    plan.push({
      trial,
      metadata: {
        taskType: 'n-back',
        blockId: 'practice',
        isPractice: true,
        isTarget: trial.isTarget,
        expectedResponse: trial.expectedResponse,
        condition: trial.isTarget ? 'target' : 'non-target',
      },
    });
  });

  testTrials.forEach((trial) => {
    plan.push({
      trial,
      metadata: {
        taskType: 'n-back',
        blockId: 'test',
        isPractice: false,
        isTarget: trial.isTarget,
        expectedResponse: trial.expectedResponse,
        condition: trial.isTarget ? 'target' : 'non-target',
      },
    });
  });

  return plan;
}

function buildStroopPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const stroop = config.task.stroop;
  const palette = stroop.colors
    .filter(Boolean)
    .map((colorName) => ({
      name: colorName.toLowerCase(),
      rgba: toRgba(colorName),
    }));

  const practice =
    config.practice && config.practiceTrials > 0
      ? createStroopTrials({
          trialCount: config.practiceTrials,
          colors: palette,
          congruentRatio: stroop.congruentRatio,
          stimulusDuration: stroop.stimulusDuration || undefined,
          isi: stroop.isi,
          fixationMs: stroop.fixationMs,
          responseTimeoutMs: stroop.responseTimeoutMs,
          targetFPS: config.targetFPS,
          seed: `${seedRoot}:stroop:practice`,
        })
      : [];

  const test = createStroopTrials({
    trialCount: stroop.trialCount,
    colors: palette,
    congruentRatio: stroop.congruentRatio,
    stimulusDuration: stroop.stimulusDuration || undefined,
    isi: stroop.isi,
    fixationMs: stroop.fixationMs,
    responseTimeoutMs: stroop.responseTimeoutMs,
    targetFPS: config.targetFPS,
    seed: `${seedRoot}:stroop:test`,
  });

  const keyMap = createIndexedKeyMap(stroop.colors, config.response.validKeys);
  const fallbackKeys = Object.values(keyMap);

  return mapPracticeAndTest(practice, test, (trial, isPractice) => {
    const expectedResponse = keyMap[trial.inkColor] || trial.expectedResponse;
    return {
      trial: {
        ...trial,
        validKeys: fallbackKeys.length > 0 ? fallbackKeys : trial.validKeys,
        correctResponse: expectedResponse,
      },
      metadata: {
        taskType: 'stroop',
        blockId: isPractice ? 'practice' : 'test',
        isPractice,
        condition: trial.congruency,
        expectedResponse,
      },
    };
  });
}

function buildFlankerPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const flanker = config.task.flanker;

  const practice =
    config.practice && config.practiceTrials > 0
      ? createFlankerTrials({
          trialCount: config.practiceTrials,
          stimulusSet: flanker.stimulusSet,
          congruentRatio: flanker.congruentRatio,
          includeNeutral: flanker.includeNeutral,
          neutralRatio: flanker.neutralRatio,
          flankerCount: flanker.flankerCount,
          stimulusDuration: flanker.stimulusDuration || undefined,
          isi: flanker.isi,
          fixationMs: flanker.fixationMs,
          responseTimeoutMs: flanker.responseTimeoutMs,
          targetFPS: config.targetFPS,
          seed: `${seedRoot}:flanker:practice`,
        })
      : [];

  const test = createFlankerTrials({
    trialCount: flanker.trialCount,
    stimulusSet: flanker.stimulusSet,
    congruentRatio: flanker.congruentRatio,
    includeNeutral: flanker.includeNeutral,
    neutralRatio: flanker.neutralRatio,
    flankerCount: flanker.flankerCount,
    stimulusDuration: flanker.stimulusDuration || undefined,
    isi: flanker.isi,
    fixationMs: flanker.fixationMs,
    responseTimeoutMs: flanker.responseTimeoutMs,
    targetFPS: config.targetFPS,
    seed: `${seedRoot}:flanker:test`,
  });

  const leftKey = config.response.validKeys[0] || 'f';
  const rightKey = config.response.validKeys[1] || leftKey;

  return mapPracticeAndTest(practice, test, (trial, isPractice) => {
    const expectedResponse = trial.target === flanker.stimulusSet[0] ? leftKey : rightKey;

    return {
      trial: {
        ...trial,
        validKeys: [leftKey, rightKey],
        correctResponse: expectedResponse,
      },
      metadata: {
        taskType: 'flanker',
        blockId: isPractice ? 'practice' : 'test',
        isPractice,
        condition: trial.congruency,
        expectedResponse,
      },
    };
  });
}

function buildIATPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const iat = config.task.iat;
  const blocks = createIATBlocks({
    categories: [
      { name: iat.category1Name, items: iat.category1Items },
      { name: iat.category2Name, items: iat.category2Items },
    ],
    attributes: [
      { name: iat.attribute1Name, items: iat.attribute1Items },
      { name: iat.attribute2Name, items: iat.attribute2Items },
    ],
    trialsPerBlock: iat.trialsPerBlock,
    practiceTrialsPerBlock: iat.practiceTrialsPerBlock,
    fixationMs: iat.fixationMs,
    responseTimeoutMs: iat.responseTimeoutMs,
    targetFPS: config.targetFPS,
    seed: `${seedRoot}:iat`,
  });

  const flat = flattenIATTrials(blocks);

  return flat.map((trial) => ({
    trial,
    metadata: {
      taskType: 'iat',
      blockId: `iat-block-${trial.blockIndex + 1}`,
      isPractice: trial.blockType.includes('practice'),
      condition: trial.blockType,
      expectedResponse: trial.expectedResponse,
    },
  }));
}

function buildDotProbePlan(
  config: NormalizedReactionConfig,
  seedRoot: string
): PlannedReactionTrial[] {
  const dotProbe = config.task.dotProbe;

  const practice =
    config.practice && config.practiceTrials > 0
      ? createDotProbeTrials({
          trialCount: config.practiceTrials,
          cueDuration: dotProbe.cueDuration,
          isi: dotProbe.isi,
          stimulusPairs: dotProbe.stimulusPairs,
          congruentRatio: dotProbe.congruentRatio,
          fixationMs: dotProbe.fixationMs,
          responseTimeoutMs: dotProbe.responseTimeoutMs,
          targetFPS: config.targetFPS,
          probeSymbol: dotProbe.probeSymbol,
          seed: `${seedRoot}:dot-probe:practice`,
        })
      : [];

  const test = createDotProbeTrials({
    trialCount: dotProbe.trialCount,
    cueDuration: dotProbe.cueDuration,
    isi: dotProbe.isi,
    stimulusPairs: dotProbe.stimulusPairs,
    congruentRatio: dotProbe.congruentRatio,
    fixationMs: dotProbe.fixationMs,
    responseTimeoutMs: dotProbe.responseTimeoutMs,
    targetFPS: config.targetFPS,
    probeSymbol: dotProbe.probeSymbol,
    seed: `${seedRoot}:dot-probe:test`,
  });

  const leftKey = config.response.validKeys[0] || 'f';
  const rightKey = config.response.validKeys[1] || leftKey;

  return mapPracticeAndTest(practice, test, (trial, isPractice) => {
    const expectedResponse = trial.probePosition === 'left' ? leftKey : rightKey;

    return {
      trial: {
        ...trial,
        validKeys: [leftKey, rightKey],
        correctResponse: expectedResponse,
      },
      metadata: {
        taskType: 'dot-probe',
        blockId: isPractice ? 'practice' : 'test',
        isPractice,
        condition: trial.congruency,
        expectedResponse,
      },
    };
  });
}

function buildCustomPlan(config: NormalizedReactionConfig): PlannedReactionTrial[] {
  return config.task.customTrials
    .map((candidate, index) => normalizeCustomTrial(candidate, config, index + 1))
    .filter(
      (
        planned
      ): planned is {
        trial: ReactionTrialConfig;
        isPractice: boolean;
        isTarget?: boolean;
        expectedResponse?: string;
      } => Boolean(planned)
    )
    .map((planned) => ({
      trial: planned.trial,
      metadata: {
        taskType: 'custom',
        blockId: planned.isPractice ? 'practice' : 'test',
        isPractice: planned.isPractice,
        isTarget: planned.isTarget,
        expectedResponse: planned.expectedResponse,
        condition: planned.isTarget === undefined ? undefined : planned.isTarget ? 'target' : 'non-target',
      },
    }));
}

function normalizeCustomTrial(
  trial: ReactionCustomTrial,
  config: NormalizedReactionConfig,
  trialNumber: number
): {
  trial: ReactionTrialConfig;
  isPractice: boolean;
  isTarget?: boolean;
  expectedResponse?: string;
} | null {
  const stimulus = normalizeStimulusCandidate(trial.stimulus);
  if (!stimulus) return null;

  const normalizedTrial: ReactionTrialConfig = {
    id: trial.id || `custom-${trialNumber}`,
    responseMode: trial.responseMode || 'keyboard',
    validKeys: trial.validKeys || config.response.validKeys,
    correctResponse: trial.correctResponse || undefined,
    requireCorrect: trial.requireCorrect ?? config.response.requireCorrect,
    fixation: {
      enabled: trial.fixation?.enabled ?? true,
      type: trial.fixation?.type || config.stimulus.fixation.type,
      durationMs: trial.fixation?.durationMs ?? config.stimulus.fixation.duration,
      color: trial.fixation?.color,
      sizePx: trial.fixation?.sizePx,
    },
    preStimulusDelayMs: trial.preStimulusDelayMs,
    stimulus,
    stimulusDurationMs: trial.stimulusDurationMs,
    responseTimeoutMs: trial.responseTimeoutMs ?? config.response.timeout,
    interTrialIntervalMs: trial.interTrialIntervalMs ?? 300,
    targetFPS: trial.targetFPS ?? config.targetFPS,
    vsync: trial.vsync,
    backgroundColor: trial.backgroundColor,
    allowResponseDuringPreStimulus: trial.allowResponseDuringPreStimulus,
  };

  const expectedResponse =
    typeof trial.expectedResponse === 'string' ? trial.expectedResponse : normalizedTrial.correctResponse;

  return {
    trial: normalizedTrial,
    isPractice: Boolean(trial.isPractice),
    isTarget: trial.isTarget,
    expectedResponse,
  };
}

function normalizeStimulusCandidate(stimulus?: ReactionStimulusConfig | string): ReactionStimulusConfig | null {
  if (!stimulus) return null;

  if (typeof stimulus === 'string') {
    return {
      kind: 'text',
      text: stimulus,
    };
  }

  if (!stimulus.kind) return null;
  return stimulus;
}

function defaultStimulusFromConfig(config: NormalizedReactionConfig): ReactionStimulusConfig | null {
  const stimulusType = config.stimulus.type;
  const stimulusContent = config.stimulus.content || '';
  const mediaSrc = config.stimulus.mediaRef?.mediaUrl || stimulusContent;

  if (stimulusType === 'text') {
    return {
      kind: 'text',
      text: stimulusContent || 'GO',
      fontPx: 72,
    };
  }

  if (stimulusType === 'image') {
    return {
      kind: 'image',
      src: mediaSrc,
      widthPx: config.stimulus.mediaRef?.width || 360,
      heightPx: config.stimulus.mediaRef?.height || 360,
    };
  }

  if (stimulusType === 'video') {
    return {
      kind: 'video',
      src: mediaSrc,
      autoplay: true,
      muted: true,
      widthPx: config.stimulus.mediaRef?.width || 640,
      heightPx: config.stimulus.mediaRef?.height || 360,
    };
  }

  if (stimulusType === 'audio') {
    return {
      kind: 'audio',
      src: mediaSrc,
      autoplay: true,
      volume: 1,
    };
  }

  return {
    kind: 'shape',
    shape:
      stimulusContent === 'square'
        ? 'square'
        : stimulusContent === 'triangle'
          ? 'triangle'
          : 'circle',
    radiusPx: 80,
  };
}

function mapPracticeAndTest<T extends ReactionTrialConfig>(
  practiceTrials: T[],
  testTrials: T[],
  mapper: (trial: T, isPractice: boolean) => PlannedReactionTrial
): PlannedReactionTrial[] {
  const plan: PlannedReactionTrial[] = [];

  practiceTrials.forEach((trial) => {
    plan.push(mapper(trial, true));
  });

  testTrials.forEach((trial) => {
    plan.push(mapper(trial, false));
  });

  return plan;
}

function createIndexedKeyMap(labels: string[], keys: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  labels.forEach((label, index) => {
    const colorName = (label || '').toLowerCase();
    if (!colorName) return;
    mapping[colorName] = keys[index] || colorName[0] || 'f';
  });
  return mapping;
}

function shuffle<T>(array: T[], rng: () => number): void {
  for (let index = array.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(rng() * (index + 1));
    const temp = array[index];
    array[index] = array[randomIndex]!;
    array[randomIndex] = temp!;
  }
}

function extractPhaseDuration(phases: ScheduledPhase[] | undefined, phaseName: string): number | undefined {
  if (!phases || phases.length === 0) return undefined;
  const phase = phases.find((entry) => entry.name.toLowerCase() === phaseName.toLowerCase());
  return phase ? phase.durationMs : undefined;
}

function toNBackStimulusSet(stimuli: Array<string | ReactionStimulusConfig>): ReactionStimulusConfig[] {
  const mapped = stimuli
    .map((entry) => {
      if (typeof entry === 'string') {
        return {
          kind: 'text' as const,
          text: entry,
          fontPx: 72,
        };
      }

      return entry;
    })
    .filter(Boolean);

  if (mapped.length > 0) {
    return mapped;
  }

  return ['A', 'B', 'C', 'D'].map((text) => ({
    kind: 'text' as const,
    text,
    fontPx: 72,
  }));
}

function toStandardTrialConfig(
  config: NormalizedReactionConfig,
  trialNumber: number,
  isPractice: boolean
): ReactionTrialConfig {
  const stimulusType = config.stimulus.type;
  const stimulusContent = config.stimulus.content || '';
  const fixation = config.stimulus.fixation;

  const mediaSrc = config.stimulus.mediaRef?.mediaUrl || stimulusContent;

  let stimulus: ReactionStimulusConfig;
  if (stimulusType === 'text') {
    stimulus = {
      kind: 'text',
      text: stimulusContent,
      fontPx: 72,
    };
  } else if (stimulusType === 'image') {
    stimulus = {
      kind: 'image',
      src: mediaSrc,
      widthPx: config.stimulus.mediaRef?.width || 360,
      heightPx: config.stimulus.mediaRef?.height || 360,
    };
  } else if (stimulusType === 'video') {
    stimulus = {
      kind: 'video',
      src: mediaSrc,
      autoplay: true,
      muted: true,
      widthPx: config.stimulus.mediaRef?.width || 640,
      heightPx: config.stimulus.mediaRef?.height || 360,
    };
  } else if (stimulusType === 'audio') {
    stimulus = {
      kind: 'audio',
      src: mediaSrc,
      autoplay: true,
      volume: 1,
    };
  } else {
    stimulus = {
      kind: 'shape',
      shape:
        stimulusContent === 'square'
          ? 'square'
          : stimulusContent === 'triangle'
            ? 'triangle'
            : 'circle',
      radiusPx: 80,
    };
  }

  return {
    id: `reaction-time-${trialNumber}`,
    responseMode: 'keyboard',
    validKeys: config.response.validKeys,
    correctResponse: config.correctKey || undefined,
    requireCorrect: config.response.requireCorrect,
    fixation: {
      enabled: true,
      type: fixation.type,
      durationMs: fixation.duration,
    },
    stimulus,
    responseTimeoutMs: config.response.timeout,
    targetFPS: config.targetFPS,
    interTrialIntervalMs: isPractice ? 300 : 500,
  };
}

function toRgba(colorValue: string): RGBAColor {
  const normalized = colorValue.trim().toLowerCase();
  const named = NAMED_COLORS[normalized];
  if (named) {
    return named;
  }

  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const h0 = hex.charAt(0);
    const h1 = hex.charAt(1);
    const h2 = hex.charAt(2);
    const r = parseInt(h0 + h0, 16) / 255;
    const g = parseInt(h1 + h1, 16) / 255;
    const b = parseInt(h2 + h2, 16) / 255;
    return [r, g, b, 1];
  }

  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b, 1];
  }

  if (/^[0-9a-f]{8}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return [r, g, b, a];
  }

  return [1, 1, 1, 1];
}

const NAMED_COLORS: Record<string, RGBAColor> = {
  red: [1, 0, 0, 1],
  blue: [0, 0, 1, 1],
  green: [0, 0.5, 0, 1],
  yellow: [1, 1, 0, 1],
  orange: [1, 0.65, 0, 1],
  purple: [0.5, 0, 0.5, 1],
  pink: [1, 0.75, 0.8, 1],
  black: [0, 0, 0, 1],
  white: [1, 1, 1, 1],
  gray: [0.5, 0.5, 0.5, 1],
};

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
