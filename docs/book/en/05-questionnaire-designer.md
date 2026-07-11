# Chapter 5: The Questionnaire Designer

The QDesigner questionnaire designer is the central workspace for building, configuring, and previewing questionnaires. It provides a full-featured visual editing environment with drag-and-drop composition, real-time preview, a variable system, flow control logic, and deep configurability for every question type.

This chapter covers the designer interface layout, the structural hierarchy of questionnaires, and the core editing workflows.

## 5.1 Interface Overview

The designer follows a three-column layout with a compact header toolbar. Each region serves a distinct purpose in the editing workflow.

### Header Toolbar

The header bar spans the full width of the screen and provides:

- **Breadcrumb navigation**: `Projects › [Project Name] ›`. Each segment is a clickable link back up the hierarchy.
- **Editable title**: Click the questionnaire name (which follows the breadcrumb) to rename it inline. Press Enter to confirm or Escape to cancel.
- **Save indicator**: A color-coded dot shows the current save state. Hover it for a tooltip that reports the exact state ("Saving…", "Unsaved changes", "Saved 14:32", or the error text):
  - Green = saved
  - Amber (pulsing) = unsaved changes
  - Blue (spinning) = saving in progress
  - Red = save error
- **Theme toggle** and **presence avatars**: A light/dark theme switch, and stacked colored avatars for any collaborators currently editing the same questionnaire.
- **Undo / Redo buttons**: A paired button group (see §5.9). Each is disabled when there is nothing to undo or redo.
- **Tools button**: A "Tools" overflow menu that gathers the modal-launching configuration panels (Study settings, Experimental design, Data quality, Share, and more — see the *Tools Menu* subsection below).
- **Version badge**: Shows the current semantic version and opens the Version Manager (see §5.11).
- **Preview button**: Toggles the live preview modal with desktop, tablet, and mobile viewports (keyboard: Ctrl+P).
- **Publish button**: Validates and publishes the questionnaire (keyboard: Ctrl+Shift+Enter). Displays a red dot if validation errors exist; disabled when there are no questions or active errors.

On mobile devices, the breadcrumb is replaced by a back arrow, and left/right panel toggles appear as hamburger-style drawer buttons; the undo/redo group, Tools menu, and version badge are hidden on small screens.

### Tools Menu

The **Tools** button (wrench icon) in the header opens an overflow menu of the secondary, panel-launching actions that used to crowd the toolbar. Selecting an item closes the menu and opens the corresponding dialog:

| Menu item | Opens |
|---|---|
| **Study settings** | Progress indicator and informed-consent authoring (see §5.12). |
| **Experimental design** | Conditions, counterbalancing, and assignment strategy. |
| **Study series** | Multi-session / longitudinal study setup (shown only once the questionnaire has been saved). |
| **Data quality** | Minimum page time, flatline detection, and attention-check settings. |
| **Scale scoring** | Scale/subscale scoring definitions consumed by the report page. |
| **Quotas** | Response quota rules. |
| **Report page** | The participant-facing results page editor (see §5.13). |
| **Share** | The distribution panel for participant links, QR codes, and embed code. |

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

The right sidebar appears automatically when a question, page, block, or variable is selected. Its top-level tab switcher has three tabs:

- **Properties** (labeled "Question Properties", "Page Properties", etc. depending on the selection): The Properties Panel, itself sub-divided into **Properties**, **Style**, and **Script** tabs (see §5.4).
- **Translate** (languages icon): The Content Translations panel for translating participant-facing text into additional languages (see §5.14).
- **Comments** (speech-bubble icon): Threaded comments for collaborative review.

Within the **Properties** tab, the Properties Panel exposes:

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

There are three ways to undo and redo:

- **Toolbar buttons**: A paired Undo/Redo button group sits in the header (curved-arrow icons). Each button is disabled (dimmed) when there is nothing left to undo or redo. Hovering shows the shortcut in the tooltip ("Undo (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)"; the modifier appears as ⌘ on macOS).
- **Keyboard**: Ctrl+Z (or ⌘+Z) to undo, Ctrl+Shift+Z (or ⌘+Shift+Z) to redo.
- **Command palette**: The "Undo" and "Redo" commands (see §5.8).

