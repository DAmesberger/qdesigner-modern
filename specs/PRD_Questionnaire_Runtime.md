# Product Requirements Document (PRD)

# QDesigner Modern - Questionnaire Runtime System

## 1. Executive Summary

### 1.1 Overview

The Questionnaire Runtime System is the participant-facing component of QDesigner Modern that executes questionnaires with microsecond-precision timing, advanced scripting capabilities, and comprehensive interaction tracking. Built as a hybrid WebGL/HTML system, it provides laboratory-grade measurement precision while maintaining the accessibility of standard web forms.

### 1.2 Core Capabilities

- **Hybrid Rendering**: WebGL for high-precision stimuli (images, videos) and HTML for standard form inputs
- **Advanced Templating**: JavaScript template literals with full expression support
- **Comprehensive Scripting**: Sandboxed JavaScript execution with Monaco editor integration
- **Interaction Tracking**: Every click, keypress, and time measurement stored with microsecond precision
- **Offline-First**: Full offline capability with intelligent sync and conflict resolution
- **GDPR Compliant**: Field-level encryption and EU regulation compliance

## 2. System Architecture

### 2.1 Runtime Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Questionnaire Runtime System                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────┐    ┌──────────────────────┐  │
│  │   Render Manager     │    │   Input Manager      │  │
│  ├─────────────────────┤    ├──────────────────────┤  │
│  │ • WebGL Layer       │    │ • Keyboard Handler   │  │
│  │ • HTML Layer        │    │ • Mouse Handler      │  │
│  │ • Layer Coordinator │    │ • Focus Manager      │  │
│  └─────────────────────┘    │ • Device Integration │  │
│                              └──────────────────────┘  │
│                                                         │
│  ┌─────────────────────┐    ┌──────────────────────┐  │
│  │  Question Engine     │    │  Script Engine       │  │
│  ├─────────────────────┤    ├──────────────────────┤  │
│  │ • Question Types    │    │ • Variable System    │  │
│  │ • Response Types    │    │ • Template Engine    │  │
│  │ • Flow Control     │    │ • Sandboxed Exec     │  │
│  │ • Navigation       │    │ • Built-in Functions │  │
│  └─────────────────────┘    └──────────────────────┘  │
│                                                         │
│  ┌─────────────────────┐    ┌──────────────────────┐  │
│  │  Timing Manager      │    │  Storage Manager     │  │
│  ├─────────────────────┤    ├──────────────────────┤  │
│  │ • Performance.now() │    │ • IndexedDB          │  │
│  │ • Frame Sync       │    │ • Encryption         │  │
│  │ • Latency Comp.    │    │ • Sync Queue         │  │
│  │ • Event Timestamps │    │ • Conflict Resolution│  │
│  └─────────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Component Architecture

```typescript
// Core interfaces for the runtime system

interface QuestionnaireRuntime {
  id: string;
  version: string;
  definition: QuestionnaireDefinition;
  state: RuntimeState;

  // Lifecycle
  initialize(): Promise<void>;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  complete(): Promise<void>;

  // Navigation
  navigateNext(): Promise<void>;
  navigatePrevious(): Promise<void>;
  navigateToQuestion(questionId: string): Promise<void>;
  canNavigateNext(): boolean;
  canNavigatePrevious(): boolean;

  // State management
  getVariable(name: string): any;
  setVariable(name: string, value: any): void;
  evaluateExpression(expression: string): any;
}

interface Question {
  id: string;
  type: QuestionType;
  content: QuestionContent;
  response: ResponseConfig;

  // Rendering
  getRenderTarget(): 'webgl' | 'html' | 'both';
  render(renderer: RenderManager): Promise<void>;
  cleanup(): void;

  // Validation
  validate(value: any): ValidationResult;
  isRequired(): boolean;
}

interface Response {
  type: ResponseType;
  config: ResponseConfig;

  // Collection
  enable(inputManager: InputManager): void;
  disable(): void;
  getValue(): any;
  setValue(value: any): void;

  // Events
  onResponse: (value: any, metadata: ResponseMetadata) => void;
}
```

## 3. Question Types

### 3.1 Base Question Types

#### Text Question

