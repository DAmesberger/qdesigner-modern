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
  value: any;
  reactionTime?: number; // ms from stimulus onset
  stimulusOnsetTime?: number;
  keyPressTime?: number;
  clickPosition?: Position;
  allKeyPresses?: KeyPress[];
  valid: boolean;
  attempts?: number;
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
  value: any;
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
  custom?: Record<string, any>;
  computedVariables?: Record<string, any>;
  aggregations?: Record<string, any>;
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
  value: any;
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