The undo stack is preserved for the duration of the editing session. Saving does not clear the undo history.

## 5.10 Save and Auto-Save

The designer tracks all changes through a "dirty" flag. The save indicator in the header toolbar reflects the current state in real time.

- **Manual save**: Ctrl+S or the "Save Questionnaire" command.
- **Auto-save (debounced)**: About 2.5 seconds after your last edit, the designer saves automatically. Each new edit reschedules the timer, so a burst of edits results in one save shortly after you stop.
- **Auto-save (periodic backstop)**: A 30-second interval also flushes any pending changes, in case the debounced save was interrupted.
- **Flush on leaving**: Pending changes are also flushed when you navigate away within the app and when you close the tab or reload. On tab close the browser additionally shows its native "unsaved changes" prompt while the save is dispatched.
- **Publish**: Publishing first saves, then validates, then marks the questionnaire as published. A published questionnaire receives a distribution URL.

**One create, ever.** The very first save of a brand-new questionnaire is *single-flighted*: no matter how many triggers fire at once (the debounce, the 30-second interval, Ctrl+S, or the tab-close flush), only a single create request is sent to the server. Every other trigger waits for that one to finish and then saves an update, so a questionnaire is never accidentally created twice.

**Naming conflicts — "Rename to save".** If the server rejects the create because a questionnaire with the same name already exists in the project, the designer stops retrying (it would only fail again) and shows a toast titled **Rename to save** with the message: *A questionnaire named "[name]" already exists in this project. Rename it to save.* The save indicator also turns red. Rename the questionnaire (via the inline title) and it saves normally on the next edit. The existing row is never overwritten — it may be an unrelated questionnaire that happens to share the name.

If any other save fails, the indicator turns red and its tooltip shows the error message. The designer retries on the next save trigger.

The questionnaire content is persisted as JSONB in the `questionnaire_definitions` table in PostgreSQL, ensuring that the entire structure -- questions, variables, flow controls, styling, and settings -- is stored atomically.

## 5.11 Version Management

QDesigner uses **semantic versioning** (semver) to track questionnaire changes. Every questionnaire has a version number in the format `v{major}.{minor}.{patch}` (e.g., `v1.2.3`).

### Version Display

The current version is displayed in the designer header toolbar next to the save indicator. Clicking the version badge opens the Version Manager panel.

### Version Bumps

The Version Manager provides three bump actions, each with different semantics:

| Change Type | Bump | Example | When to Use |
|---|---|---|---|
| **Major** | Increments major, resets minor and patch to 0 | `v1.2.3` -> `v2.0.0` | Structural changes that affect data comparability |
| **Minor** | Increments minor, resets patch to 0 | `v1.2.3` -> `v1.3.0` | Content changes that don't affect response structure |
| **Patch** | Increments patch | `v1.2.3` -> `v1.2.4` | Cosmetic fixes with no impact on data |

#### Bump Rules

| Change | Recommended Bump |
|---|---|
| Add, remove, or reorder questions | Major |
| Change response key names | Major |
| Edit question text or labels | Minor |
| Add answer options to a choice question | Minor |
| Change page ordering | Minor |
| Fix typos, adjust styling, update descriptions | Patch |

A **major version bump** is highlighted with a warning, since it signals that response data collected under the new major version is not directly comparable to data from previous major versions.

### Version History

The Version Manager displays a chronological list of all published versions, showing the version number, publication timestamp, and who published it. Each publication creates a snapshot in the `questionnaire_versions` table, preserving the exact content at that point in time.

### Version Tracking in Sessions

When a participant starts a fillout session, the session records the questionnaire's current `version_major`, `version_minor`, and `version_patch`. This allows researchers to:

- Filter response data by version
- Compare results across versions
- Identify which version a participant completed
- Ensure that only sessions within the same major version are compared in aggregate statistics

### Publishing and Versions

Publishing a questionnaire:

1. Creates a version snapshot (freezes content, variables, flow controls)
2. Records the current semver in the snapshot
3. Sets the questionnaire status to `published`
4. Makes it accessible via the short code URL

