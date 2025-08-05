/**
 * Unified Question Type System
 * Comprehensive type-safe question system with proper configuration structure
 */

// ============================================================================
// Core Questionnaire Types
// ============================================================================

export interface Questionnaire {
  id: string;
  organizationId?: string;
  projectId?: string;
  name: string;
  description?: string;
  code?: string;
  version: string;
  created: Date;
  modified: Date;
  variables: Variable[];
  questions: Question[];
  pages: Page[];
  flow: FlowControl[];
  settings: QuestionnaireSettings;
}

export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  scope: 'global' | 'local' | 'temporary';
  defaultValue?: any;
  formula?: string;
  dependencies?: string[];
  validation?: ValidationRule[];
  description?: string;
  metadata?: Record<string, any>;
}

export type VariableType = 
  | 'number' 
  | 'string' 
  | 'boolean' 
  | 'date' 
  | 'time' 
  | 'array' 
  | 'object'
  | 'reaction_time'
  | 'stimulus_onset';

export interface Page {
  id: string;
  name?: string;
  questions?: string[]; // Question IDs
  blocks?: Block[];
  layout?: LayoutConfig;
  conditions?: DisplayCondition[];
}

export interface Block {
  id: string;
  pageId: string;
  name?: string;
  type: 'standard' | 'randomized' | 'conditional' | 'loop';
  questions: string[]; // Question IDs
  layout?: LayoutConfig;
  randomization?: RandomizationConfig;
  loop?: LoopConfig;
  conditions?: DisplayCondition[];
}

export interface FlowControl {
  id: string;
  type: 'skip' | 'branch' | 'loop' | 'terminate';
  condition: string; // Formula
  target?: string; // Page/Question ID for skip/branch
  iterations?: number; // For loops
}

export interface QuestionnaireSettings {
  allowBackNavigation?: boolean;
  showProgressBar?: boolean;
  saveProgress?: boolean;
  randomizationSeed?: string;
  timeZone?: string;
  language?: string;
  webgl?: WebGLSettings;
  requireConsent?: boolean;
  requireAuthentication?: boolean;
  allowAnonymous?: boolean;
  metadata?: Record<string, any>;
}

export interface QuestionSettings {
  required?: boolean;
  hidden?: boolean;
  readOnly?: boolean;
  showNumber?: boolean;
  randomize?: boolean;
}

export interface PageSettings {
  showTitle?: boolean;
  showProgressBar?: boolean;
  allowNavigation?: boolean;
  autoAdvance?: boolean;
  timeLimit?: number;
}

// ============================================================================
// Question Types and Enums
// ============================================================================

export const QuestionTypes = {
  // Display-only questions
  TEXT_DISPLAY: 'text-display',
  INSTRUCTION: 'instruction',
  MEDIA_DISPLAY: 'media-display',
  WEBGL: 'webgl',
  
  // Input questions
  TEXT_INPUT: 'text-input',
  NUMBER_INPUT: 'number-input',
  
  // Choice questions
  SINGLE_CHOICE: 'single-choice',
  MULTIPLE_CHOICE: 'multiple-choice',
  
  // Scale questions
  SCALE: 'scale',
  RATING: 'rating',
  
  // Advanced questions
  MATRIX: 'matrix',
  RANKING: 'ranking',
  
  // Time-based questions
  REACTION_TIME: 'reaction-time',
  DATE_TIME: 'date-time',
  
  // File questions
  FILE_UPLOAD: 'file-upload',
  MEDIA_RESPONSE: 'media-response',
  
  // Drawing
  DRAWING: 'drawing',
  
  // Statistical
  STATISTICAL_FEEDBACK: 'statistical-feedback'
} as const;

export type QuestionType = typeof QuestionTypes[keyof typeof QuestionTypes];

// ============================================================================
// Common Configuration Types
// ============================================================================

export interface TimingConfig {
  minTime?: number;
  maxTime?: number;
  showTimer?: boolean;
  warningTime?: number;
}

export interface NavigationConfig {
  showPrevious?: boolean;
  showNext?: boolean;
  autoAdvance?: boolean;
  advanceDelay?: number;
}

export interface MediaConfig {
  // Media reference - either URL or media asset ID
  mediaId?: string; // Reference to media asset in media management system
  url?: string; // Direct URL (legacy support or external URLs)
  
  // How this media is referenced in markdown content
  // e.g., ![alt text](media:my-ref-id) would use refId: "my-ref-id"
  refId?: string;
  
