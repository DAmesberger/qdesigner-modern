# Architectural Issues and Fix Plan

## Executive Summary

This document provides a comprehensive analysis of all TypeScript errors, architectural inconsistencies, and missing implementations in the QDesigner Modern codebase. It includes a prioritized plan for addressing these issues with clear dependencies and implementation order.

## 1. TypeScript Errors Analysis

### 1.1 Component Type Errors

#### MatrixQuestion Component
- **File**: `src/lib/components/questions/MatrixQuestion.svelte`
- **Issues**:
  - Line 19: Parameter 'row' implicitly has an 'any' type
  - Line 132: Cannot find name 'mobile' (should be 'isMobile')
  - Line 132: Arithmetic operation type error with template literal

**Fix**:
```typescript
// Line 19 - Add proper typing
question.config.rows.forEach((row: MatrixRow) => {
  if (!(row.id in value)) {
    // ...
  }
});

// Line 132 - Fix class binding
<div class="matrix-container" class:mobile={isMobile && mobileLayout === 'scroll'}>
```

#### Invite Page Component
- **File**: `src/routes/invite/[token]/+page.svelte`
- **Issue**: Line 216: Directive value must be a JavaScript expression enclosed in curly braces
- **Root Cause**: Syntax error in event handler

**Fix**:
```svelte
<button
  class="w-full"
  on:click={async () => {
    await supabase.auth.signOut();
    // rest of handler
  }}
>
```

### 1.2 Missing Type Definitions

#### Dashboard Types
- **Issue**: Missing `QuestionnaireStats` and `QuestionnaireListItem` types
- **Used in**: `src/routes/(app)/dashboard/+page.svelte`

**Fix**: Create `/src/lib/types/dashboard.ts`:
```typescript
export interface QuestionnaireStats {
  activeQuestionnaires: number;
  totalResponses: number;
  averageCompletionRate: number;
  activeParticipants: number;
}

export interface QuestionnaireListItem {
  questionnaire_id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
  total_responses: number;
  completed_responses: number;
  avg_completion_time?: number;
  response_rate_7d: number;
}
```

## 2. Architectural Inconsistencies

### 2.1 Duplicate Module Problem

The codebase has multiple implementations of the same modules, causing confusion and import errors:

#### VariableEngine Duplicates
1. `/src/lib/core/scripting/VariableEngine.ts`
2. `/src/lib/questionnaire/variables/VariableEngine.ts`
3. `/src/lib/scripting-engine/VariableEngine.ts`

**Resolution**: 
- Keep only `/src/lib/scripting-engine/VariableEngine.ts` as the canonical implementation
- Update all imports to use this single source
- Delete duplicate files

#### WebGLRenderer Duplicates
1. `/src/lib/core/renderer/WebGLRenderer.ts`
2. `/src/lib/renderer/WebGLRenderer.ts`

**Resolution**:
- Keep only `/src/lib/renderer/WebGLRenderer.ts`
- Update imports throughout the codebase
- Delete duplicate file

#### DesignerStore Duplicates
1. `/src/lib/stores/designerStore.ts`
2. `/src/lib/features/designer/stores/designerStore.ts`

**Resolution**:
- Keep only `/src/lib/features/designer/stores/designerStore.ts`
- Update all imports
- Delete duplicate file

### 2.2 Import Path Inconsistencies

The codebase uses inconsistent import paths:
- Some use `$lib/...`
- Some use `@/...`
- Some use `~/...`

**Resolution**: Standardize on `$lib/...` for all internal imports (SvelteKit convention)

### 2.3 Missing Runtime Renderer Base Class

The runtime renderers extend `BaseRenderer` from `./QuestionRenderer`, but this export may be missing.

**Fix**: Ensure `QuestionRenderer.ts` exports `BaseRenderer`:
```typescript
export { BaseRenderer } from './QuestionRenderer';
```

## 3. Missing Implementations

### 3.1 Runtime System Components

#### Missing ResourceManager
- **Required by**: All renderer classes
- **Location**: Should be at `/src/lib/runtime/resources/ResourceManager.ts`

**Implementation**:
```typescript
export class ResourceManager {
  private cache = new Map<string, any>();
  
  async loadImage(url: string): Promise<HTMLImageElement> {
    // Implementation
  }
  
  async loadAudio(url: string): Promise<HTMLAudioElement> {
    // Implementation
  }
  
  async loadVideo(url: string): Promise<HTMLVideoElement> {
    // Implementation
  }
  
  async loadText(url: string): Promise<string> {
    // Implementation
  }
  
  get(key: string): any {
    return this.cache.get(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
}
```

### 3.2 Missing UI Components

Several UI components are imported but not implemented:
- Various skeletons in `/src/lib/components/ui/skeletons/`
- Form components in `/src/lib/components/ui/forms/`

## 4. Implementation Order and Dependencies