- Simple text display with HTML/Markdown support
- Template variable interpolation
- Conditional content based on variables

#### Image Question

- WebGL-rendered for precise timing
- Supports multiple formats (PNG, JPG, WebP)
- Preloading with progress indication
- Frame-locked presentation

#### Video Question

- WebGL texture streaming
- Frame-accurate playback control
- Audio sync via Web Audio API
- Subtitle/caption support

#### Audio Question

- Web Audio API integration
- Precise onset timing
- Visual waveform display (optional)
- Background audio support

#### Instruction Question

- Rich text with multimedia
- No response required
- Auto-advance or manual continue

### 3.2 Interactive Question Types

#### Multiple Choice Question

```typescript
interface MultipleChoiceQuestion extends Question {
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';
  randomizeOptions?: boolean;
  showHotkeys?: boolean;
  allowMultiple?: boolean;
}

interface ChoiceOption {
  id: string;
  label: string;
  value: any;
  hotkey?: string;
  image?: string;
  conditionalDisplay?: string; // JS expression
}
```

#### Scale Question

```typescript
interface ScaleQuestion extends Question {
  min: number;
  max: number;
  step?: number;
  labels?: ScaleLabel[];
  showValue?: boolean;
  defaultValue?: number;
  layout: 'horizontal' | 'vertical';
}
```

#### Text Input Question

```typescript
interface TextInputQuestion extends Question {
  inputType: 'text' | 'number' | 'email' | 'tel' | 'url';
  placeholder?: string;
  maxLength?: number;
  pattern?: string;
  multiline?: boolean;
  rows?: number;
}
```

#### Matrix Question

```typescript
interface MatrixQuestion extends Question {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  responseType: 'radio' | 'checkbox' | 'text' | 'scale';
  randomizeRows?: boolean;
  randomizeColumns?: boolean;
}
```

## 4. Response Types

### 4.1 Input Response Types

#### Keyboard Response

```typescript
interface KeyboardResponse extends Response {
  allowedKeys?: string[];
  recordAllKeys?: boolean;
  measureReactionTime: boolean;
  timeout?: number;

  // Hotkey mapping
  hotkeys?: Map<string, any>;

  // Timing data
  onsetTime?: number;
  responseTime?: number;
}
```

#### Mouse Response

```typescript
interface MouseResponse extends Response {
  trackMovement?: boolean;
  trackClicks: boolean;
  allowedTargets?: string[]; // CSS selectors

  // Gesture support
  gestures?: GestureConfig[];
}
```

#### Touch Response

```typescript
interface TouchResponse extends Response {
  multiTouch?: boolean;
  gestures?: TouchGesture[];
  pressure?: boolean;
}
```

### 4.2 Form Response Types

#### Choice Response

- Single or multiple selection
- Keyboard shortcuts
- Visual feedback
- Conditional options

#### Scale Response

- Slider or button array
- Visual or numeric feedback
- Custom scale points
- Non-linear scales support

#### Text Response

- Real-time validation
- Auto-save on change
- Character/word limits
- Rich text support (optional)

## 5. Variable System & Scripting

### 5.1 Variable Engine

```typescript
interface Variable {
  name: string;
  type: VariableType;
  value: any;
  scope: 'global' | 'page' | 'local';

  // Computed variables
  formula?: string;
  dependencies?: string[];

  // Persistence
  persistent?: boolean;
  encrypted?: boolean;
}

interface VariableEngine {
  // Variable management
  define(variable: Variable): void;
  get(name: string): any;
  set(name: string, value: any): void;

  // Expression evaluation
  evaluate(expression: string, context?: object): any;

  // Reactive updates
  watch(name: string, callback: (value: any) => void): void;
  unwatch(name: string, callback: Function): void;
}
```

### 5.2 Template Engine

```typescript
interface TemplateEngine {
  // Parse template with JS expressions
  parse(template: string): ParsedTemplate;

  // Render with current variable context
  render(template: string, context: object): string;

  // Reactive rendering
  createReactive(template: string): ReactiveTemplate;
}

// Template syntax examples:
// Simple: ${variableName}
// Expression: ${age >= 18 ? 'Adult' : 'Minor'}
// Function: ${formatDate(responseDate, 'MM/DD/YYYY')}
// Conditional: ${if (score > 80)}Excellent!${/if}
// Loop: ${foreach items as item}${item.name}${/foreach}
```

