# Product Requirements Document (PRD)

# QDesigner Modern - Designer Application

## 1. Executive Summary

### 1.1 Overview

The QDesigner Modern Designer Application is a professional-grade questionnaire creation platform that combines FAANG-level UI/UX with powerful scripting capabilities and modular architecture. It enables researchers to create complex psychological and behavioral research instruments with microsecond-precision timing, advanced logic, and real-time data visualization.

### 1.2 Core Principles

- **Professional UI/UX**: Match the quality and intuitiveness of leading SAAS platforms
- **Modular Architecture**: Extensible question types and components
- **Powerful Scripting**: Full programmability with Monaco editor and TypeScript support
- **Real-time Preview**: Live testing and validation as you build
- **Accessibility First**: WCAG 2.1 AA compliance throughout
- **Performance**: Smooth interactions even with complex questionnaires

## 2. User Experience Architecture

### 2.1 Information Architecture

```
Designer Application
├── Dashboard
│   ├── Recent Projects
│   ├── Templates Gallery
│   └── Quick Actions
├── Questionnaire Editor
│   ├── Canvas (Visual Editor)
│   ├── Structure View
│   ├── Properties Panel
│   ├── Variable Manager
│   └── Script Editor
├── Preview & Test
│   ├── Live Preview
│   ├── Device Simulator
│   └── Response Tester
└── Settings & Export
    ├── Project Settings
    ├── Export Options
    └── Version Control
```

### 2.2 Core User Flows

#### Creating a Questionnaire

1. **Start**: Dashboard → New Questionnaire or Template
2. **Structure**: Add Pages → Add Blocks → Add Questions
3. **Configure**: Set properties, add logic, define variables
4. **Test**: Preview and validate functionality
5. **Publish**: Export or deploy to runtime

#### Advanced Scripting Flow

1. **Define Variables**: Create questionnaire-wide variables
2. **Write Scripts**: Use Monaco editor with IntelliSense
3. **Add Templates**: Insert variable references in content
4. **Test Logic**: Validate with different scenarios
5. **Debug**: Use console and variable inspector

## 3. Designer Interface Components

### 3.1 Main Canvas

```typescript
interface DesignerCanvas {
  // Core functionality
  mode: 'visual' | 'structure' | 'flow';
  zoom: number; // 25% - 200%
  grid: boolean;

  // Page management
  pages: Page[];
  currentPage: string;

  // Interaction
  dragDrop: DragDropManager;
  selection: SelectionManager;
  history: UndoRedoManager;

  // Visual indicators
  showBlockBoundaries: boolean;
  showQuestionNumbers: boolean;
  showConditionalIndicators: boolean;
}
```

#### Visual Design Requirements

- Clean, modern interface with subtle shadows and borders
- Smooth animations (300ms transitions)
- Visual feedback for all interactions
- Clear hierarchy with typography and spacing
- Dark mode support

### 3.2 Component Sidebar

```typescript
interface ComponentSidebar {
  sections: {
    questionTypes: QuestionTypeCategory[];
    blocks: BlockTemplate[];
    layouts: LayoutOption[];
    widgets: WidgetType[];
  };

  // Search and filter
  search: string;
  filters: FilterOptions;
  favorites: string[];

  // Drag source
  dragPreview: DragPreviewRenderer;
}

interface QuestionTypeCategory {
  name: string;
  icon: string;
  types: QuestionType[];
  description: string;
}
```

### 3.3 Properties Panel

```typescript
interface PropertiesPanel {
  // Context-aware content
  selectedItem: Question | Block | Page | null;

  // Property sections
  sections: PropertySection[];

  // Advanced options
  showAdvanced: boolean;
  customProperties: CustomProperty[];

  // Validation
  validationRules: ValidationRule[];
  errorDisplay: ErrorDisplay;
}

interface PropertySection {
  title: string;
  properties: Property[];
  collapsible: boolean;
  helpText?: string;
}
```

### 3.4 Variable Manager

