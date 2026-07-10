import {
  assignCounterbalance,
  blockOrderPermutation,
  createDotProbeTrials,
  createFlankerTrials,
  createGoNoGoTrials,
  createIATBlocks,
  createNBackTrials,
  createPosnerTrials,
  createPvtTrials,
  createRsvpTrials,
  createSartTrials,
  createSimonTrials,
  createSternbergTrials,
  createStroopTrials,
  createTemporalOrderTrials,
  createVisualSearchTrials,
  findFactorAssignment,
  flattenIATTrials,
  iatBlockSequence,
} from '$lib/runtime/reaction';
import type {
  CounterbalanceAssignment,
  CounterbalanceFactorAssignment,
} from '$lib/runtime/reaction';
import type { RGBAColor } from '$lib/shared';
import type {
  ReactionStimulusConfig,
  ReactionTrialConfig,
  ReactionTrialFeedbackConfig,
  ScheduledPhase,
} from '$lib/runtime/reaction';
import type { PlannedReactionTrial } from './reaction-plan-types';
import type {
  NormalizedReactionConfig,
  ReactionCustomTrial,
  ReactionStudyBlock,
  ReactionStudyTrialTemplate,
} from './reaction-schema';

/**
 * Minimal context the reaction compilers read for deterministic seeding. Design-time
 * callers (starter templates, designer previews, mid-experiment re-compiles) legitimately
 * supply only a partial questionnaire / question, so this narrows to the two
 * optional-chained fields the planner needs rather than requiring a full runtime
 * `QuestionRuntimeContext` (whose `question`/`questionnaire` are now strictly typed).
 */
export interface ReactionCompileContext {
  questionnaire?: { settings?: { randomizationSeed?: string } };
  question?: { id?: string };
  /**
   * Per-session id (E-REACT-6). Folds into the seed root so within-block shuffles
   * vary per participant while staying reproducible from the persisted
   * seed + session id + assigned cell. Also seeds the counterbalance assignment
   * when `counterbalance` is not supplied.
   */
  sessionId?: string;
  /**
   * Monotonic participant counter (0-based). When present, systematic
   * counterbalancing methods (round-robin / Latin-square) cycle off it for
   * exactly-even coverage; absent, assignment falls back to a session-id hash.
   */
  participantIndex?: number;
  /**
   * Pre-computed counterbalance assignment (E-REACT-6). The runtime resolves the
   * cell once (so it can persist it) and threads it in here so the applied
   * transforms match the persisted cell exactly. When omitted, the compiler
   * resolves it from `config.counterbalance` + `sessionId` / `participantIndex`.
   */
  counterbalance?: CounterbalanceAssignment;
}

export function compileReactionPlan(
  config: NormalizedReactionConfig,
  context: ReactionCompileContext
): PlannedReactionTrial[] {
  const plan = buildReactionPlan(config, context);

  // E-REACT-4: attach the resolved trial-level feedback config to every planned
  // trial in one pass, so each paradigm builder stays feedback-agnostic. A trial
  // that already carries its own feedback (e.g. a custom template) is left as-is.
  const feedback = buildTrialFeedback(config);
  if (feedback) {
    for (const planned of plan) {
      if (planned.trial.feedback === undefined) {
        planned.trial.feedback = feedback;
      }
    }
  }

  return plan;
}

