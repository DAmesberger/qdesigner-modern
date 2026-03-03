# Chapter 6: Question Types Reference

QDesigner provides 16 question types organized into two module categories: **Display** (content-only modules that present information without collecting responses) and **Questions** (interactive modules that collect user input). Each type is implemented as a self-contained module with runtime and designer components, a metadata definition, and an answer type schema.

This chapter documents every question type with its purpose, configuration options, validation rules, response data format, and practical use cases.

---

## 6.1 Display Modules

Display modules present information to respondents. They do not collect answers but can use variables, conditionals, and timing.

### Text Display

**Type identifier**: `text-display`
**Category**: Display
**Purpose**: Show formatted text content with markdown rendering and variable interpolation.

**Configuration (TextDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `content` | string | Welcome markdown | The text to display. Supports full markdown syntax. |
| `format` | `'text' \| 'markdown' \| 'html'` | `'markdown'` | Content rendering format. |
| `variables` | boolean | `false` | Enable `{{variableName}}` substitution in content. |
| `styling.fontSize` | string | `'1rem'` | Font size for the content. |
| `styling.textAlign` | `'left' \| 'center' \| 'right'` | `'left'` | Text alignment. |
| `styling.fontWeight` | string | `'normal'` | Font weight. |
| `autoAdvance.enabled` | boolean | `false` | Auto-advance to the next page after a delay. |
| `autoAdvance.delay` | number | `5000` | Auto-advance delay in milliseconds. |

**Capabilities**: Scripting, Conditionals, Timing, Variables.

**Use cases**: Welcome screens, consent forms, debriefing text, between-task instructions, personalized feedback messages using `{{variables}}`.

**Media**: Embed images, videos, and audio using markdown syntax: `![alt](media:refId)` for uploaded media assets or `![alt](https://...)` for external URLs.

---

### Text Instruction

**Type identifier**: `text-instruction` (registered as `instruction` in the questionnaire type system)
**Category**: Display
**Purpose**: Display instructional text with variable interpolation and optional auto-advance.

**Configuration**:

| Property | Type | Default | Description |
|---|---|---|---|
| `content` | string | Placeholder text | Instruction content (markdown). |
| `format` | string | `'markdown'` | Rendering format. |
| `enableMarkdown` | boolean | `true` | Whether to render markdown. |
| `variables` | boolean | `true` | Enable variable substitution (enabled by default). |
| `navigation.showNext` | boolean | `true` | Show the next button. |
| `navigation.autoAdvance` | boolean | `false` | Auto-advance without user action. |
| `navigation.advanceDelay` | number | `5000` | Delay before auto-advance. |

**Capabilities**: Scripting, Conditionals, Variables.

**Use cases**: Task instructions before experimental blocks, informed consent text, mid-questionnaire guidance, variable-personalized messages.

---

### Bar Chart

**Type identifier**: `bar-chart`
**Category**: Display
**Purpose**: Visualize data as vertical or horizontal bars with optional error bars.

**Configuration (StatisticalFeedbackConfig subset)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `chartType` | `'bar'` | `'bar'` | Fixed to bar chart. |
| `orientation` | `'vertical' \| 'horizontal'` | `'horizontal'` | Bar orientation. |
| `showErrorBars` | boolean | `false` | Show error bars. |
| `errorType` | `'standardError' \| 'standardDeviation' \| 'confidence95'` | `'standardError'` | Error bar type. |
| `stacked` | boolean | `false` | Stack bars. |
| `showValues` | boolean | `true` | Display values on bars. |
| `showDataLabels` | boolean | `true` | Show data labels. |
| `barWidth` | number | `0.8` | Relative bar width. |
| `axes.x.label` | string | `''` | X-axis label. |
| `axes.y.label` | string | `''` | Y-axis label. |
| `axes.y.min` | `'auto' \| number` | `'auto'` | Y-axis minimum. |
| `axes.y.max` | `'auto' \| number` | `'auto'` | Y-axis maximum. |
| `colors.scheme` | string | `'default'` | Color scheme. |

**Capabilities**: Scripting, Conditionals, Analytics, Variables.

**Use cases**: Displaying aggregated results, showing comparison data, feedback on performance metrics, cohort comparisons.

---

### Statistical Feedback

**Type identifier**: `statistical-feedback`
**Category**: Display
**Purpose**: Configurable real-time statistical feedback panel with multiple data source modes and visualization options.

**Configuration (StatisticalFeedbackConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `title` | string | `'Statistical Feedback'` | Panel title. |
| `subtitle` | string | `''` | Panel subtitle. |
| `chartType` | `'bar' \| 'line'` | `'bar'` | Visualization type. |
| `sourceMode` | string | `'current-session'` | Data source: `current-session`, `cohort`, `participant-vs-cohort`, `participant-vs-participant`. |
| `metric` | string | `'mean'` | Aggregation: `count`, `mean`, `median`, `std_dev`, `p90`, `p95`, `p99`, `z_score`. |
| `dataSource.source` | `'variable' \| 'response'` | `'variable'` | Where to pull data from. |
| `dataSource.key` | string | `''` | Variable or response key. |
| `dataSource.currentVariable` | string | `''` | Variable for current participant. |
| `dataSource.participantId` | string | `'{{participantId}}'` | Participant identifier. |
| `showPercentile` | boolean | `true` | Show percentile rank. |
| `showSummary` | boolean | `true` | Show summary statistics. |
| `refreshMs` | number | `0` | Auto-refresh interval (0 = disabled). |

**Capabilities**: All (Scripting, Conditionals, Validation, Analytics, Timing, Variables).

**Use cases**: Showing participants their performance relative to others, displaying reaction time statistics, providing normative feedback, research debriefing with aggregated data.

---

## 6.2 Input Questions

### Text Input

**Type identifier**: `text-input`
**Category**: Question
**Answer type**: TEXT (string)

**Purpose**: Collect free-text responses, from single-line answers to multi-line essays.

**Display Configuration (TextInputDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | -- | Question text (markdown, variables). |
| `instruction` | string | -- | Optional instruction below the prompt. |
| `placeholder` | string | `'Enter your response...'` | Input placeholder text. |
| `multiline` | boolean | `false` | Use a textarea instead of a single-line input. |
| `rows` | number | `3` | Number of visible rows in multiline mode. |
| `maxLength` | number | `500` | Maximum character count. |
| `showCharCount` | boolean | -- | Display a character counter. |

**Response Configuration (TextInputResponseConfig)**:

| Property | Type | Description |
|---|---|---|
| `saveAs` | string | Variable name to store the response. |
| `transform` | `'none' \| 'lowercase' \| 'uppercase' \| 'trim'` | Text transformation before saving. |
| `trackTiming` | boolean | Record time spent on this question. |
| `trackChanges` | boolean | Record edit history. |

**Validation (TextValidation)**:

| Rule | Description |
|---|---|
| `required` | Must not be empty. |
| `minLength` | Minimum character count. |
| `maxLength` | Maximum character count. |
| `pattern` | Regular expression the response must match. |
| `customRules` | Array of custom validation rules with formulas. |

**Answer data format**:
```json
{ "value": "string", "length": 42 }
```

**Aggregations**: count, mode, wordcount, unique.
**Transformations**: lowercase, uppercase, trim, extract, categorize.

**Use cases**: Open-ended questions, demographic fields (name, occupation), essay responses, qualitative feedback.

---

### Number Input

**Type identifier**: `number-input`
**Category**: Question
**Answer type**: NUMBER (number)

**Purpose**: Collect numeric responses with precision control, range validation, and optional formatting.

**Display Configuration (NumberInputDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | -- | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `placeholder` | string | `'Enter a number...'` | Placeholder. |
| `min` | number | -- | Minimum accepted value. |
| `max` | number | -- | Maximum accepted value. |
| `step` | number | `1` | Step increment. |
| `prefix` | string | `''` | Prefix text (e.g., "$"). |
| `suffix` | string | `''` | Suffix text (e.g., "kg"). |
| `showSpinButtons` | boolean | `true` | Show increment/decrement buttons. |

**Validation (NumberValidation)**:

| Rule | Description |
|---|---|
| `required` | Must not be empty. |
| `min` | Minimum value. |
| `max` | Maximum value. |
| `integer` | Must be a whole number. |

**Answer data format**:
```json
{ "value": 42, "unit": "years" }
```

**Aggregations**: sum, mean, median, mode, min, max, std, variance, count.
**Transformations**: round, ceil, floor, abs, normalize, scale.

**Use cases**: Age, income, physical measurements, count data, any numeric response.

---

## 6.3 Choice Questions

### Single Choice (Multiple Choice in single-response mode)

**Type identifier**: `multiple-choice` (with `response.type: 'single'`)
**Category**: Question
**Answer type**: SINGLE_CHOICE (string)

**Purpose**: Present a list of options from which the respondent selects exactly one.

**Display Configuration (SingleChoiceDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `'Select an option:'` | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `options` | ChoiceOption[] | 3 default options | Array of choice options. |
| `layout` | `'vertical' \| 'horizontal' \| 'grid'` | `'vertical'` | Options layout. |
| `columns` | number | -- | Grid column count (when layout = grid). |
| `showOther` | boolean | -- | Show an "Other" free-text option. |
| `otherLabel` | string | -- | Label for the Other option. |
| `randomizeOptions` | boolean | `false` | Shuffle option order. |

**ChoiceOption structure**:
```typescript
{
  id: string;       // Unique identifier
  label: string;    // Display text
  value: string | number;  // Stored value
  code?: string | number;  // Statistical encoding
  image?: MediaConfig;     // Optional image
  hotkey?: string;         // Keyboard shortcut
  exclusive?: boolean;     // Deselect all others when chosen
}
```

**Answer data format**:
```json
{ "selectedId": "opt-2", "selectedLabel": "Agree", "selectedValue": 4 }
```

**Aggregations**: count, percentage, mode, distribution.
**Transformations**: group, map_value, to_number.

**Use cases**: Demographic questions (gender, education), Likert-style items presented as radio buttons, forced-choice paradigms, any single-answer selection.

---

### Multiple Choice (multi-response mode)

**Type identifier**: `multiple-choice` (with `response.type: 'multiple'`)
**Answer type**: MULTIPLE_CHOICE (array)

The same module as Single Choice, but allows multiple selections.

**Additional display properties**:

| Property | Type | Description |
|---|---|---|
| `minSelections` | number | Minimum number of selections required. |
| `maxSelections` | number | Maximum number of selections allowed. |
| `selectAllOption` | boolean | Show a "Select All" checkbox. |

**Answer data format**:
```json
{
  "selectedIds": ["opt-1", "opt-3"],
  "selectedLabels": ["Option A", "Option C"],
  "selectedValues": [1, 3]
}
```

**Aggregations**: count, percentage, mode, distribution, co_occurrence.

**Use cases**: "Select all that apply" questions, symptom checklists, multi-interest surveys, checkbox-style questionnaire items.

---

## 6.4 Scale Questions

### Scale

**Type identifier**: `scale`
**Category**: Question
**Answer type**: LIKERT_SCALE (number)

**Purpose**: Collect responses on a numeric scale with labeled endpoints and multiple presentation styles.

**Display Configuration (ScaleDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `'Rate this statement:'` | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `min` | number | `1` | Scale minimum. |
| `max` | number | `7` | Scale maximum. |
| `step` | number | `1` | Step increment. |
| `labels.min` | string | `'Strongly Disagree'` | Left/minimum label. |
| `labels.max` | string | `'Strongly Agree'` | Right/maximum label. |
| `labels.midpoint` | string | -- | Optional midpoint label. |
| `showValue` | boolean | `true` | Display the selected numeric value. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Scale orientation. |
| `style` | `'slider' \| 'buttons' \| 'visual-analog'` | `'buttons'` | Presentation style. |

**Presentation styles**:
- **Buttons**: Discrete numbered buttons (classic Likert).
- **Slider**: A continuous slider with a draggable handle.
- **Visual Analog**: A continuous line from minimum to maximum (VAS), commonly used in pain research.

**Answer data format**:
```json
{ "value": 5, "label": "Agree", "percentage": 0.67 }
```

**Aggregations**: mean, median, mode, std, distribution, percentiles.
**Transformations**: normalize, reverse, group_by_range.

**Use cases**: Likert scales, Visual Analog Scales (VAS), Net Promoter Score (NPS), any ordinal or interval measurement.

---

### Rating

**Type identifier**: `rating`
**Category**: Question
**Answer type**: LIKERT_SCALE (number)

**Purpose**: Iconic rating using stars, hearts, thumbs, or numbers with optional half-step precision.

**Display Configuration (RatingDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | -- | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `levels` | number | `5` | Number of rating levels. |
| `style` | `'stars' \| 'hearts' \| 'thumbs' \| 'numeric'` | `'stars'` | Icon style. |
| `allowHalf` | boolean | `false` | Allow half-step ratings (e.g., 3.5 stars). |
| `labels` | string[] | `[]` | Optional label for each level. |

**Use cases**: Product/service satisfaction, content quality rating, user experience evaluation, preference strength.

---

## 6.5 Advanced Questions

### Matrix

**Type identifier**: `matrix`
**Category**: Question
**Answer type**: MATRIX (object)

**Purpose**: Grid-based questions where respondents evaluate multiple items on the same set of response options.

**Display Configuration (MatrixDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `'Please evaluate:'` | Overall instruction. |
| `rows` | `{id, label}[]` | 2 items | Row definitions (items to rate). |
| `columns` | `{id, label, value?}[]` | 5-point Likert | Column definitions (response options). |
| `responseType` | `'single' \| 'multiple' \| 'text' \| 'number'` | `'single'` | Cell response type. |
| `required` | `'all' \| 'any' \| string[]` | -- | Which rows must be answered. |

**Default configuration**: A 5-point Likert scale (Strongly Disagree to Strongly Agree) applied to 2 items.

**Answer data format**:
```json
{
  "responses": {
    "row1": { "col3": 3 },
    "row2": { "col4": 4 }
  }
}
```

**Aggregations**: row_means, column_means, correlation_matrix.
**Transformations**: flatten, pivot, aggregate_by_row.

**Use cases**: Multi-item Likert batteries, semantic differential scales, multi-attribute evaluation, repeated measures within a single page.

---

### Ranking

**Type identifier**: `ranking`
**Category**: Question
**Answer type**: RANKING (array)

**Purpose**: Drag-and-drop ranking task where respondents order items by preference or importance.

**Display Configuration (RankingDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | -- | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `items` | `{id, label}[]` | 4 items | Items to rank. |
| `allowPartial` | boolean | `true` | Allow incomplete rankings. |
| `tieBreaking` | boolean | `false` | Allow ties. |

**Additional metadata config**:

| Property | Type | Default | Description |
|---|---|---|---|
| `layout` | string | `'vertical'` | Drag direction. |
| `animation` | boolean | `true` | Animate reorder transitions. |
| `showNumbers` | boolean | `true` | Show rank numbers. |
| `dragHandlePosition` | string | `'left'` | Handle position. |

**Capabilities**: Includes timing support for measuring deliberation time.

**Answer data format**:
```json
{
  "rankedItems": [
    { "id": "item3", "rank": 1, "label": "Quality" },
    { "id": "item1", "rank": 2, "label": "Price" },
    { "id": "item2", "rank": 3, "label": "Speed" }
  ]
}
```

**Aggregations**: average_rank, top_positions, kendall_tau, spearman_rho.
**Transformations**: to_scores, normalize_ranks.

**Use cases**: Preference ordering, value prioritization, feature importance ranking, conjoint-style tasks.

---

## 6.6 Time-Based Questions

### Date/Time

**Type identifier**: `date-time`
**Category**: Question
**Answer type**: DATE (date)

**Purpose**: Collect date and/or time responses with calendar picker support.

**Display Configuration (DateTimeDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `'Select a date/time:'` | Question text. |
| `mode` | `'date' \| 'time' \| 'datetime'` | `'date'` | Input mode. |
| `format` | string | `'YYYY-MM-DD'` | Display format. |
| `showCalendar` | boolean | `true` | Show calendar picker. |
| `minDate` | string | -- | Earliest allowed date. |
| `maxDate` | string | -- | Latest allowed date. |

**Additional metadata config**: `disabledDates` (array of disabled dates), `defaultToToday` (boolean), `timeStep` (minutes, default 15).

**Answer data format**:
```json
{ "value": "2024-03-15", "timestamp": 1710460800000 }
```

**Aggregations**: min, max, range, count.
**Transformations**: format, to_timestamp, extract_year, extract_month, extract_day.

**Use cases**: Date of birth, event dates, time preferences, longitudinal tracking, appointment scheduling.

---

### Reaction Time

**Type identifier**: `reaction-time`
**Category**: Question
**Answer type**: REACTION_TIME (object)

**Purpose**: Measure response speed with microsecond precision using configurable stimuli, fixation periods, and response mappings.

**Configuration**:

| Property | Type | Default | Description |
|---|---|---|---|
| `task.type` | string | `'standard'` | Task type (standard, n-back, custom). |
| `prompt` | string | `'Reaction Time Task'` | Task instruction. |
| `stimulus.type` | string | `'shape'` | Stimulus type. |
| `stimulus.content` | string | `'circle'` | Stimulus content. |
| `stimulus.fixation.type` | string | `'cross'` | Fixation type. |
| `stimulus.fixation.duration` | number | `500` | Fixation duration (ms). |
| `feedback` | boolean | `true` | Show accuracy feedback. |
| `practice` | boolean | `false` | Include practice trials. |
| `practiceTrials` | number | `3` | Number of practice trials. |
| `testTrials` | number | `10` | Number of test trials. |
| `targetFPS` | number | `120` | Target frame rate. |
| `response.validKeys` | string[] | `['f', 'j']` | Valid response keys. |
| `response.timeout` | number | `2000` | Response timeout (ms). |
| `response.requireCorrect` | boolean | `false` | Require correct response. |

**N-back task configuration** (when `task.type = 'n-back'`):

| Property | Type | Default |
|---|---|---|
| `task.nBack.n` | number | `2` |
| `task.nBack.sequenceLength` | number | `20` |
| `task.nBack.targetRate` | number | `0.3` |
| `task.nBack.stimulusSet` | string[] | `['A','B','C','D']` |
| `task.nBack.targetKey` | string | `'j'` |
| `task.nBack.nonTargetKey` | string | `'f'` |
| `task.nBack.fixationMs` | number | `400` |
| `task.nBack.responseTimeoutMs` | number | `1200` |

**Capabilities**: Scripting, Conditionals, Analytics, Timing, Variables. Uses a dedicated `ReactionTimeRuntime` for microsecond-precision timing via `performance.now()`.

**Answer data format**:
```json
{
  "reactionTime": 342,
  "correct": true,
  "stimulus": "circle",
  "response": "j",
  "timestamp": 1710461234567
}
```

**Aggregations**: mean_rt, median_rt, min_rt, max_rt, accuracy, outliers.
**Transformations**: remove_outliers, log_transform, z_score.

**Use cases**: Simple reaction time tasks, go/no-go paradigms, n-back working memory tasks, Stroop tasks, implicit association tests, psychophysical experiments.

---

## 6.7 File and Media Questions

### File Upload

**Type identifier**: `file-upload`
**Category**: Question
**Answer type**: FILE_UPLOAD (object)

**Purpose**: Collect file uploads with drag-and-drop, type validation, and configurable storage.

**Display Configuration (FileUploadDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `'Upload a file:'` | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `accept` | string[] | `[]` | Accepted MIME types (empty = all). |
| `maxSize` | number | `10485760` | Maximum file size in bytes (10 MB). |
| `maxFiles` | number | `1` | Maximum number of files. |
| `dragDrop` | boolean | `true` | Enable drag-and-drop upload. |

**Response Configuration (FileUploadResponseConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `storage` | `'base64' \| 'url' \| 'reference'` | `'reference'` | How the file is stored. |
| `saveMetadata` | boolean | `true` | Save file metadata alongside the upload. |

**Answer data format**:
```json
{
  "fileName": "photo.jpg",
  "fileSize": 2048576,
  "fileType": "image/jpeg",
  "uploadId": "abc-123",
  "metadata": {}
}
```

**Aggregations**: count, size_stats, type_distribution.

**Use cases**: Collecting photographs, document submissions, audio recordings, participant-generated content.

---

### Drawing/Sketch

**Type identifier**: `drawing`
**Category**: Question
**Answer type**: DRAWING (object)

**Purpose**: Canvas-based drawing and sketching task with multiple tools, colors, and optional stroke analysis.

**Display Configuration (DrawingDisplayConfig)**:

| Property | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | `'Draw something:'` | Question text. |
| `instruction` | string | -- | Optional instruction. |
| `canvas.width` | number | `600` | Canvas width in pixels. |
| `canvas.height` | number | `400` | Canvas height in pixels. |
| `canvas.background` | string | -- | Background image or color. |
| `tools` | string[] | `['pen', 'eraser']` | Available tools: `pen`, `eraser`, `line`, `shape`. |
| `colors` | string[] | 6 defaults | Available colors. |
| `defaultColor` | string | `'#000000'` | Default drawing color. |
| `defaultTool` | string | -- | Default selected tool. |

**Response Configuration (DrawingResponseConfig)**:

| Property | Type | Description |
|---|---|---|
| `storage` | `'base64' \| 'url' \| 'reference'` | How the drawing is stored. |
| `analysis.extractFeatures` | boolean | Extract drawing features automatically. |
| `analysis.detectShapes` | boolean | Run shape detection. |
| `analysis.measurePressure` | boolean | Track pressure data (if available). |
| `analysis.trackTiming` | boolean | Record stroke timing. |

**Capabilities**: Includes timing support.

**Answer data format**:
```json
{
  "strokes": [
    {
      "points": [{"x": 10, "y": 20, "pressure": 0.5}],
      "timestamp": 1710461234567
    }
  ],
  "duration": 15000,
  "imageData": "data:image/png;base64,..."
}
```

**Aggregations**: stroke_count, duration_stats, pressure_stats.
**Transformations**: extract_features, to_image.

**Use cases**: Clock-drawing tests (cognitive assessment), free-drawing tasks, signature collection, spatial ability measures, children's research.

---

## 6.8 Specialized Questions

### WebGL Stimulus

**Type identifier**: `webgl`
**Category**: Question
**Answer type**: REACTION_TIME (object)

**Purpose**: GPU-rendered visual stimuli at 120+ FPS with microsecond timing precision using WebGL 2.0.

**Configuration**:

| Property | Type | Default | Description |
|---|---|---|---|
| `stimulus.type` | string | `'shape'` | Stimulus type. |
| `stimulus.content.type` | string | `'circle'` | Shape type. |
| `stimulus.content.properties.radius` | number | `50` | Shape radius. |
| `stimulus.content.properties.color` | number[] | `[1,1,1,1]` | RGBA color (0-1). |
| `stimulus.fixation.show` | boolean | `true` | Show fixation. |
| `stimulus.fixation.duration` | number | `500` | Fixation duration (ms). |
| `response.type` | string | `'keyboard'` | Response modality. |
| `response.validKeys` | string[] | `['f','j']` | Valid keys. |
| `timing.stimulusDuration` | number | `0` | Duration (0 = until response). |
| `timing.responseDuration` | number | `2000` | Response window. |
| `timing.interTrialInterval` | number | `500` | ITI. |
| `rendering.targetFPS` | number | `120` | Target frame rate. |
| `rendering.vsync` | boolean | `true` | Vertical sync. |
| `rendering.antialias` | boolean | `true` | Anti-aliasing. |

**Capabilities**: All capabilities including dedicated `WebGLRuntime`.

**Use cases**: Psychophysical experiments, visual search tasks, motion perception studies, change detection, masking paradigms, any experiment requiring precise visual timing.

---

### Media Response

**Type identifier**: `media-response`
**Category**: Question
**Answer type**: FILE_UPLOAD (object)

**Purpose**: Collect media responses (audio, video, or image) from participants. Uses the same configuration structure as File Upload but is semantically distinct for media-specific use cases.

**Configuration**: Same as File Upload (FileUploadDisplayConfig + FileUploadResponseConfig).

**Use cases**: Audio diary entries, video responses to prompts, photo documentation, voice recordings for speech analysis.

---

## 6.9 Best Practices

### Choosing the Right Question Type

| Research Need | Recommended Type |
|---|---|
| Measure attitudes or opinions | Scale (Likert buttons) |
| Categorical classification | Single Choice |
| Multiple applicable categories | Multiple Choice |
| Free-text responses | Text Input |
| Numeric measurements | Number Input |
| Multiple items, same scale | Matrix |
| Preference ordering | Ranking |
| Cognitive performance | Reaction Time |
| Visual perception research | WebGL Stimulus |
| Date/temporal data | Date/Time |
| Qualitative artifacts | Drawing or File Upload |
| Real-time feedback | Statistical Feedback |
| Instructions/consent | Text Display or Instruction |

### Validation Guidelines

- Always mark critical items as **required**.
- Use **minLength** on text inputs to prevent trivially short responses.
- Use **min/max** on number inputs to catch data entry errors.
- Enable **attention checks** on at least one item per block for data quality screening.
- Use **timing** constraints to flag suspiciously fast responses (speeders).

### Performance Considerations

- Reaction Time and WebGL questions use `performance.now()` for microsecond precision. Ensure the target device supports High Resolution Time.
- The WebGL renderer targets 120 FPS by default. Set `rendering.targetFPS` to match the display refresh rate.
- For large matrix questions (many rows/columns), consider mobile layout settings to ensure usability on small screens.
