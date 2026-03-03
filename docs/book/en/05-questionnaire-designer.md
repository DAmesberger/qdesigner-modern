# Chapter 5: The Questionnaire Designer

The QDesigner questionnaire designer is the central workspace for building, configuring, and previewing questionnaires. It provides a full-featured visual editing environment with drag-and-drop composition, real-time preview, a variable system, flow control logic, and deep configurability for every question type.

This chapter covers the designer interface layout, the structural hierarchy of questionnaires, and the core editing workflows.

## 5.1 Interface Overview

The designer follows a three-column layout with a compact header toolbar. Each region serves a distinct purpose in the editing workflow.

### Header Toolbar

The header bar spans the full width of the screen and provides:

- **Breadcrumb navigation**: Projects > [Project Name] > [Questionnaire Title]. Each segment is a clickable link.
- **Editable title**: Click the questionnaire name to rename it inline. Press Enter to confirm or Escape to cancel.
- **Save indicator**: A color-coded dot shows the current save state:
  - Green = saved
  - Amber (pulsing) = unsaved changes
  - Blue (spinning) = saving in progress
  - Red = save error
- **Experimental Design button**: Opens the experimental design configuration panel (conditions, counterbalancing, assignment strategy).
- **Data Quality button**: Opens data quality settings (minimum page time, flatline detection, attention checks).
- **Share button**: Opens the distribution panel for generating participant links and configuring access.
- **Preview button** (Ctrl+P): Toggles the live preview modal with desktop, tablet, and mobile viewports.
- **Publish button** (Ctrl+Shift+Enter): Validates and publishes the questionnaire. Displays a red dot if validation errors exist; disabled when there are no questions or active errors.

On mobile devices, the breadcrumb is replaced by a back arrow, and left/right panel toggles appear as hamburger-style drawer buttons.

### Left Sidebar: Icon Rail and Flyout Panels

The left sidebar consists of two layers:

1. **Icon Rail** (always visible on desktop): A narrow vertical strip of icon buttons providing access to the five main panels:
   - **Structure** (Layers icon): Opens the Block Manager -- a tree view of pages, blocks, and questions.
   - **Add** (Plus icon): Opens the Question Palette for adding new modules.
   - **Templates** (Library icon): Opens the Template Library with reusable questionnaire patterns.
   - **Variables** (Variable icon): Opens the Variable Manager for creating and managing variables and formulas.
   - **Flow** (GitBranch icon): Opens the Flow Control Manager for skip logic, branching, loops, and terminate conditions.

   At the bottom of the rail:
   - **View toggle**: Switch between WYSIWYG (visual) and structural view modes.
   - **Help** (Ctrl+K): Opens the command palette.

2. **Flyout Panel**: When a rail icon is clicked, a panel slides out over the canvas (on desktop) with the corresponding editor. Clicking the backdrop or the X button closes it.

On mobile, the left sidebar becomes a full-width drawer with tab navigation across the five panels.

### Center: The Canvas

The canvas is the main editing area. It renders the currently selected page and its blocks/questions. Two view modes are available:

- **WYSIWYG mode**: A visual representation of how the questionnaire will appear to respondents, rendered through the `WYSIWYGCanvas` component. Questions are displayed as cards that can be selected, reordered via drag-and-drop, and edited inline.
- **Structural mode**: A compact, data-oriented view showing question types, IDs, and configuration summaries without visual rendering.

The canvas supports zoom in/out (Ctrl+= / Ctrl+-) and zoom reset (Ctrl+0).

### Right Sidebar: Properties Panel

The right sidebar appears automatically when a question, page, block, or variable is selected. It contains the **Properties Panel** with three tabs:

- **Properties**: Type-specific configuration fields for the selected item (prompt text, options, validation rules, display settings, carry-forward configuration, attention checks).
- **Style**: Visual styling controls through the Style Editor (colors, typography, spacing, shadows, custom CSS).
- **Script**: The Monaco-based script editor for writing event hooks and custom logic (available for questions only).

The right panel can be **pinned** open using the pin button, so it remains visible even when no item is selected. It can also be closed manually.

## 5.2 Pages, Blocks, and Questions

QDesigner uses a three-level hierarchy to organize questionnaire content:

### Pages

A page is the top-level container. Each page represents one screen that a respondent sees at a time. Pages have:

- A name (optional, defaults to "Page 1", "Page 2", etc.)
- Display conditions (formulas that control visibility)
- Settings: show title, show progress bar, allow navigation, auto-advance, time limit.
- One or more blocks.

To add a page, click the "+ Page" button in the Structure panel header or use the command palette (Ctrl+K, then "Add Page").

### Blocks

Blocks group questions within a page. Every question belongs to a block. Blocks come in four types:

| Block Type | Description |
|---|---|
| **Standard** | Questions appear in the defined order. |
| **Randomized** | Questions are shuffled randomly. Configure "Preserve First N" and "Preserve Last N" to fix anchor items. |
| **Conditional** | The block is only shown when its condition evaluates to true. |
| **Loop** | The block repeats a configurable number of iterations. Supports an iteration variable and an exit condition. |

Blocks can also be assigned to an **experimental condition** if the questionnaire uses experimental design. Only participants assigned to that condition will see the block.

To add a block: open the Structure panel, hover over a page node, and click the + button. In the modal, choose a block type, give it a name, and configure any type-specific settings.

### Questions

Questions are the atomic elements of a questionnaire. Each question has:

- A **type** (one of 16+ registered module types)
- An **order** within its block
- A **display configuration** (prompt, options, layout, etc.)
- A **response configuration** (how the answer is saved and typed)
- **Validation rules** (required, min/max, pattern, custom)
- **Conditional logic** (show/enable/require formulas)
- **Timing configuration** (min/max time, timer display)
- **Attention check** settings (instructed or trap type)

Questions can be added via the Question Palette, the command palette, or drag-and-drop from the palette onto the canvas.

## 5.3 Adding Questions

### The Question Palette

The Question Palette (accessed via the + icon in the left rail) provides a searchable, categorized list of all registered question modules. Modules are organized into two categories:

- **Display**: Text Display, Text Instruction, Bar Chart, Statistical Feedback
- **Questions**: Multiple Choice, Scale, Rating, Text Input, Number Input, Matrix, Ranking, Date/Time, File Upload, Drawing, Reaction Time, WebGL

Each module card shows:
- Name and description
- Capability badges: "Variables", "Conditionals", "Timing" (shown when the module supports those features)
- A + icon on hover

**To add a question:**
1. Ensure a page and block are selected (or at least a page, which will use the first block).
2. **Click** a module card to add it instantly to the current block, or
3. **Drag** a module card onto the canvas to place it at a specific position.

The palette includes a search field that filters modules by name, description, or type identifier.

### Command Palette

Press **Ctrl+K** to open the command palette. Type to filter commands. Useful quick-add commands:

| Command | Shortcut |
|---|---|
| Add Text Input Question | T |
| Add Multiple Choice Question | M |
| Add Reaction Time Question | R |
| Add Page | P |

## 5.4 The Properties Panel

When a question is selected, the Properties Panel appears in the right sidebar with three tabs.

### Properties Tab

This is the primary configuration surface. Its contents vary by question type but always include:

- **Question name**: An internal identifier for reference in variables and conditions.
- **Required toggle**: Whether the question must be answered before proceeding.
- **Prompt text**: The question text shown to respondents (supports markdown and `{{variable}}` interpolation).
- **Type-specific fields**: Options for choice questions, scale range for scales, stimulus configuration for reaction time tasks, canvas dimensions for drawing, etc.
- **Validation**: Minimum/maximum values, patterns, custom rules.
- **Conditional logic**: Show condition, enable condition, require condition -- each accepts a formula expression.
- **Timing**: Minimum time, maximum time, show timer, warning time.
- **Carry-forward**: Pipe selected options from a previous choice question into this question's options, with configurable modes (selected, unselected, all) and target fields.
- **Attention check**: Enable attention checking with a correct answer and type (instructed or trap).

For **page** items, the panel shows page name, display conditions, and page-level settings.

For **variable** items, the panel shows variable metadata (name, type, default value, formula, description).

### Style Tab

The Style Editor provides visual controls organized into three scopes:

- **Global**: Colors (primary, background, text, border), typography (font family, base size), effects (shadows, border radius).
- **Page**: Background color, padding, max width.
- **Question**: Container background, padding, border radius, shadow, prompt font size, font weight, text color.

A **Custom CSS** textarea is always available for writing arbitrary styles.

Available font families: System UI, Arial, Georgia, Times New Roman, Courier New, Inter, Roboto.

### Script Tab

The Script tab uses a Monaco Editor instance (the same editor powering VS Code) to provide a rich code editing experience. It includes:

- Syntax highlighting for JavaScript/TypeScript
- IntelliSense with auto-completion
- Type definitions for the QDesigner API (QuestionAPI.Context, VariableSystem, Response, etc.)
- Format on paste and type
- Ctrl+S save shortcut
- Ctrl+Space for suggestions

The script template provides four event hooks:

```javascript
export const hooks = {
  onMount: (context) => { /* Question mounted */ },
  onResponse: (response, context) => { /* User responded */ },
  onValidate: (value, context) => { /* Return true or error message */ },
  onNavigate: (direction, context) => { /* Return true to allow */ }
};
```

Additional exports: `customRender`, `dynamicStyles`, `apiCalls`.

## 5.5 Block Manager

The Block Manager (Structure panel) displays the complete questionnaire hierarchy as a collapsible tree:

