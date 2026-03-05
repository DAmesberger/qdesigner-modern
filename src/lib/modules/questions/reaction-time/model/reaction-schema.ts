import type { ReactionStimulusConfig, ReactionTrialConfig, ScheduledPhase } from '$lib/runtime/reaction';

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
  stimulusDurationMs?: number;
  responseTimeoutMs?: number;
  interTrialIntervalMs?: number;
  targetFPS?: number;
  backgroundColor?: [number, number, number, number];
  phases?: ScheduledPhase[];
}

export interface ReactionStudyBlock {
  id: string;
  name: string;
  kind: 'practice' | 'test' | 'custom';
  randomizeOrder?: boolean;
  repetitions?: number;
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
  };
  correctKey: string;
  feedback: boolean;
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
  };
  correctKey?: string;
  feedback?: boolean;
  practice?: boolean;
  practiceTrials?: number;
  testTrials?: number;
  targetFPS?: number;
}

export type NormalizedReactionConfig = ReactionStudyConfig;