  // Media metadata
  type?: 'image' | 'video' | 'audio';
  alt?: string;
  caption?: string;
  
  // Display options (can be overridden in markdown)
  width?: number;
  height?: number;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  size?: 'small' | 'medium' | 'large' | 'full';
}

export interface StimulusConfig {
  content: string | MediaConfig;
  duration?: number;
  position?: 'above' | 'below' | 'left' | 'right' | 'background';
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message?: string;
  condition?: string;
}

export interface ConditionalLogic {
  show?: string;
  enable?: string;
  require?: string;
}

export interface LayoutConfig {
  type: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  spacing?: number;
  alignment?: 'left' | 'center' | 'right';
}

export interface DisplayCondition {
  formula: string;
  target?: 'show' | 'hide' | 'enable' | 'disable';
}

export interface RandomizationConfig {
  type: 'all' | 'subset' | 'latin-square';
  subset?: number;
  fixedPositions?: Record<string, number>;
}

export interface LoopConfig {
  variable: string;
  values: any[];
  shuffle?: boolean;
}

export interface WebGLSettings {
  targetFPS?: number;
  antialias?: boolean;
  pixelRatio?: number;
}

export interface Position {
  x: number;
  y: number;
  z?: number;
}

// ============================================================================
// Display Configuration Types
// ============================================================================

// IMPORTANT: All text fields (prompt, content, instruction, etc.) in display configs
// support markdown by default. Media can be embedded using markdown syntax:
// - Standard URL: ![alt text](https://example.com/image.jpg)
// - Media reference: ![alt text](media:refId) where refId matches a MediaConfig.refId
// - Variables: {{variableName}} can be used in any text field

// Base display configuration with media support - ALL questions can have media
export interface BaseDisplayConfig {
  // Available media assets that can be referenced in markdown content
  media?: MediaConfig[];
  // Whether to process markdown in prompt/content fields (default: true)
  enableMarkdown?: boolean;
}

export interface TextDisplayConfig extends BaseDisplayConfig {
  content: string; // Supports markdown with embedded media references
  format: 'text' | 'markdown' | 'html';
  variables?: boolean; // Enable variable substitution in content
  styling?: {
    fontSize?: string;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
  };
}

export interface MediaDisplayConfig extends BaseDisplayConfig {
  media: MediaConfig[];
  caption?: string;
  showControls?: boolean;
  clickToEnlarge?: boolean;
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: string | number;
  code?: string | number; // For statistical encoding
  image?: MediaConfig;
  hotkey?: string;
  exclusive?: boolean;
}

export interface SingleChoiceDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  showOther?: boolean;
  otherLabel?: string;
  randomizeOptions?: boolean;
}

export interface MultipleChoiceDisplayConfig extends SingleChoiceDisplayConfig {
  minSelections?: number;
  maxSelections?: number;
  selectAllOption?: boolean;
}

export interface ScaleDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  min: number;
  max: number;
  step?: number;
  labels?: {
    min?: string;
    max?: string;
    midpoint?: string;
  };
  showValue?: boolean;
  orientation?: 'horizontal' | 'vertical';
  style?: 'slider' | 'buttons' | 'visual-analog';
}

export interface RatingDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  levels: number;
  style: 'stars' | 'hearts' | 'thumbs' | 'numeric';
  allowHalf?: boolean;
  labels?: string[];
}

export interface TextInputDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  showCharCount?: boolean;
}

export interface NumberInputDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  showSpinButtons?: boolean;
}

export interface MatrixDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  rows: Array<{ id: string; label: string }>;
  columns: Array<{ id: string; label: string; value?: any }>;
  responseType: 'single' | 'multiple' | 'text' | 'number';
  required?: 'all' | 'any' | string[];
}

export interface ReactionTimeDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  stimulus: StimulusConfig;
  fixationDuration?: number;
  fixationSymbol?: string;
  keys: string[];
  correctKey?: string;
  showFeedback?: boolean;
  practice?: boolean;
  practiceTrials?: number;
}

export interface DateTimeDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  mode: 'date' | 'time' | 'datetime';
  minDate?: string;
  maxDate?: string;
  format?: string;
  showCalendar?: boolean;
}

export interface FileUploadDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  accept?: string[];
  maxSize?: number;
  maxFiles?: number;
  dragDrop?: boolean;
}

export interface DrawingDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  canvas?: {
    width?: number;
    height?: number;
    background?: string;
  };
  tools?: Array<'pen' | 'eraser' | 'line' | 'shape'>;
  colors?: string[];
  defaultColor?: string;
  defaultTool?: 'pen' | 'eraser' | 'line' | 'shape';
}

