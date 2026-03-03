# Chapter 8: Flow Control and Logic

Flow control allows researchers to create adaptive questionnaires that change their structure based on participant responses. QDesigner supports four types of flow control (skip, branch, loop, terminate), display conditions on individual questions, and a visual flow editor for understanding and designing complex logic.

## 8.1 Overview

In a standard questionnaire, pages are presented sequentially from first to last. Flow control adds conditional navigation that can:

- **Skip** ahead to a specific page or question when a condition is met.
- **Branch** to different paths based on response values.
- **Loop** a section a specified number of times (for repeated trials or iterative tasks).
- **Terminate** the questionnaire early when a disqualification condition is met.

Flow controls are defined at the questionnaire level and stored in the `flow` array of the questionnaire data structure. Each flow control has:

```typescript
{
  id: string;        // Unique identifier
  type: 'skip' | 'branch' | 'loop' | 'terminate';
  condition: string; // Formula expression that triggers this rule
  target?: string;   // Page or question ID (for skip/branch)
  iterations?: number; // Number of repetitions (for loop)
}
```

## 8.2 Skip Logic

Skip logic jumps the respondent to a specific page or question when a condition evaluates to true. All questions between the current position and the target are skipped.

### Configuration

| Field | Description |
|---|---|
| Type | `skip` |
| Condition | Formula expression (e.g., `age < 18`) |
| Target | The page or question to jump to |

### Example

A demographic questionnaire asks about employment status. If the respondent selects "Student", skip the employment history section:

- **Condition**: `employmentStatus === 'student'`
- **Target**: Page "Education Details"

All pages between the current page and "Education Details" are bypassed for this respondent.

### Practical Patterns

**Skip to end of section**:
```
Condition: consentGiven === false
Target: Page "Thank You" (final page)
```

**Skip optional section**:
```
Condition: wantsDetailedFeedback === false
Target: Page "Summary"
```

**Skip based on screening**:
```
Condition: screeningScore < 3
Target: Page "Ineligible Notice"
```

## 8.3 Branching

Branching provides conditional navigation where different respondents follow different paths through the questionnaire. Unlike skip (which always moves forward), branching can direct respondents to entirely different sections.

### Configuration

| Field | Description |
|---|---|
| Type | `branch` |
| Condition | Formula expression |
| Target | The page or question to navigate to |

### Example: Two-Path Branch

A study examines both clinical and non-clinical populations:

- **Branch 1**: Condition `groupAssignment === 'clinical'`, Target: Page "Clinical Measures"
- **Branch 2**: Condition `groupAssignment === 'control'`, Target: Page "Control Measures"

After their respective sections, both groups converge on the "Debriefing" page.

### Example: Multi-Branch

A personality questionnaire adapts based on initial screening:

```
Branch A: IF(dominantTrait === 'extraversion')   -> "Extraversion Deep Dive"
Branch B: IF(dominantTrait === 'neuroticism')     -> "Neuroticism Deep Dive"
Branch C: IF(dominantTrait === 'openness')        -> "Openness Deep Dive"
Default:                                          -> "General Personality"
```

### Implementing Multi-Branch

Since each flow control rule has a single condition and target, implement multi-branch logic with multiple flow controls:

1. Flow: type=branch, condition=`dominantTrait === 'extraversion'`, target=Page "Extraversion Deep Dive"
2. Flow: type=branch, condition=`dominantTrait === 'neuroticism'`, target=Page "Neuroticism Deep Dive"
3. Flow: type=branch, condition=`dominantTrait === 'openness'`, target=Page "Openness Deep Dive"

The first matching condition wins.

## 8.4 Loops

Loops repeat a section of the questionnaire a specified number of times. This is essential for within-subjects experimental designs, practice trials, and iterative tasks.

### Configuration

| Field | Description |
|---|---|
| Type | `loop` |
| Condition | Formula expression that must be true for the loop to continue |
| Iterations | Maximum number of repetitions |

### Block-Level Loops

