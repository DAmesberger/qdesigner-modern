# WYSIWYG Implementation Guide

## Overview

This guide explains how to integrate the new WYSIWYG components into the existing QDesigner architecture. The approach maintains backward compatibility while adding powerful visual editing capabilities.

## Components Created

### 1. **Theme System** (`packages/shared/src/types/theme.ts`)
- Comprehensive theme definition with colors, typography, spacing, effects
- Component-specific styling for questions, pages, responses
- Support for breakpoints and custom CSS

### 2. **Visual Question Renderer** (`QuestionVisualRenderer.svelte`)
- Renders questions exactly as participants will see them
- Supports edit mode with inline editing
- Handles all question types (choice, text, scale, etc.)
- Direct manipulation of question properties

### 3. **Style Editor** (`StyleEditor.svelte`)
- Visual controls for all theme properties
- Organized into Global, Page, and Question styles
- Color pickers, sliders, and select controls
- Custom CSS injection support

### 4. **Script Editor** (`ScriptEditor.svelte`)
- Monaco-based code editor with TypeScript support
- Predefined hooks for question lifecycle
- IntelliSense for questionnaire API
- Syntax highlighting and error detection

### 5. **Live Test Runner** (`LiveTestRunner.svelte`)
- Instant preview in desktop/tablet/mobile modes
- Real participant experience
- Variable state tracking
- Response collection with timing

## Integration Steps

### Step 1: Update the Designer Store

```typescript
// In designerStore.ts, add:
interface DesignerState {
  // ... existing state
  
  // WYSIWYG state
  viewMode: 'structural' | 'wysiwyg';
  theme: QuestionnaireTheme;
  customScripts: Record<string, string>; // questionId -> script
  previewDevice: 'desktop' | 'tablet' | 'mobile';
  showGrid: boolean;
  snapToGrid: boolean;
}

// Add theme management actions
setTheme: (theme: QuestionnaireTheme) => update(state =>
  produce(state, draft => {
    draft.theme = theme;
  })
),

updateThemeProperty: (path: string[], value: any) => update(state =>
  produce(state, draft => {
    // Update nested theme property
    let obj = draft.theme;
    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
  })
),

setQuestionScript: (questionId: string, script: string) => update(state =>
  produce(state, draft => {
    draft.customScripts[questionId] = script;
  })
),
```

### Step 2: Create WYSIWYG Canvas Component

```svelte
<!-- WYSIWYGCanvas.svelte -->
<script lang="ts">
  import { designerStore, currentPage, currentPageQuestions } from '../stores/designerStore';
  import QuestionVisualRenderer from './QuestionVisualRenderer.svelte';
  import { dndzone } from 'svelte-dnd-action';
  
  $: items = $currentPageQuestions.map(q => ({ id: q.id, question: q }));
  
  function handleDndConsider(e) {
    items = e.detail.items;
  }
  
  function handleDndFinalize(e) {
    items = e.detail.items;
    // Update question order in store
    const questionIds = items.map(item => item.id);
    designerStore.updatePageQuestions($currentPage.id, questionIds);
  }
</script>

<div 
  class="wysiwyg-canvas"
  style="background: {$designerStore.theme.components.page.background}"
>
  <div 
    class="page-container"
    style={Object.entries($designerStore.theme.components.page)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
      .join('; ')}
  >
    <div
      class="questions-list"
      use:dndzone={{ 
        items,
        flipDurationMs: 300,
        dropTargetStyle: {}
      }}
      on:consider={handleDndConsider}
      on:finalize={handleDndFinalize}
    >
      {#each items as item (item.id)}
        <div class="question-wrapper" data-question-id={item.id}>
          <QuestionVisualRenderer
            question={item.question}
            theme={$designerStore.theme}
            mode="edit"
            selected={$designerStore.selectedItemId === item.id}
            on:select={() => designerStore.selectItem(item.id, 'question')}
            on:update={(e) => designerStore.updateQuestion(item.id, e.detail)}
            on:delete={() => designerStore.deleteQuestion(item.id)}
            on:edit-properties={() => {
              designerStore.selectItem(item.id, 'question');
              // Properties panel will auto-update
            }}
          />
        </div>
      {/each}
    </div>
  </div>
</div>
```

### Step 3: Update Properties Panel

```svelte
<!-- In PropertiesPanel.svelte, add tabs: -->
<script>
  import StyleEditor from '../wysiwyg/StyleEditor.svelte';
  import ScriptEditor from '../wysiwyg/ScriptEditor.svelte';
  
  let activeTab: 'properties' | 'style' | 'script' = 'properties';
</script>

<div class="properties-panel">
  <!-- Tab buttons -->
  <div class="tabs">
    <button 
      class:active={activeTab === 'properties'}
      on:click={() => activeTab = 'properties'}
    >
      Properties
    </button>
    <button 
      class:active={activeTab === 'style'}
      on:click={() => activeTab = 'style'}
    >
      Style
    </button>
    <button 
      class:active={activeTab === 'script'}
      on:click={() => activeTab = 'script'}
      disabled={!$selectedItem || $selectedItemType !== 'question'}
    >
      Script
    </button>
  </div>
  
  <!-- Tab content -->
  {#if activeTab === 'properties'}
    <!-- Existing properties content -->
  {:else if activeTab === 'style'}
    <StyleEditor
      theme={$designerStore.theme}
      selectedElement={$selectedItemType || 'global'}
      on:update={(e) => designerStore.updateThemeProperty(e.detail.path, e.detail.value)}
    />
  {:else if activeTab === 'script' && $selectedItem}
    <ScriptEditor
      question={$selectedItem}
      onUpdate={(script) => designerStore.setQuestionScript($selectedItem.id, script)}
    />
  {/if}
</div>
```