export interface RankingDisplayConfig extends BaseDisplayConfig {
  prompt: string;
  instruction?: string;
  items: Array<{ id: string; label: string }>;
  allowPartial?: boolean;
  tieBreaking?: boolean;
}

export interface WebGLDisplayConfig extends BaseDisplayConfig {
  prompt?: string;
  sceneConfig: Record<string, any>;
  interactionMode?: 'click' | 'drag' | 'keyboard' | 'custom';
}

export interface StatisticalFeedbackConfig extends BaseDisplayConfig {
  prompt: string;
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
  dataSource: string;
  compareWith?: string;
  showPercentile?: boolean;
  customization?: Record<string, any>;
}

// ============================================================================
// Response Configuration Types
// ============================================================================

export interface BaseResponseConfig {
  saveAs: string;
  trackTiming?: boolean;
  trackChanges?: boolean;
}

export interface SingleChoiceResponseConfig extends BaseResponseConfig {
  valueType: 'value' | 'label' | 'index';
  allowDeselect?: boolean;
  saveOtherAs?: string;
}

export interface MultipleChoiceResponseConfig extends BaseResponseConfig {
  valueType: 'array' | 'object' | 'binary';
  saveOtherAs?: string;
}

export interface ScaleResponseConfig extends BaseResponseConfig {
  valueType: 'number' | 'string';
  savePositionAs?: string;
}

export interface TextInputResponseConfig extends BaseResponseConfig {
  transform?: 'none' | 'lowercase' | 'uppercase' | 'trim';
  saveMetadata?: boolean;
}

export interface MatrixResponseConfig extends BaseResponseConfig {
  saveFormat: 'nested' | 'flat' | 'separate';
  rowPrefix?: string;
}

export interface ReactionTimeResponseConfig extends BaseResponseConfig {
  saveAccuracy?: boolean;
  savePractice?: boolean;
  metrics?: ('rt' | 'accuracy' | 'anticipation')[];
}

export interface FileUploadResponseConfig extends BaseResponseConfig {
  storage: 'base64' | 'url' | 'reference';
  saveMetadata?: boolean;
}

export interface DrawingResponseConfig extends BaseResponseConfig {
  storage: 'base64' | 'url' | 'reference';
  saveMetadata?: boolean;
  analysis?: {
    extractFeatures?: boolean;
    detectShapes?: boolean;
    measurePressure?: boolean;
    trackTiming?: boolean;
  };
}

// ============================================================================
// Validation Configuration Types
// ============================================================================

export interface TextValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  customRules?: ValidationRule[];
}

export interface NumberValidation {
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  customRules?: ValidationRule[];
}

export interface ChoiceValidation {
  required?: boolean;
  customRules?: ValidationRule[];
}

export interface FileValidation {
  required?: boolean;
  maxSize?: number;
  allowedTypes?: string[];
  customRules?: ValidationRule[];
}

// ============================================================================
// Base Question Interface
// ============================================================================

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  order: number;
  required: boolean;
  
  // Optional common properties
  randomize?: boolean;
  timing?: TimingConfig;
  navigation?: NavigationConfig;
  conditions?: ConditionalLogic;
  
  // Metadata
  name?: string;
  tags?: string[];
}

// ============================================================================
// Common Types
// ============================================================================

export interface Position {
  x: number;
  y: number;
  z?: number;
  unit?: 'px' | '%' | 'vw' | 'vh';
}

export interface Size {
  width: number;
  height: number;
  unit?: 'px' | '%' | 'vw' | 'vh';
}

// ============================================================================
// Response Types
// ============================================================================

export interface ResponseType {
  type: 'single' | 'multiple' | 'text' | 'number' | 'scale' | 'keypress' | 'click' | 'custom';
  config?: ResponseConfig;
}

export interface ResponseConfig {
  // For keypress
  allowedKeys?: string[];
  recordAllKeys?: boolean;
  
  // For scale
  min?: number;
  max?: number;
  step?: number;
  labels?: string[];
  
  // For text/number
  maxLength?: number;
  pattern?: string;
  
  // General
  timeout?: number; // Max response time in ms
  required?: boolean;
}

export interface ResponseOption {
  id: string;
  value: any;
  label?: string;
  hotkey?: string;
  position?: Position;
}

// ============================================================================
// Question Type Definitions
// ============================================================================