In addition to flow-level loops, individual blocks can be configured as **Loop Blocks** with these settings:

| Setting | Description |
|---|---|
| Number of Iterations | How many times to repeat (can be a number or a variable reference). |
| Iteration Variable | A variable name that holds the current iteration index (e.g., `currentTrial`). |
| Exit Condition | A formula that, when true, breaks out of the loop early (e.g., `score > 100`). |

### Example: Practice and Test Trials

A reaction time experiment has 5 practice trials and 20 test trials:

1. **Block "Practice"** (type: loop, iterations: 5, variable: `practiceTrialNum`)
   - Reaction Time question
   - Feedback instruction: `"Trial {{practiceTrialNum}} of 5: {{IF(lastCorrect, 'Correct!', 'Incorrect')}}"`.

2. **Block "Test"** (type: loop, iterations: 20, variable: `testTrialNum`, exitCondition: `consecutiveErrors >= 3`)
   - Reaction Time question (no feedback)

The exit condition ensures the test terminates early if the participant makes three consecutive errors, preventing frustration and invalid data.

### Example: Adaptive Testing

A vocabulary test presents words of increasing difficulty, stopping when the participant misses 3 in a row:

```
Block: Vocabulary Test
  Type: loop
  Iterations: 50 (maximum)
  Iteration Variable: wordIndex
  Exit Condition: consecutiveMisses >= 3

  Question: "What does '{{wordList[wordIndex]}}' mean?"
  Script: onResponse updates consecutiveMisses counter
```

## 8.5 Terminate Conditions

Terminate conditions end the questionnaire immediately when a disqualification criterion is met. The respondent is directed to a completion/disqualification page.

### Configuration

| Field | Description |
|---|---|
| Type | `terminate` |
| Condition | Formula expression that triggers termination |

### Example: Screening Disqualification

```
Condition: age < 18 || consentGiven === false
Type: terminate
```

When this condition is true, the questionnaire ends and the respondent sees a default termination message.

### Example: Data Quality Termination

```
Condition: attentionCheckFails >= 2
Type: terminate
```

Respondents who fail two attention checks are terminated to maintain data quality.

### Example: Completion Check

```
Condition: completedAllSections === true
Type: terminate
```

This can be used to end the questionnaire when all required sections are complete, regardless of the page order.

## 8.6 Display Conditions

Display conditions operate at the individual question level, controlling visibility and interactivity without changing the page flow. They are defined in the `conditions` property of each question.

### Condition Types

| Condition | Property | Effect |
|---|---|---|
| **Show** | `conditions.show` | Question is visible only when the formula evaluates to true. |
| **Enable** | `conditions.enable` | Question is visible but disabled (grayed out) when false. |
| **Require** | `conditions.require` | Question becomes required when the formula evaluates to true. |

### Configuration

Display conditions are set in the Properties Panel under the "Conditional Logic" section. Each condition accepts a formula expression.

### Example: Conditional Follow-Up

A medical history questionnaire:

- Q1: "Do you have any chronic conditions?" (Yes/No)
- Q2: "Please list your conditions." (Text Input)
  - Show condition: `hasChronicConditions === 'yes'`

Q2 only appears if the respondent answers "Yes" to Q1.

### Example: Dynamic Requirement

- Q1: "Are you a smoker?" (Yes/No)
- Q2: "How many cigarettes per day?" (Number Input)
  - Show condition: `isSmoker === 'yes'`
  - Require condition: `isSmoker === 'yes'`

Q2 appears and becomes required only when the respondent is a smoker.

### Example: Progressive Disclosure

In a complex form, additional detail fields appear based on initial selections:

```
Q1: "Education level" (Single Choice: High School, Bachelor's, Master's, PhD)
Q2: "Year of graduation" - show: educationLevel !== 'High School'
Q3: "University name" - show: educationLevel !== 'High School'
Q4: "Research area" - show: educationLevel === 'PhD'
Q5: "Dissertation title" - show: educationLevel === 'PhD'
```

### Page-Level Conditions

Pages also support display conditions:

```typescript
{
  id: 'page-3',
  name: 'Advanced Options',
  conditions: [
    { formula: 'showAdvancedOptions === true', target: 'show' }
  ]
}
```

The entire page (with all its blocks and questions) is shown or hidden based on the condition.

## 8.7 The Visual Flow Editor

The Visual Flow Editor provides a node-graph visualization of the questionnaire's flow structure. It is built on the Svelte Flow library and renders:

### Node Types

| Node | Color | Description |
|---|---|---|
| **Start** | -- | Entry point of the questionnaire. |
| **Page** | Blue | Represents a questionnaire page. |
| **Block** | Blue | Represents a block within a page. |
| **Question** | Blue | Represents an individual question. |
| **Branch** | Orange | A conditional branch point. |
| **Loop** | Orange | A loop control. |
| **Terminate** | Orange | A termination point. |
| **Variable** | Green | A variable referenced in flow conditions. |
| **End** | -- | Exit point of the questionnaire. |

### Edge Types

- **Sequential edges** (solid lines): Standard page-to-page or block-to-block connections.
- **Conditional edges** (animated dashed lines): Connections created by flow control rules, labeled with their condition.

### Features

- **Pan and zoom**: Navigate the graph using mouse drag and scroll.
- **Mini map**: A small overview in the corner for orientation in large questionnaires.
- **Controls**: Zoom in, zoom out, fit view, and lock buttons.
- **Auto Layout**: Arranges nodes automatically for readability.
- **Export**: Save the flow diagram as an image for documentation.
- **Interactive connections**: Draw new edges between nodes to create flow control rules.
- **Legend panel**: Color-coded legend showing node categories.

### Opening the Visual Flow Editor

1. Open the Flow Control panel (GitBranch icon in the left rail).
2. Click the map icon button in the Flow Control header.
3. The editor opens in a full-screen modal.

## 8.8 Validation

The Flow Control Manager validates all flow control rules and displays warnings:

| Validation | Message |
|---|---|
| Missing condition | "Missing condition." |
| Skip/branch without target | "Skip/branch flows require a target." |
| Loop without iterations | "Loop flows need at least 1 iteration." |

Warnings appear as red badges on the flow control cards. Invalid flows are still saved but will not execute at runtime.

## 8.9 The Flow Control Manager

The Flow Control Manager (accessible from the Flow panel in the left sidebar) provides a list-based interface for managing flow controls.

### Adding a Flow Control

1. Click "Add Flow" in the panel header.
2. In the modal, select the flow type:
   - **Skip**: Jump to another question/page
   - **Branch**: Conditional navigation
   - **Loop**: Repeat section
   - **Terminate**: End questionnaire
3. Enter the **condition** (a formula expression using variable names and JavaScript operators).
4. For Skip/Branch: Select the **target** from the dropdown of available pages and questions.
5. For Loop: Enter the **maximum iterations**.
6. Click "Add Flow".

### Editing and Deleting

- Click the pencil icon on a flow card to open the edit modal (pre-filled with current values).
- Click the trash icon to delete a flow control.
- The flow type cannot be changed after creation; delete and re-create to change the type.

### Available Targets

The target dropdown shows all pages and questions in the questionnaire:

```
Page: Welcome
Page: Demographics
Q: What is your age? (Demographics)
Q: Gender (Demographics)
Page: Experimental Task
...
```

## 8.10 Complex Logic Examples

### Example 1: Screening with Multiple Criteria

A clinical study requires participants to meet several eligibility criteria:

```
Flow 1: type=terminate, condition=age < 18 || age > 65
Flow 2: type=terminate, condition=hasNeurologicalDisorder === true
Flow 3: type=terminate, condition=visionAcuity < 20/40
Flow 4: type=branch, condition=medicationUse === true, target=Page "Medication Details"
```

Participants who fail any screening criterion are immediately terminated. Those taking medication are routed to an additional section.

### Example 2: Adaptive Questionnaire with Branching

A personality assessment adapts its depth based on initial responses:

```
Page 1: Brief Personality Inventory (10 items)
  -> Variables: extraversionScore, neuroticismScore, opennessScore

Flow: branch, condition=extraversionScore > 35, target=Page "Extraversion Detailed"
Flow: branch, condition=neuroticismScore > 35, target=Page "Neuroticism Detailed"
Flow: branch, condition=opennessScore > 35, target=Page "Openness Detailed"
Flow: skip, condition=true, target=Page "Summary" (default if no trait is dominant)

Page "Extraversion Detailed": 20 additional extraversion items
Page "Neuroticism Detailed": 20 additional neuroticism items
Page "Openness Detailed": 20 additional openness items
Page "Summary": Results and feedback
```

### Example 3: Experimental Design with Loops and Conditions

A cognitive psychology experiment with practice, test blocks, and between-subjects conditions:

```
Page "Instructions"
  Text Instruction: Task description

Page "Practice"
  Block "Practice Trials" (loop, 5 iterations, variable: trialNum)
    Reaction Time question with feedback
  Text Display: "Practice complete. Ready for the test?"

Page "Test Block A" (display condition: experimentalCondition === 'A')
  Block "Stimulus Set A" (loop, 40 iterations, variable: testTrial)
    Reaction Time question (no feedback)

Page "Test Block B" (display condition: experimentalCondition === 'B')
  Block "Stimulus Set B" (loop, 40 iterations, variable: testTrial)
    Reaction Time question (no feedback)

Page "Feedback"
  Statistical Feedback: participant vs. cohort comparison
  Bar Chart: accuracy by block

Flow: terminate, condition=consecutiveTimeouts >= 5
```

This design assigns participants to condition A or B, runs 40 trials in the assigned condition, and terminates if the participant stops responding.

### Example 4: Survey with Piping and Dynamic Routing

A customer satisfaction survey that adapts based on responses:

```
Q1: "How would you rate our service?" (Scale 1-10)
  -> Variable: serviceRating

Q2: "What could we improve?" (Text Input)
  Display condition: serviceRating <= 6

Q3: "What did you enjoy most?" (Text Input)
  Display condition: serviceRating >= 7

Q4: "Would you recommend us?" (Single Choice: Yes/No)
  -> Variable: wouldRecommend

Flow: branch, condition=wouldRecommend === 'yes' AND serviceRating >= 8
  Target: Page "Referral Program"

Flow: branch, condition=wouldRecommend === 'no'
  Target: Page "Improvement Details"

Page "Referral Program":
  Text Display: "Thank you for your score of {{serviceRating}}!"
  Text Input: "Would you like to share a referral code?"

Page "Improvement Details":
  Text Display: "We're sorry to hear about your experience."
  Matrix: Detailed satisfaction breakdown

Page "Thank You":
  Text Display: "Survey complete. Thank you, {{participantName}}!"
```

## 8.11 Best Practices

### Keep Conditions Simple

- Use clear variable names that read naturally: `isAdult`, `hasConsented`, `passedScreening`.
- Prefer simple comparisons over complex nested logic.
- Test conditions with the Preview mode debug panel.

### Avoid Circular Logic

- Never create a branch that leads back to a page that triggers the same branch.
- Use the Visual Flow Editor to verify there are no infinite loops.
- The dependency graph in the Variable Manager helps identify circular variable dependencies.

### Plan the Flow First

- Sketch the questionnaire flow on paper or in the Visual Flow Editor before building individual questions.
- Identify all decision points and their conditions upfront.
- Document the flow logic in variable descriptions.

### Test Thoroughly

- Use Preview mode with the debug panel to trace flow execution.
- Test each branch path by providing different response combinations.
- Verify that termination conditions work correctly.
- Check that skip logic does not accidentally bypass required questions.

### Use Display Conditions for Simple Cases

- For showing/hiding individual questions within a page, prefer display conditions over flow control.
- Reserve skip/branch for navigating between pages or sections.
- Display conditions are evaluated per-question; flow controls are evaluated per-page transition.