```typescript
interface VariableManager {
  // Variable definition
  variables: Variable[];
  categories: VariableCategory[];

  // Dependency visualization
  dependencyGraph: DependencyGraph;

  // Testing
  testValues: Map<string, any>;
  evaluationResults: EvaluationResult[];

  // UI Components
  editor: VariableEditor;
  inspector: VariableInspector;
  visualizer: DependencyVisualizer;
}

interface Variable {
  id: string;
  name: string;
  type: VariableType;
  scope: 'global' | 'page' | 'block';

  // Value definition
  defaultValue?: any;
  formula?: string;

  // Metadata
  description?: string;
  category?: string;
  tags?: string[];

  // Computed
  dependencies?: string[];
  dependents?: string[];
}
```

### 3.5 Script Editor (Monaco Integration)

```typescript
interface ScriptEditor {
  // Monaco configuration
  editor: monaco.editor.IStandaloneCodeEditor;
  language: 'typescript';
  theme: 'vs-dark' | 'vs-light';

  // Features
  intellisense: IntelliSenseProvider;
  validation: ValidationProvider;
  formatting: FormattingProvider;

  // Custom additions
  snippets: ScriptSnippet[];
  apiDocs: APIDocumentation;

  // Integration
  variableCompletion: VariableCompletionProvider;
  functionLibrary: BuiltInFunctions;
}

interface ScriptingAPI {
  // Questionnaire control
  questionnaire: {
    getCurrentPage(): Page;
    navigateToPage(pageId: string): void;
    skipToQuestion(questionId: string): void;
    end(): void;
  };

  // Variable access
  variables: {
    get(name: string): any;
    set(name: string, value: any): void;
    compute(formula: string): any;
  };

  // Response access
  responses: {
    get(questionId: string): any;
    set(questionId: string, value: any): void;
    validate(questionId: string): ValidationResult;
  };

  // UI control
  ui: {
    showMessage(message: string, type?: 'info' | 'warning' | 'error'): void;
    enableNext(enabled: boolean): void;
    enablePrevious(enabled: boolean): void;
    showQuestion(questionId: string, visible: boolean): void;
  };

  // Utilities
  utils: {
    random(min?: number, max?: number): number;
    shuffle<T>(array: T[]): T[];
    formatDate(date: Date, format: string): string;
    calculateAge(birthDate: Date): number;
  };
}
```

## 4. Question Architecture

### 4.1 Base Question Interface

```typescript
interface BaseQuestion {
  id: string;
  type: string;

  // Content
  title?: string;
  content?: QuestionContent;
  helpText?: string;

  // Layout
  layout?: LayoutOptions;
  styling?: StylingOptions;

  // Logic
  showIf?: string; // JS expression
  requiredIf?: string;
  validation?: ValidationRules;

  // Response
  responseType?: ResponseType;
  responseOptions?: ResponseOptions;

  // Timing
  timing?: TimingOptions;

  // Metadata
  tags?: string[];
  notes?: string;
}

interface QuestionContent {
  text?: string; // Supports templates
  media?: MediaContent[];
  formatting?: FormattingOptions;
}
```

### 4.2 Standard Question Types

#### Text Display Question

```typescript
interface TextDisplayQuestion extends BaseQuestion {
  type: 'text-display';
  content: {
    text: string; // Markdown + templates
    textAlign?: 'left' | 'center' | 'right' | 'justify';
  };
  autoAdvance?: {
    enabled: boolean;
    delay: number; // milliseconds
  };
}
```

#### Multiple Choice Question

```typescript
interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multiple-choice';
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';

  selection: {
    min: number;
    max: number;
    required: boolean;
  };

  randomization?: {
    randomizeOptions: boolean;
    fixedOptions?: number[]; // indices
    randomizationSeed?: string;
  };

  display?: {
    showHotkeys: boolean;
    showIcons: boolean;
    columns?: number; // for grid layout
  };
}

interface ChoiceOption {
  id: string;
  label: string; // Supports templates
  value: any;

  // Optional enhancements
  icon?: string;
  image?: string;
  color?: string;
  hotkey?: string;

  // Logic
  showIf?: string;
  exclusive?: boolean; // "None of the above" behavior
}
```

