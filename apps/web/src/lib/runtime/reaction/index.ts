export { ReactionEngine } from './ReactionEngine';
export type {
  ReactionEngineHooks,
  ReactionTrialConfig,
  ReactionTrialResult,
  ReactionResponseCapture,
  ReactionStimulusConfig,
  ReactionFixationConfig,
  ScheduledPhase,
  TimingMethod,
} from './types';

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