### 5.3 Script Engine

```typescript
interface ScriptEngine {
  // Sandboxed execution
  execute(script: string, context: ScriptContext): any;

  // Built-in functions
  functions: BuiltInFunctions;

  // Monaco editor integration
  getCompletions(): MonacoCompletion[];
  validate(script: string): ValidationResult;
}

interface BuiltInFunctions {
  // Math functions
  sum(array: number[]): number;
  avg(array: number[]): number;
  min(array: number[]): number;
  max(array: number[]): number;
  round(value: number, decimals?: number): number;

  // String functions
  concat(...strings: string[]): string;
  upper(str: string): string;
  lower(str: string): string;
  trim(str: string): string;

  // Date/Time functions
  now(): Date;
  formatDate(date: Date, format: string): string;
  diffTime(start: Date, end: Date, unit: string): number;

  // Array functions
  filter(array: any[], predicate: Function): any[];
  map(array: any[], transform: Function): any[];
  find(array: any[], predicate: Function): any;

  // Questionnaire functions
  getResponse(questionId: string): any;
  setResponse(questionId: string, value: any): void;
  skipTo(questionId: string): void;
  showQuestion(questionId: string): void;
  hideQuestion(questionId: string): void;

  // Random functions
  random(): number;
  randomInt(min: number, max: number): number;
  shuffle(array: any[]): any[];

  // Storage functions
  store(key: string, value: any): void;
  retrieve(key: string): any;

  // External device functions (future)
  device: {
    isConnected(deviceType: string): boolean;
    sendTrigger(deviceId: string, value: any): void;
    readValue(deviceId: string): any;
  };
}
```

## 6. Navigation & Flow Control

### 6.1 Navigation System

```typescript
interface NavigationManager {
  // History tracking
  history: NavigationEntry[];
  currentPosition: number;

  // Navigation methods
  next(): Promise<void>;
  previous(): Promise<void>;
  jumpTo(targetId: string): Promise<void>;

  // Conditional navigation
  evaluateFlow(): NextDestination;
  canGoNext(): boolean;
  canGoPrevious(): boolean;

  // Events
  onNavigate: (from: string, to: string) => void;
}

interface NavigationEntry {
  questionId: string;
  timestamp: number;
  responseTime: number;
  navigationTrigger: 'next' | 'previous' | 'jump' | 'auto';
}

interface FlowRule {
  id: string;
  condition: string; // JS expression
  action: 'skip' | 'show' | 'jump' | 'end';
  target?: string; // Question or page ID
  priority?: number;
}
```

### 6.2 Page Management

```typescript
interface Page {
  id: string;
  questions: string[];

  // Display rules
  showIf?: string; // JS expression
  skipIf?: string;

  // Navigation rules
  preventNext?: string; // Condition to prevent next
  preventPrevious?: string;
  autoAdvance?: boolean;
  advanceDelay?: number;
}
```

## 7. Timing & Performance

### 7.1 Timing Manager

```typescript
interface TimingManager {
  // High-precision timing
  getTimestamp(): number; // performance.now()

  // Stimulus timing
  markStimulusOnset(stimulusId: string): void;
  markStimulusOffset(stimulusId: string): void;

  // Response timing
  markResponseEnabled(questionId: string): void;
  markResponseCollected(questionId: string, value: any): void;

  // Latency compensation
  calibrateInputLatency(): Promise<number>;
  compensateLatency(timestamp: number): number;

  // Frame timing (WebGL)
  onFrame(callback: (timestamp: number) => void): void;
  getFrameRate(): number;
}

interface TimingData {
  questionId: string;
  stimulusOnset?: number;
  stimulusOffset?: number;
  responseEnabled?: number;
  responseTime?: number;
  reactionTime?: number; // responseTime - stimulusOnset
  inputLatency?: number;
  frameNumber?: number;
}
```

### 7.2 Performance Monitoring