// Display-only questions
export interface TextDisplayQuestion extends BaseQuestion {
  type: typeof QuestionTypes.TEXT_DISPLAY;
  display: TextDisplayConfig;
}

export interface InstructionQuestion extends BaseQuestion {
  type: typeof QuestionTypes.INSTRUCTION;
  display: TextDisplayConfig;
}

export interface MediaDisplayQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MEDIA_DISPLAY;
  display: MediaDisplayConfig;
}

export interface WebGLQuestion extends BaseQuestion {
  type: typeof QuestionTypes.WEBGL;
  display: WebGLDisplayConfig;
  response?: BaseResponseConfig;
}

// Input questions
export interface TextInputQuestion extends BaseQuestion {
  type: typeof QuestionTypes.TEXT_INPUT;
  display: TextInputDisplayConfig;
  response: TextInputResponseConfig;
  validation?: TextValidation;
}

export interface NumberInputQuestion extends BaseQuestion {
  type: typeof QuestionTypes.NUMBER_INPUT;
  display: NumberInputDisplayConfig;
  response: BaseResponseConfig;
  validation?: NumberValidation;
}

// Choice questions
export interface SingleChoiceQuestion extends BaseQuestion {
  type: typeof QuestionTypes.SINGLE_CHOICE;
  display: SingleChoiceDisplayConfig;
  response: SingleChoiceResponseConfig;
  validation?: ChoiceValidation;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MULTIPLE_CHOICE;
  display: MultipleChoiceDisplayConfig;
  response: MultipleChoiceResponseConfig;
  validation?: ChoiceValidation;
}

// Scale questions
export interface ScaleQuestion extends BaseQuestion {
  type: typeof QuestionTypes.SCALE;
  display: ScaleDisplayConfig;
  response: ScaleResponseConfig;
  validation?: NumberValidation;
}

export interface RatingQuestion extends BaseQuestion {
  type: typeof QuestionTypes.RATING;
  display: RatingDisplayConfig;
  response: BaseResponseConfig;
  validation?: ChoiceValidation;
}

// Advanced questions
export interface MatrixQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MATRIX;
  display: MatrixDisplayConfig;
  response: MatrixResponseConfig;
  validation?: ChoiceValidation;
}

export interface RankingQuestion extends BaseQuestion {
  type: typeof QuestionTypes.RANKING;
  display: RankingDisplayConfig;
  response: BaseResponseConfig;
  validation?: ChoiceValidation;
}

// Time-based questions
export interface ReactionTimeQuestion extends BaseQuestion {
  type: typeof QuestionTypes.REACTION_TIME;
  display: ReactionTimeDisplayConfig;
  response: ReactionTimeResponseConfig;
  validation?: ChoiceValidation;
}

export interface DateTimeQuestion extends BaseQuestion {
  type: typeof QuestionTypes.DATE_TIME;
  display: DateTimeDisplayConfig;
  response: BaseResponseConfig;
  validation?: TextValidation;
}

// File questions
export interface FileUploadQuestion extends BaseQuestion {
  type: typeof QuestionTypes.FILE_UPLOAD;
  display: FileUploadDisplayConfig;
  response: FileUploadResponseConfig;
  validation?: FileValidation;
}

export interface MediaResponseQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MEDIA_RESPONSE;
  display: FileUploadDisplayConfig;
  response: FileUploadResponseConfig;
  validation?: FileValidation;
}

export interface DrawingQuestion extends BaseQuestion {
  type: typeof QuestionTypes.DRAWING;
  display: DrawingDisplayConfig;
  response: DrawingResponseConfig;
  validation?: BaseValidation;
}

export interface StatisticalFeedbackQuestion extends BaseQuestion {
  type: typeof QuestionTypes.STATISTICAL_FEEDBACK;
  display: StatisticalFeedbackConfig;
}

// ============================================================================
// Union Type
// ============================================================================

export type Question = 
  | TextDisplayQuestion
  | InstructionQuestion
  | MediaDisplayQuestion
  | WebGLQuestion
  | TextInputQuestion
  | NumberInputQuestion
  | SingleChoiceQuestion
  | MultipleChoiceQuestion
  | ScaleQuestion
  | RatingQuestion
  | MatrixQuestion
  | RankingQuestion
  | ReactionTimeQuestion
  | DateTimeQuestion
  | FileUploadQuestion
  | MediaResponseQuestion
  | DrawingQuestion
  | StatisticalFeedbackQuestion;

// ============================================================================
// Type Guards
// ============================================================================