function buildReactionPlan(
  config: NormalizedReactionConfig,
  context: ReactionCompileContext
): PlannedReactionTrial[] {
  const baseSeed =
    context.questionnaire?.settings?.randomizationSeed ||
    context.question?.id ||
    'reaction-time';

  // E-REACT-6: resolve the participant's counterbalance cell (or use the one the
  // runtime already resolved + persisted). The session id folds into the seed
  // root so within-block shuffles vary per participant but stay reproducible.
  const assignment =
    context.counterbalance ??
    assignCounterbalance(config.counterbalance, {
      seed: baseSeed,
      sessionId: context.sessionId,
      participantIndex: context.participantIndex,
    });
  const seedRoot = context.sessionId ? `${baseSeed}:s:${context.sessionId}` : baseSeed;

  // Key-mapping counterbalancing: swap the two response keys at the config level
  // so every paradigm builder derives the reversed mapping. IAT keeps its
  // canonical e/i keys and swaps them inside buildIATPlan instead.
  const keyMapping = findFactorAssignment(assignment, 'key-mapping');
  const reverseKeys = keyMapping ? keyMapping.levelIndex % 2 === 1 : false;
  const effective = reverseKeys ? swapResponseKeys(config) : config;

  if (effective.blocks.length > 0) {
    return buildStudyBlocksPlan(effective, seedRoot, assignment);
  }

  if (effective.task.type === 'n-back') {
    return buildNBackPlan(effective, seedRoot);
  }

  if (effective.task.type === 'stroop') {
    return buildStroopPlan(effective, seedRoot);
  }

  if (effective.task.type === 'flanker') {
    return buildFlankerPlan(effective, seedRoot);
  }

  if (effective.task.type === 'iat') {
    return buildIATPlan(effective, seedRoot, assignment);
  }

  if (effective.task.type === 'dot-probe') {
    return buildDotProbePlan(effective, seedRoot);
  }

  if (effective.task.type === 'go-nogo') {
    return buildGoNoGoPlan(effective, seedRoot);
  }

  if (effective.task.type === 'sart') {
    return buildSartPlan(effective, seedRoot);
  }

  if (effective.task.type === 'simon') {
    return buildSimonPlan(effective, seedRoot);
  }

  if (effective.task.type === 'posner') {
    return buildPosnerPlan(effective, seedRoot);
  }

  if (effective.task.type === 'visual-search') {
    return buildVisualSearchPlan(effective, seedRoot);
  }

  if (effective.task.type === 'sternberg') {
    return buildSternbergPlan(effective, seedRoot);
  }

  if (effective.task.type === 'pvt') {
    return buildPvtPlan(effective, seedRoot);
  }

  if (effective.task.type === 'temporal-order') {
    return buildTemporalOrderPlan(effective, seedRoot);
  }

  if (effective.task.type === 'rsvp') {
    return buildRsvpPlan(effective, seedRoot);
  }

  if (effective.task.type === 'custom') {
    const customPlan = buildCustomPlan(effective);
    if (customPlan.length > 0) {
      return customPlan;
    }
  }

  return buildStandardPlan(effective);
}

/**
 * Key-mapping counterbalancing (E-REACT-6). Returns a shallow clone of the config
 * with every two-alternative response-key pair swapped: the global valid-key
 * pair, each paradigm's dedicated left/right (or first/second, present/absent)
 * keys, the correct key, and each study-block template's own key pair + correct
 * response. Paradigms that key off `validKeys[0..1]` (flanker, dot-probe, study
 * blocks) inherit the swap; the reversed cell therefore flips which physical key
 * scores each response category.
 */