```typescript
interface PerformanceMonitor {
  // Metrics collection
  trackMetric(name: string, value: number): void;

  // Performance stats
  getFrameRate(): number;
  getDroppedFrames(): number;
  getRenderTime(): number;

  // Resource usage
  getMemoryUsage(): MemoryInfo;
  getCPUUsage(): number;

  // Network performance
  getLatency(): number;
  getBandwidth(): number;
}
```

## 8. Data Storage & Synchronization

### 8.1 Storage Architecture

```typescript
interface StorageManager {
  // Local storage (IndexedDB)
  local: LocalStorage;

  // Remote storage (Supabase)
  remote: RemoteStorage;

  // Sync management
  sync: SyncManager;

  // Encryption
  encryption: EncryptionManager;
}

interface LocalStorage {
  // Session data
  saveSession(session: Session): Promise<void>;
  getSession(sessionId: string): Promise<Session>;

  // Response data
  saveResponse(response: ResponseData): Promise<void>;
  getResponses(sessionId: string): Promise<ResponseData[]>;

  // Offline queue
  queueForSync(data: any): Promise<void>;
  getQueuedItems(): Promise<QueueItem[]>;
}

interface SyncManager {
  // Sync control
  startSync(): Promise<void>;
  stopSync(): void;
  forceSync(): Promise<void>;

  // Conflict resolution
  resolveConflict(local: any, remote: any): any;

  // Status
  getSyncStatus(): SyncStatus;
  onSyncComplete: (result: SyncResult) => void;
}
```

### 8.2 Database Schema

```sql
-- Questionnaire Definitions (versioned)
CREATE TABLE questionnaire_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL,
  definition JSONB NOT NULL, -- Full questionnaire structure
  changelog JSONB, -- What changed in this version
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT false,

  -- Versioning
  parent_version_id UUID REFERENCES questionnaire_definitions(id),

  -- Indexes
  UNIQUE(project_id, name, version)
);

-- Sessions (participant instances)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES questionnaire_definitions(id),
  participant_id UUID REFERENCES participants(id),

  -- Status tracking
  status VARCHAR(50) NOT NULL, -- 'not_started', 'in_progress', 'completed', 'abandoned'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,

  -- Progress tracking
  current_question_id VARCHAR(255),
  current_page_id VARCHAR(255),
  progress_percentage INTEGER DEFAULT 0,

  -- Device & environment info
  device_info JSONB,
  browser_info JSONB,

  -- Offline support
  offline_start BOOLEAN DEFAULT false,
  sync_status VARCHAR(50) DEFAULT 'synced', -- 'synced', 'pending', 'conflict'
  last_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Response data (versioned with history)
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  question_id VARCHAR(255) NOT NULL,

  -- Response value (can be encrypted)
  value JSONB NOT NULL,
  value_encrypted BYTEA, -- For sensitive data
  encryption_key_id UUID, -- Reference to key management

  -- Timing data (microsecond precision)
  stimulus_onset_us BIGINT,
  response_time_us BIGINT,
  reaction_time_us BIGINT, -- response_time - stimulus_onset
  time_on_question_ms INTEGER,

  -- Version tracking
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  previous_version_id UUID REFERENCES responses(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  client_timestamp TIMESTAMPTZ, -- From participant's device

  -- Indexes
  INDEX idx_session_question (session_id, question_id),
  INDEX idx_current_responses (session_id, is_current)
);

-- Interaction events (detailed tracking)
CREATE TABLE interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),
  question_id VARCHAR(255),

  -- Event details
  event_type VARCHAR(50) NOT NULL, -- 'click', 'keypress', 'focus', 'blur'
  event_data JSONB NOT NULL,

  -- Timing (microsecond precision)
  timestamp_us BIGINT NOT NULL,
  relative_time_us BIGINT, -- Time since question shown

  -- Performance data
  frame_number INTEGER,
  frame_time_ms NUMERIC(6,3),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Variables (session state)
CREATE TABLE session_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id),

  -- Variable data
  name VARCHAR(255) NOT NULL,
  value JSONB NOT NULL,
  type VARCHAR(50) NOT NULL,

  -- Tracking
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_question VARCHAR(255),

  -- Unique per session
  UNIQUE(session_id, name)
);

-- Offline sync queue
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,

  -- Sync data
  operation VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete'
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  data JSONB NOT NULL,

  -- Sync status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'syncing', 'synced', 'failed'
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_responses_session ON responses(session_id);
CREATE INDEX idx_responses_timing ON responses(session_id, stimulus_onset_us);
CREATE INDEX idx_events_session_time ON interaction_events(session_id, timestamp_us);
CREATE INDEX idx_sync_queue_status ON sync_queue(status, created_at);

-- Row Level Security
ALTER TABLE questionnaire_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_variables ENABLE ROW LEVEL SECURITY;

-- RLS Policies (example for sessions)
CREATE POLICY sessions_participant_access ON sessions
  FOR ALL
  USING (participant_id = auth.uid() OR
         EXISTS (
           SELECT 1 FROM project_members pm
           JOIN questionnaire_definitions qd ON qd.project_id = pm.project_id
           WHERE qd.id = sessions.questionnaire_id
           AND pm.user_id = auth.uid()
         ));
```

