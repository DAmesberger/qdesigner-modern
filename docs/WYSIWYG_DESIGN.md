# WYSIWYG Questionnaire Designer - Design Document

## Vision

Transform the current structural editor into a visual WYSIWYG designer that shows questions exactly as participants will see them, while maintaining full flexibility for styling and advanced features like scripting and live testing.

## Design Principles

1. **True WYSIWYG**: What you see is exactly what participants get
2. **Flexibility First**: Support any visual design without limitations
3. **Performance**: Maintain 60+ FPS even with complex designs
4. **Progressive Enhancement**: Start simple, unlock advanced features as needed
5. **Live Everything**: Changes reflect instantly, test without switching contexts

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Designer Interface                         │
├─────────────┬─────────────────────────┬────────────────────┤
│   Sidebar   │    Canvas (WYSIWYG)     │  Properties Panel  │
│             │                         │                    │
│ • Templates │  ┌─────────────────┐   │ • Style Editor    │
│ • Elements  │  │  Page Preview   │   │ • Script Editor   │
│ • Assets    │  │                 │   │ • Logic Builder   │
│ • Pages     │  │  [Question 1]   │   │ • Animations      │
│             │  │                 │   │                    │
│             │  │  [Question 2]   │   │ Context-aware     │
│             │  │                 │   │ controls based    │
│             │  └─────────────────┘   │ on selection      │
│             │                         │                    │
│             │  Zoom: [──●──] 100%    │                    │
└─────────────┴─────────────────────────┴────────────────────┘
                           │
                    ┌──────┴──────┐
                    │ Test Runner │
                    └─────────────┘
```

## Core Components

### 1. Visual Canvas System

**Approach**: Hybrid Canvas + DOM
- Use Canvas for high-performance backgrounds, effects, and decorations
- Use DOM for interactive elements (better accessibility, native inputs)
- Seamless integration between both layers

```typescript
interface CanvasLayer {
  // Background effects, gradients, patterns
  background: CanvasRenderingContext2D;
  
  // Decorative elements, shapes, images
  decorations: CanvasRenderingContext2D;
  
  // Interactive DOM layer
  interactive: HTMLElement;
  
  // Overlay for guides, selections
  overlay: CanvasRenderingContext2D;
}
```

### 2. Flexible Styling System

**Theme Architecture**:
```typescript
interface QuestionnaireTheme {
  // Global styles
  global: {
    colors: ColorPalette;
    typography: TypographySystem;
    spacing: SpacingScale;
    effects: {
      shadows: ShadowPresets;
      animations: AnimationPresets;
      transitions: TransitionPresets;
    };
  };
  
  // Component-specific styles
  components: {
    question: QuestionStyles;
    page: PageStyles;
    response: ResponseStyles;
    // ... other components
  };
  
  // Breakpoints for responsive design
  breakpoints: BreakpointSystem;
  
  // Custom CSS injection points
  customCSS: string;
}
```

**Style Editor Features**:
- Visual color picker with palette management
- Typography controls (Google Fonts integration)
- Spacing system with visual guides
- Shadow/effect builders
- Animation timeline editor
- CSS grid/flexbox visual tools
- Responsive preview modes

### 3. Question Rendering System

**Dual-Mode Rendering**:
```typescript
interface QuestionRenderer {
  // Edit mode: Shows handles, guides, and edit controls
  renderEditMode(question: Question, theme: Theme): ReactNode;
  
  // Preview mode: Exact participant view
  renderPreviewMode(question: Question, theme: Theme): ReactNode;
  
  // Export mode: Generates production-ready code
  renderProductionMode(question: Question, theme: Theme): string;
}
```

**Visual Editing Features**:
- Inline text editing with rich formatting
- Drag-to-resize for images and media
- Visual margin/padding adjustment
- Direct manipulation of response options
- Live validation preview

### 4. Advanced Script Editor

**Monaco-based Script Environment**:
```typescript
interface ScriptingEnvironment {
  // Question lifecycle hooks
  hooks: {
    onMount: (context: QuestionContext) => void;
    onResponse: (response: Response) => void;
    onValidate: (value: any) => ValidationResult;
    onNavigate: (direction: 'next' | 'back') => boolean;
  };
  
  // Custom rendering functions
  customRender?: (props: QuestionProps) => HTMLElement;
  
  // Dynamic styling
  dynamicStyles?: (context: QuestionContext) => CSSProperties;
  
