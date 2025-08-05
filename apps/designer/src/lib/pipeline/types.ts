// Data Pipeline Types

export interface PipelineStage<TInput = any, TOutput = any> {
  id: string;
  name: string;
  type: 'validation' | 'transformation' | 'enrichment' | 'storage' | 'notification';
  process: (input: TInput, context: PipelineContext) => Promise<TOutput>;
  onError?: (error: Error, input: TInput, context: PipelineContext) => Promise<void>;
  enabled?: boolean;
  priority?: number;
}

export interface PipelineContext {
  sessionId: string;
  questionnaireId: string;
  participantId: string;
  timestamp: number;
  metadata: Map<string, any>;
  errors: PipelineError[];
  warnings: string[];
}

export interface PipelineError {
  stage: string;
  error: Error;
  timestamp: number;
  recovered: boolean;
}

export interface ResponseData {
  id: string;
  questionId: string;
  questionnaireId: string;
  sessionId: string;
  participantId: string;
  value: any;
  timestamp: number;
  reactionTime?: number;
  metadata?: Record<string, any>;
  validation?: ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  sanitizedValue?: any;
}

export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  value?: any;
}

export interface TransformationRule {
  id: string;
  name: string;
  condition?: string;
  transformations: Transformation[];
}

export interface Transformation {
  field: string;
  type: 'map' | 'filter' | 'compute' | 'normalize' | 'aggregate';
  config: any;
}

export interface BatchConfig {
  batchSize: number;
  flushInterval: number; // milliseconds
  maxRetries: number;
  retryDelay: number;
  parallelism: number;
}

export interface StreamConfig {
  bufferSize: number;
  backpressureThreshold: number;
  timeout: number;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export interface StorageAdapter {
  name: string;
  type: 'database' | 'file' | 'cloud' | 'memory';
  store: (data: ResponseData[], context: PipelineContext) => Promise<void>;
  retrieve?: (query: any) => Promise<ResponseData[]>;
  flush?: () => Promise<void>;
}

export interface ExportConfig {
  format: 'csv' | 'json' | 'spss' | 'excel' | 'parquet';
  destination: 'file' | 'cloud' | 'api';
  options: Record<string, any>;
  schedule?: ExportSchedule;
}

export interface ExportSchedule {
  type: 'immediate' | 'interval' | 'cron' | 'event';
  value: string | number;
  timezone?: string;
}

export interface PipelineMetrics {
  processed: number;
  failed: number;
  latency: number[];
  throughput: number;
  errors: PipelineError[];
  lastProcessed?: number;
  startTime: number;
}