```
Page 1
  +-- Block: Demographics (standard) (3 questions)
  |   +-- Q: What is your age? [number-input]
  |   +-- Q: What is your gender? [single-choice]
  |   +-- Q: Education level [single-choice]
  +-- Block: Personality Scale (randomized) (5 questions)
      +-- Q: I enjoy being around people [scale]
      +-- ...
Page 2
  +-- Block: Reaction Time Trials (loop, 10 iterations)
      +-- Q: Reaction task [reaction-time]
```

**Features:**
- Click a page to navigate to it. Click a block to select it. Click a question to select it in the Properties Panel.
- Hover over a page to reveal the + button for adding blocks.
- Hover over a block to reveal edit and delete buttons.
- The current page and block are auto-expanded and highlighted.
- Block type icons: file (standard), shuffle (randomized), git-fork (conditional), repeat (loop).
- Question type icons are shown for each question.
- Experimental conditions are shown as badges on blocks.

## 5.6 Style Editor

The Style Editor is accessible from the Style tab of the Properties Panel. It provides hierarchical styling:

### Global Styles

Control the overall visual identity of the questionnaire:

- **Colors**: Primary color (brand), background, text color, border color. Each controlled by a color picker.
- **Typography**: Font family (7 options), base font size (XS through 3XL).
- **Effects**: Shadow intensity (none, small, medium, large), border radius (none through XL).

### Page Styles

- **Background**: Color picker for the page background.
- **Padding**: Slider from 0 to 128px in 8px increments.
- **Max Width**: Small (512px), Medium (768px), Large (1024px), XL (1280px), or Full Width.

### Question Styles

- **Container**: Background color, padding (0-64px), border radius (0-24px), shadow.
- **Prompt text**: Font size, font weight (300-700), text color.

### Custom CSS

A monospace textarea where arbitrary CSS can be written. This CSS is applied to the questionnaire at runtime, allowing researchers to achieve any visual design that the structured controls cannot express.

## 5.7 Preview Mode

The Preview mode (toggled via Ctrl+P or the Preview button in the header) opens a modal containing the `RealtimePreview` component. It provides:

- **Live rendering**: The questionnaire is rendered exactly as respondents will see it, with all styling, conditions, and variable interpolation active.
- **Auto-update**: Changes in the designer are reflected in the preview after a 300ms debounce.
- **Interactive mode**: Questions can be answered in the preview, allowing researchers to test the complete respondent experience.
- **Device types**: Desktop, tablet, and mobile viewports can be selected.
- **Debug panel**: When enabled, shows variable values, flow state, and timing information in real time.

## 5.8 Command Palette and Keyboard Shortcuts

Press **Ctrl+K** to open the command palette. It provides fuzzy search across all available commands, grouped by section:

### Add Commands
| Command | Shortcut |
|---|---|
| Add Text Input Question | T |
| Add Multiple Choice Question | M |
| Add Reaction Time Question | R |
| Add Page | P |

### Edit Commands
| Command | Shortcut |
|---|---|
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z |
| Duplicate Selected Item | Ctrl+D |
| Delete Selected Item | Del |

### View Commands
| Command | Shortcut |
|---|---|
| Switch to Visual View | -- |
| Switch to Structure View | -- |
| Zoom In | Ctrl+= |
| Zoom Out | Ctrl+- |
| Reset Zoom | Ctrl+0 |

### Panel Commands
| Command | Description |
|---|---|
| Open Structure Panel | Shows the tree view |
| Open Add Panel | Shows the question palette |
| Open Variables Panel | Shows the variable manager |
| Open Flow Panel | Shows flow control |

### Action Commands
| Command | Shortcut |
|---|---|
| Save Questionnaire | Ctrl+S |
| Publish Questionnaire | Ctrl+Shift+Enter |
| Toggle Preview | Ctrl+P |
| Run Live Test | -- |

## 5.9 Undo/Redo

The designer maintains a full undo/redo history. Every state-mutating operation (adding, deleting, or modifying questions, pages, blocks, variables, or flow controls) is recorded.

- **Undo**: Ctrl+Z or the command palette.
- **Redo**: Ctrl+Shift+Z or the command palette.

The undo stack is preserved for the duration of the editing session. Saving does not clear the undo history.

## 5.10 Save and Auto-Save

The designer tracks all changes through a "dirty" flag. The save indicator in the header toolbar reflects the current state in real time.

- **Manual save**: Ctrl+S or the "Save Questionnaire" command.
- **Auto-save**: The designer automatically saves when changes are detected, after a configurable debounce period.
- **Publish**: Publishing first saves, then validates, then marks the questionnaire as published. A published questionnaire receives a distribution URL.

If a save fails, the indicator turns red and a tooltip shows the error message. The designer will retry on the next save trigger.

The questionnaire content is persisted as JSONB in the `questionnaire_definitions` table in PostgreSQL, ensuring that the entire structure -- questions, variables, flow controls, styling, and settings -- is stored atomically.