#### Scale Question

```typescript
interface ScaleQuestion extends BaseQuestion {
  type: 'scale';
  scale: {
    min: number;
    max: number;
    step: number;

    // Labels
    minLabel?: string;
    maxLabel?: string;
    midLabel?: string;
    scaleLabels?: ScaleLabel[];
  };

  display: {
    type: 'slider' | 'buttons' | 'visual-analog';
    showValue: boolean;
    showLabels: boolean;
    orientation: 'horizontal' | 'vertical';
  };

  // Visual analog scale options
  vas?: {
    lineThickness: number;
    handleSize: number;
    snapToGrid: boolean;
  };
}
```

#### Text Input Question

```typescript
interface TextInputQuestion extends BaseQuestion {
  type: 'text-input';
  input: {
    type: 'text' | 'number' | 'email' | 'tel' | 'url' | 'textarea';
    placeholder?: string;

    // Validation
    pattern?: string;
    minLength?: number;
    maxLength?: number;

    // Number specific
    min?: number;
    max?: number;
    step?: number;

    // Textarea specific
    rows?: number;
    resize?: boolean;
  };

  // Features
  autoComplete?: string;
  spellCheck?: boolean;
  datalist?: string[]; // suggestions
}
```

#### Matrix Question

```typescript
interface MatrixQuestion extends BaseQuestion {
  type: 'matrix';

  rows: MatrixRow[];
  columns: MatrixColumn[];

  responseType: 'radio' | 'checkbox' | 'text' | 'dropdown' | 'scale';

  display: {
    alternateRowColors: boolean;
    mobileLayout: 'accordion' | 'cards' | 'scroll';
    headerSticky: boolean;
  };

  randomization?: {
    randomizeRows: boolean;
    randomizeColumns: boolean;
    fixedRows?: number[];
    fixedColumns?: number[];
  };
}
```

### 4.3 Advanced Question Types

#### Media Question (Image/Video/Audio)

```typescript
interface MediaQuestion extends BaseQuestion {
  type: 'media';
  media: {
    type: 'image' | 'video' | 'audio';
    source: string | MediaSource[];

    // Playback control
    autoplay?: boolean;
    loop?: boolean;
    controls?: boolean;

    // Timing
    startTime?: number;
    endTime?: number;

    // WebGL rendering (for precise timing)
    useWebGL?: boolean;
    preload?: boolean;
  };

  // Response collection during media
  responsesDuringPlayback?: {
    enabled: boolean;
    type: 'keyboard' | 'mouse' | 'continuous';
    recordTimestamps: boolean;
  };
}
```

#### Reaction Time Question

```typescript
interface ReactionTimeQuestion extends BaseQuestion {
  type: 'reaction-time';

  stimulus: {
    type: 'text' | 'image' | 'shape' | 'custom';
    content: any;

    // Timing
    presentationTime?: number; // ms
    randomDelay?: {
      min: number;
      max: number;
    };
  };

  response: {
    type: 'keyboard' | 'mouse' | 'touch';
    validKeys?: string[];
    validTargets?: string[]; // for mouse

    timeout?: number;
    requireCorrect?: boolean;
  };

  // WebGL required for sub-ms precision
  rendering: {
    engine: 'webgl';
    targetFPS: 120 | 144 | 240;
    vsync: boolean;
  };
}
```

#### Drawing/Annotation Question

```typescript
interface DrawingQuestion extends BaseQuestion {
  type: 'drawing';

  canvas: {
    width: number;
    height: number;
    background?: string | ImageSource;
  };

  tools: {
    pen: boolean;
    eraser: boolean;
    shapes: boolean;
    text: boolean;
    colors: string[];
    sizes: number[];
  };

  // Save format
  output: {
    format: 'png' | 'svg' | 'json';
    includeTimeline: boolean; // stroke timing
  };
}
```