function swapResponseKeys(config: NormalizedReactionConfig): NormalizedReactionConfig {
  const keys = config.response.validKeys;
  if (keys.length < 2) return config;
  const k0 = keys[0]!;
  const k1 = keys[1]!;
  const remapGlobal = (key: string | undefined): string | undefined =>
    key === k0 ? k1 : key === k1 ? k0 : key;

  const swappedValidKeys = [k1, k0, ...keys.slice(2)];

  const task = config.task;
  return {
    ...config,
    correctKey: remapGlobal(config.correctKey) ?? config.correctKey,
    response: { ...config.response, validKeys: swappedValidKeys },
    task: {
      ...task,
      nBack: { ...task.nBack, targetKey: task.nBack.nonTargetKey, nonTargetKey: task.nBack.targetKey },
      simon: { ...task.simon, leftKey: task.simon.rightKey, rightKey: task.simon.leftKey },
      posner: { ...task.posner, leftKey: task.posner.rightKey, rightKey: task.posner.leftKey },
      temporalOrder: {
        ...task.temporalOrder,
        firstKey: task.temporalOrder.secondKey,
        secondKey: task.temporalOrder.firstKey,
      },
      visualSearch: {
        ...task.visualSearch,
        presentKey: task.visualSearch.absentKey,
        absentKey: task.visualSearch.presentKey,
      },
      sternberg: {
        ...task.sternberg,
        presentKey: task.sternberg.absentKey,
        absentKey: task.sternberg.presentKey,
      },
    },
    blocks: config.blocks.map((block) => ({
      ...block,
      trials: block.trials.map((trial) => {
        const pair = trial.validKeys && trial.validKeys.length >= 2 ? trial.validKeys : keys;
        const t0 = pair[0]!;
        const t1 = pair[1]!;
        const remap = (key: string | undefined): string | undefined =>
          key === t0 ? t1 : key === t1 ? t0 : key;
        return {
          ...trial,
          validKeys:
            trial.validKeys && trial.validKeys.length >= 2
              ? [trial.validKeys[1]!, trial.validKeys[0]!, ...trial.validKeys.slice(2)]
              : trial.validKeys,
          correctResponse: remap(trial.correctResponse),
        };
      }),
    })),
  };
}

/**
 * Apply the participant's block-order and stimulus-subset counterbalancing
 * (E-REACT-6) to a study-block list. Block order is permuted per the Latin-square
 * row for the assigned level; stimulus-subset keeps only the trial templates
 * tagged (via `condition`) with the assigned subset level (untagged templates are
 * shared across subsets). Key-mapping was already baked into the config upstream.
 */
function applyCounterbalanceToBlocks(
  blocks: ReactionStudyBlock[],
  assignment: CounterbalanceAssignment
): ReactionStudyBlock[] {
  let result = blocks;

  const blockOrder = findFactorAssignment(assignment, 'block-order');
  if (blockOrder && result.length > 1) {
    const permutation = blockOrderPermutation(blockOrder.levelIndex, result.length);
    result = permutation.map((index) => result[index]).filter((block): block is ReactionStudyBlock => Boolean(block));
  }

  const subset = findFactorAssignment(assignment, 'stimulus-subset');
  if (subset) {
    result = result.map((block) => selectTrialSubset(block, subset));
  }

  return result;
}

/**
 * Keep only the trial templates belonging to the assigned stimulus-subset level.
 * A template is "tagged" for subsetting when its `condition` matches one of the
 * declared subset levels; tagged templates for OTHER levels are dropped, tagged
 * templates for the assigned level are kept, and untagged templates (no matching
 * condition) are shared across every subset. A block with no tagged templates is
 * returned unchanged so subsetting never empties an unrelated block.
 */
function selectTrialSubset(
  block: ReactionStudyBlock,
  subset: CounterbalanceFactorAssignment
): ReactionStudyBlock {
  const levelSet = new Set(subset.levels.map((level) => level.toLowerCase()));
  const assigned = subset.level.toLowerCase();

  const hasTagged = block.trials.some(
    (trial) => trial.condition && levelSet.has(trial.condition.toLowerCase())
  );
  if (!hasTagged) return block;

  const kept = block.trials.filter((trial) => {
    const condition = trial.condition?.toLowerCase();
    if (condition && levelSet.has(condition)) {
      return condition === assigned;
    }
    return true;
  });

  return { ...block, trials: kept.length > 0 ? kept : block.trials };
}

/**
 * Resolve the trial-level feedback config (E-REACT-4) from the normalized study
 * config. Returns undefined when feedback is disabled. The mode defaults per
 * paradigm — timed single-response tasks report the reaction time, forced-choice
 * paradigms report accuracy — unless the author overrode it in `feedbackSettings`.
 */