Bumping a version does **not** automatically publish. Researchers can bump the version, continue editing, and publish when ready.

## 5.12 Study Settings

Open **Tools > Study settings** to configure two participant-facing behaviors. Changes are held locally and applied only when you click **Save** (Cancel discards them), so the panel never churns the undo history while you type.

### Presentation

- **Show progress indicator**: When enabled, participants see a completion progress bar as they work through the study. (Defaults to on.) The helper text reads: *Display a completion progress bar to participants while they fill out the study.*

### Informed consent

- **Require consent before starting**: When enabled, participants must accept a consent screen before the study begins. Turning this off does not discard the consent content you authored — it is kept so you can toggle consent back on later.

When "Require consent before starting" is on, a consent editor appears with these fields:

- **Heading**: An optional title for the consent screen. Left blank, it falls back to the built-in localized "Informed Consent" heading. (Base language only; not yet translated per locale — translate the body via the Translations panel.)
- **Consent text**: The main consent body, authored in **Markdown** (bold, headings, and lists are supported). Rendered as sanitized HTML to participants. Translate it per language in the Translations panel (the "Consent text" slot).
- **Acknowledgement checkboxes**: An optional list of statements participants must (or may) tick. Use **Add checkbox** to append a row; each row has a label field, a **Required** toggle, and a remove button. With no checkboxes, participants can accept with a single button.
- **Require electronic signature**: When enabled, participants must type their name to record consent. Helper text: *Participants must type their name to record consent.*

**How it renders to participants.** On the consent screen, the heading appears at the top, the Markdown body below it, then any acknowledgement checkboxes (required ones are marked with a red asterisk), and — if enabled — a signature text field. Participants proceed with the primary agree button and can decline (which asks for confirmation before exiting). The agree button advertises an incomplete state but is not hard-disabled, so screen-reader users are told *why* they cannot yet proceed (any required checkbox unticked, or an empty required signature) rather than facing a silently disabled control.

## 5.13 The Report Page

Open **Tools > Report page** to build an optional participant-facing results page that renders after completion, entirely offline, from the participant's own completed session. Widgets bind to variables or scale scores; cohort-comparison widgets bind an object-typed server variable.

Page-level controls:

- **Show report page after completion**: Master toggle for the whole feature.
- **Enable PDF download**: Lets participants download their report as a PDF.
- **Title** (e.g. "Your results"), plus numeric layout inputs — **Row h** (row height in px), **Gap** (px), and **Refresh h** (the server-variable fetch-skip window, in hours).

### Widgets

Click **Add Widget** (or, from the empty state, **Add your first widget**) to add a report element. Each widget has a type selector — **Score tile**, **Bar chart**, **Box vs cohort**, **Reaction vs cohort**, **Radar profile**, **Distribution + marker**, **Gauge / arc**, **Interpretive text**, **Results table**, or **Completion metadata** — followed by its binding, comparison, and interpretation-note fields.

### Visual layout: Layout vs Preview

Once at least one widget exists, a two-button toggle appears above the widget list:

- **Layout** (grid icon): A schematic **12-column grid editor**. Each widget is a draggable, resizable box:
  - **Drag** the box body to move it.
  - **Resize** using the edge handles (right edge / bottom edge) or the bottom-right corner handle; boxes are anchored top-left, so they grow to the right and downward.
  - **Keyboard**: with a box focused, arrow keys nudge its position one cell; **Shift + arrow keys** resize it. Moves and resizes are announced for screen-reader users ("Moved to column X, row Y" / "Resized to W by H").

  Each widget card below the grid still exposes numeric **X / Y / W / H** fields for precise placement; the visual grid and the numeric fields edit the same integer coordinates and stay in lockstep with the current selection.

- **Preview** (eye icon): A **live preview** rendered with the *real* participant results renderer against representative sample values, so you see the page essentially as participants will. A footer note reminds you: *Preview uses representative sample values — participants see their own results.*

As with the other Tools panels, changes apply on **Save** and are discarded on Cancel.

