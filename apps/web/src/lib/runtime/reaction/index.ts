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
  ScheduledPhase,
  TimingMethod,
} from './types';

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