  // External API integration
  apiCalls?: {
    [key: string]: (params: any) => Promise<any>;
  };
}
```

**Features**:
- TypeScript support with type checking
- IntelliSense for questionnaire API
- Syntax highlighting and error detection
- Integrated debugger
- Code snippets and templates
- Version control integration

### 5. Live Testing System

**Instant Preview Modes**:
1. **Split View**: Designer + Live preview side-by-side
2. **Device Preview**: Test on different screen sizes
3. **Participant Mode**: Full-screen participant experience
4. **Debug Mode**: Shows variable states and timing

**Test Features**:
- Hot reload on any change
- Variable state inspector
- Response flow visualization
- Performance metrics overlay
- Accessibility checker
- Multi-language preview

## Implementation Plan

### Phase 1: Foundation (Weeks 1-2)
1. Create base WYSIWYG canvas component
2. Implement theme system data model
3. Build question renderer for basic types
4. Create style property editors

### Phase 2: Visual Editing (Weeks 3-4)
1. Implement direct manipulation controls
2. Add visual style editors
3. Create responsive design tools
4. Build animation system

### Phase 3: Advanced Features (Weeks 5-6)
1. Integrate Monaco editor for scripting
2. Add custom component system
3. Implement live testing framework
4. Create template library

### Phase 4: Polish & Performance (Week 7-8)
1. Optimize rendering performance
2. Add keyboard shortcuts
3. Implement undo/redo for visual changes
4. Create onboarding experience

## Technical Decisions

### Rendering Strategy
- **Primary**: Svelte components with reactive updates
- **Canvas**: For backgrounds, effects, and performance-critical visuals
- **WebGL**: Reuse existing renderer for special effects
- **CSS-in-JS**: Runtime styling with emotion/stitches for dynamic themes

### State Management
```typescript
interface DesignerState {
  // Existing state...
  
  // New WYSIWYG state
  view: {
    mode: 'edit' | 'preview' | 'test';
    zoom: number;
    guides: boolean;
    breakpoint: 'mobile' | 'tablet' | 'desktop';
  };
  
  theme: QuestionnaireTheme;
  
  selectedElements: string[];
  
  clipboard: ClipboardData;
}
```

### Styling Approach
1. **Base styles**: Tailwind CSS for designer UI
2. **Theme styles**: CSS-in-JS for dynamic questionnaire styling
3. **Custom styles**: Direct style attribute manipulation
4. **Animations**: Framer Motion or native Web Animations API

## UI/UX Patterns

### Direct Manipulation
- Click to select
- Drag to move
- Resize handles on corners/edges
- Inline editing for text
- Context menus for quick actions

### Property Editing
- Contextual property panel
- Visual controls (sliders, color pickers)
- Grouped properties by category
- Search/filter for properties
- Preset management

### Workspace Management
- Tabbed interface for multiple questionnaires
- Dockable panels
- Customizable layout
- Keyboard-driven workflow
- Multi-monitor support

## Example: Creating a Styled Question

```typescript
// 1. User drags question type from sidebar
<QuestionTemplate type="rating" />

// 2. Question appears in canvas with default styling
<QuestionPreview 
  question={newQuestion}
  theme={currentTheme}
  mode="edit"
/>

// 3. User clicks to select, property panel updates
<PropertyPanel 
  selection={selectedQuestion}
  onStyleChange={(styles) => updateQuestionStyles(styles)}
/>

// 4. User adjusts visual properties
// - Changes background color
// - Adjusts padding
// - Modifies font size
// - Adds shadow effect

// 5. Changes reflect immediately in canvas
<QuestionPreview 
  question={updatedQuestion}
  theme={currentTheme}
  mode="edit"
  styles={customStyles}
/>

// 6. User tests with live preview
<TestRunner 
  questionnaire={currentQuestionnaire}
  startFrom={currentPage}
/>
```

## Performance Considerations

1. **Virtual Scrolling**: For long questionnaires
2. **Lazy Loading**: Load questions as needed
3. **Debounced Updates**: Batch style changes
4. **Web Workers**: Offload heavy computations
5. **GPU Acceleration**: Use transform3d for smooth animations
6. **Differential Rendering**: Only update changed elements

## Accessibility

1. **Screen Reader Support**: Proper ARIA labels in edit mode
2. **Keyboard Navigation**: Full keyboard control
3. **High Contrast Mode**: Automatic theme adjustments
4. **Focus Indicators**: Clear focus states
5. **Zoom Support**: Interface scales properly

## Migration Strategy

1. **Compatibility Layer**: Existing questionnaires work without changes
2. **Progressive Enhancement**: Add visual features incrementally
3. **Import/Export**: Support for various formats
4. **Backwards Compatible**: Can always fall back to structural view

This WYSIWYG designer will provide the flexibility and visual control needed while maintaining the powerful features like variables, logic, and precise timing that make QDesigner unique.