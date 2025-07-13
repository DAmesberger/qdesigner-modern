/**
 * Question Type System v2
 * Comprehensive type-safe question system with proper configuration structure
 */

// ============================================================================
// Base Types and Enums
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
  
  // Statistical
  STATISTICAL_FEEDBACK: 'statistical-feedback'
} as const;

export type QuestionType = typeof QuestionTypes[keyof typeof QuestionTypes];

// ============================================================================
// Common Configuration Types
// ============================================================================

export interface TimingConfig {
  minTime?: number;          // Minimum time before allowing next
  maxTime?: number;          // Maximum time before auto-advance
  showTimer?: boolean;       // Show countdown timer
  warningTime?: number;      // Show warning at this time
}

export interface NavigationConfig {
  showPrevious?: boolean;    // Allow going back
  showNext?: boolean;        // Show next button
  autoAdvance?: boolean;     // Auto-advance after response
  advanceDelay?: number;     // Delay before auto-advance (ms)
}

export interface MediaConfig {
  url: string;
  type: 'image' | 'video' | 'audio';
  alt?: string;
  width?: number;
  height?: number;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
}

export interface StimulusConfig {
  content: string | MediaConfig;
  duration?: number;         // Display duration (ms)
  position?: 'above' | 'below' | 'left' | 'right' | 'background';
}

export interface ValidationRule {
  type: 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value: any;
  message?: string;
  formula?: string;          // For custom validation
}

export interface ConditionalLogic {
  show?: string;             // Formula to determine visibility
  enable?: string;           // Formula to determine if enabled
  require?: string;          // Formula to determine if required
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
  name?: string;             // Internal name for variables
  tags?: string[];           // For organization/filtering
}

// ============================================================================
// Display Configuration Types
// ============================================================================

export interface TextDisplayConfig {
  content: string;
  format: 'text' | 'markdown' | 'html';
  variables?: boolean;       // Enable variable substitution
  styling?: {
    fontSize?: string;
    fontWeight?: string;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
  };
}

export interface MediaDisplayConfig {
  media: MediaConfig;
  caption?: string;
  showControls?: boolean;
  clickToEnlarge?: boolean;
}

export interface ChoiceOption {
  id: string;
  label: string;
  value: string | number;
  image?: MediaConfig;
  hotkey?: string;           // Keyboard shortcut
  exclusive?: boolean;       // For "None of the above" options
}

export interface SingleChoiceDisplayConfig {
  prompt: string;
  instruction?: string;
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';
  columns?: number;          // For grid layout
  showOther?: boolean;
  otherLabel?: string;
  randomizeOptions?: boolean;
}

export interface MultipleChoiceDisplayConfig extends SingleChoiceDisplayConfig {
  minSelections?: number;
  maxSelections?: number;
  selectAllOption?: boolean;
}

