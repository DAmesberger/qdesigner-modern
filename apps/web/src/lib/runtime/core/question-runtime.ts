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

export interface QuestionRuntimeContext {
  question: Question;
  questionnaire?: Questionnaire;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  variableEngine: VariableEngine;
  resourceManager: ResourceManager;
  responseCollector: ResponseCollector;
  abortSignal?: AbortSignal;
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