export function isTextDisplayQuestion(q: Question): q is TextDisplayQuestion {
  return q.type === QuestionTypes.TEXT_DISPLAY;
}

export function isInstructionQuestion(q: Question): q is InstructionQuestion {
  return q.type === QuestionTypes.INSTRUCTION;
}

export function isMediaDisplayQuestion(q: Question): q is MediaDisplayQuestion {
  return q.type === QuestionTypes.MEDIA_DISPLAY;
}

export function isWebGLQuestion(q: Question): q is WebGLQuestion {
  return q.type === QuestionTypes.WEBGL;
}

export function isTextInputQuestion(q: Question): q is TextInputQuestion {
  return q.type === QuestionTypes.TEXT_INPUT;
}

export function isNumberInputQuestion(q: Question): q is NumberInputQuestion {
  return q.type === QuestionTypes.NUMBER_INPUT;
}

export function isSingleChoiceQuestion(q: Question): q is SingleChoiceQuestion {
  return q.type === QuestionTypes.SINGLE_CHOICE;
}

export function isMultipleChoiceQuestion(q: Question): q is MultipleChoiceQuestion {
  return q.type === QuestionTypes.MULTIPLE_CHOICE;
}

export function isScaleQuestion(q: Question): q is ScaleQuestion {
  return q.type === QuestionTypes.SCALE;
}

export function isRatingQuestion(q: Question): q is RatingQuestion {
  return q.type === QuestionTypes.RATING;
}

export function isMatrixQuestion(q: Question): q is MatrixQuestion {
  return q.type === QuestionTypes.MATRIX;
}

export function isRankingQuestion(q: Question): q is RankingQuestion {
  return q.type === QuestionTypes.RANKING;
}

export function isReactionTimeQuestion(q: Question): q is ReactionTimeQuestion {
  return q.type === QuestionTypes.REACTION_TIME;
}

export function isDateTimeQuestion(q: Question): q is DateTimeQuestion {
  return q.type === QuestionTypes.DATE_TIME;
}

export function isFileUploadQuestion(q: Question): q is FileUploadQuestion {
  return q.type === QuestionTypes.FILE_UPLOAD;
}

export function isMediaResponseQuestion(q: Question): q is MediaResponseQuestion {
  return q.type === QuestionTypes.MEDIA_RESPONSE;
}

export function isDrawingQuestion(q: Question): q is DrawingQuestion {
  return q.type === QuestionTypes.DRAWING;
}

export function isStatisticalFeedbackQuestion(q: Question): q is StatisticalFeedbackQuestion {
  return q.type === QuestionTypes.STATISTICAL_FEEDBACK;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function hasResponseConfig(q: Question): boolean {
  return 'response' in q && q.response !== undefined;
}

export function isDisplayOnlyQuestion(q: Question): boolean {
  const displayOnlyTypes: QuestionType[] = [
    QuestionTypes.TEXT_DISPLAY,
    QuestionTypes.INSTRUCTION,
    QuestionTypes.MEDIA_DISPLAY,
    QuestionTypes.STATISTICAL_FEEDBACK
  ];
  return displayOnlyTypes.includes(q.type);
}

export function requiresUserInput(q: Question): boolean {
  return !isDisplayOnlyQuestion(q) && q.type !== QuestionTypes.WEBGL;
}

export function getQuestionVariable(q: Question): string | undefined {
  if (hasResponseConfig(q) && 'response' in q) {
    return q.response?.saveAs;
  }
  return undefined;
}

// ============================================================================
// Legacy Type Mapping (for migration)
// ============================================================================

export type LegacyQuestionType = 
  | 'text'
  | 'instruction'
  | 'choice'
  | 'scale'
  | 'rating'
  | 'reaction'
  | 'multimedia'
  | 'statistical_feedback'
  | 'webgl';

export const LEGACY_TYPE_MAP: Record<LegacyQuestionType, QuestionType> = {
  'text': QuestionTypes.TEXT_INPUT,
  'instruction': QuestionTypes.INSTRUCTION,
  'choice': QuestionTypes.SINGLE_CHOICE,
  'scale': QuestionTypes.SCALE,
  'rating': QuestionTypes.RATING,
  'reaction': QuestionTypes.REACTION_TIME,
  'multimedia': QuestionTypes.MEDIA_DISPLAY,
  'statistical_feedback': QuestionTypes.STATISTICAL_FEEDBACK,
  'webgl': QuestionTypes.WEBGL
};