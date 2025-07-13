// Core questionnaire data model

export interface Questionnaire {
  id: string;
  organizationId?: string; // Added for offline sync support
  projectId?: string;
  name: string;
  description?: string;
  code?: string; // Questionnaire code/identifier
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
  formula?: string; // Mathematical expression
  dependencies?: string[]; // Other variable IDs this depends on
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

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message?: string;
  condition?: string; // Formula that must evaluate to true
}

export interface Question {
  id: string;
  type: QuestionType;
  page?: string; // Page ID (deprecated, use blockId)
  blockId?: string; // Block ID this question belongs to
  name?: string; // Question name/identifier
  text?: string; // Question text
  content?: string; // Alternative content field
  instruction?: string; // Instruction text
  required?: boolean; // Whether question is required
  settings?: QuestionSettings; // Question-specific settings
  layout?: LayoutConfig; // Layout configuration
  media?: MediaContent; // Media content
  stimulus?: Stimulus;
  stimuli?: any[]; // Array of stimuli for complex questions
  prompt?: TextContent;
  responseType: ResponseType;
  responseOptions?: ResponseOption[];
  variables?: QuestionVariable[]; // Variables to set based on response
  timing?: TimingConfig;
  conditions?: DisplayCondition[];
  validation?: ValidationRule[];
  randomize?: boolean;
  config?: any; // Additional configuration
  style?: {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fontWeight?: string;
    textAlign?: string;
    lineHeight?: number;
    backgroundColor?: string;
    padding?: string | number;
    margin?: string | number;
    [key: string]: any;
  }; // Style configuration
  code?: string; // Question code/identifier
}

export type QuestionType = 
  | 'text' 
  | 'choice' 
  | 'scale' 
  | 'rating'
  | 'reaction' 
  | 'multimedia'
  | 'instruction'
  | 'webgl'
  | 'custom';

export interface Stimulus {
  id?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'html' | 'composite';
  content: StimulusContent;
  properties?: Record<string, any>;
  position?: Position;
  size?: Size; // Size of the stimulus
  duration?: number; // ms
  delay?: number; // ms before showing
  transition?: TransitionConfig;
}

export interface StimulusContent {
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  html?: string;
  components?: Stimulus[]; // For composite stimuli
  position?: Position;
  size?: Size;
  style?: Record<string, any>;
}

export interface TextContent {
  text: string;
  html?: boolean;
  variables?: string[]; // Variable names to interpolate
}

export type ResponseType = 
  | { type: 'single'; options: ResponseOption[]; required?: boolean; timeout?: number; }
  | { type: 'multiple'; options: ResponseOption[]; required?: boolean; timeout?: number; minChoices?: number; maxChoices?: number; }
  | { type: 'text'; minLength?: number; maxLength?: number; pattern?: string; required?: boolean; timeout?: number; }
  | { type: 'number'; min?: number; max?: number; step?: number; required?: boolean; timeout?: number; }
  | { type: 'scale'; min: number; max: number; step?: number; labels?: string[]; minLabel?: string; maxLabel?: string; required?: boolean; timeout?: number; }
  | { type: 'keypress'; keys: string[]; recordAllKeys?: boolean; required?: boolean; timeout?: number; }
  | { type: 'click'; allowedTargets?: string[]; required?: boolean; timeout?: number; }
  | { type: 'none'; autoAdvance?: boolean; delay?: number; } // For instruction questions
  | { type: 'webgl'; validKeys?: string[]; validTargets?: string[]; recordAllResponses?: boolean; required?: boolean; timeout?: number; }
  | { type: 'custom'; customType: string; config?: any; required?: boolean; timeout?: number; };

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
  key?: string; // Keyboard shortcut key
  hotkey?: string;
  position?: Position;
}

export interface QuestionVariable {
  variableId: string;
  source: 'response' | 'reaction_time' | 'stimulus_onset' | 'custom';
  transform?: string; // Formula to transform the value
}

