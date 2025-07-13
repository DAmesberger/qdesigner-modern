// Question Component Architecture Types

import type { Question, QuestionType, ResponseType, ResponseOption, ValidationRule } from '$lib/shared';

// Base interface for all question components
export interface BaseQuestionComponent {
  question: Question;
  mode: 'edit' | 'preview' | 'runtime';
  value?: any;
  disabled?: boolean;
  onResponse?: (value: any) => void;
  onValidation?: (isValid: boolean, errors: string[]) => void;
}

// Extended question types for rich functionality
export interface ExtendedQuestion extends Question {
  // Display properties
  title?: string;
  description?: string;
  helpText?: string;
  placeholder?: string;
  
  // Layout properties
  styling?: QuestionStyling;
  
  // Advanced properties
  scoring?: ScoringConfig;
  feedback?: FeedbackConfig;
  analytics?: AnalyticsConfig;
}

export interface QuestionLayout {
  width?: 'full' | 'half' | 'third' | 'custom';
  customWidth?: string;
  alignment?: 'left' | 'center' | 'right';
  padding?: string;
  margin?: string;
}

export interface QuestionStyling {
  theme?: 'default' | 'minimal' | 'modern' | 'scientific';
  primaryColor?: string;
  fontSize?: string;
  fontFamily?: string;
  customCSS?: string;
  animations?: AnimationConfig;
}

export interface AnimationConfig {
  entrance?: 'fade' | 'slide' | 'scale' | 'none';
  exit?: 'fade' | 'slide' | 'scale' | 'none';
  duration?: number;
  delay?: number;
}

export interface MediaConfig {
  type: 'image' | 'video' | 'audio';
  source: string;
  alt?: string;
  caption?: string;
  position?: 'above' | 'below' | 'left' | 'right' | 'background';
  size?: 'small' | 'medium' | 'large' | 'full';
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
}

export interface ScoringConfig {
  correctAnswer?: any;
  points?: number;
  partialCredit?: boolean;
  scoringFunction?: string; // Custom JS function
}

export interface FeedbackConfig {
  showCorrectAnswer?: boolean;
  correctFeedback?: string;
  incorrectFeedback?: string;
  partialFeedback?: string;
  customFeedback?: Array<{
    condition: string;
    message: string;
  }>;
}

export interface AnalyticsConfig {
  trackTiming?: boolean;
  trackInteractions?: boolean;
  trackFocus?: boolean;
  customEvents?: string[];
}

// Question-specific configurations
export interface TextDisplayConfig {
  content: string;
  markdown?: boolean;
  variables?: boolean; // Enable variable interpolation
  autoAdvance?: {
    enabled: boolean;
    delay: number;
  };
}

export interface MultipleChoiceConfig {
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  randomizeOptions?: boolean;
  otherOption?: boolean;
  exclusiveOptions?: string[]; // Option IDs that are exclusive
}

export interface ChoiceOption extends ResponseOption {
  icon?: string;
  image?: string;
  color?: string;
  description?: string;
  exclusive?: boolean;
}

export interface ScaleConfig {
  min: number;
  max: number;
  step: number;
  labels?: ScaleLabel[];
  displayType: 'slider' | 'buttons' | 'stars' | 'visual-analog';
  showValue?: boolean;
  showLabels?: boolean;
  orientation?: 'horizontal' | 'vertical';
  defaultValue?: number;
}

export interface ScaleLabel {
  value: number;
  label: string;
  description?: string;
}

export interface TextInputConfig {
  inputType: 'text' | 'number' | 'email' | 'tel' | 'url' | 'password';
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  multiline?: boolean;
  rows?: number;
  autoResize?: boolean;
  suggestions?: string[];
}

export interface MatrixConfig {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  responseType: 'radio' | 'checkbox' | 'text' | 'dropdown' | 'scale';
  alternateRowColors?: boolean;
  stickyHeaders?: boolean;
  mobileLayout?: 'accordion' | 'cards' | 'scroll';
}

export interface MatrixRow {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
}

export interface MatrixColumn {
  id: string;
  label: string;
  value: any;
  width?: string;
}

export interface ReactionTimeConfig {
  stimulus: StimulusConfig;
  response: ReactionResponseConfig;
  practice?: boolean;
  feedback?: boolean;
  targetFPS?: 60 | 120 | 144 | 240;
}

export interface StimulusConfig {
  type: 'text' | 'image' | 'shape' | 'custom';
  content: any;
  duration?: number;
  fixation?: {
    show: boolean;
    duration: number;
    type: 'cross' | 'dot' | 'custom';
  };
  mask?: {
    show: boolean;
    duration: number;
    type: string;
  };
}

export interface ReactionResponseConfig {
  type: 'keyboard' | 'mouse' | 'touch';
  validKeys?: string[];
  validTargets?: string[];
  timeout?: number;
  requireCorrect?: boolean;
  recordAllResponses?: boolean;
}

// Question registry for extensibility
export interface QuestionComponentRegistry {
  [key: string]: {
    component: any; // Svelte component
    configComponent?: any; // Configuration UI component
    defaultConfig: any;
    validator?: (config: any) => ValidationResult;
    icon: string;
    category: string;
    description: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Question editor interfaces
export interface QuestionEditorProps {
  question: ExtendedQuestion;
  onChange: (updates: Partial<ExtendedQuestion>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  showAdvanced: boolean;
}

// Response data structure
export interface QuestionResponse {
  questionId: string;
  value: any;
  timestamp: number;
  reactionTime?: number;
  interactions?: InteractionEvent[];
  valid: boolean;
  errors?: string[];
}

export interface InteractionEvent {
  type: 'click' | 'keypress' | 'focus' | 'blur' | 'change';
  timestamp: number;
  data?: any;
}