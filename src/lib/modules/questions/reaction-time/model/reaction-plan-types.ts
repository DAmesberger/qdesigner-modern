import type { ReactionTrialConfig } from '$lib/runtime/reaction';
import type { ScheduledPhase } from '$lib/runtime/reaction';
import type { NormalizedReactionConfig, ReactionTaskType } from './reaction-schema';

export interface ReactionTrialMetadata {
  taskType: ReactionTaskType;
  blockId: string;
  isPractice: boolean;
  expectedResponse?: string;
  isTarget?: boolean;
  condition?: string;
  trialTemplateId?: string;
  scheduledPhases?: ScheduledPhase[];
}

export interface PlannedReactionTrial {
  trial: ReactionTrialConfig;
  metadata: ReactionTrialMetadata;
}

export interface CompiledReactionPlan {
  config: NormalizedReactionConfig;
  trials: PlannedReactionTrial[];
}
