export { ReactionEngine } from './ReactionEngine';
export type {
  ReactionEngineHooks,
  ReactionTrialConfig,
  ReactionTrialResult,
  ReactionResponseCapture,
  ReactionResponseMode,
  ReactionTargetRegion,
  ReactionStimulusConfig,
  ReactionFixationConfig,
  ReactionTrialFeedbackConfig,
  ScheduledPhase,
  TimingMethod,
  ReactionOffsetMethod,
} from './types';

export {
  resolveFeedbackVerdict,
  resolveFeedbackRenderable,
  DEFAULT_FEEDBACK_TEXT,
} from './feedback/feedbackRenderable';
export type { FeedbackVerdict, FeedbackRenderableSpec } from './feedback/feedbackRenderable';

export { FrameCountdown, framesForDurationMs, durationMsForFrames } from './frameScheduler';

export { pointInRegion } from './input/spatialHit';
export { GamepadPoller } from './input/GamepadPoller';
export type {
  GamepadSnapshot,
  GamepadSource,
  GamepadResponse,
  GamepadPollerOptions,
} from './input/GamepadPoller';

// Preset re-exports
export {
  createNBackTrials,
  createStroopTrials,
  createFlankerTrials,
  createIATBlocks,
  flattenIATTrials,
  computeDScore,
  createDotProbeTrials,
  computeAttentionalBias,
} from './presets';

export type {
  NBackPresetConfig,
  NBackTrialConfig,
  StroopPresetConfig,
  StroopTrialConfig,
  StroopColor,
  StroopCongruency,
  FlankerPresetConfig,
  FlankerTrialConfig,
  FlankerCongruency,
  IATPresetConfig,
  IATTrialConfig,
  IATBlockConfig,
  IATBlockType,
  IATCategory,
  IATDScoreResult,
  DotProbePresetConfig,
  DotProbeTrialConfig,
  DotProbeStimulusPair,
  DotProbeCongruency,
  AttentionalBiasResult,
} from './presets';
