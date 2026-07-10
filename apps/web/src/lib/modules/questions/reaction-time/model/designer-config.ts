import type { ReactionTrialConfig } from '$lib/runtime/reaction';
import type {
  GoNoGoTaskConfig,
  PosnerTaskConfig,
  PvtTaskConfig,
  ReactionFeedbackSettings,
  ReactionStudyConfig,
  RsvpTaskConfig,
  SartTaskConfig,
  SimonTaskConfig,
  SternbergTaskConfig,
  TemporalOrderTaskConfig,
  TimingSpec,
  VisualSearchTaskConfig,
} from './reaction-schema';

/**
 * Designer-facing config shape for the reaction-time question editor. Extracted
 * from the inline definition in ReactionTimeDesigner.svelte (P6-T5) so the parent
 * and the `TaskPresetFields` sub-editor can share a single typed contract.
 */
export type ReactionTaskType =
  | 'standard'
  | 'n-back'
  | 'stroop'
  | 'flanker'
  | 'iat'
  | 'dot-probe'
  | 'go-nogo'
  | 'sart'
  | 'simon'
  | 'posner'
  | 'visual-search'
  | 'sternberg'
  | 'pvt'
  | 'temporal-order'
  | 'rsvp'
  | 'custom';
export type StimulusType = 'text' | 'shape' | 'image' | 'video' | 'audio';
export type ResponseMode = 'keyboard' | 'mouse' | 'touch' | 'gamepad';

export interface MediaStimulusRef {
  mediaId: string;
  mediaUrl?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface ReactionTimeConfig {
  study?: ReactionStudyConfig;
  task: {
    type: ReactionTaskType;
    nBack: {
      n: number;
      sequenceLength: number;
      targetRate: number;
      stimulusSet: string[];
      targetKey: string;
      nonTargetKey: string;
      fixationMs: TimingSpec;
      responseTimeoutMs: TimingSpec;
    };
    stroop: {
      trialCount: number;
      colors: string[];
      congruentRatio: number;
      stimulusDuration: TimingSpec;
      isi: TimingSpec;
      fixationMs: TimingSpec;
      responseTimeoutMs: TimingSpec;
    };
    flanker: {
      trialCount: number;
      stimulusSet: [string, string];
      congruentRatio: number;
      includeNeutral: boolean;
      neutralRatio: number;
      flankerCount: number;
      stimulusDuration: TimingSpec;
      isi: TimingSpec;
      fixationMs: TimingSpec;
      responseTimeoutMs: TimingSpec;
    };
    iat: {
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
      fixationMs: TimingSpec;
      responseTimeoutMs: TimingSpec;
    };
    dotProbe: {
      trialCount: number;
      cueDuration: TimingSpec;
      isi: TimingSpec;
      congruentRatio: number;
      probeSymbol: string;
      stimulusPairs: Array<{ salient: string; neutral: string }>;
      fixationMs: TimingSpec;
      responseTimeoutMs: TimingSpec;
    };
    goNoGo: GoNoGoTaskConfig;
    sart: SartTaskConfig;
    simon: SimonTaskConfig;
    posner: PosnerTaskConfig;
    visualSearch: VisualSearchTaskConfig;
    sternberg: SternbergTaskConfig;
    pvt: PvtTaskConfig;
    temporalOrder: TemporalOrderTaskConfig;
    rsvp: RsvpTaskConfig;
    customTrials: Array<Partial<ReactionTrialConfig>>;
  };
  stimulus: {
    type: StimulusType;
    content: string;
    mediaRef?: MediaStimulusRef;
    fixation?: {
      type: 'cross' | 'dot';
      duration: number;
    };
  };
  response: {
    validKeys: string[];
    timeout: number;
    requireCorrect?: boolean;
    mode?: ResponseMode;
    targetRegion?: { x: number; y: number; radius: number };
    gamepadButtonMap?: Record<number, string>;
    captureKeyUp?: boolean;
  };
  correctKey?: string;
  feedback?: boolean;
  feedbackSettings?: ReactionFeedbackSettings;
  practice?: boolean;
  practiceTrials?: number;
  testTrials?: number;
  targetFPS?: number;
  prompt?: string;
}
