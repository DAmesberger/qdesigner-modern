# Chapter 7: Variables, Formulas, and Scripting

QDesigner includes a comprehensive variable system and formula engine that enables dynamic questionnaires with computed scores, conditional content, real-time feedback, and custom logic. This chapter covers the variable system, the complete formula function reference, variable piping, and the script editor.

## 7.1 Variable System Overview

Variables in QDesigner store values that can be referenced throughout the questionnaire. They serve multiple purposes:

- **Store response data**: Each question can save its answer to a named variable.
- **Compute scores**: Formulas can combine multiple responses into aggregate scores.
- **Control flow**: Conditions in flow control rules and display conditions reference variables.
- **Personalize content**: Variable piping inserts computed or stored values into question text.
- **Track state**: System variables like timestamps and counters maintain session state.

### Variable Types

QDesigner supports nine variable types:

| Type | Label | Description | Default Value |
|---|---|---|---|
| `number` | Number | Numeric values (integers or decimals) | `0` |
| `string` | Text | String values | `''` |
| `boolean` | True/False | Boolean values | `false` |
| `date` | Date | Date values | Current date |
| `time` | Time | Time values | Current time |
| `array` | List | Ordered collections | `[]` |
| `object` | Object | Key-value maps | `{}` |
| `reaction_time` | Reaction Time | Microsecond-precision timing values | `0` |
| `stimulus_onset` | Stimulus Onset | Timestamp of stimulus presentation | `0` |

### Variable Scope

Each variable has a scope that determines its lifetime and accessibility:

| Scope | Description |
|---|---|
| `global` | Accessible throughout the entire questionnaire session. Persists across pages. |
| `local` | Accessible only within the current page. Reset when leaving the page. |
| `temporary` | Exists only during formula evaluation. Not persisted. |

### Variable Properties

Every variable has the following properties:

```typescript
{
  id: string;           // Unique identifier (UUID)
  name: string;         // Reference name (used in formulas)
  type: VariableType;   // One of the nine types
  scope: 'global' | 'local' | 'temporary';
  defaultValue?: any;   // Initial value
  formula?: string;     // Computed formula (if any)
  dependencies?: string[]; // Variables this formula depends on
  description?: string; // Human-readable description
  validation?: ValidationRule[]; // Optional validation rules
}
```

## 7.2 Creating and Managing Variables

### The Variable Manager

Open the Variable Manager from the left sidebar (Variable icon). It provides:

- **Variable list**: All defined variables with their type, formula, and default value.
- **Add Variable**: Button to create a new variable through a modal form.
- **Edit/Delete**: Inline buttons on each variable card.
- **Dependency Graph**: A visual canvas showing how variables depend on each other through formulas.
- **Available Functions**: A quick reference of common formula functions.

### Creating a Variable

1. Click "Add Variable" in the Variable Manager header.
2. Fill in the form:
   - **Name**: A unique identifier (e.g., `totalScore`, `participantAge`, `reactionTimeMean`). Use camelCase or snake_case.
   - **Type**: Select from the dropdown (Number, Text, True/False, Date, Time, List, Object, Reaction Time, Stimulus Onset).
   - **Default Value** (optional): The initial value before any formula runs or response is recorded.
   - **Formula** (optional): A formula expression that computes this variable's value. Use other variable names directly (e.g., `q1Score + q2Score + q3Score`).
   - **Description** (optional): Explain what this variable represents.
3. Click "Add Variable".

### The Advanced Formula Editor

Toggle "Advanced Editor" in the variable creation modal to switch from the simple textarea to the **FormulaEditor** -- a Monaco-based editor with full IntelliSense support:

- **Syntax highlighting** for formula expressions
- **Full autocomplete** with 46 built-in functions across 7 categories (Math, Array, Statistics, Logic, Text, Date/Time, Custom), presented as category-grouped completions
- **Signature help** that displays parameter types and descriptions as you type, updating in real time as you move between parameters
- **Tab-stop snippet insertion** -- selecting a function from autocomplete inserts a snippet with tab stops for each parameter, so you can press Tab to move between arguments
- **Dynamic variable suggestions** that update in real-time as you add, rename, or remove variables in the Variable Manager -- newly created variables appear immediately in autocomplete
- **Real-time error feedback** with inline diagnostics
- **Variable type information** shown in hover tooltips

