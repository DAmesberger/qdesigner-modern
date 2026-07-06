import type {
  ReactionResponseMode,
  ReactionStimulusConfig,
  ReactionTargetRegion,
  ReactionTrialConfig,
  ScheduledPhase,
} from '$lib/runtime/reaction';

export type { ReactionResponseMode, ReactionTargetRegion };

export type ReactionTaskType =
  | 'standard'
  | 'n-back'
  | 'stroop'
  | 'flanker'
  | 'iat'
  | 'dot-probe'
  | 'custom';

export type ReactionStimulusType = 'text' | 'shape' | 'image' | 'video' | 'audio';

export interface MediaStimulusRef {
  mediaId: string;
  mediaUrl?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface ReactionStudyTrialTemplate {
  id: string;
  name?: string;
  condition?: string;
  isTarget?: boolean;
  isPractice?: boolean;
  repeat?: number;
  stimulus?: ReactionStimulusConfig | string;
  validKeys?: string[];
  correctResponse?: string;
  requireCorrect?: boolean;
  fixationMs?: number;
  fixationType?: 'cross' | 'dot';
  preStimulusDelayMs?: number;
  /** Frame-accurate cue delay (E-REACT-3); takes precedence over the ms value. */
  preStimulusDelayFrames?: number;
  stimulusDurationMs?: number;
  /** Frame-accurate stimulus exposure (E-REACT-3); takes precedence over the ms value. */
  stimulusDurationFrames?: number;
  responseTimeoutMs?: number;
  interTrialIntervalMs?: number;
  targetFPS?: number;
  backgroundColor?: [number, number, number, number];
  phases?: ScheduledPhase[];
}

/**
 * Criterion-based practice gating (E-REACT-4). When a practice block carries a
 * criterion, the runtime re-runs the block (up to `maxAttempts`) until the
 * participant's accuracy reaches `minAccuracy` before advancing to the test.
 */
export interface ReactionPracticeCriterion {
  /** Minimum proportion correct [0,1] required to advance past the block. */
  minAccuracy: number;
  /** Maximum number of practice passes before advancing regardless. */
  maxAttempts: number;
}

export interface ReactionStudyBlock {
  id: string;
  name: string;
  kind: 'practice' | 'test' | 'custom';
  randomizeOrder?: boolean;
  repetitions?: number;
  practiceCriterion?: ReactionPracticeCriterion;
  trials: ReactionStudyTrialTemplate[];
}

export interface NBackTaskConfig {
  n: number;
  sequenceLength: number;
  targetRate: number;
  stimulusSet: Array<string | ReactionStimulusConfig>;
  targetKey: string;
  nonTargetKey: string;
  fixationMs: number;
  responseTimeoutMs: number;
}

export interface StroopTaskConfig {
  trialCount: number;
  colors: string[];
  congruentRatio: number;
  stimulusDuration: number;
  isi: number;
  fixationMs: number;
  responseTimeoutMs: number;
}

export interface FlankerTaskConfig {
  trialCount: number;
  stimulusSet: [string, string];
  congruentRatio: number;
  includeNeutral: boolean;
  neutralRatio: number;
  flankerCount: number;
  stimulusDuration: number;
  isi: number;
  fixationMs: number;
  responseTimeoutMs: number;
}

export interface IATTaskConfig {
  category1Name: string;
  category1Items: string[];
  category2Name: string;
  category2Items: string[];
  attribute1Name: string;
  attribute1Items: string[];
  attribute2Name: string;
  attribute2Items: string[];
  trialsPerBlock: number;
  practiceTrialsPerBlock: number;
  fixationMs: number;
  responseTimeoutMs: number;
}

export interface DotProbeStimulusPair {
  salient: string;
  neutral: string;
}

export interface DotProbeTaskConfig {
  trialCount: number;
  cueDuration: number;
  isi: number;
  congruentRatio: number;
  probeSymbol: string;
  stimulusPairs: DotProbeStimulusPair[];
  fixationMs: number;
  responseTimeoutMs: number;
}

export type ReactionCustomTrial = Partial<ReactionTrialConfig> & {
  isPractice?: boolean;
  isTarget?: boolean;
  expectedResponse?: string;
  stimulus?: ReactionStimulusConfig | string;
};

export interface ReactionTaskConfig {
  type: ReactionTaskType;
  nBack: NBackTaskConfig;
  stroop: StroopTaskConfig;
  flanker: FlankerTaskConfig;
  iat: IATTaskConfig;
  dotProbe: DotProbeTaskConfig;
  customTrials: ReactionCustomTrial[];
}

/**
 * Trial-level feedback settings (E-REACT-4). The boolean `feedback` toggle
 * enables/disables feedback; these settings shape what is shown when enabled.
 */
export interface ReactionFeedbackSettings {
  mode: 'accuracy' | 'rt' | 'both';
  durationMs: number;
  correctText?: string;
  incorrectText?: string;
  tooSlowText?: string;
}

export interface ReactionStudyConfig {
  schemaVersion: 1;
  task: ReactionTaskConfig;
  blocks: ReactionStudyBlock[];
  stimulus: {
    type: ReactionStimulusType;
    content: string;
    mediaRef?: MediaStimulusRef;
    fixation: {
      type: 'cross' | 'dot';
      duration: number;
    };
  };
  response: {
    validKeys: string[];
    timeout: number;
    requireCorrect: boolean;
    /** Response device family. Defaults to `keyboard`. */
    mode: ReactionResponseMode;
    /** Spatial-response scoring region (mouse/touch), normalized [0,1]. */
    targetRegion?: ReactionTargetRegion;
    /** Gamepad button index → response value mapping. */
    gamepadButtonMap?: Record<number, string>;
    /** Keyboard hold/release capture (records releaseTimestamp/holdDurationMs). */
    captureKeyUp?: boolean;
  };
  correctKey: string;
  feedback: boolean;
  /** Shape of the feedback shown when `feedback` is enabled (E-REACT-4). */
  feedbackSettings?: ReactionFeedbackSettings;
  practice: boolean;
  practiceTrials: number;
  testTrials: number;
  targetFPS: number;
}

export interface ReactionLegacyQuestionConfig {
  study?: Partial<ReactionStudyConfig>;
  task?: Partial<ReactionTaskConfig> & {
    nBack?: Partial<NBackTaskConfig>;
    stroop?: Partial<StroopTaskConfig>;
    flanker?: Partial<FlankerTaskConfig>;
    iat?: Partial<IATTaskConfig>;
    dotProbe?: Partial<DotProbeTaskConfig>;
  };
  blocks?: ReactionStudyBlock[];
  stimulus?: {
    type?: ReactionStimulusType;
    content?: string;
    mediaRef?: MediaStimulusRef;
    fixation?: {
      type?: 'cross' | 'dot';
      duration?: number;
    };
  };
  response?: {
    validKeys?: string[];
    timeout?: number;
    requireCorrect?: boolean;
    mode?: ReactionResponseMode;
    targetRegion?: ReactionTargetRegion;
    gamepadButtonMap?: Record<number, string>;
    captureKeyUp?: boolean;
  };
  correctKey?: string;
  feedback?: boolean;
  feedbackSettings?: Partial<ReactionFeedbackSettings>;
  practice?: boolean;
  practiceTrials?: number;
  testTrials?: number;
  targetFPS?: number;
}

export type NormalizedReactionConfig = ReactionStudyConfig;
