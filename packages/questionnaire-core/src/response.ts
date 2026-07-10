// Response data model for questionnaire execution

export interface QuestionnaireSession {
  id: string;
  questionnaireId: string;
  questionnaireVersion: string;
  participantId?: string;
  startTime: number; // timestamp
  endTime?: number;
  status: 'in_progress' | 'completed' | 'abandoned' | 'timed_out';
  responses: Response[];
  variables: VariableState[];
  metadata?: SessionMetadata;
}

export interface Response {
  id: string;
  questionId: string;
  pageId?: string;
  timestamp: number;
  value: unknown;
  reactionTime?: number; // ms from stimulus onset
  stimulusOnsetTime?: number;
  keyPressTime?: number;
  clickPosition?: Position;
  allKeyPresses?: KeyPress[];
  valid: boolean;
  attempts?: number;
  /**
   * True when this response was produced by a per-question deadline elapsing
   * (E-FLOW-5) rather than a deliberate participant submission. An `auto-submit`
   * timeout carries the partial value with `timedOut: true`; a `skip` timeout carries
   * a null value. Folded into the QualityReport timeout dimension so researchers can
   * flag rushed / abandoned items.
   */
  timedOut?: boolean;
  /**
   * Zero-based loop iteration this response belongs to (E-FLOW-4). Absent for
   * items presented outside a loop block. Combined with `questionId` it makes each
   * looped answer distinct: exports emit one row per (questionId, iterationIndex).
   */
  iterationIndex?: number;
  /**
   * The loop item value active for the iteration that produced this response
   * (roster entry, stimulus name, trial descriptor, …). Absent outside a loop.
   */
  loopValue?: unknown;
  metadata?: ResponseMetadata;
}

export interface KeyPress {
  key: string;
  timestamp: number;
  duration?: number; // For key hold
}

export interface Position {
  x: number;
  y: number;
  timestamp: number;
}

export interface VariableState {
  variableId: string;
  value: unknown;
  timestamp: number;
  source?: string; // What set this value
}

export interface SessionMetadata {
  userAgent?: string;
  screenResolution?: string;
  refreshRate?: number;
  webGLSupported?: boolean;
  timezone?: string;
  locale?: string;
  custom?: Record<string, unknown>;
  computedVariables?: Record<string, unknown>;
  aggregations?: Record<string, unknown>;
  qualityReport?: Record<string, unknown>;
  /**
   * Present only when the session ended via an eligibility screen-out (F-20) —
   * either a `terminate` flow rule carrying screen-out fields or a structured
   * {@link ScreenerRule}. Its presence is what distinguishes a screened-out
   * session from a natural completion, so the runtime writes it and the fillout
   * page routes to the screened-out screen (never the thank-you). Queryable
   * server-side for ineligibility analytics.
   */
  screenOut?: {
    reason: string;
    ruleId: string | null;
    message?: string;
    redirectUrl?: string;
    at: string;
  };
}

export interface ResponseMetadata {
  renderTime?: number; // Time to render the question
  firstInteraction?: number; // Time to first user interaction
  totalTime?: number; // Total time on question
  corrections?: number; // Number of times answer was changed
  mouseMovements?: MouseTrackingData;
  eyeTracking?: EyeTrackingData;
}

export interface MouseTrackingData {
  positions: Position[];
  clicks: Position[];
  totalDistance?: number;
  averageSpeed?: number;
}

export interface EyeTrackingData {
  fixations: Fixation[];
  saccades: Saccade[];
  heatmap?: HeatmapData;
}

export interface Fixation {
  x: number;
  y: number;
  duration: number;
  timestamp: number;
}

export interface Saccade {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
  timestamp: number;
}

export interface HeatmapData {
  width: number;
  height: number;
  data: number[][]; // 2D array of fixation densities
}

// Export formats
export interface ExportData {
  format: 'csv' | 'spss' | 'json' | 'excel';
  sessions: QuestionnaireSession[];
  questionnaire: QuestionnaireMetadata;
  options?: ExportOptions;
}

export interface QuestionnaireMetadata {
  id: string;
  name: string;
  description?: string;
  version: string;
  variables: VariableMetadata[];
  questions: QuestionMetadata[];
}

export interface VariableMetadata {
  id: string;
  name: string;
  type: string;
  label?: string;
  values?: ValueLabel[];
}

export interface ValueLabel {
  value: unknown;
  label: string;
}

export interface QuestionMetadata {
  id: string;
  type: string;
  label?: string;
  responseType: string;
}

export interface ExportOptions {
  includeMetadata?: boolean;
  includeTimingData?: boolean;
  includeRawResponses?: boolean;
  dateFormat?: string;
  delimiter?: string;
  encoding?: string;
}