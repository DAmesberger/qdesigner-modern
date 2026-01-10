/**
 * Data Pipeline Types
 * Type definitions for the QDesigner Modern data pipeline system
 */

import type { 
  QuestionnaireSession, 
  Response, 
  QuestionnaireMetadata, 
  ExportOptions 
} from '$lib/shared/types/response';
import type { Question } from '$lib/shared/types/questionnaire';

// ============================================================================
// Core Pipeline Types
// ============================================================================

export interface PipelineConfig {
  batchSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  backpressureThreshold?: number;
  enableStreaming?: boolean;
  queueTimeout?: number;
}

export interface PipelineContext {
  sessionId: string;
  questionnaireId: string;
  organizationId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Streaming Types
// ============================================================================

export interface StreamingConfig {
  enabled: boolean;
  bufferSize?: number;
  flushInterval?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  compression?: boolean;
}

export interface StreamMessage {
  id: string;
  type: 'response' | 'progress' | 'error' | 'complete';
  sessionId: string;
  data: any;
  timestamp: number;
  sequence?: number;
}

export interface StreamSubscription {
  id: string;
  sessionId: string;
  callback: (message: StreamMessage) => void;
  filters?: StreamFilter[];
}

export interface StreamFilter {
  type: 'question' | 'responseType' | 'custom';
  value: string | RegExp | ((message: StreamMessage) => boolean);
  operator?: 'equals' | 'contains' | 'matches';
}

export interface BackpressureStatus {
  queueSize: number;
  threshold: number;
  isBackpressured: boolean;
  estimatedDelay: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  transformed?: any;
}

export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
  constraint?: any;
}

export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidationRule {
  name: string;
  type: 'schema' | 'business' | 'statistical' | 'custom';
  rule: (value: any, context?: ValidationContext) => ValidationResult;
  priority?: number;
  enabled?: boolean;
}

export interface ValidationContext {
  question: Question;
  session: QuestionnaireSession;
  previousResponses?: Response[];
  metadata?: Record<string, any>;
}

export interface SchemaDefinition {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'date';
  required?: boolean;
  properties?: Record<string, SchemaDefinition>;
  items?: SchemaDefinition;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: any[];
  custom?: (value: any) => boolean;
}

// ============================================================================
// Transformation Types
// ============================================================================

export interface TransformationPipeline {
  stages: TransformationStage[];
  parallel?: boolean;
  stopOnError?: boolean;
}

export interface TransformationStage {
  name: string;
  type: 'normalize' | 'compute' | 'aggregate' | 'filter' | 'custom';
  transformer: Transformer;
  condition?: (data: any, context: TransformationContext) => boolean;
  order?: number;
}

export interface Transformer {
  name: string;
  transform: (data: any, context: TransformationContext) => TransformationResult | Promise<TransformationResult>;
  supports: (data: any) => boolean;
}

export interface TransformationResult {
  success: boolean;
  data?: any;
  errors?: string[];
  warnings?: string[];
  metadata?: Record<string, any>;
}

export interface TransformationContext {
  questionnaire: QuestionnaireMetadata;
  session: QuestionnaireSession;
  pipeline: TransformationPipeline;
  stage: number;
  metadata?: Record<string, any>;
}

export interface ComputedVariable {
  id: string;
  name: string;
  formula: string;
  dependencies: string[];
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';
  scope: 'response' | 'session' | 'global';
}

export interface AggregationConfig {
  groupBy?: string[];
  functions: AggregationFunction[];
  filters?: FilterConfig[];
}

export interface AggregationFunction {
  name: string;
  type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'std' | 'custom';
  field: string;
  output: string;
  condition?: string;
  customFn?: (values: any[]) => any;
}

export interface FilterConfig {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'regex';
  value: any;
}

// ============================================================================
// Export Types
// ============================================================================

export interface ExportRequest {
  format: ExportFormat;
  sessions: QuestionnaireSession[];
  questionnaire: QuestionnaireMetadata;
  options?: ExportOptions;
  transformations?: TransformationPipeline;
  metadata?: ExportMetadata;
}

export type ExportFormat = 'csv' | 'spss' | 'r' | 'excel' | 'json' | 'custom';

export interface ExportMetadata {
  title?: string;
  description?: string;
  author?: string;
  organization?: string;
  created?: Date;
  version?: string;
  tags?: string[];
  custom?: Record<string, any>;
  
  // Export process tracking
  exportedAt?: Date | string;
  sessionCount?: number;
  questionnaireId?: string;
  rows?: number;
  columns?: number;
  variables?: number;
  encoding?: string;
  worksheets?: number;
  totalResponses?: number;
  sessions?: number;
  
  // Format specific
  hasLabels?: boolean;
  variableLabels?: boolean;
  valueLabels?: boolean;
  syntaxFile?: string;
  packageFormat?: string;
  hasFactors?: boolean;
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  data?: any;
  filename?: string;
  size?: number;
  errors?: string[];
  warnings?: string[];
  metadata?: ExportMetadata;
}

export interface CSVExportOptions extends ExportOptions {
  separator?: string;
  quote?: string;
  escape?: string;
  header?: boolean;
  encoding?: 'utf8' | 'utf16' | 'latin1';
  dateFormat?: string;
  timeFormat?: string;
  booleanFormat?: 'true/false' | '1/0' | 'yes/no';
}

