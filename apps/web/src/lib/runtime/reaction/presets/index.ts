export { createNBackTrials } from './nBack';
export type { NBackPresetConfig, NBackTrialConfig } from './nBack';

export { createStroopTrials } from './stroop';
export type { StroopPresetConfig, StroopTrialConfig, StroopColor, StroopCongruency } from './stroop';

export { createFlankerTrials } from './flanker';
export type { FlankerPresetConfig, FlankerTrialConfig, FlankerCongruency } from './flanker';

export { createIATBlocks, flattenIATTrials, computeDScore, iatBlockSequence } from './iat';
export type {
  IATPresetConfig,
  IATTrialConfig,
  IATBlockConfig,
  IATBlockType,
  IATCategory,
  IATDScoreResult,
} from './iat';

export { createDotProbeTrials, computeAttentionalBias } from './dotProbe';
export type {
  DotProbePresetConfig,
  DotProbeTrialConfig,
  DotProbeStimulusPair,
  DotProbeCongruency,
  AttentionalBiasResult,
} from './dotProbe';

// Standard-paradigm library expansion (E-REACT-2).
export { createGoNoGoTrials } from './goNoGo';
export type { GoNoGoPresetConfig, GoNoGoTrialConfig, GoNoGoCondition } from './goNoGo';

export { createSartTrials } from './sart';
export type { SartPresetConfig, SartTrialConfig, SartCondition } from './sart';

export { createSimonTrials } from './simon';
export type { SimonPresetConfig, SimonTrialConfig, SimonColor, SimonCongruency } from './simon';

export { createPosnerTrials } from './posner';
export type { PosnerPresetConfig, PosnerTrialConfig, PosnerValidity } from './posner';

export { createVisualSearchTrials } from './visualSearch';
export type { VisualSearchPresetConfig, VisualSearchTrialConfig } from './visualSearch';

export { createSternbergTrials } from './sternberg';
export type { SternbergPresetConfig, SternbergTrialConfig } from './sternberg';

export { createPvtTrials } from './pvt';
export type { PvtPresetConfig, PvtTrialConfig } from './pvt';

export { createTemporalOrderTrials } from './temporalOrder';
export type { TemporalOrderPresetConfig, TemporalOrderTrialConfig } from './temporalOrder';

export { createRsvpTrials } from './rsvp';
export type { RsvpPresetConfig, RsvpTrialConfig } from './rsvp';

export { createSeededRng, shuffle } from './random';
