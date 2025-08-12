// Core module types and interfaces

import type { ComponentType } from 'svelte';
import type { Question, ConditionalLogic } from '$lib/shared';

// Module categories
// - display: Components that only show content (no user response)
// - question: Interactive components that collect user responses
export type ModuleCategory = 'display' | 'question';

// Base module metadata
export interface ModuleMetadata {
  type: string;
  category: ModuleCategory;
  name: string;
  icon: string;
  description: string;
  capabilities: ModuleCapabilities;
  components: ModuleComponents;
  defaultConfig?: any;
  answerType?: AnswerType; // Only for questions
}

// Module capabilities
export interface ModuleCapabilities {
  supportsScripting?: boolean;
  supportsConditionals?: boolean;
  supportsValidation?: boolean;
  supportsAnalytics?: boolean;
  supportsTiming?: boolean;
  supportsMedia?: boolean;
  supportsVariables?: boolean;
}

// Module component loaders
export interface ModuleComponents {
  runtime: () => Promise<{ default: ComponentType }>;
  designer: () => Promise<{ default: ComponentType }>;
}

// Answer type definition for questions
export interface AnswerType {
  type: string;
  dataType: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';
  aggregations: string[]; // Available aggregation functions
  transformations: string[]; // Available transformation functions
  schema: any; // TypeScript schema for the answer
}

// Storage interface
export interface ModuleStorage {
  save(id: string, data: any): Promise<void>;
  load(id: string): Promise<any>;
  clear(id: string): Promise<void>;
  getAll(): Promise<Record<string, any>>;
}

// Validator interface
export interface ModuleValidator {
  validate(value: any, config: any): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Component props interfaces
export interface InstructionProps {
  instruction: InstructionConfig;
  mode: 'edit' | 'preview' | 'runtime';
  onUpdate?: (updates: Partial<InstructionConfig>) => void;
  onInteraction?: (event: InteractionEvent) => void;
}

export interface QuestionProps {
  question: Question;
  mode: 'edit' | 'preview' | 'runtime';
  value?: any;
  disabled?: boolean;
  onResponse?: (value: any) => void;
  onValidation?: (result: ValidationResult) => void;
  onInteraction?: (event: InteractionEvent) => void;
}

export interface AnalyticsBlockProps {
  block: AnalyticsBlock;
  mode: 'edit' | 'preview' | 'runtime';
  data?: any[];
  onUpdate?: (updates: Partial<AnalyticsBlock>) => void;
}

// Instruction configuration
export interface InstructionConfig {
  id: string;
  type: string;
  order: number;
  content?: string;
  media?: MediaConfig[];
  timing?: TimingConfig;
  conditions?: ConditionalLogic;
  styling?: StylingConfig;
}

// Analytics types
export interface AnalyticsPage {
  id: string;
  name: string;
  description?: string;
  blocks: AnalyticsBlock[];
  variables: Variable[];
  layout: 'single-column' | 'two-column' | 'grid' | 'custom';
  conditions?: ConditionalLogic;
}

export interface AnalyticsBlock {
  id: string;
  type: string;
  order: number;
  config: any; // Block-specific configuration
  dataSource?: DataSource;
  calculations?: Calculation[];
  conditions?: ConditionalLogic;
  styling?: StylingConfig;
}

export interface DataSource {
  questionIds: string[];
  filters?: DataFilter[];
  groupBy?: string;
  timeRange?: TimeRange;
  aggregation?: string;
}

export interface DataFilter {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  value: any;
}

export interface TimeRange {
  start?: Date | string;
  end?: Date | string;
  relative?: 'last-hour' | 'last-day' | 'last-week' | 'last-month' | 'all-time';
}

export interface Calculation {
  id: string;
  name: string;
  formula: string; // Uses scripting engine syntax
  inputs: Record<string, string>; // Maps variable names to question IDs
  output: 'number' | 'string' | 'boolean' | 'array';
}

export interface Variable {
  id: string;
  name: string;
  value: any;
  source?: 'calculation' | 'response' | 'system' | 'constant';
}

// Styling configuration
export interface StylingConfig {
  theme?: string;
  className?: string;
  customCSS?: string;
  layout?: LayoutConfig;
}

export interface LayoutConfig {
  width?: 'full' | 'half' | 'third' | 'quarter' | 'custom';
  customWidth?: string;
  alignment?: 'left' | 'center' | 'right';
  padding?: string;
  margin?: string;
}

// Media configuration
export interface MediaConfig {
  id: string;
  type: 'image' | 'video' | 'audio';
  source: string;
  mediaId?: string; // Reference to uploaded media
  alt?: string;
  caption?: string;
  position?: 'above' | 'below' | 'left' | 'right' | 'background';
  size?: 'small' | 'medium' | 'large' | 'full' | 'custom';
  customSize?: { width: string; height: string };
}

// Timing configuration
export interface TimingConfig {
  autoAdvance?: boolean;
  delay?: number;
  duration?: number;
  showTimer?: boolean;
  timerPosition?: 'top' | 'bottom';
}

// Interaction events
export interface InteractionEvent {
  type: 'view' | 'click' | 'keypress' | 'focus' | 'blur' | 'change' | 'submit';
  timestamp: number;
  data?: any;
}

// Response data structure
export interface ResponseData {
  questionId: string;
  value: any;
  timestamp: number;
  sessionId: string;
  participantId?: string;
  metadata?: {
    reactionTime?: number;
    interactions?: InteractionEvent[];
    device?: string;
    browser?: string;
  };
}

// Module registry
export interface ModuleRegistry {
  register(metadata: ModuleMetadata): void;
  unregister(type: string): void;
  get(type: string): ModuleMetadata | undefined;
  getByCategory(category: ModuleCategory): ModuleMetadata[];
  getAllTypes(): string[];
  loadComponent(type: string, variant: 'runtime' | 'designer'): Promise<ComponentType>;
}