## 5.14 Content Translations

The designer can present participant-facing content in additional languages. Open the **Translate** tab (globe icon) in the right sidebar to reach the **Content Translations** panel. This translates study *content* (prompts, options, page titles, and the welcome/consent/completion chrome) — it is separate from the application interface language.

### Managing languages

- The base language (the text you author directly) is shown as a chip marked `· base`.
- Add a language with the **Language code** field (e.g. `de`) and an optional **Label** (e.g. `Deutsch`), then **Add language**. Common codes are suggested as you type.
- Each added language appears as a chip you can click to make active for editing, with a small **×** to remove it. Removing a language asks for confirmation (and warns how many translated strings will be lost).

### Completeness bars

Below the language chips, a **per-locale completeness** list shows one row per added language: a progress bar plus a `done/total` count. When strings are still missing, the count is annotated with "· N left"; when there is nothing translatable yet it reads "nothing to translate". Each active-language chip also shows its percentage inline. This lets you see at a glance which translations are finished before publishing.

### What you translate

For the active language, the panel provides:

- **Question** prompt and options — select a question in the canvas to translate it; the base text is shown as reference/placeholder.
- **Page titles** — one field per page.
- **Welcome / consent / completion** chrome — the **Welcome message**, **Consent text**, and **Completion message** slots.

## 5.15 Media Library

The **Media Library** manages images, video, and audio for the organization. It opens as a picker when you attach media to a question, and the same surface doubles as a housekeeping tool.

- **View toggle**: Switch between **Grid view** and **List view**.
- **Search** (`Search media…`) and a **type filter** (All Types / Images / Videos / Audio).
- **Upload**: Reveals a drag-and-drop drop zone with a **Choose Files** button (max 50 MB per file; images, video, and audio).
- **Image dimensions**: For images whose dimensions the server extracted, the pixel size is shown as e.g. `1920 × 1080` — in the hover overlay in grid view, and in the metadata line in list view (alongside file size, type, and date).

### Manage mode

Click **Manage** in the library header to enter housekeeping mode (the button switches to **Done**). In Manage mode, tapping a card no longer selects it; instead each asset shows a red **Delete** (trash) button.

Deleting asks for confirmation with the dialog title **Delete media?** and this warning:

> Permanently delete "[filename] ([width] × [height])"? Any questionnaire that references this asset will lose it — this cannot be undone.

This is a **hard delete** — there is no "in use" guard, so removing an asset that a published questionnaire still points at will break that reference. On success a "Media deleted" toast confirms the removal.

## 5.16 Managing Questionnaires and Projects

Outside the designer, questionnaires and projects are managed from their **cards** (on the projects list and project-detail pages) and headers via a kebab **More options** menu (⋮). The available actions depend on your role; delete is limited to project owners / organization admins.

### Questionnaire actions

The questionnaire "More options" menu offers:

- **Rename**: Opens a "Rename questionnaire" dialog with a **Questionnaire name** field; click **Save**.
- **Duplicate**: Creates a full copy named "Copy of [name]" as a fresh **draft** (its own new fillout code, version reset to the create-time default). A "Questionnaire duplicated" toast confirms it.
- **Archive** / **Restore**: Archiving hides the questionnaire from active lists; Restore returns it to the editable **draft** state (re-publishing is a separate, explicit step).
- **Delete** (typed confirmation): Opens a "Delete questionnaire" dialog explaining that this *removes [name] and takes its fillout link offline. Already-collected responses are retained in the database but will no longer be accessible here.* You must type the questionnaire's exact name into the **Type "[name]" to confirm** field before the **Delete questionnaire** button enables.

### Project actions

The project "More options" menu offers **Rename**, **Archive** / **Restore**, and **Delete**. Deleting a project is the most destructive action: the "Delete project" dialog warns that this *removes [name] along with its questionnaires and all collected responses. You won't be able to access them again.* As with questionnaires, you must type the project's exact name into the **Type "[name]" to confirm** field to enable the **Delete project** button.

Each action reports its result with a toast (e.g. "Project renamed", "Project archived", "Project restored", "Project deleted").
