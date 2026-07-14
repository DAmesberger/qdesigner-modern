import type { Question, Questionnaire } from '@qdesigner/questionnaire-core';
import type { WebGLRenderer } from '$lib/renderer';
import type { VariableEngine } from '@qdesigner/scripting-engine';
import type { ResourceManager } from '../resources/ResourceManager';
import type { ResponseCollector } from './ResponseCollector';

export interface QuestionRuntimeCapabilities {
  supportsTiming: boolean;
  supportsMedia: boolean;
  supportsVariables: boolean;
  supportsHighFrequencySampling: boolean;
}

/**
 * One completed trial, emitted by a v1 reaction runtime the instant the trial
 * finishes (RT-1b per-trial persistence). Carries the fields the offline
 * `filloutTrials` row / server `trials` table need — the question-level response
 * still carries the full block summary unchanged (dual-write). `rtUs` is already
 * microseconds (ms×1000 floored) so the persistence layer never re-scales.
 */
export interface RuntimeTrialEvent {
  questionId: string;
  /** Monotonic trial number within the question (1-based). */
  trialIndex: number;
  /** Reaction paradigm / task type. */
  paradigm: string;
  /** Winning ResponseOption id (ADR 0024), else null. */
  optionId: string | null;
  /** Winning source family (keyboard/pointer/…), else null. */
  source: string | null;
  /** Reaction time in microseconds (ms×1000 floored), else null. */
  rtUs: number | null;
  /** Trial correctness, else null (unscored). */
  correct: boolean | null;
  /**
   * Whether this was a PRACTICE (warm-up) trial. Load-bearing, not decorative:
   * practice RTs are systematically slower and must never pool into a cohort
   * aggregate a participant is shown, so this flag has to survive all the way to
   * `trials.is_practice` (ADR 0028).
   */
  isPractice: boolean;
  /** Materialized (sampled) phase-plan timings for this trial (ADR 0025). */
  sampledTimings: unknown;
  /** Per-trial timing-provenance blob (clocks, latencies, frame health). */
  provenance: unknown;
  /** W-3 invalidation stamp (e.g. `'visibility'`), else null. */
  invalidated: string | null;
}

export interface QuestionRuntimeContext {
  question: Question;
  questionnaire?: Questionnaire;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  variableEngine: VariableEngine;
  resourceManager: ResourceManager;
  responseCollector: ResponseCollector;
  abortSignal?: AbortSignal;
  /**
   * Fired by a v1 reaction runtime for EACH completed trial (RT-1b). The fillout
   * layer wires this to write a `filloutTrials` row immediately (fire-and-forget),
   * so per-trial data is a first-class analytic object that survives independently
   * of the question-level block summary. Absent in the designer preview.
   */
  onTrialComplete?: (trial: RuntimeTrialEvent) => void;
  /**
   * The active session id (E-REACT-6). Reaction runtimes fold it into the
   * randomization seed root so within-block shuffles and the participant's
   * counterbalance cell are deterministic per session and reproducible from the
   * persisted seed + session id + cell.
   */
  sessionId?: string;
  /**
   * Monotonic participant counter (0-based) when the session carries one. Enables
   * exactly-even systematic (round-robin / Latin-square) counterbalancing;
   * absent, assignment falls back to a session-id hash.
   */
  participantNumber?: number;
}

export interface QuestionRuntimeResult {
  value: unknown;
  reactionTimeMs?: number | null;
  isCorrect?: boolean | null;
  timedOut?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IQuestionRuntime {
  readonly type: string;
  readonly capabilities: QuestionRuntimeCapabilities;
  prepare(context: QuestionRuntimeContext): Promise<void>;
  run(context: QuestionRuntimeContext): Promise<QuestionRuntimeResult>;
  teardown(): Promise<void> | void;
}
