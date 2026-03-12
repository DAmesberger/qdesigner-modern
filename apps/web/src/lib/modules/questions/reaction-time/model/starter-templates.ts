import { normalizeReactionQuestionConfig } from './reaction-normalize';
import { compileReactionPlan } from './reaction-compiler';
import type {
  NormalizedReactionConfig,
  ReactionLegacyQuestionConfig,
  ReactionStudyBlock,
  ReactionStudyTrialTemplate,
  ReactionTaskType,
} from './reaction-schema';

/**
 * Build a fully-populated starter config for a reaction paradigm.
 * The result uses the canonical schema consumed by the runtime compiler.
 */
export function createReactionStudyStarter(
  taskType: ReactionTaskType,
  overrides?: Partial<ReactionLegacyQuestionConfig>
): NormalizedReactionConfig {
  const base = normalizeReactionQuestionConfig({
    config: {
      task: {
        type: taskType,
      },
      ...overrides,
    },
  });

  if (base.blocks.length > 0) {
    return base;
  }

  const plan = compileReactionPlan(base, {
    questionnaire: {
      settings: {
        randomizationSeed: `starter:${taskType}`,
      },
    },
    question: {
      id: `starter-${taskType}`,
    },
  });

  return {
    ...base,
    blocks: planToBlocks(plan),
  };
}

/**
 * Build a backward-compatible legacy config payload for the current designer.
 * This keeps existing `task/stimulus/response` fields while also writing `study`.
 */
export function createLegacyStarterPayload(
  taskType: ReactionTaskType,
  overrides?: Partial<ReactionLegacyQuestionConfig>
): ReactionLegacyQuestionConfig {
  const study = createReactionStudyStarter(taskType, overrides);

  return {
    study,
    task: study.task,
    stimulus: study.stimulus,
    response: study.response,
    correctKey: study.correctKey,
    feedback: study.feedback,
    practice: study.practice,
    practiceTrials: study.practiceTrials,
    testTrials: study.testTrials,
    targetFPS: study.targetFPS,
  };
}

function planToBlocks(plan: ReturnType<typeof compileReactionPlan>): ReactionStudyBlock[] {
  const map = new Map<string, ReactionStudyBlock>();

  plan.forEach((planned, index) => {
    const blockId = planned.metadata.blockId || 'block';
    const blockName = humanizeBlockId(blockId);

    if (!map.has(blockId)) {
      map.set(blockId, {
        id: blockId,
        name: blockName,
        kind: planned.metadata.isPractice ? 'practice' : 'test',
        randomizeOrder: false,
        repetitions: 1,
        trials: [],
      });
    }

    const block = map.get(blockId)!;
    block.trials.push(planEntryToTrialTemplate(planned, index));
  });

  return Array.from(map.values());
}

function planEntryToTrialTemplate(
  planned: ReturnType<typeof compileReactionPlan>[number],
  index: number
): ReactionStudyTrialTemplate {
  const trial = planned.trial;

  return {
    id: planned.metadata.trialTemplateId || trial.id || `trial-${index + 1}`,
    name: planned.metadata.condition || trial.id || `Trial ${index + 1}`,
    condition: planned.metadata.condition,
    isTarget: planned.metadata.isTarget,
    isPractice: planned.metadata.isPractice,
    repeat: 1,
    stimulus: trial.stimulus,
    validKeys: trial.validKeys || [],
    correctResponse: trial.correctResponse,
    requireCorrect: trial.requireCorrect,
    fixationMs: trial.fixation?.durationMs,
    fixationType: trial.fixation?.type,
    preStimulusDelayMs: trial.preStimulusDelayMs,
    stimulusDurationMs: trial.stimulusDurationMs,
    responseTimeoutMs: trial.responseTimeoutMs,
    interTrialIntervalMs: trial.interTrialIntervalMs,
    targetFPS: trial.targetFPS,
    backgroundColor: trial.backgroundColor,
    phases: planned.metadata.scheduledPhases,
  };
}

function humanizeBlockId(blockId: string): string {
  return blockId
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