### 4.4 Statistical Feedback Components

```typescript
interface StatisticalFeedback {
  id: string;
  type: 'statistical-feedback';

  // Data source
  dataSource: {
    variables: string[];
    calculations: Calculation[];
    normativeData?: NormativeDataset;
  };

  // Visualization
  visualization: {
    type: 'bar' | 'line' | 'radar' | 'distribution' | 'percentile';
    options: VisualizationOptions;
  };

  // Text feedback
  interpretation?: {
    template: string; // With variable interpolation
    conditions: InterpretationRule[];
  };

  // Scientific display
  statistics?: {
    showMean: boolean;
    showSD: boolean;
    showCI: boolean;
    showPercentile: boolean;
  };
}

interface VisualizationOptions {
  // Chart.js or D3.js configuration
  responsive: boolean;
  animations: boolean;
  theme: 'light' | 'dark' | 'scientific';

  // Scientific additions
  errorBars?: boolean;
  confidenceIntervals?: boolean;
  normativeComparison?: boolean;

  // Customization
  colors?: string[];
  fonts?: FontOptions;
}
```

## 5. Block and Page System

### 5.1 Block Architecture

```typescript
interface Block {
  id: string;
  type: 'standard' | 'randomized' | 'adaptive';

  // Content
  title?: string;
  instructions?: string;
  questions: string[]; // Question IDs

  // Layout
  layout: {
    type: 'vertical' | 'horizontal' | 'grid' | 'custom';
    spacing: number;
    padding: number;
  };

  // Logic
  randomization?: {
    type: 'all' | 'pick-n' | 'stratified';
    count?: number;
    stratifyBy?: string; // Variable name
  };

  // Display
  showTitle: boolean;
  showProgress: boolean;
  numbered: boolean;
}
```

### 5.2 Page Architecture

```typescript
interface Page {
  id: string;
  name: string;

  // Content
  blocks: string[]; // Block IDs

  // Navigation
  navigation: {
    showNext: boolean;
    showPrevious: boolean;
    nextLabel?: string;
    previousLabel?: string;

    // Conditions
    canNavigateNext?: string; // JS expression
    canNavigatePrevious?: string;
  };

  // Layout
  layout: PageLayout;

  // Logic
  onEnter?: string; // Script
  onExit?: string; // Script

  // Timing
  timeLimit?: number; // seconds
  autoAdvance?: {
    enabled: boolean;
    delay: number;
  };
}

interface PageLayout {
  type: 'single-column' | 'two-column' | 'custom';
  maxWidth?: number;
  alignment: 'left' | 'center' | 'right';
  background?: BackgroundOptions;
}
```

## 6. Template Language

### 6.1 Template Syntax

```typescript
interface TemplateEngine {
  // Basic interpolation
  // ${variableName}
  // ${responses.q1}
  // Expressions
  // ${age >= 18 ? 'Adult' : 'Minor'}
  // ${score * 100 / maxScore}
  // Formatting
  // ${format(date, 'MM/DD/YYYY')}
  // ${round(percentage, 2)}%
  // Conditionals
  // ${if (condition)}...${else}...${/if}
  // Loops
  // ${foreach items as item}...${/foreach}
  // Built-in variables
  // ${page.current}
  // ${page.total}
  // ${time.elapsed}
  // ${participant.id}
}
```

### 6.2 Template Functions