export interface SPSSExportOptions extends ExportOptions {
  version?: string;
  compression?: boolean;
  variableLabels?: boolean;
  valueLabels?: boolean;
  longVariableNames?: boolean;
  syntax?: boolean;
}

export interface RExportOptions extends ExportOptions {
  packageFormat?: 'data.frame' | 'tibble' | 'data.table';
  factorEncoding?: boolean;
  dateClass?: 'Date' | 'POSIXct' | 'character';
  script?: boolean;
  rds?: boolean;
}

export interface ExcelExportOptions extends ExportOptions {
  worksheets?: ExcelWorksheet[];
  formatting?: ExcelFormatting;
  charts?: ExcelChart[];
  protection?: ExcelProtection;
}

export interface ExcelWorksheet {
  name: string;
  data: any[];
  headers?: string[];
  frozen?: { rows?: number; cols?: number };
  filters?: boolean;
}

export interface ExcelFormatting {
  headers?: ExcelCellFormat;
  data?: ExcelCellFormat;
  alternatingRows?: boolean;
  borders?: boolean;
}

export interface ExcelCellFormat {
  font?: { name?: string; size?: number; bold?: boolean; color?: string };
  fill?: { type?: string; color?: string };
  alignment?: { horizontal?: string; vertical?: string };
  numberFormat?: string;
}

export interface ExcelChart {
  type: 'column' | 'line' | 'pie' | 'scatter' | 'bar';
  title: string;
  data: { labels: string[]; values: number[] };
  position: { row: number; col: number };
}

export interface ExcelProtection {
  password?: string;
  sheet?: boolean;
  structure?: boolean;
  windows?: boolean;
}

// ============================================================================
// Queue Types
// ============================================================================

export interface QueueItem<T = any> {
  id: string;
  data: T;
  priority: number;
  retries: number;
  maxRetries: number;
  delay: number;
  created: number;
  scheduled: number;
  attempts: QueueAttempt[];
}

export interface QueueAttempt {
  timestamp: number;
  duration: number;
  success: boolean;
  error?: string;
}

export interface QueueConfig {
  maxSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  priorityLevels?: number;
  concurrency?: number;
  timeout?: number;
}

export interface QueueStatus {
  size: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  throughput: number;
}

export interface QueueMetrics {
  totalProcessed: number;
  totalFailed: number;
  avgWaitTime: number;
  avgProcessingTime: number;
  throughputPerSecond: number;
  errorRate: number;
  currentLoad: number;
}

// ============================================================================
// Batch Processing Types
// ============================================================================

export interface BatchJob<T = any> {
  id: string;
  name: string;
  type: 'export' | 'transform' | 'validate' | 'analyze' | 'custom';
  data: T[];
  config: BatchConfig;
  status: BatchStatus;
  progress: BatchProgress;
  result?: BatchResult;
  created: number;
  started?: number;
  completed?: number;
  metadata?: Record<string, any>;
}

export interface BatchConfig {
  batchSize: number;
  maxConcurrency: number;
  timeout: number;
  retryOnFailure: boolean;
  maxRetries: number;
  retryDelay: number;
  stopOnError: boolean;
  parallelProcessing: boolean;
}

export type BatchStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface BatchProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  percentage: number;
  estimatedTimeRemaining?: number;
  currentBatch?: number;
  batchProgress?: number;
}

export interface BatchResult {
  success: boolean;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  duration: number;
  throughput: number;
  errors: BatchError[];
  warnings: string[];
  data?: any;
}

export interface BatchError {
  itemId: string;
  batch: number;
  attempt: number;
  error: string;
  timestamp: number;
}

export interface BatchProcessor<T = any, R = any> {
  name: string;
  process: (items: T[], context: BatchContext) => Promise<R[]>;
  supports: (item: T) => boolean;
  maxBatchSize?: number;
  timeout?: number;
}

export interface BatchContext {
  job: BatchJob;
  batch: number;
  totalBatches: number;
  startTime: number;
  metadata?: Record<string, any>;
}

// ============================================================================
// Event Types
// ============================================================================

export interface PipelineEvent {
  id: string;
  type: PipelineEventType;
  source: string;
  timestamp: number;
  data: any;
  context?: PipelineContext;
}

export type PipelineEventType = 
  | 'response.received'
  | 'response.validated' 
  | 'response.transformed'
  | 'response.exported'
  | 'batch.started'
  | 'batch.progress'
  | 'batch.completed'
  | 'batch.failed'
  | 'queue.full'
  | 'queue.empty'
  | 'stream.connected'
  | 'stream.disconnected'
  | 'error.occurred'
  | 'warning.issued';

export interface PipelineEventHandler {
  handle: (event: PipelineEvent) => void | Promise<void>;
  filter?: (event: PipelineEvent) => boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export interface PipelineError extends Error {
  code: string;
  type: 'validation' | 'transformation' | 'export' | 'queue' | 'stream' | 'system';
  context?: any;
  recoverable: boolean;
  timestamp: number;
}

export interface ErrorRecoveryStrategy {
  type: 'retry' | 'skip' | 'fallback' | 'manual';
  maxAttempts?: number;
  delay?: number;
  condition?: (error: PipelineError) => boolean;
  action?: (error: PipelineError) => any;
}