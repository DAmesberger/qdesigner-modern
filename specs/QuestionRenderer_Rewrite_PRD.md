# QuestionRenderer Rewrite PRD (Product Requirements Document)

## Overview

This document outlines the comprehensive rewrite of the QuestionRenderer system to establish a type-safe, maintainable architecture for question configuration, display, and response handling in QDesigner Modern.

## Current Problems

1. **Type Safety Issues**
   - Base Question type has `config?: any` (optional, untyped)
   - Question components expect strongly-typed required configs
   - No compile-time guarantees for configuration correctness

2. **Configuration Fragmentation**
   - Configuration spread across multiple properties: `config`, `responseType`, `settings`, direct properties
   - No single source of truth for question configuration
   - Inconsistent patterns for storing display vs response configuration

3. **Missing Default Configurations**
   - Questions created without proper default configs
   - Components must handle undefined configs at runtime
   - Leads to runtime errors and defensive programming

4. **No Separation of Concerns**
   - Designer controls mixed with runtime display logic
   - Same components handle editing and display with a `mode` prop
   - Difficult to optimize for specific use cases

## Proposed Architecture

### 1. Unified Type System

```typescript
// Base question interface with discriminated union for type safety
interface BaseQuestion {
  id: string;
  type: QuestionType;
  order: number;
  required: boolean;
  randomize?: boolean;
  timing?: TimingConfig;
  navigation?: NavigationConfig;
}

// Type-specific question interfaces
interface TextDisplayQuestion extends BaseQuestion {
  type: 'text-display';
  display: TextDisplayConfig;
  // No response config needed for display-only questions
}

interface SingleChoiceQuestion extends BaseQuestion {
  type: 'single-choice';
  display: SingleChoiceDisplayConfig;
  response: SingleChoiceResponseConfig;
  validation?: SingleChoiceValidation;
}

interface ScaleQuestion extends BaseQuestion {
  type: 'scale';
  display: ScaleDisplayConfig;
  response: ScaleResponseConfig;
  validation?: ScaleValidation;
}

// ... other question types

// Union type for all questions
type Question = TextDisplayQuestion | SingleChoiceQuestion | ScaleQuestion | /* ... */;
```

### 2. Configuration Structure

```typescript
// Display configuration - how the question appears
interface TextDisplayConfig {
  content: string;
  format: 'text' | 'markdown' | 'html';
  variables?: boolean;          // Enable variable substitution
  styling?: TextStylingConfig;
}

interface SingleChoiceDisplayConfig {
  prompt: string;
  instruction?: string;
  options: ChoiceOption[];
  layout: 'vertical' | 'horizontal' | 'grid';
  columns?: number;              // For grid layout
  showOther?: boolean;
  otherLabel?: string;
}

// Response configuration - how data is collected
interface SingleChoiceResponseConfig {
  saveAs: string;               // Variable name
  valueType: 'value' | 'label' | 'index';
  allowDeselect?: boolean;
  trackChanges?: boolean;
  trackTiming?: boolean;
}

// Validation configuration
interface SingleChoiceValidation {
  required?: boolean;
  customRules?: ValidationRule[];
}
```

### 3. Component Architecture

#### Separate Designer and Runtime Components

```
src/lib/components/
├── designer/
│   └── questions/
│       ├── TextDisplayDesigner.svelte
│       ├── SingleChoiceDesigner.svelte
│       └── ...
├── runtime/
│   └── questions/
│       ├── TextDisplayRenderer.svelte
│       ├── SingleChoiceRenderer.svelte
│       └── ...
└── shared/
    └── questions/
        ├── OptionList.svelte
        ├── ValidationMessage.svelte
        └── ...
```

#### Designer Components
- Handle configuration editing
- Provide real-time preview
- Validate configuration
- Optimized for editing experience

#### Runtime Components
- Handle response collection
- Minimal overhead for performance
- Support for WebGL rendering at 120+ FPS
- Accessibility compliant

### 4. Configuration Factory System