### 8.3 Data Encryption

```typescript
interface EncryptionManager {
  // Field-level encryption
  encryptField(value: any, fieldConfig: EncryptionConfig): EncryptedData;
  decryptField(encrypted: EncryptedData): any;

  // Key management
  rotateKeys(): Promise<void>;
  getActiveKey(): EncryptionKey;

  // GDPR compliance
  anonymizeData(data: any, rules: AnonymizationRules): any;
  pseudonymize(identifier: string): string;

  // Right to erasure
  permanentlyDelete(dataId: string): Promise<void>;
}

interface EncryptionConfig {
  algorithm: 'AES-256-GCM';
  keyDerivation: 'PBKDF2';
  fields: string[]; // Fields to encrypt
  purpose: 'PII' | 'health' | 'financial' | 'general';
}
```

## 9. Offline Capabilities

### 9.1 Offline Architecture

```typescript
interface OfflineManager {
  // Offline detection
  isOnline(): boolean;
  onStatusChange: (online: boolean) => void;

  // Cache management
  cacheQuestionnaire(id: string): Promise<void>;
  getCachedQuestionnaires(): Promise<string[]>;

  // Service worker
  registerServiceWorker(): Promise<void>;
  updateServiceWorker(): Promise<void>;

  // Data sync
  queueData(data: any): Promise<void>;
  syncWhenOnline(): Promise<void>;
}
```

### 9.2 Progressive Web App

```typescript
interface PWAConfig {
  // Manifest
  name: string;
  shortName: string;
  icons: IconConfig[];

  // Caching strategy
  cacheStrategy: 'network-first' | 'cache-first' | 'stale-while-revalidate';

  // Offline pages
  offlinePage: string;

  // Background sync
  backgroundSync: boolean;
  syncInterval: number;
}
```

### 9.3 Conflict Resolution

```typescript
interface ConflictResolver {
  // Strategies
  strategy: 'last-write-wins' | 'first-write-wins' | 'merge' | 'manual';

  // Resolution
  resolve(local: any, remote: any, metadata: ConflictMetadata): any;

  // Manual resolution UI
  presentConflictUI(conflicts: Conflict[]): Promise<Resolution[]>;
}

interface ConflictMetadata {
  localTimestamp: number;
  remoteTimestamp: number;
  localVersion: number;
  remoteVersion: number;
  field: string;
  dataType: string;
}
```

## 10. External Device Integration

### 10.1 Device API (Future)

```typescript
interface DeviceManager {
  // Device discovery
  scan(): Promise<Device[]>;
  connect(deviceId: string): Promise<DeviceConnection>;

  // Device types
  supportedTypes: DeviceType[];

  // Event handling
  onDeviceEvent: (event: DeviceEvent) => void;
}

interface Device {
  id: string;
  type: 'eye-tracker' | 'eeg' | 'button-box' | 'physiological';
  name: string;
  capabilities: DeviceCapabilities;
}

interface DeviceConnection {
  // Control
  start(): Promise<void>;
  stop(): Promise<void>;
  calibrate(): Promise<CalibrationResult>;

  // Data
  getData(): any;
  subscribe(callback: (data: any) => void): void;

  // Triggers
  sendTrigger(value: any): void;
}
```

