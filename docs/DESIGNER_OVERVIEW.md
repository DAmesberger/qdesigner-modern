# QDesigner Modern - Questionnaire Designer Overview

## Foundation Architecture

### Core Components Built

#### 1. **Designer Store** (`designerStore.ts`)
The central state management for the entire questionnaire designer:

- **State Management**: Uses Svelte stores with Immer for immutable updates
- **Undo/Redo**: Full history tracking with 50-step buffer
- **Variable Engine Integration**: Automatic variable registration and validation
- **Operations**: 
  - Page management (add, update, delete, reorder)
  - Question management (add, update, delete, move between pages)
  - Variable management with formula validation
  - Flow control for conditional logic
  - Import/Export functionality

#### 2. **Visual Designer Interface**

**Main Layout** (`Designer.svelte`):
- Toolbar with save, export, import, preview controls
- Three-panel layout:
  - Left: Question palette, variable manager, flow control
  - Center: Page canvas with drag-and-drop
  - Right: Properties panel for selected items
- Status bar with validation and statistics

**Question Palette** (`QuestionPalette.svelte`):
- Draggable question types:
  - Text/Instruction
  - Multiple Choice
  - Rating Scale
  - Reaction Test
  - Media Stimulus
  - Custom Question
- Native HTML5 drag-and-drop API

**Page Canvas** (`PageCanvas.svelte`):
- Visual representation of questionnaire pages
- Drop zones for adding questions
- Reorderable question cards
- Empty state guidance

**Question Cards** (`QuestionCard.svelte`):
- Visual question representation
- Drag handles for reordering
- Quick actions (edit, delete)
- Status badges (variables, conditions, timing)

**Variable Manager** (`VariableManager.svelte`):
- Create and edit variables
- Support for multiple data types
- Formula editor with syntax help
- Visual dependency tracking

**Properties Panel** (`PropertiesPanel.svelte`):
- Context-sensitive property editing
- Real-time updates
- Support for:
  - Question properties
  - Page settings
  - Variable configuration
  - Stimulus settings
  - Timing constraints

### Data Model

#### Questionnaire Structure
```typescript
{
  id: string,
  name: string,
  pages: Page[],
  questions: Question[],
  variables: Variable[],
  flow: FlowControl[],
  settings: QuestionnaireSettings
}
```

#### Key Features

1. **Variable System**:
   - Mathematical formulas: `age * 10 + reactionTime`
   - Conditional logic: `IF(score > 90, "A", "B")`
   - Array operations: `SUM()`, `AVG()`, `COUNT()`
   - String operations: `CONCAT()`, `LENGTH()`
   - Time functions: `NOW()`, `TIME_SINCE()`
   - Automatic dependency tracking
   - Circular dependency detection

2. **Question Types**:
   - Modular architecture for easy extension
   - Each type has:
     - Stimulus options (text, image, video, audio)
     - Response configuration
     - Timing settings
     - Variable assignments

3. **Flow Control**:
   - Page-level conditions
   - Question-level visibility
   - Dynamic branching based on variables
   - Loop support for repeated sections

4. **Response Types**:
   - Single/Multiple choice
   - Text/Number input
   - Rating scales
   - Keypress detection
   - Mouse click tracking
   - Custom response handlers

### Drag-and-Drop Implementation

- **New Questions**: Drag from palette to canvas
- **Reordering**: Drag questions within a page
- **Moving**: Drag questions between pages
- **Visual Feedback**: Drop indicators and hover states

### State Persistence

- **JSON Export**: Complete questionnaire definition
- **Undo/Redo**: Full editing history
- **Auto-save Ready**: State changes trigger modified timestamp
- **Import**: Load existing questionnaires

## Next Steps for Full Implementation

### 1. Question Type Implementations
Create the actual question components that render in the designer and runtime:
- Text/Instruction component
- Multiple choice with option management
- Scale questions with customizable ranges
- Media stimulus handlers
- Reaction test integration

### 2. Runtime Engine
Build the WebGL-based execution engine:
- Question renderer using WebGL
- Precise timing with performance.now()
- Response collection
- Variable updates during execution
- Flow control execution

### 3. Response Collection
Implement data collection:
- Timestamp all interactions
- Reaction time measurements
- Response validation
- Progress tracking
- Session management

### 4. Export Functionality
Add data export capabilities:
- CSV for Excel
- SPSS syntax files
- JSON with full timing data
- Custom format support

### 5. Advanced Features
- Media library management
- Question templates
- Collaborative editing
- Version control
- A/B testing support

## Usage Example

```javascript
// Creating a simple questionnaire
designerStore.addPage();
designerStore.addVariable({
  name: 'age',
  type: 'number',
  description: 'Participant age'
});
designerStore.addQuestion('page1', 'text');
designerStore.updateQuestion('q1', {
  prompt: { text: 'Welcome to the study!' }
});
```

## Design Principles

1. **Visual First**: WYSIWYG editing with immediate feedback
2. **Flexible Variables**: Powerful formula system for complex logic
3. **Performance**: WebGL rendering for precise timing
4. **Extensible**: Modular architecture for custom question types
5. **User Friendly**: Drag-and-drop with clear visual indicators

The foundation is now ready for implementing the specific question types and runtime engine while maintaining the sophisticated variable system and flow control capabilities that make QDesigner powerful.