```typescript
// Factory for creating questions with proper defaults
class QuestionFactory {
  static create(type: QuestionType): Question {
    switch (type) {
      case 'text-display':
        return {
          id: generateId(),
          type: 'text-display',
          order: 0,
          required: false,
          display: {
            content: 'Enter your text here',
            format: 'text',
            variables: false
          }
        };
      
      case 'single-choice':
        return {
          id: generateId(),
          type: 'single-choice',
          order: 0,
          required: true,
          display: {
            prompt: 'Enter your question',
            options: [
              { id: '1', label: 'Option 1', value: '1' },
              { id: '2', label: 'Option 2', value: '2' }
            ],
            layout: 'vertical'
          },
          response: {
            saveAs: `q_${generateId()}`,
            valueType: 'value'
          }
        };
      
      // ... other types
    }
  }
}
```

### 5. Type Guards and Utilities

```typescript
// Type guards for runtime type checking
function isTextDisplayQuestion(q: Question): q is TextDisplayQuestion {
  return q.type === 'text-display';
}

function isSingleChoiceQuestion(q: Question): q is SingleChoiceQuestion {
  return q.type === 'single-choice';
}

// Configuration validators
class ConfigValidator {
  static validateTextDisplay(config: TextDisplayConfig): ValidationResult {
    const errors: string[] = [];
    
    if (!config.content?.trim()) {
      errors.push('Content is required');
    }
    
    if (config.format === 'html' && !this.isSafeHTML(config.content)) {
      errors.push('HTML contains unsafe elements');
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  // ... other validators
}
```

### 6. QuestionRenderer Implementation

```typescript
// New QuestionRenderer with proper type handling
<script lang="ts">
  import type { Question } from '$lib/types/questions';
  import { getQuestionComponent } from './questionComponents';
  
  interface Props {
    question: Question;
    value?: any;
    onChange?: (value: any) => void;
    onNext?: () => void;
    disabled?: boolean;
  }
  
  let { question, value, onChange, onNext, disabled }: Props = $props();
  
  // Get the appropriate component based on question type
  $: Component = getQuestionComponent(question.type);
</script>

{#if Component}
  <Component {question} {value} {onChange} {onNext} {disabled} />
{:else}
  <div class="error">Unknown question type: {question.type}</div>
{/if}
```

### 7. Migration Strategy

#### Phase 1: Type Definitions (Week 1)
1. Define all question type interfaces
2. Create configuration types for each question type
3. Implement type guards and validators
4. Create factory functions

#### Phase 2: Component Split (Week 2)
1. Create designer-specific components
2. Create runtime-specific components
3. Extract shared components
4. Update imports

#### Phase 3: Data Migration (Week 3)
1. Create migration utilities
2. Update existing questions to new format
3. Update designerStore to use new types
4. Test with existing questionnaires

#### Phase 4: Integration (Week 4)
1. Update QuestionRenderer
2. Update designer UI
3. Update runtime system
4. Performance testing

### 8. Benefits

1. **Type Safety**
   - Compile-time guarantees
   - Better IDE support
   - Fewer runtime errors

2. **Maintainability**
   - Clear separation of concerns
   - Consistent patterns
   - Easier to add new question types

3. **Performance**
   - Optimized runtime components
   - Smaller bundle sizes
   - Better tree-shaking

4. **Developer Experience**
   - Clear documentation
   - Intuitive APIs
   - Better error messages

### 9. Testing Strategy

1. **Unit Tests**
   - Test each configuration type
   - Test validators
   - Test factory functions
   - Test type guards

2. **Component Tests**
   - Test designer components
   - Test runtime components
   - Test shared components

3. **Integration Tests**
   - Test question creation flow
   - Test question rendering
   - Test response collection
   - Test data persistence

4. **Migration Tests**
   - Test data migration utilities
   - Test backward compatibility
   - Test edge cases

### 10. Success Metrics

1. **Zero Type Errors**: All TypeScript errors related to question types resolved
2. **100% Type Coverage**: All question configurations properly typed
3. **Performance**: No regression in rendering performance
4. **Migration Success**: All existing questionnaires work without modification
5. **Developer Adoption**: New question types can be added in < 1 hour

## Conclusion

This rewrite will establish a robust foundation for the question system, enabling type-safe development, better performance, and easier maintenance. The phased approach ensures minimal disruption while delivering immediate benefits through improved type safety and developer experience.