import type { ReactionTrialConfig } from '$lib/runtime/reaction';
import type { ScheduledPhase } from '$lib/runtime/reaction';
import type {
  NormalizedReactionConfig,
  ReactionPracticeCriterion,
  ReactionTaskType,
} from './reaction-schema';

export interface ReactionTrialMetadata {
  taskType: ReactionTaskType;
  blockId: string;
  isPractice: boolean;
  expectedResponse?: string;
  isTarget?: boolean;
  condition?: string;
  trialTemplateId?: string;
  scheduledPhases?: ScheduledPhase[];
  /**
   * Criterion-based practice gating for this trial's block (E-REACT-4). Present
   * only on study-block practice trials that define a criterion; the runtime
   * groups consecutive trials by block and re-runs the practice group until the
   * accuracy target is met or the attempt budget is exhausted.
   */
  practiceCriterion?: ReactionPracticeCriterion;
}

export interface PlannedReactionTrial {
  trial: ReactionTrialConfig;
  metadata: ReactionTrialMetadata;
}

export interface CompiledReactionPlan {
  config: NormalizedReactionConfig;
  trials: PlannedReactionTrial[];
}