export interface ScaleDisplayConfig {
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

export interface RatingDisplayConfig {
  prompt: string;
  instruction?: string;
  levels: number;            // e.g., 5 for 5-star rating
  style: 'stars' | 'hearts' | 'thumbs' | 'numeric';
  allowHalf?: boolean;       // Allow half ratings
  labels?: string[];         // Custom labels for each level
}

export interface TextInputDisplayConfig {
  prompt: string;
  instruction?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;             // For multiline
  maxLength?: number;
  showCharCount?: boolean;
}

export interface NumberInputDisplayConfig {
  prompt: string;
  instruction?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  prefix?: string;           // e.g., "$"
  suffix?: string;           // e.g., "kg"
}

export interface MatrixDisplayConfig {
  prompt: string;
  instruction?: string;
  rows: Array<{ id: string; label: string }>;
  columns: Array<{ id: string; label: string; value: any }>;
  responseType: 'single' | 'multiple' | 'scale' | 'text';
  required?: boolean[];      // Per-row requirements
}

export interface ReactionTimeDisplayConfig {
  instruction: string;
  stimulus: StimulusConfig;
  fixationDuration?: number;
  fixationSymbol?: string;
  responseKey?: string;      // Default: spacebar
  practiceTrials?: number;
}

export interface DateTimeDisplayConfig {
  prompt: string;
  instruction?: string;
  mode: 'date' | 'time' | 'datetime';
  minDate?: string;
  maxDate?: string;
  format?: string;
}

export interface FileUploadDisplayConfig {
  prompt: string;
  instruction?: string;
  accept?: string[];         // MIME types
  maxSize?: number;          // Bytes
  maxFiles?: number;
  dragDrop?: boolean;
}

export interface RankingDisplayConfig {
  prompt: string;
  instruction?: string;
  items: Array<{ id: string; label: string }>;
  allowPartial?: boolean;    // Allow ranking subset
  tieBreaking?: boolean;     // Allow same rank
}

export interface WebGLDisplayConfig {
  prompt?: string;
  sceneConfig: Record<string, any>; // WebGL-specific config
  interactionMode?: 'click' | 'drag' | 'keyboard' | 'custom';
}

export interface StatisticalFeedbackConfig {
  prompt: string;
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram';
  dataSource: string;        // Variable name or formula
  compareWith?: string;      // Normative data variable
  showPercentile?: boolean;
  customization?: Record<string, any>;
}

// ============================================================================
// Response Configuration Types
// ============================================================================

export interface BaseResponseConfig {
  saveAs: string;            // Variable name
  trackTiming?: boolean;     // Track response time
  trackChanges?: boolean;    // Track all value changes
}

export interface SingleChoiceResponseConfig extends BaseResponseConfig {
  valueType: 'value' | 'label' | 'index';
  allowDeselect?: boolean;
  saveOtherAs?: string;      // Variable for "other" text
}

export interface MultipleChoiceResponseConfig extends BaseResponseConfig {
  valueType: 'array' | 'object' | 'binary';
  saveOtherAs?: string;
}

export interface ScaleResponseConfig extends BaseResponseConfig {
  valueType: 'number' | 'string';
  savePositionAs?: string;   // Save slider position separately
}

export interface TextInputResponseConfig extends BaseResponseConfig {
  transform?: 'none' | 'lowercase' | 'uppercase' | 'trim';
  saveMetadata?: boolean;    // Save typing metrics
}

export interface MatrixResponseConfig extends BaseResponseConfig {
  saveFormat: 'nested' | 'flat' | 'separate';
  rowPrefix?: string;        // For separate variables
}

export interface ReactionTimeResponseConfig extends BaseResponseConfig {
  saveAccuracy?: boolean;
  savePractice?: boolean;
  metrics?: ('rt' | 'accuracy' | 'anticipation')[];
}

export interface FileUploadResponseConfig extends BaseResponseConfig {
  storage: 'base64' | 'url' | 'reference';
  saveMetadata?: boolean;    // File size, type, etc.
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
// Question Type Definitions
// ============================================================================

// Display-only questions
export interface TextDisplayQuestion extends BaseQuestion {
  type: typeof QuestionTypes.TEXT_DISPLAY;
  display: TextDisplayConfig;
  // No response config needed
}

export interface InstructionQuestion extends BaseQuestion {
  type: typeof QuestionTypes.INSTRUCTION;
  display: TextDisplayConfig;
  // No response config needed
}

export interface MediaDisplayQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MEDIA_DISPLAY;
  display: MediaDisplayConfig;
  // No response config needed
}

export interface WebGLQuestion extends BaseQuestion {
  type: typeof QuestionTypes.WEBGL;
  display: WebGLDisplayConfig;
  response?: BaseResponseConfig; // Optional for interactive WebGL
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
  validation?: NumberValidation;
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

export interface ReactionTimeQuestion extends BaseQuestion {
  type: typeof QuestionTypes.REACTION_TIME;
  display: ReactionTimeDisplayConfig;
  response: ReactionTimeResponseConfig;
  // No validation needed
}

export interface DateTimeQuestion extends BaseQuestion {
  type: typeof QuestionTypes.DATE_TIME;
  display: DateTimeDisplayConfig;
  response: BaseResponseConfig;
  validation?: TextValidation;
}

export interface FileUploadQuestion extends BaseQuestion {
  type: typeof QuestionTypes.FILE_UPLOAD;
  display: FileUploadDisplayConfig;
  response: FileUploadResponseConfig;
  validation?: FileValidation;
}

export interface MediaResponseQuestion extends BaseQuestion {
  type: typeof QuestionTypes.MEDIA_RESPONSE;
  display: FileUploadDisplayConfig; // Reuse for media capture
  response: FileUploadResponseConfig;
  validation?: FileValidation;
}

export interface StatisticalFeedbackQuestion extends BaseQuestion {
  type: typeof QuestionTypes.STATISTICAL_FEEDBACK;
  display: StatisticalFeedbackConfig;
  // No response needed - display only
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