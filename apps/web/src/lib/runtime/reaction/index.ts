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
  // ResponseSet model (ADR 0024).
  ResponseSet,
  ResponseOption,
  Binding,
  ResponseSourceKind,
  KeyboardBinding,
  PointerBinding,
  TouchBinding,
  GamepadBinding,
  HidBinding,
} from './types';

// Legacy → ResponseSet compilation (ADR 0024).
export { compileLegacyResponse } from './responseSet';
export type { LegacyResponseInput } from './responseSet';

export {
  resolveFeedbackVerdict,
  resolveFeedbackRenderable,
  DEFAULT_FEEDBACK_TEXT,
} from './feedback/feedbackRenderable';
export type { FeedbackVerdict, FeedbackRenderableSpec } from './feedback/feedbackRenderable';

export { FrameCountdown, framesForDurationMs, durationMsForFrames } from './frameScheduler';

// Participant-level counterbalancing (E-REACT-6)
export {
  assignCounterbalance,
  blockOrderPermutation,
  findFactorAssignment,
  emptyCounterbalanceAssignment,
} from './counterbalance';
export type {
  CounterbalanceFactor,
  CounterbalanceMethod,
  CounterbalanceScheme,
  CounterbalanceFactorAssignment,
  CounterbalanceAssignment,
  CounterbalanceContext,
} from './counterbalance';

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
  iatBlockSequence,
  createDotProbeTrials,
  computeAttentionalBias,
  createGoNoGoTrials,
  createSartTrials,
  createSimonTrials,
  createPosnerTrials,
  createVisualSearchTrials,
  createSternbergTrials,
  createPvtTrials,
  createTemporalOrderTrials,
  createRsvpTrials,
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
  GoNoGoPresetConfig,
  GoNoGoTrialConfig,
  GoNoGoCondition,
  SartPresetConfig,
  SartTrialConfig,
  SartCondition,
  SimonPresetConfig,
  SimonTrialConfig,
  SimonColor,
  SimonCongruency,
  PosnerPresetConfig,
  PosnerTrialConfig,
  PosnerValidity,
  VisualSearchPresetConfig,
  VisualSearchTrialConfig,
  SternbergPresetConfig,
  SternbergTrialConfig,
  PvtPresetConfig,
  PvtTrialConfig,
  TemporalOrderPresetConfig,
  TemporalOrderTrialConfig,
  RsvpPresetConfig,
  RsvpTrialConfig,
} from './presets';