export interface TimingConfig {
  fixationDuration?: number;
  preDelay?: number;
  stimulusDuration?: number;
  responseDuration?: number;
  postDelay?: number; // Delay after stimulus before next question
  interTrialInterval?: number;
  jitter?: JitterConfig;
}

export interface JitterConfig {
  min: number;
  max: number;
  distribution: 'uniform' | 'normal';
}

export interface QuestionSettings {
  [key: string]: any;
}

export interface PageSettings {
  [key: string]: any;
}

export interface MediaContent {
  type: 'image' | 'video' | 'audio';
  source: string;
  alt?: string;
  caption?: string;
  size?: 'small' | 'medium' | 'large';
  position?: 'above' | 'below' | 'left' | 'right';
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
}

export interface DisplayCondition {
  formula: string; // Expression that must evaluate to true
  action: 'show' | 'hide' | 'skip';
}

export interface Page {
  id: string;
  name?: string;
  title?: string; // Page title
  settings?: PageSettings; // Page-specific settings
  blocks?: Block[]; // Blocks containing questions
  questions?: string[]; // Direct question IDs (for backward compatibility)
  layout?: LayoutConfig;
  transitions?: PageTransition;
  conditions?: DisplayCondition[];
}

export interface Block {
  id: string;
  pageId: string;
  name?: string;
  type: 'standard' | 'randomized' | 'conditional' | 'loop';
  questions: string[]; // Question IDs in this block
  layout?: LayoutConfig;
  conditions?: DisplayCondition[];
  randomization?: RandomizationConfig;
  loop?: LoopConfig;
  metadata?: Record<string, any>;
}

export interface RandomizationConfig {
  enabled: boolean;
  preserveFirst?: number; // Keep first N questions in order
  preserveLast?: number; // Keep last N questions in order
  grouping?: string[][]; // Groups of question IDs that stay together
}

export interface LoopConfig {
  iterations: number | string; // Number or formula
  iterationVariable?: string; // Variable to store current iteration
  exitCondition?: string; // Formula to break loop early
}

export interface LayoutConfig {
  type: 'vertical' | 'horizontal' | 'grid' | 'custom';
  spacing?: number;
  alignment?: 'left' | 'center' | 'right';
  customCss?: string;
  
  // Layout properties
  width?: string | number;
  padding?: string | number;
  margin?: string | number;
  
  // Positioning
  position?: {
    x: number;
    y: number;
  };
  size?: {
    width: number;
    height: number;
  };
  
  // Visual properties
  opacity?: number;
  rotation?: number;
}

export interface PageTransition {
  in?: TransitionConfig;
  out?: TransitionConfig;
}

export interface TransitionConfig {
  type: 'fade' | 'slide' | 'none';
  duration: number;
  easing?: string;
}

export interface FlowControl {
  id: string;
  type: 'branch' | 'loop' | 'randomize' | 'terminate';
  condition?: string; // Formula
  target?: string; // Page or question ID
  config?: FlowConfig;
}

export interface FlowConfig {
  // For loops
  iterations?: number;
  iterationVariable?: string;
  
  // For randomization
  randomizePages?: string[];
  randomizeQuestions?: string[];
  
  // For branching
  branches?: Branch[];
}

export interface Branch {
  condition: string;
  target: string;
}

export interface QuestionnaireSettings {
  allowBackNavigation?: boolean;
  showProgressBar?: boolean;
  randomizePages?: boolean;
  randomizeQuestions?: boolean;
  timeLimit?: number; // Total time in ms
  autoAdvance?: boolean;
  saveProgress?: boolean;
  language?: string;
  theme?: ThemeConfig;
  webgl?: WebGLConfig;
  requireAuthentication?: boolean; // Require user authentication
  requireConsent?: boolean; // Require consent form
  allowAnonymous?: boolean; // Allow anonymous participation
}

export interface ThemeConfig {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: string;
  customCss?: string;
}

export interface WebGLConfig {
  targetFPS: 60 | 120 | 144 | 240;
  vsync?: boolean;
  antialias?: boolean;
  pixelRatio?: number;
}

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