function buildTrialFeedback(
  config: NormalizedReactionConfig
): ReactionTrialFeedbackConfig | undefined {
  if (!config.feedback) return undefined;

  const settings = config.feedbackSettings;
  return {
    show: true,
    mode: settings?.mode ?? defaultFeedbackMode(config.task.type),
    durationMs: settings?.durationMs ?? 800,
    correctText: settings?.correctText,
    incorrectText: settings?.incorrectText,
    tooSlowText: settings?.tooSlowText,
  };
}

function defaultFeedbackMode(taskType: NormalizedReactionConfig['task']['type']): 'accuracy' | 'rt' {
  // RT-only paradigms (simple reaction time, PVT) report the reaction time;
  // forced-choice / inhibition paradigms report accuracy.
  return taskType === 'standard' || taskType === 'pvt' ? 'rt' : 'accuracy';
}

function buildStudyBlocksPlan(
  config: NormalizedReactionConfig,
  seedRoot: string,
  assignment: CounterbalanceAssignment
): PlannedReactionTrial[] {
  const plan: PlannedReactionTrial[] = [];
  const blocks = applyCounterbalanceToBlocks(config.blocks, assignment);

  blocks.forEach((block, blockIndex) => {
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
          practiceCriterion: block.practiceCriterion,
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
    responseMode: config.response.mode,
    captureKeyUp: config.response.captureKeyUp,
    targetRegion: config.response.targetRegion,
    gamepadButtonMap: config.response.gamepadButtonMap,
    validKeys,
    correctResponse: template.correctResponse || config.correctKey || undefined,
    requireCorrect: template.requireCorrect ?? config.response.requireCorrect,
    fixation: {
      enabled: fixationDurationMs > 0,
      type: template.fixationType || config.stimulus.fixation.type,
      durationMs: fixationDurationMs,
    },
    preStimulusDelayMs: template.preStimulusDelayMs ?? scheduledCueDelay,
    preStimulusDelayFrames: template.preStimulusDelayFrames,
    stimulus,
    stimulusDurationMs: template.stimulusDurationMs ?? scheduledStimulusDuration,
    stimulusDurationFrames: template.stimulusDurationFrames,
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

function buildIATPlan(
  config: NormalizedReactionConfig,
  seedRoot: string,
  assignment: CounterbalanceAssignment
): PlannedReactionTrial[] {
  const iat = config.task.iat;

  // E-REACT-6: block-order counterbalancing chooses the compatible- vs
  // incompatible-first 7-block sequence; key-mapping swaps the canonical e/i key
  // sides. Both are seeded from the participant's assigned cell.
  const blockOrder = findFactorAssignment(assignment, 'block-order');
  const order =
    blockOrder && blockOrder.levelIndex % 2 === 1 ? 'incompatible-first' : 'compatible-first';
  const keyMapping = findFactorAssignment(assignment, 'key-mapping');
  const reverseKeys = keyMapping ? keyMapping.levelIndex % 2 === 1 : false;

  const blocks = createIATBlocks({
    categories: [
      { name: iat.category1Name, items: iat.category1Items },
      { name: iat.category2Name, items: iat.category2Items },
    ],
    attributes: [
      { name: iat.attribute1Name, items: iat.attribute1Items },
      { name: iat.attribute2Name, items: iat.attribute2Items },
    ],
    blocksSequence: iatBlockSequence(order),
    leftKey: reverseKeys ? 'i' : 'e',
    rightKey: reverseKeys ? 'e' : 'i',
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

function buildGoNoGoPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const goNoGo = config.task.goNoGo;
  const shared = {
    goRatio: goNoGo.goRatio,
    goStimulus: goNoGo.goStimulus,
    noGoStimulus: goNoGo.noGoStimulus,
    responseKey: goNoGo.responseKey,
    stimulusDuration: goNoGo.stimulusDuration || undefined,
    isi: goNoGo.isi,
    fixationMs: goNoGo.fixationMs,
    responseTimeoutMs: goNoGo.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createGoNoGoTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:go-nogo:practice` })
      : [];
  const test = createGoNoGoTrials({ ...shared, trialCount: goNoGo.trialCount, seed: `${seedRoot}:go-nogo:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'go-nogo',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
      isTarget: trial.isTarget,
      expectedResponse: trial.expectedResponse || undefined,
    },
  }));
}

function buildSartPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const sart = config.task.sart;
  const shared = {
    targetDigit: sart.targetDigit,
    digits: sart.digits,
    responseKey: sart.responseKey,
    stimulusDuration: sart.stimulusDuration || undefined,
    isi: sart.isi,
    fixationMs: sart.fixationMs,
    responseTimeoutMs: sart.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createSartTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:sart:practice` })
      : [];
  const test = createSartTrials({ ...shared, trialCount: sart.trialCount, seed: `${seedRoot}:sart:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'sart',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
      isTarget: trial.isTarget,
      expectedResponse: trial.expectedResponse || undefined,
    },
  }));
}

function buildSimonPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const simon = config.task.simon;
  const shared = {
    congruentRatio: simon.congruentRatio,
    colors: [
      { name: simon.leftColor, rgba: toRgba(simon.leftColor), side: 'left' as const },
      { name: simon.rightColor, rgba: toRgba(simon.rightColor), side: 'right' as const },
    ] as [
      { name: string; rgba: RGBAColor; side: 'left' },
      { name: string; rgba: RGBAColor; side: 'right' },
    ],
    leftKey: simon.leftKey,
    rightKey: simon.rightKey,
    stimulusDuration: simon.stimulusDuration || undefined,
    isi: simon.isi,
    fixationMs: simon.fixationMs,
    responseTimeoutMs: simon.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createSimonTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:simon:practice` })
      : [];
  const test = createSimonTrials({ ...shared, trialCount: simon.trialCount, seed: `${seedRoot}:simon:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'simon',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.congruency,
      expectedResponse: trial.expectedResponse,
    },
  }));
}

function buildPosnerPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const posner = config.task.posner;
  const shared = {
    validRatio: posner.validRatio,
    cueDurationMs: posner.cueDurationMs,
    soaMs: posner.soaMs,
    leftKey: posner.leftKey,
    rightKey: posner.rightKey,
    isi: posner.isi,
    fixationMs: posner.fixationMs,
    responseTimeoutMs: posner.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createPosnerTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:posner:practice` })
      : [];
  const test = createPosnerTrials({ ...shared, trialCount: posner.trialCount, seed: `${seedRoot}:posner:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'posner',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.validity,
      expectedResponse: trial.expectedResponse,
    },
  }));
}

function buildVisualSearchPlan(
  config: NormalizedReactionConfig,
  seedRoot: string
): PlannedReactionTrial[] {
  const search = config.task.visualSearch;
  const shared = {
    setSizes: search.setSizes,
    targetPresentRatio: search.targetPresentRatio,
    featureSearch: search.featureSearch,
    targetChar: search.targetChar,
    distractorChars: search.distractorChars,
    presentKey: search.presentKey,
    absentKey: search.absentKey,
    stimulusDuration: search.stimulusDuration || undefined,
    isi: search.isi,
    fixationMs: search.fixationMs,
    responseTimeoutMs: search.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createVisualSearchTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:visual-search:practice` })
      : [];
  const test = createVisualSearchTrials({ ...shared, trialCount: search.trialCount, seed: `${seedRoot}:visual-search:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'visual-search',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
      isTarget: trial.targetPresent,
      expectedResponse: trial.expectedResponse,
    },
  }));
}

function buildSternbergPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const sternberg = config.task.sternberg;
  const shared = {
    setSizes: sternberg.setSizes,
    targetPresentRatio: sternberg.targetPresentRatio,
    memoryItems: sternberg.memoryItems,
    presentKey: sternberg.presentKey,
    absentKey: sternberg.absentKey,
    encodingMs: sternberg.encodingMs,
    retentionMs: sternberg.retentionMs,
    isi: sternberg.isi,
    fixationMs: sternberg.fixationMs,
    responseTimeoutMs: sternberg.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createSternbergTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:sternberg:practice` })
      : [];
  const test = createSternbergTrials({ ...shared, trialCount: sternberg.trialCount, seed: `${seedRoot}:sternberg:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'sternberg',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
      isTarget: trial.inSet,
      expectedResponse: trial.expectedResponse,
    },
  }));
}

function buildPvtPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const pvt = config.task.pvt;
  const shared = {
    isi: pvt.isi,
    responseKey: pvt.responseKey,
    responseTimeoutMs: pvt.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createPvtTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:pvt:practice` })
      : [];
  const test = createPvtTrials({ ...shared, trialCount: pvt.trialCount, seed: `${seedRoot}:pvt:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'pvt',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
    },
  }));
}

function buildTemporalOrderPlan(
  config: NormalizedReactionConfig,
  seedRoot: string
): PlannedReactionTrial[] {
  const toj = config.task.temporalOrder;
  const shared = {
    soaSetMs: toj.soaSetMs,
    firstKey: toj.firstKey,
    secondKey: toj.secondKey,
    stimulusDuration: toj.stimulusDuration || undefined,
    isi: toj.isi,
    fixationMs: toj.fixationMs,
    responseTimeoutMs: toj.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createTemporalOrderTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:temporal-order:practice` })
      : [];
  const test = createTemporalOrderTrials({ ...shared, trialCount: toj.trialCount, seed: `${seedRoot}:temporal-order:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'temporal-order',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
      expectedResponse: trial.expectedResponse,
    },
  }));
}

function buildRsvpPlan(config: NormalizedReactionConfig, seedRoot: string): PlannedReactionTrial[] {
  const rsvp = config.task.rsvp;
  const shared = {
    streamLength: rsvp.streamLength,
    itemDurationMs: rsvp.itemDurationMs,
    targetKey: rsvp.targetKey,
    targetSet: rsvp.targetSet,
    distractorSet: rsvp.distractorSet,
    fixationMs: rsvp.fixationMs,
    responseTimeoutMs: rsvp.responseTimeoutMs,
    targetFPS: config.targetFPS,
  };

  const practice =
    config.practice && config.practiceTrials > 0
      ? createRsvpTrials({ ...shared, trialCount: config.practiceTrials, seed: `${seedRoot}:rsvp:practice` })
      : [];
  const test = createRsvpTrials({ ...shared, trialCount: rsvp.trialCount, seed: `${seedRoot}:rsvp:test` });

  return mapPracticeAndTest(practice, test, (trial, isPractice) => ({
    trial,
    metadata: {
      taskType: 'rsvp',
      blockId: isPractice ? 'practice' : 'test',
      isPractice,
      condition: trial.condition,
      expectedResponse: trial.expectedResponse,
    },
  }));
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
    responseMode: trial.responseMode || config.response.mode,
    captureKeyUp: trial.captureKeyUp ?? config.response.captureKeyUp,
    targetRegion: trial.targetRegion ?? config.response.targetRegion,
    gamepadButtonMap: trial.gamepadButtonMap ?? config.response.gamepadButtonMap,
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
    preStimulusDelayFrames: trial.preStimulusDelayFrames,
    stimulus,
    stimulusDurationMs: trial.stimulusDurationMs,
    stimulusDurationFrames: trial.stimulusDurationFrames,
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
    responseMode: config.response.mode,
    captureKeyUp: config.response.captureKeyUp,
    targetRegion: config.response.targetRegion,
    gamepadButtonMap: config.response.gamepadButtonMap,
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