### 10.2 Hardware Timing Sync

```typescript
interface HardwareSync {
  // Time synchronization
  syncClocks(): Promise<ClockOffset>;

  // Trigger alignment
  alignTriggers(device: Device): Promise<void>;

  // Latency measurement
  measureLatency(device: Device): Promise<number>;
}
```

## 11. Performance Requirements

### 11.1 Timing Precision

- Stimulus onset: < 1ms accuracy
- Response recording: < 0.1ms accuracy
- Frame timing: Synchronized to display refresh
- Audio onset: < 1ms accuracy via Web Audio API

### 11.2 Rendering Performance

- WebGL: 120+ FPS capability
- HTML updates: < 16ms (60 FPS)
- No dropped frames during stimulus presentation
- Smooth transitions and animations

### 11.3 Data Performance

- Local save: < 10ms
- Interaction logging: Non-blocking
- Sync operations: Background thread
- Query response data: < 100ms

### 11.4 Offline Performance

- Cache size: < 50MB per questionnaire
- Sync queue: Handles 10,000+ events
- Conflict resolution: < 1s per conflict
- Background sync: Minimal battery impact

## 12. Security & Compliance

### 12.1 GDPR Compliance

- Consent management before data collection
- Right to access: Export all participant data
- Right to erasure: Complete data deletion
- Data portability: Standard export formats and SPSS export
- Privacy by design: Minimal data collection

### 12.2 Data Security

- TLS 1.3 for all communications
- AES-256-GCM for field encryption
- Secure key storage (never in code)
- Regular security audits
- Penetration testing

### 12.3 Healthcare Compliance (Future)

- HIPAA compliance ready
- Audit trails for all data access
- Encryption for health data
- BAA support
- Clinical trial regulations

## 13. Monitoring & Analytics

### 13.1 Runtime Metrics

```typescript
interface RuntimeMetrics {
  // Performance
  frameRate: number;
  renderTime: number;
  responseLatency: number;

  // Reliability
  errorRate: number;
  crashRate: number;
  syncFailures: number;

  // Usage
  questionsCompleted: number;
  averageSessionTime: number;
  dropoutRate: number;
}
```

### 13.2 Error Tracking

- Sentry integration for error capture
- Custom error boundaries
- Offline error queuing
- Error replay capability

### 13.3 Analytics Events

- Session start/complete
- Question view/response
- Navigation events
- Performance degradation
- Device/browser capabilities

## 14. Testing Strategy

### 14.1 Unit Tests

- Variable engine logic
- Template parsing
- Script execution
- Timing calculations
- Encryption/decryption

### 14.2 Integration Tests

- Question rendering
- Response collection
- Navigation flow
- Data synchronization
- Offline/online transitions

### 14.3 E2E Tests

- Complete questionnaire flow
- Different question types
- Browser compatibility
- Device compatibility
- Performance benchmarks

### 14.4 Specialized Tests

- Timing accuracy verification
- Frame drop detection
- Sync conflict scenarios
- Security penetration
- Load testing (1000+ concurrent)

## 15. Development Roadmap

### Phase 1: Core Runtime (Months 1-2)

- Basic question types
- HTML response collection
- Variable system
- Simple navigation
- Local storage

### Phase 2: Advanced Features (Months 3-4)

- WebGL integration
- Advanced scripting
- Template engine
- Complex navigation
- Interaction tracking

### Phase 3: Offline & Sync (Months 5-6)

- Service worker
- Offline storage
- Sync queue
- Conflict resolution
- PWA features

### Phase 4: Performance & Polish (Months 7-8)

- Timing optimization
- Performance monitoring
- Security hardening
- Comprehensive testing
- Documentation

### Phase 5: Future Features (Months 9+)

- External device API
- Advanced analytics
- A/B testing support
- Machine learning integration
- Real-time collaboration

---

_Document Version: 1.0_  
_Created: January 2025_  
_System: QDesigner Modern - Questionnaire Runtime_  
_Architecture: Hybrid WebGL/HTML with Offline-First Design_
