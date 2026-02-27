import type { WebGLRenderer } from '$lib/renderer';
import type { VariableEngine } from '$lib/scripting-engine';
import type { ResourceManager } from '../resources/ResourceManager';
import type { ResponseCollector } from './ResponseCollector';

export interface QuestionRuntimeCapabilities {
  supportsTiming: boolean;
  supportsMedia: boolean;
  supportsVariables: boolean;
  supportsHighFrequencySampling: boolean;
}

export interface QuestionRuntimeContext {
  question: any;
  questionnaire?: any;
  canvas: HTMLCanvasElement;
  renderer: WebGLRenderer;
  variableEngine: VariableEngine;
  resourceManager: ResourceManager;
  responseCollector: ResponseCollector;
  abortSignal?: AbortSignal;
}

export interface QuestionRuntimeResult {
  value: any;
  reactionTimeMs?: number | null;
  isCorrect?: boolean | null;
  timedOut?: boolean;
  metadata?: Record<string, any>;
}

export interface IQuestionRuntime {
  readonly type: string;
  readonly capabilities: QuestionRuntimeCapabilities;
  prepare(context: QuestionRuntimeContext): Promise<void>;
  run(context: QuestionRuntimeContext): Promise<QuestionRuntimeResult>;
  teardown(): Promise<void> | void;
}