### Dependency Graph

Click "Show Graph" to visualize variable dependencies as a directed graph. Each variable is rendered as a circular node, with arrows indicating which variables are used in other variables' formulas. The graph uses a circular layout and color-codes nodes:

- **Blue border**: Currently selected variable.
- **Gray border**: Unselected variables.
- Node icons indicate the type (#, T, ?, D, C, [], {}, Z, O).

The dependency graph helps identify circular dependencies, understand computation order, and visualize the overall variable architecture.

## 7.3 Formula Syntax

Formulas follow a spreadsheet-like syntax with these characteristics:

- Leading `=` is optional (e.g., `= SUM(a, b)` is equivalent to `SUM(a, b)`).
- Variable names are referenced directly: `age * 10 + baseScore`.
- Function names are case-insensitive but conventionally uppercase: `SUM()`, `IF()`, `MEAN()`.
- Standard arithmetic operators: `+`, `-`, `*`, `/`, `^` (exponentiation).
- Comparison operators: `==`, `!=`, `>`, `<`, `>=`, `<=`.
- Logical operators: `&&` (AND), `||` (OR), `!` (NOT).
- String literals use single or double quotes: `'hello'`, `"world"`.
- Array literals use square brackets: `[1, 2, 3]`.

### Formula Evaluation

The formula engine:
1. Replaces variable references with their current values.
2. Recursively evaluates function calls from innermost to outermost.
3. Evaluates the resulting expression.
4. Caches results for repeated evaluations within the same context.

Each evaluation returns an `EvaluationResult`:
```typescript
{
  value: any;          // The computed value
  type: string;        // 'number', 'string', 'boolean', 'array', etc.
  dependencies: string[]; // Variables referenced in the formula
  executionTime: number;  // Milliseconds taken to evaluate
  error?: string;      // Error message if evaluation failed
}
```

## 7.4 Complete Function Reference

QDesigner's formula engine provides 47+ built-in functions across seven categories.

### Mathematical Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `ABS(value)` | number | number | Absolute value. |
| `ROUND(value, decimals?)` | number, number | number | Round to decimal places (default 0). |
| `SQRT(value)` | number | number | Square root. |
| `POW(base, exponent)` | number, number | number | Exponentiation. |
| `RANDOM()` | -- | number | Random number between 0 and 1. Supports seeded PRNG for reproducibility. |
| `RANDINT(min, max)` | number, number | number | Random integer in range [min, max]. |

### Array Functions (Basic)

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `SUM(values...)` | ...number or array | number | Sum of values. |
| `COUNT(values...)` | ...any or array | number | Count of non-empty values. |
| `MIN(values...)` | ...number or array | number | Minimum value. |
| `MAX(values...)` | ...number or array | number | Maximum value. |

### Logical Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `IF(condition, trueValue, falseValue)` | boolean, any, any | any | Conditional expression. |
| `AND(values...)` | ...boolean | boolean | True if all values are truthy. |
| `OR(values...)` | ...boolean | boolean | True if any value is truthy. |
| `NOT(value)` | boolean | boolean | Logical negation. |

### Text Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `CONCAT(values...)` | ...any | string | Concatenate values into a string. |
| `LENGTH(text)` | string | number | String length. |
| `UPPER(text)` | string | string | Convert to uppercase. |
| `LOWER(text)` | string | string | Convert to lowercase. |

### Date/Time Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `NOW()` | -- | number | Current timestamp in milliseconds. |
| `TIME_SINCE(timestamp)` | number | number | Milliseconds elapsed since the given timestamp. |

### Statistical Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `MEAN(values...)` | ...number or array | number | Arithmetic mean. |
| `MEDIAN(values...)` | ...number or array | number | Median value. |
| `MODE(values...)` | ...any or array | any | Most frequent value(s). Returns array if multiple modes. |
| `STDEV(values...)` | ...number or array | number | Sample standard deviation. |
| `VARIANCE(values...)` | ...number or array | number | Sample variance. |
| `PERCENTILE(array, p)` | array, number | number | nth percentile (p: 0-1 or 0-100). |
| `CORRELATION(x, y)` | array, array | number | Pearson correlation coefficient. |
| `ZSCORE(value, mean, stdev)` | number, number, number | number | Standard score (z-score). |
| `TTEST(group1, group2, tails?)` | array, array, number | object | Independent samples t-test. Returns {t, df, mean1, mean2, meanDiff, se, effectSize}. |
| `SKEWNESS(values...)` | ...number or array | number | Distribution skewness. |
| `KURTOSIS(values...)` | ...number or array | number | Excess kurtosis. |

### Advanced Array Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `FILTER(array, condition)` | array, string | array | Filter elements. Condition: `"> 5"`, `"!= banana"`. |
| `MAP(array, transform)` | array, string | array | Transform elements. Transform: `"* 2"`, `"+ 10"`. |
| `REDUCE(array, operation, initial?)` | array, string, any | any | Reduce: `"sum"`, `"product"`, `"min"`, `"max"`, `"concat"`, `"count"`. |
| `SORT(array, order?)` | array, string | array | Sort ascending (default) or `"desc"`. |
| `UNIQUE(array)` | array | array | Remove duplicates. |
| `FLATTEN(array, depth?)` | array, number | array | Flatten nested arrays. |
| `GROUP_BY(array, property)` | array, string | object | Group objects by a property. |
| `PLUCK(array, property)` | array, string | array | Extract property values from objects. |
| `SLICE(array, start, end?)` | array, number, number | array | Extract portion of array. |
| `REVERSE(array)` | array | array | Reverse array order. |

## 7.5 Custom Functions

Researchers can define custom functions using the `CustomFunctionManager`. Custom functions are written in JavaScript and can be saved with the questionnaire for reuse.

**Definition structure**:
```javascript
{
  name: 'SCORE_SCALE',
  description: 'Convert raw score to standardized scale',
  parameters: ['rawScore', 'min', 'max', 'newMin', 'newMax'],
  body: `
    const ratio = (rawScore - min) / (max - min);
    return newMin + ratio * (newMax - newMin);
  `
}
```

**Built-in example functions**:

| Function | Description |
|---|---|
| `SCORE_SCALE(raw, min, max, newMin, newMax)` | Linear rescaling. |
| `CATEGORY_SCORE(items, weights)` | Weighted average of items. |
| `AGE_GROUP(age)` | Categorize age into groups (Minor, Young Adult, Adult, etc.). |
| `LIKERT_TO_NUMERIC(response)` | Convert text Likert responses to numbers. |
| `RESPONSE_TIME_CATEGORY(ms)` | Categorize RT as Too Fast / Fast / Normal / Slow / Very Slow. |

## 7.6 Variable Piping

Variable piping allows you to embed live variable values in any text field (prompts, instructions, feedback). The syntax is:

```
{{variableName}}
```

**Examples**:

- `"Hello {{participantName}}, welcome to the study."` -- Inserts the participant's name.
- `"Your score is {{totalScore}} out of {{maxScore}}."` -- Shows computed scores.
- `"Your average reaction time was {{ROUND(meanRT, 0)}} ms."` -- Inline formula in piped value.

Variable piping works in:
- Question prompts and instructions
- Text Display and Text Instruction content
- Statistical Feedback titles and subtitles
- Choice option labels
- Any text field where `variables: true` is set in the display configuration

The piping engine resolves variables at runtime, so values are always current. If a variable has not been set yet, the placeholder is left as-is or replaced with an empty string (depending on configuration).

## 7.7 The Script Editor

The Script Editor provides per-question programmable logic using JavaScript. It is accessed via the "Script" tab in the Properties Panel (available only for question items).

### Editor Features

- **Monaco Editor**: Full VS Code editing experience with syntax highlighting, bracket matching, auto-indentation, and error diagnostics.
- **Type definitions**: IntelliSense for the QDesigner API (`QuestionAPI.Context`, `VariableSystem`, `Response`, `ValidationResult`).
- **Dark theme**: VS Dark color scheme optimized for code reading.
- **Format and reset**: Toolbar buttons to auto-format code and reset to the template.
- **Keyboard shortcuts**: Ctrl+S (save), Ctrl+Space (suggestions).

### Event Hooks

Scripts export a `hooks` object with four lifecycle hooks:

#### `onMount(context)`

Called when the question is first rendered. Use for initialization, setting focus, loading external data, or setting initial variable values.

```javascript
onMount: (context) => {
  context.focusFirstInput();
  context.variables.set('startTime', Date.now());
}
```

#### `onResponse(response, context)`

Called whenever the user provides or changes their response. Use for scoring, updating variables, triggering side effects.

```javascript
onResponse: (response, context) => {
  if (response.value === 'correct') {
    context.variables.increment('score', 10);
  }
  context.variables.set('lastResponse', response.value);
}
```

#### `onValidate(value, context)`

Called before the response is accepted. Return `true` to accept, or a string error message to reject.

```javascript
onValidate: (value, context) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return 'Please enter a valid email address';
  }
  return true;
}
```

#### `onNavigate(direction, context)`

Called when the user attempts to navigate forward or backward. Return `true` to allow, `false` to prevent.

```javascript
onNavigate: (direction, context) => {
  if (direction === 'next' && !context.hasResponse) {
    context.showError('Please provide a response before continuing');
    return false;
  }
  return true;
}
```

### Additional Exports

#### `customRender(props)`
Return a custom HTML element to replace the default rendering, or `null` to use the default.

#### `dynamicStyles(context)`
Return a CSS properties object that is applied to the question container based on runtime state.

```javascript
export const dynamicStyles = (context) => {
  if (context.hasResponse) {
    return { backgroundColor: '#F0FDF4', borderColor: '#10B981' };
  }
  return {};
};
```

#### `apiCalls`
An object of async functions for calling external APIs.

### Context API

The `context` object passed to hooks provides:

| Property/Method | Description |
|---|---|
| `context.questionId` | The current question's ID. |
| `context.questionType` | The question type string. |
| `context.variables.get(name)` | Get a variable value. |
| `context.variables.set(name, value)` | Set a variable value. |
| `context.variables.increment(name, by?)` | Increment a numeric variable. |
| `context.variables.decrement(name, by?)` | Decrement a numeric variable. |
| `context.hasResponse` | Whether the user has responded. |
| `context.response` | The current response value. |
| `context.focusFirstInput()` | Focus the first input element. |
| `context.showError(message)` | Display an error message. |
| `context.showSuccess(message)` | Display a success message. |

## 7.8 Practical Examples

### Example 1: Questionnaire Scoring

Create variables to compute a sum score from five Likert items:

1. Create five Scale questions (q1 through q5), each saving to variables `q1`, `q2`, `q3`, `q4`, `q5`.
2. Create a variable `totalScore` with formula: `SUM(q1, q2, q3, q4, q5)`.
3. Create a variable `meanScore` with formula: `MEAN(q1, q2, q3, q4, q5)`.
4. Display on a feedback page: `"Your average score is {{ROUND(meanScore, 1)}} on a 7-point scale."`.

### Example 2: Reverse Scoring

Some items need to be reverse-coded before aggregation:

```
reversedQ3 = (maxScale + 1) - q3
adjustedTotal = q1 + q2 + reversedQ3 + q4 + q5
```

### Example 3: Conditional Feedback

Use IF to provide different feedback based on performance:

```
feedbackMessage = IF(meanScore > 5, "Above average", IF(meanScore > 3, "Average", "Below average"))
```

Then pipe it: `"Your performance: {{feedbackMessage}}"`.

### Example 4: Reaction Time Analysis

After a reaction time block, compute summary statistics:

```
meanRT = MEAN(allReactionTimes)
medianRT = MEDIAN(allReactionTimes)
sdRT = STDEV(allReactionTimes)
accuracyPct = ROUND(SUM(MAP(allCorrect, "* 1")) / COUNT(allCorrect) * 100, 1)
```

### Example 5: Age-Based Branching

Create a variable and use it in flow control:

1. Variable `isAdult` with formula: `participantAge >= 18`.
2. Flow control: Branch with condition `isAdult === false`, target: "Minor Consent Page".

### Example 6: Custom Scoring with Weights

```
weightedScore = CATEGORY_SCORE([q1, q2, q3, q4], [0.3, 0.3, 0.2, 0.2])
```

### Example 7: Real-Time Statistical Feedback

Configure a Statistical Feedback display block:
- Source mode: `participant-vs-cohort`
- Metric: `z_score`
- Data source variable: `totalScore`
- Show percentile: enabled

This displays where the current participant's score falls relative to all previous respondents.