### Step 4: Add View Mode Toggle

```svelte
<!-- In Designer.svelte toolbar: -->
<div class="view-mode-toggle">
  <button
    class:active={$designerStore.viewMode === 'structural'}
    on:click={() => designerStore.setViewMode('structural')}
  >
    <svg><!-- Structure icon --></svg>
    Structure
  </button>
  <button
    class:active={$designerStore.viewMode === 'wysiwyg'}
    on:click={() => designerStore.setViewMode('wysiwyg')}
  >
    <svg><!-- Visual icon --></svg>
    Visual
  </button>
</div>

<!-- In main canvas area: -->
{#if $designerStore.viewMode === 'structural'}
  <PageCanvas /> <!-- Existing component -->
{:else}
  <WYSIWYGCanvas />
{/if}
```

### Step 5: Add Test Runner Integration

```svelte
<!-- In Designer.svelte: -->
<script>
  import LiveTestRunner from '../wysiwyg/LiveTestRunner.svelte';
  
  let showTestRunner = false;
  let testStartPage = null;
</script>

<!-- Add test button to toolbar -->
<button
  class="test-btn"
  on:click={() => {
    showTestRunner = true;
    testStartPage = $currentPage?.id;
  }}
>
  <svg><!-- Play icon --></svg>
  Test
</button>

<!-- Test runner overlay -->
{#if showTestRunner}
  <LiveTestRunner
    questionnaire={$designerStore.questionnaire}
    theme={$designerStore.theme}
    startPageId={testStartPage}
    showDebugInfo={true}
    on:close={() => showTestRunner = false}
    on:response={(e) => console.log('Test response:', e.detail)}
    on:complete={(e) => console.log('Test complete:', e.detail)}
  />
{/if}
```

## Migration Strategy

### Phase 1: Side-by-side Implementation
1. Keep existing structural view as default
2. Add WYSIWYG as optional view mode
3. Share the same data model

### Phase 2: Feature Parity
1. Ensure all operations work in both views
2. Add visual-only features (themes, styling)
3. Implement import/export for themes

### Phase 3: Default to WYSIWYG
1. Make WYSIWYG the default view
2. Keep structural view as "advanced mode"
3. Add onboarding for new features

## Performance Optimizations

### 1. Virtual Scrolling for Long Questionnaires
```typescript
// Use svelte-virtual-list for questionnaires with 50+ questions
import VirtualList from 'svelte-virtual-list';
```

### 2. Debounced Theme Updates
```typescript
// Debounce style changes to prevent excessive re-renders
import { debounce } from 'lodash-es';

const debouncedThemeUpdate = debounce((path, value) => {
  designerStore.updateThemeProperty(path, value);
}, 100);
```

### 3. Lazy Load Monaco Editor
```typescript
// Only load Monaco when script tab is opened
let monacoLoaded = false;

async function loadMonaco() {
  if (!monacoLoaded) {
    await import('monaco-editor');
    monacoLoaded = true;
  }
}
```

## Advanced Features

### 1. Theme Presets
```typescript
const themePresets = {
  modern: { /* ... */ },
  classic: { /* ... */ },
  minimal: { /* ... */ },
  academic: { /* ... */ },
};
```

### 2. Responsive Preview
```typescript
// Add responsive breakpoint preview
const breakpoints = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
};
```

### 3. Animation Designer
```typescript
// Visual animation timeline editor
interface Animation {
  trigger: 'onEnter' | 'onExit' | 'onFocus';
  duration: number;
  easing: string;
  properties: Record<string, any>;
}
```

### 4. Component Library
```typescript
// Pre-built question templates
const questionTemplates = {
  'likert-5': { /* ... */ },
  'nps-score': { /* ... */ },
  'matrix-grid': { /* ... */ },
};
```

## Testing Strategy

### 1. Visual Regression Tests
- Use Playwright for screenshot comparisons
- Test each question type with different themes
- Verify responsive behavior

### 2. Interaction Tests
- Test drag-and-drop in WYSIWYG mode
- Verify inline editing
- Test theme property updates

### 3. Performance Tests
- Measure render time for large questionnaires
- Test memory usage with multiple themes
- Verify smooth animations

## Conclusion

This WYSIWYG implementation provides:
- **True visual editing** - See exactly what participants see
- **Full flexibility** - Complete control over styling and behavior
- **Advanced features** - Scripting, animations, responsive design
- **Smooth migration** - Works alongside existing features

The modular approach allows incremental adoption while maintaining the powerful features that make QDesigner unique.