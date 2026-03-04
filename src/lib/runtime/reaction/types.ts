import type { RGBAColor, FrameSample, FrameStats } from '$lib/shared';

export type ReactionResponseMode = 'keyboard' | 'mouse' | 'touch';

export interface ReactionFixationConfig {
  enabled?: boolean;
  type?: 'cross' | 'dot';
  durationMs?: number;
  color?: RGBAColor;
  sizePx?: number;
}

export interface ReactionStimulusBase {
  id?: string;
  position?: { x: number; y: number };
}

export interface ShapeStimulusConfig extends ReactionStimulusBase {
  kind: 'shape';
  shape: 'circle' | 'square' | 'rectangle' | 'triangle';
  color?: RGBAColor;
  widthPx?: number;
  heightPx?: number;
  radiusPx?: number;
}

export interface TextStimulusConfig extends ReactionStimulusBase {
  kind: 'text';
  text: string;
  color?: RGBAColor;
  fontPx?: number;
  fontFamily?: string;
}

export interface ImageStimulusConfig extends ReactionStimulusBase {
  kind: 'image';
  src: string;
  widthPx?: number;
  heightPx?: number;
}

export interface VideoStimulusConfig extends ReactionStimulusBase {
  kind: 'video';
  src: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  widthPx?: number;
  heightPx?: number;
}

export interface AudioStimulusConfig extends ReactionStimulusBase {
  kind: 'audio';
  src: string;
  volume?: number;
  autoplay?: boolean;
}

export interface CustomStimulusConfig extends ReactionStimulusBase {
  kind: 'custom';
  shader: string;
  vertices: number[];
  uniforms?: Record<string, number | number[] | boolean>;
}

export type ReactionStimulusConfig =
  | ShapeStimulusConfig
  | TextStimulusConfig
  | ImageStimulusConfig
  | VideoStimulusConfig
  | AudioStimulusConfig
  | CustomStimulusConfig;

export interface ScheduledPhase {
  name: string;
  durationMs: number;
  allowResponse?: boolean;
  marksStimulusOnset?: boolean;
}

export interface ReactionTrialConfig {
  id: string;
  responseMode?: ReactionResponseMode;
  validKeys?: string[];
  correctResponse?: string;
  requireCorrect?: boolean;
  fixation?: ReactionFixationConfig;
  preStimulusDelayMs?: number;
  stimulus: ReactionStimulusConfig;
  stimulusDurationMs?: number;
  responseTimeoutMs?: number;
  interTrialIntervalMs?: number;
  targetFPS?: number;
  vsync?: boolean;
  backgroundColor?: RGBAColor;
  allowResponseDuringPreStimulus?: boolean;
}

export type TimingMethod =
  | 'event.timeStamp'
  | 'rvfc'
  | 'audioContext'
  | 'performance.now';

export interface ReactionResponseCapture {
  source: ReactionResponseMode;
  value: string | { x: number; y: number };
  timestamp: number;
  reactionTimeMs: number;
  timingMethod?: TimingMethod;
}

export interface ReactionPhaseMark {
  name: string;
  startTime: number;
  endTime: number;
}

export interface ReactionTrialResult {
  trialId: string;
  startedAt: number;
  stimulusOnsetTime: number | null;
  stimulusTimingMethod?: TimingMethod;
  response: ReactionResponseCapture | null;
  isCorrect: boolean | null;
  timeout: boolean;
  frameLog: FrameSample[];
  phaseTimeline: ReactionPhaseMark[];
  stats: FrameStats;
}

export interface ReactionEngineHooks {
  onFrame?: (sample: FrameSample, stats: FrameStats) => void;
  onPhaseChange?: (phase: string, startedAt: number) => void;
  onResponse?: (response: ReactionResponseCapture) => void;
}