```typescript
interface TemplateFunctions {
  // Math
  sum(numbers: number[]): number;
  avg(numbers: number[]): number;
  min(numbers: number[]): number;
  max(numbers: number[]): number;
  round(value: number, decimals?: number): number;

  // String
  upper(text: string): string;
  lower(text: string): string;
  capitalize(text: string): string;
  truncate(text: string, length: number): string;

  // Date/Time
  now(): Date;
  formatDate(date: Date, format: string): string;
  formatTime(date: Date, format: string): string;
  daysBetween(date1: Date, date2: Date): number;

  // Array
  count(array: any[]): number;
  first(array: any[]): any;
  last(array: any[]): any;
  join(array: any[], separator: string): string;

  // Questionnaire
  responseCount(): number;
  isAnswered(questionId: string): boolean;
  getResponse(questionId: string): any;
  pageNumber(): number;
}
```

## 7. Drag and Drop System

### 7.1 Drag Sources

```typescript
interface DragSource {
  // Component palette
  questionTypes: DraggableQuestionType[];
  blocks: DraggableBlock[];
  widgets: DraggableWidget[];

  // From existing content
  questions: Question[];
  blocks: Block[];

  // Preview during drag
  dragPreview: {
    render: (item: DragItem) => ReactNode;
    offset: { x: number; y: number };
  };
}
```

### 7.2 Drop Targets

```typescript
interface DropTarget {
  // Valid drop zones
  pages: PageDropZone[];
  blocks: BlockDropZone[];

  // Visual feedback
  highlight: 'outline' | 'background' | 'insertion-line';

  // Validation
  canDrop: (item: DragItem, target: DropZone) => boolean;

  // Actions
  onDrop: (item: DragItem, target: DropZone) => void;
}
```

### 7.3 Reordering

```typescript
interface ReorderingSystem {
  // Within containers
  reorderQuestions: (blockId: string, from: number, to: number) => void;
  reorderBlocks: (pageId: string, from: number, to: number) => void;
  reorderPages: (from: number, to: number) => void;

  // Between containers
  moveQuestion: (questionId: string, targetBlockId: string, index: number) => void;
  moveBlock: (blockId: string, targetPageId: string, index: number) => void;

  // Keyboard support
  keyboardReorder: boolean;
  arrowKeyStep: 1 | 'section';
}
```

## 8. Real-time Preview System

### 8.1 Preview Modes

```typescript
interface PreviewSystem {
  // Preview types
  mode: 'desktop' | 'tablet' | 'mobile' | 'custom';

  // Device frames
  deviceFrame: boolean;
  deviceType?: DeviceType;

  // Interaction
  interactive: boolean;
  collectResponses: boolean;

  // Data
  testData: Map<string, any>;
  mockParticipant?: ParticipantData;

  // Sync
  autoUpdate: boolean;
  updateDelay: number; // ms
}
```

### 8.2 Preview Controls

```typescript
interface PreviewControls {
  // Navigation
  currentPage: string;

  // Playback
  play(): void;
  pause(): void;
  reset(): void;

  // Testing
  setVariable(name: string, value: any): void;
  triggerEvent(event: string): void;

  // Debugging
  showConsole: boolean;
  showVariables: boolean;
  showTimings: boolean;
}
```

## 9. Version Control Integration

### 9.1 Version Management

```typescript
interface VersionControl {
  // History
  versions: Version[];
  currentVersion: string;

  // Operations
  save(message: string): Promise<Version>;
  restore(versionId: string): Promise<void>;
  compare(v1: string, v2: string): VersionDiff;

  // Branching
  branches: Branch[];
  createBranch(name: string): Promise<Branch>;
  merge(branch: string): Promise<MergeResult>;

  // Collaboration
  locks: ResourceLock[];
  comments: VersionComment[];
}
```

### 9.2 Change Tracking

```typescript
interface ChangeTracking {
  // Real-time changes
  pendingChanges: Change[];

  // Diff visualization
  showDiff: boolean;
  diffGranularity: 'character' | 'word' | 'line';

  // Conflict resolution
  conflicts: Conflict[];
  resolveConflict(id: string, resolution: Resolution): void;
}
```

## 10. Export and Import

### 10.1 Export Formats

