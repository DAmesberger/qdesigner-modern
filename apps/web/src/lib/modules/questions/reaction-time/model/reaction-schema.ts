import type {
  CounterbalanceScheme,
  ReactionResponseMode,
  ReactionStimulusConfig,
  ReactionTargetRegion,
  ReactionTrialConfig,
  ScheduledPhase,
  TimingSpec,
} from '$lib/runtime/reaction';

export type { ReactionResponseMode, ReactionTargetRegion, CounterbalanceScheme, TimingSpec };

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

// Phase-duration fields below are `TimingSpec` (ADR 0025): a fixed ms value or a
// per-trial `uniform` distribution the seeded generator samples at materialization.

export interface NBackTaskConfig {
  n: number;
  sequenceLength: number;
  targetRate: number;
  stimulusSet: Array<string | ReactionStimulusConfig>;
  targetKey: string;
  nonTargetKey: string;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface StroopTaskConfig {
  trialCount: number;
  colors: string[];
  congruentRatio: number;
  stimulusDuration: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface FlankerTaskConfig {
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
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface DotProbeStimulusPair {
  salient: string;
  neutral: string;
}

export interface DotProbeTaskConfig {
  trialCount: number;
  cueDuration: TimingSpec;
  isi: TimingSpec;
  congruentRatio: number;
  probeSymbol: string;
  stimulusPairs: DotProbeStimulusPair[];
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

// --- Standard-paradigm library expansion (E-REACT-2). ---

export interface GoNoGoTaskConfig {
  trialCount: number;
  goRatio: number;
  goStimulus: string;
  noGoStimulus: string;
  responseKey: string;
  stimulusDuration: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface SartTaskConfig {
  trialCount: number;
  targetDigit: number;
  digits: number[];
  responseKey: string;
  stimulusDuration: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface SimonTaskConfig {
  trialCount: number;
  congruentRatio: number;
  leftColor: string;
  rightColor: string;
  leftKey: string;
  rightKey: string;
  stimulusDuration: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface PosnerTaskConfig {
  trialCount: number;
  validRatio: number;
  cueDurationMs: TimingSpec;
  soaMs: TimingSpec;
  leftKey: string;
  rightKey: string;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface VisualSearchTaskConfig {
  trialCount: number;
  setSizes: number[];
  targetPresentRatio: number;
  featureSearch: boolean;
  targetChar: string;
  distractorChars: string[];
  presentKey: string;
  absentKey: string;
  stimulusDuration: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface SternbergTaskConfig {
  trialCount: number;
  setSizes: number[];
  targetPresentRatio: number;
  memoryItems: string[];
  presentKey: string;
  absentKey: string;
  encodingMs: TimingSpec;
  retentionMs: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface PvtTaskConfig {
  trialCount: number;
  /**
   * Foreperiod before the target (ADR 0025). Normally a `uniform` spec — the PVT
   * is defined by a random foreperiod. The legacy `minIsiMs`/`maxIsiMs` pair is
   * retained (optional) for back-compat; the normalizer maps it into `isi`.
   */
  isi: TimingSpec;
  /** @deprecated Legacy minimum ISI (ms); superseded by `isi`. */
  minIsiMs?: number;
  /** @deprecated Legacy maximum ISI (ms); superseded by `isi`. */
  maxIsiMs?: number;
  responseKey: string;
  responseTimeoutMs: TimingSpec;
}

export interface TemporalOrderTaskConfig {
  trialCount: number;
  soaSetMs: number[];
  firstKey: string;
  secondKey: string;
  stimulusDuration: TimingSpec;
  isi: TimingSpec;
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
}

export interface RsvpTaskConfig {
  trialCount: number;
  streamLength: number;
  itemDurationMs: TimingSpec;
  targetKey: string;
  targetSet: string[];
  distractorSet: string[];
  fixationMs: TimingSpec;
  responseTimeoutMs: TimingSpec;
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
  goNoGo: GoNoGoTaskConfig;
  sart: SartTaskConfig;
  simon: SimonTaskConfig;
  posner: PosnerTaskConfig;
  visualSearch: VisualSearchTaskConfig;
  sternberg: SternbergTaskConfig;
  pvt: PvtTaskConfig;
  temporalOrder: TemporalOrderTaskConfig;
  rsvp: RsvpTaskConfig;
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
  /**
   * Participant-level counterbalancing schemes (E-REACT-6). Each scheme assigns
   * every participant a level for one factor (block order / key mapping /
   * stimulus subset) via Latin-square, round-robin, or random. The assigned cell
   * is persisted per session so the design is reproducible and exports as a
   * column. Absent / empty ⇒ the legacy single-order behaviour.
   */
  counterbalance?: CounterbalanceScheme[];
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
    goNoGo?: Partial<GoNoGoTaskConfig>;
    sart?: Partial<SartTaskConfig>;
    simon?: Partial<SimonTaskConfig>;
    posner?: Partial<PosnerTaskConfig>;
    visualSearch?: Partial<VisualSearchTaskConfig>;
    sternberg?: Partial<SternbergTaskConfig>;
    pvt?: Partial<PvtTaskConfig>;
    temporalOrder?: Partial<TemporalOrderTaskConfig>;
    rsvp?: Partial<RsvpTaskConfig>;
  };
  blocks?: ReactionStudyBlock[];
  counterbalance?: CounterbalanceScheme[];
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

/**
 * Canonical constructor for a fresh stimulus of a given kind. Extracted from the
 * duplicated stimulus-kind switches that previously lived in TrialTemplateEditor
 * (`setStimulusKind`) and ReactionLabWorkspace (`createStimulus`). Both the
 * reaction-time and reaction-experiment stacks consume this so a newly picked
 * kind always yields a fully-formed, WebGL-renderable config with a centered
 * position. Callers may spread extra fields (e.g. `id`) onto the result.
 */
export function createStimulusForKind(
  kind: ReactionStimulusConfig['kind']
): ReactionStimulusConfig {
  const position = { x: 0, y: 0 };
  switch (kind) {
    case 'shape':
      return { kind: 'shape', shape: 'circle', radiusPx: 80, position };
    case 'image':
      return { kind: 'image', src: '', widthPx: 360, heightPx: 360, position };
    case 'video':
      return {
        kind: 'video',
        src: '',
        autoplay: true,
        muted: true,
        loop: true,
        widthPx: 640,
        heightPx: 360,
        position,
      };
    case 'audio':
      return { kind: 'audio', src: '', autoplay: true, volume: 1, position };
    case 'custom':
      return {
        kind: 'custom',
        shader: 'void main() { gl_FragColor = vec4(0.49, 0.82, 0.98, 1.0); }',
        vertices: [-0.5, -0.5, 0.5, -0.5, 0, 0.5],
        uniforms: {},
        position,
      };
    case 'text':
    default:
      return { kind: 'text', text: 'GO', fontPx: 64, position };
  }
}
