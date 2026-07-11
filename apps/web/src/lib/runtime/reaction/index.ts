export { ReactionEngine } from './ReactionEngine';
export type {
  ReactionEngineHooks,
  ReactionTrialConfig,
  ReactionTrialResult,
  ReactionResponseCapture,
  ReactionResponseMode,
  ReactionResponseDevice,
  ReactionTargetRegion,
  ReactionStimulusConfig,
  ReactionFixationConfig,
  ReactionTrialFeedbackConfig,
  ScheduledPhase,
  TimingMethod,
  ReactionOffsetMethod,
  // Authored phase durations (ADR 0025).
  TimingSpec,
  UniformTimingSpec,
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

// Enforce-mode visibility re-queue orchestration (F-59, ADR 0027).
export {
  runBlockWithVisibilityRequeue,
  MAX_VISIBILITY_REQUEUES_PER_BLOCK,
} from './blockRequeue';
export type { BlockRequeueOutcome, RunBlockOptions } from './blockRequeue';

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

// WebHID response source (RT-4, ADR 0024).
export { HidSource, HidReportParser } from './input/HidSource';
export type { HidTransition, HidTransitionSource, HidDeviceLike } from './input/HidSource';
export { HidDeviceManager } from './input/HidDeviceManager';
export { containsHidBinding, definitionNeedsHid } from './input/hidBindingScan';

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
  sampleTiming,
  representativeTiming,
  isTimingSpec,
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