```typescript
interface ExportOptions {
  formats: {
    json: {
      pretty: boolean;
      includeMetadata: boolean;
      version: string;
    };

    qsf: {
      // Qualtrics Survey Format
      compatible: boolean;
    };

    pdf: {
      layout: 'questionnaire' | 'codebook';
      includeLogic: boolean;
    };

    runtime: {
      optimized: boolean;
      standalone: boolean;
      includeAssets: boolean;
    };
  };
}
```

### 10.2 Import Capabilities

```typescript
interface ImportOptions {
  sources: {
    json: boolean;
    qsf: boolean;
    csv: boolean; // for choice options
    markdown: boolean; // for content
  };

  // Mapping
  fieldMapping: FieldMapper;

  // Validation
  validateOnImport: boolean;
  fixIncompatible: boolean;
}
```

## 11. Keyboard Shortcuts

```typescript
interface KeyboardShortcuts {
  // File operations
  'Ctrl/Cmd+S': 'save';
  'Ctrl/Cmd+O': 'open';
  'Ctrl/Cmd+N': 'new';

  // Edit operations
  'Ctrl/Cmd+Z': 'undo';
  'Ctrl/Cmd+Y': 'redo';
  'Ctrl/Cmd+X': 'cut';
  'Ctrl/Cmd+C': 'copy';
  'Ctrl/Cmd+V': 'paste';
  Delete: 'delete';

  // Navigation
  'Ctrl/Cmd+Arrow': 'navigate';
  Tab: 'nextField';
  'Shift+Tab': 'previousField';

  // View
  'Ctrl/Cmd+1': 'visualView';
  'Ctrl/Cmd+2': 'structureView';
  'Ctrl/Cmd+3': 'previewView';
  'Ctrl/Cmd+Plus': 'zoomIn';
  'Ctrl/Cmd+Minus': 'zoomOut';

  // Designer specific
  Q: 'quickAddQuestion';
  B: 'quickAddBlock';
  P: 'quickAddPage';
  'Ctrl/Cmd+P': 'commandPalette';
}
```

## 12. Performance Requirements

### 12.1 Responsiveness

- All interactions < 100ms response time
- Smooth drag and drop at 60 FPS
- No lag with 1000+ questions
- Instant property updates

### 12.2 Scalability

- Handle questionnaires with 500+ pages
- Support 10,000+ variables
- Manage complex dependency graphs
- Efficient undo/redo for all operations

### 12.3 Resource Usage

- Initial load < 2 seconds
- Memory usage < 500MB
- Incremental updates only
- Lazy loading for large questionnaires

## 13. Accessibility Requirements

### 13.1 WCAG 2.1 AA Compliance

- Full keyboard navigation
- Screen reader support
- High contrast mode
- Focus indicators
- ARIA labels and descriptions

### 13.2 Inclusive Design

- Color blind friendly palettes
- Adjustable font sizes
- Clear error messages
- Contextual help
- Multi-language support

## 14. Security Requirements

### 14.1 Data Protection

- Encrypted storage of sensitive questions
- Secure variable values
- Audit trail for all changes
- Role-based access control

### 14.2 Script Security

- Sandboxed script execution
- No access to system APIs
- Validated variable access
- Rate limiting for computations

## 15. Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)

- Fix designer store and routing
- Implement drag and drop
- Create base question components
- Set up properties panel

### Phase 2: Question System (Week 3-4)

- Implement all standard question types
- Add response configuration
- Create question property editors
- Build validation system

### Phase 3: Scripting & Variables (Week 5-6)

- Integrate Monaco editor
- Implement variable system
- Create template engine
- Add scripting API

### Phase 4: Advanced Features (Week 7-8)

- Build preview system
- Add statistical components
- Implement version control
- Create import/export

### Phase 5: Polish & Optimization (Week 9-10)

- Optimize performance
- Complete accessibility
- Add animations and transitions
- Comprehensive testing

---

_Document Version: 1.0_  
_Created: January 2025_  
_System: QDesigner Modern - Designer Application_  
_Architecture: React + TypeScript + Monaco Editor + WebGL_
