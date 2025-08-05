# QDesigner Modern - Full Modular Migration Specification

## Overview

This specification outlines the complete migration to a fully modular questionnaire system, removing all legacy code and ensuring tight integration with the variable/scripting system.

## Core Principles

1. **No Backward Compatibility** - Clean break from legacy system
2. **Full Variable Integration** - Variables work everywhere via interpolation
3. **Offline-First** - All modules bundled for complete offline support
4. **Performance** - Maintain 120+ FPS for reaction time measurements
5. **Unified Architecture** - Single source of truth via module registry

## Architecture

### Module System

```typescript
interface ModuleMetadata {
  type: string;
  category: 'question' | 'instruction' | 'visualization';
  name: string;
  icon: string;
  description: string;
  capabilities: ModuleCapabilities;
  components: {
    runtime: () => Promise<ComponentType>;
    designer: () => Promise<ComponentType>;
  };
  defaultConfig: any;
  answerType: AnswerType;
  renderer?: 'dom' | 'webgl' | 'hybrid';
  performance?: {
    targetFPS?: number;
    gpuRequired?: boolean;
  };
}
```

### Variable Service

```typescript
class VariableService {
  constructor(private engine: VariableEngine) {}
  
  // Interpolate text with {{variable}} syntax
  interpolate(text: string, context?: Record<string, any>): string;
  
  // Evaluate conditions for flow control
  evaluateCondition(condition: string): boolean;
  
  // Subscribe to variable changes
  subscribe(variables: string[], callback: (values: any) => void): () => void;
  
  // Get formatted value for display
  formatValue(variable: string, format?: string): string;
}
```

### Runtime Architecture

```typescript
class ModularQuestionnaireRuntime {
  private modules: Map<string, QuestionModule>;
  private variableService: VariableService;
  private renderer: UnifiedRenderer;
  private timingService: TimingService;
  
  async initialize(questionnaire: Questionnaire): Promise<void> {
    // Preload all required modules
    // Initialize variable engine
    // Setup renderer (DOM or WebGL)
  }
  
  async renderQuestion(question: Question): Promise<void> {
    const module = await this.loadModule(question.type);
    const Component = await module.loadComponent('runtime');
    
    // Interpolate all text fields
    const interpolatedQuestion = this.variableService.interpolateQuestion(question);
    
    // Render based on module type
    if (module.metadata.renderer === 'webgl') {
      await this.renderer.renderToCanvas(Component, interpolatedQuestion);
    } else {
      await this.renderer.renderToDOM(Component, interpolatedQuestion);
    }
  }
}
```

### Storage Architecture

```typescript
abstract class BaseQuestionStorage {
  // Common storage operations
  abstract parseValue(value: any): any;
  abstract formatValue(value: any): string;
  abstract validateValue(value: any): boolean;
  
  // Aggregation interface
  abstract getAllAggregations(questionId: string): Promise<Record<string, any>>;
}
```

## Implementation Plan

### Phase 1: Port Remaining Questions

#### 1.1 WebGLQuestion Module
- Location: `/src/lib/modules/questions/webgl/`
- Features:
  - Custom shader support
  - 3D content rendering
  - High-precision timing
  - GPU-accelerated animations
  - Performance metrics collection

#### 1.2 StatisticalFeedbackQuestion Module  
- Location: `/src/lib/modules/questions/statistical-feedback/`
- Features:
  - Real-time calculation from responses
  - Chart/graph rendering
  - Comparison with norms
  - Variable interpolation in feedback
  - Custom formula support

### Phase 2: Core System Updates

#### 2.1 Variable Service Implementation
- Universal text interpolation
- Condition evaluation for flow
- Real-time updates
- Complex expressions support
- Performance optimized

#### 2.2 Runtime Modernization
- Remove all legacy code
- Module-based rendering
- Unified timing system
- Offline-capable loading
- Memory efficient

#### 2.3 Factory Simplification
- Dynamic module-based creation
- Metadata-driven defaults
- No hardcoded types
- Variable name generation

### Phase 3: Designer Integration

#### 3.1 Remove Legacy Components
- Delete `/components/designer/questions/`
- Delete `/components/designer/properties/`
- Delete legacy type definitions
- Remove old imports

#### 3.2 Update Core Designer
- QuestionPalette: Load from registry
- PropertiesPanel: Dynamic module components
- Preview: Use actual runtime
- Variable picker integration

### Phase 4: Runtime Renderer

#### 4.1 Unified Renderer
```typescript
class UnifiedRenderer {
  private domContainer: HTMLElement;
  private webglCanvas: HTMLCanvasElement;
  private webglRenderer: WebGLRenderer;
  
  async renderToDOM(Component: ComponentType, props: any): Promise<void>;
  async renderToCanvas(Component: ComponentType, props: any): Promise<void>;
  
  // Handle transitions between questions
  async transition(from: string, to: string, effect: TransitionEffect): Promise<void>;
}
```

#### 4.2 WebGL Integration
- Shared WebGL context
- Resource management
- Performance monitoring
- Fallback to DOM if needed

### Phase 5: Offline Support

#### 5.1 Module Bundling
- Vite configuration for module chunks
- Service worker setup
- IndexedDB for responses
- Queue for sync

#### 5.2 Resource Caching
- Cache all module code
- Store media assets
- Offline variable state
- Response persistence

## Variable Integration Details

### Text Interpolation
```typescript
// Simple variable
"Your reaction time was {{reactionTime}}ms"

// Expressions
"You were {{reactionTime > avgTime ? 'slower' : 'faster'}} than average"

// Formatting
"Date: {{responseDate | format:'MMM DD, YYYY'}}"

// Complex calculations
"Your score: {{(correct / total * 100).toFixed(1)}}%"
```

### Flow Control
```typescript
// Page visibility
page.visible = "{{score >= threshold}}"

// Question skip logic
question.skip = "{{previousAnswer === 'no'}}"

// Dynamic branching
branch.condition = "{{age >= 18 && consent === true}}"
```

### Statistical Feedback
```typescript
// Real-time aggregation
"Average: {{responses | avg}}"
"You scored better than {{percentile}}% of participants"

// Custom formulas
"Z-Score: {{(score - mean) / stdDev}}"
```

## Performance Requirements

1. **Reaction Time**: Microsecond precision timing
2. **Frame Rate**: 120+ FPS for WebGL content
3. **Load Time**: < 100ms module load
4. **Memory**: < 50MB for runtime
5. **Offline**: 100% functionality without connection

## Testing Strategy

1. **Unit Tests**: Each module individually
2. **Integration Tests**: Runtime flow
3. **Performance Tests**: FPS, timing accuracy
4. **Offline Tests**: Full questionnaire offline
5. **Variable Tests**: Interpolation edge cases

## Migration Steps

1. Port WebGLQuestion
2. Port StatisticalFeedbackQuestion
3. Implement VariableService
4. Update Runtime
5. Update Factory
6. Remove legacy code
7. Test everything
8. Deploy

## Success Criteria

- ✅ All question types ported to modules
- ✅ No legacy code remaining
- ✅ Variables work everywhere
- ✅ Full offline support
- ✅ 120+ FPS performance maintained
- ✅ Clean, maintainable architecture