### Phase 1: Critical Type Fixes (Immediate)
1. Fix MatrixQuestion type errors
2. Fix invite page syntax error
3. Create dashboard types file
4. Fix all Svelte warnings (self-closing tags, a11y issues)

### Phase 2: Module Consolidation (Day 1)
1. Consolidate VariableEngine implementations
   - Update all imports
   - Run tests to verify
2. Consolidate WebGLRenderer implementations
   - Update imports in runtime system
   - Verify rendering still works
3. Consolidate designerStore
   - Update component imports
   - Test designer functionality

### Phase 3: Import Path Standardization (Day 1-2)
1. Create script to update all imports to use `$lib/...`
2. Run script and verify build
3. Update any remaining manual cases

### Phase 4: Runtime System Completion (Day 2-3)
1. Implement ResourceManager
2. Fix BaseRenderer export
3. Implement missing renderer methods
4. Create comprehensive runtime tests

### Phase 5: UI Component Implementation (Day 3-4)
1. Implement missing skeleton components
2. Complete form component set
3. Add component documentation

### Phase 6: Testing and Validation (Day 4-5)
1. Run full test suite
2. Fix any failing tests
3. Add tests for new implementations
4. Performance testing of runtime system

## 5. Code Examples for Key Fixes

### 5.1 Import Path Update Script
```bash
#!/bin/bash
# update_imports.sh

# Update @/ imports to $lib/
find src -name "*.ts" -o -name "*.svelte" | xargs sed -i "s|from '@/|from '\$lib/|g"
find src -name "*.ts" -o -name "*.svelte" | xargs sed -i "s|from \"@/|from \"\$lib/|g"

# Update ~/ imports to $lib/
find src -name "*.ts" -o -name "*.svelte" | xargs sed -i "s|from '~/|from '\$lib/|g"
find src -name "*.ts" -o -name "*.svelte" | xargs sed -i "s|from \"~/|from \"\$lib/|g"
```

### 5.2 Renderer Factory Pattern
```typescript
// src/lib/runtime/renderers/RendererFactory.ts
import { TextRenderer } from './TextRenderer';
import { ImageRenderer } from './ImageRenderer';
import { VideoRenderer } from './VideoRenderer';
import { AudioRenderer } from './AudioRenderer';
import { HTMLRenderer } from './HTMLRenderer';
import { CompositeRenderer } from './CompositeRenderer';

export class RendererFactory {
  static create(type: string, config: RendererConfig): IQuestionRenderer {
    switch (type) {
      case 'text':
        return new TextRenderer(config.id, config);
      case 'image':
        return new ImageRenderer(config.id, config);
      case 'video':
        return new VideoRenderer(config.id, config);
      case 'audio':
        return new AudioRenderer(config.id, config);
      case 'html':
        return new HTMLRenderer(config.id, config);
      case 'composite':
        return new CompositeRenderer(config.id, config);
      default:
        throw new Error(`Unknown renderer type: ${type}`);
    }
  }
}
```

## 6. Testing Strategy

### Unit Tests Required
1. VariableEngine consolidation tests
2. ResourceManager tests
3. Renderer base class tests
4. Import path verification tests

### Integration Tests Required
1. Designer workflow with consolidated stores
2. Runtime system with all renderers
3. Dashboard with proper types
4. Full questionnaire fillout flow

### E2E Tests to Update
1. Designer tests may need selector updates
2. Runtime tests need to verify renderer functionality
3. Dashboard tests with new type structure

## 7. Risk Assessment

### High Risk Areas
1. **Runtime System**: Core functionality, needs careful testing
2. **Import Path Changes**: Could break many files if done incorrectly
3. **Store Consolidation**: Affects state management across app

### Mitigation Strategies
1. Create comprehensive backups before major changes
2. Run tests after each phase
3. Use version control effectively with clear commit messages
4. Test in staging environment before production

## 8. Success Criteria

The refactoring will be considered complete when:
1. `pnpm check` runs with 0 errors
2. All tests pass (`pnpm test`)
3. E2E tests pass (`pnpm test:e2e`)
4. No duplicate modules exist
5. All imports use consistent `$lib/...` paths
6. Runtime system successfully renders all question types
7. Dashboard displays with proper typing
8. Build succeeds without warnings

## 9. Maintenance Guidelines

Going forward:
1. Always run `pnpm check` before committing
2. Use only `$lib/...` for imports
3. Keep modules in their designated locations
4. Write tests for new features
5. Document architectural decisions
6. Regular code reviews to prevent duplication

## 10. Timeline Summary

- **Day 1**: Critical fixes + Module consolidation
- **Day 2**: Import standardization + Runtime system start
- **Day 3**: Complete runtime system + Start UI components  
- **Day 4**: Complete UI components + Testing
- **Day 5**: Final testing + Documentation

Total estimated time: 5 development days

This plan provides a systematic approach to resolving all architectural issues while minimizing risk and ensuring the application remains functional throughout the refactoring process.