# Chapter 11: Data Quality

High-quality data is the foundation of credible research. QDesigner Modern provides three integrated data quality systems -- attention checks, speeder detection, and flatline detection -- that flag low-effort or bot-generated responses in real time. This chapter covers configuration, detection algorithms, quality reports, and best practices for research data integrity.

---

## 11.1 Overview of Data Quality Mechanisms

| Mechanism          | Detects                               | Implementation                     |
|-------------------|--------------------------------------|-----------------------------------|
| Attention Checks   | Inattentive or random responding      | `AttentionCheckValidator`          |
| Speeder Detection  | Rushing through pages/questionnaire   | `SpeederDetector`                  |
| Flatline Detection | Repetitive response patterns          | `FlatlineDetector`                 |

All three systems operate independently and produce quality flags that can be combined for comprehensive data screening.

---

## 11.2 Attention Checks

Attention checks are embedded questions that have a known correct answer. QDesigner supports two types.

### 11.2.1 Instructed Response Items

An instructed response item explicitly tells the participant which answer to select:

> "To show that you are reading carefully, please select 'Strongly Agree' for this question."

**Configuration:**

```typescript
{
  enabled: true,
  type: 'instructed',
  correctAnswer: 'Strongly Agree'
}
```

Instructed response items are the most transparent form of attention check. They are easy for attentive participants to pass but catch those who are not reading the questions.

### 11.2.2 Trap Questions

Trap questions embed a hidden check within what appears to be a regular question:

> "I have been to every country in the world." (Expected answer: Disagree)

**Configuration:**

```typescript
{
  enabled: true,
  type: 'trap',
  correctAnswer: 'Disagree'
}
```

Trap questions are subtler than instructed response items and test whether participants are processing question content rather than simply selecting responses mechanically.

### 11.2.3 Answer Matching Logic

The `AttentionCheckValidator` uses a flexible matching algorithm:

1. **Exact match:** `actual === expected` (handles all types).
2. **Case-insensitive string match:** `String(actual).toLowerCase() === String(expected).toLowerCase()`.
3. **Loose type matching:** Numeric responses are stringified before comparison (e.g., `5` matches `"5"`).
4. **Array comparison:** For multi-select questions, arrays are sorted and compared element-wise (case-insensitive).

### 11.2.4 Failure Threshold

The validator is initialized with a **failure threshold** (default: 1). When the number of failed attention checks reaches or exceeds this threshold, the `hasFailed` flag is set to `true`.

```typescript
const validator = new AttentionCheckValidator(failureThreshold);
```

| Threshold | Behavior                                         |
|-----------|--------------------------------------------------|
| 1         | Flag after the first failed check (strict)        |
| 2         | Allow one mistake; flag after two failures         |
| 3         | Lenient -- allow two mistakes                      |

### 11.2.5 Validation Results

Each validated attention check produces an `AttentionCheckResult`:

```typescript
interface AttentionCheckResult {
  questionId: string;         // Which question was checked
  passed: boolean;            // Whether the response was correct
  expectedAnswer: unknown;    // The correct answer
  actualAnswer: unknown;      // What the participant answered
  type: 'instructed' | 'trap';
}
```

Summary properties:

| Property       | Type     | Description                              |
|---------------|----------|------------------------------------------|
| `failureCount` | `number` | Number of failed checks                  |
| `passCount`    | `number` | Number of passed checks                  |
| `totalChecks`  | `number` | Total checks evaluated                   |
| `hasFailed`    | `boolean`| Whether failure threshold was reached    |

---

## 11.3 Speeder Detection

Speeder detection identifies respondents who complete pages or the entire questionnaire too quickly, suggesting low-effort or automated responses.

### 11.3.1 How It Works

The `SpeederDetector` tracks page-level timing:

1. When a participant enters a page, `enterPage(pageId)` records the timestamp.
2. When the participant leaves the page, `leavePage()` records the timestamp and computes the duration.
3. Pages where `duration < minPageTimeMs` are flagged.

### 11.3.2 Configuration

```typescript
interface SpeederConfig {
  minPageTimeMs: number;   // Minimum ms per page (default: 2000)
  minTotalTimeMs: number;  // Minimum total ms for entire questionnaire (default: 0 = disabled)
}
```

**Per-page threshold (default: 2 seconds):**

The default assumes that reading and answering even a simple page takes at least 2 seconds. Researchers can adjust this based on their content:

| Page Content                    | Recommended Minimum (ms) |
|--------------------------------|--------------------------|
| Single yes/no question          | 1,500                    |
| 5-item Likert scale             | 5,000                    |
| Long text vignette              | 10,000                   |
| Reaction time block             | Varies by trial count    |

**Total time threshold:**

Setting `minTotalTimeMs` enables a global check. For example, if a 50-question survey is expected to take at least 5 minutes:

```typescript
{ minTotalTimeMs: 300000 }  // 5 minutes in ms
```

### 11.3.3 Page Timing Data

Each page visit produces a `PageTiming` record:

```typescript
interface PageTiming {
  pageId: string;    // Page identifier
  enteredAt: number; // Timestamp when page was entered
  leftAt: number;    // Timestamp when page was left
  duration: number;  // Time spent on page (ms)
}
```

### 11.3.4 Detection Outputs

| Property          | Type          | Description                                |
|------------------|---------------|--------------------------------------------|
| `flaggedPages`    | `PageTiming[]`| Pages below the minimum time               |
| `totalTime`       | `number`      | Total time across all pages (ms)           |
| `isTotalTimeFlagged` | `boolean`  | Whether total time is below minimum        |
| `isFlagged`       | `boolean`     | Whether any speeding was detected          |
| `speedRatio`      | `number`      | Actual time / expected minimum (0-1)       |

### 11.3.5 Speed Ratio

The speed ratio provides a continuous measure of how quickly the participant completed the questionnaire relative to expected minimums:

$$\text{speedRatio} = \min\left(1, \frac{\text{totalTime}}{\text{expectedMinTotal}}\right)$$

where `expectedMinTotal` is either `minTotalTimeMs` (if set) or `numPages * minPageTimeMs`. A ratio of 0.5 means the participant completed in half the expected minimum time.

---

## 11.4 Flatline Detection

Flatline detection identifies "straight-lining" -- patterns where respondents select the same answer repeatedly or follow mechanical patterns rather than engaging with question content.

### 11.4.1 Pattern Types

The `FlatlineDetector` checks for three distinct patterns:

#### All Same

All (or nearly all) responses in a block are identical:

```
Responses: 3, 3, 3, 3, 3, 3, 3, 3
Pattern:   all_same
Ratio:     1.0 (100% match)
```

The match ratio is computed as:

$$\text{matchRatio}_{\text{same}} = \frac{\text{count}(x_i = x_0)}{n}$$

#### Alternating

Responses follow an A-B-A-B pattern:

```
Responses: 1, 5, 1, 5, 1, 5, 1, 5
Pattern:   alternating
Ratio:     1.0 (100% match)
```

The match ratio counts positions that match the expected alternation:

$$\text{matchRatio}_{\text{alt}} = \frac{\text{count}(x_i = \text{expected}_i)}{n}$$

where `expected_i = A` for even indices and `expected_i = B` for odd indices.

#### Sequential

Responses follow an ascending or descending pattern (each value differs by exactly 1):

```
Responses: 1, 2, 3, 4, 5, 6, 7
Pattern:   sequential
Ratio:     1.0 (100% consecutive pairs differ by 1)
```

The match ratio counts consecutive pairs:

$$\text{matchRatio}_{\text{seq}} = \frac{\max(\text{ascending pairs}, \text{descending pairs})}{n - 1}$$

### 11.4.2 Configuration

```typescript
interface FlatlineConfig {
  threshold: number;     // Flag if ratio >= this value (default: 0.8)
  minResponses: number;  // Minimum responses before checking (default: 3)
}
```

**Threshold (default: 0.8):**

A threshold of 0.8 means that 80% or more of responses must match a pattern before it is flagged. This prevents false positives for short blocks where some repetition is natural.

**Minimum responses (default: 3):**

Blocks with fewer than 3 responses are not checked, since short blocks commonly have repeated answers by chance.

### 11.4.3 Analysis Scope

Flatline detection operates at the **block level**. Each block's responses are analyzed independently:

```typescript
detector.analyzeBlock("block-personality-items", [3, 3, 3, 3, 3, 3, 3]);
detector.analyzeBlock("block-satisfaction-items", [1, 2, 3, 4, 5, 6, 7]);
```

Only scalar values (numbers and strings) are analyzed. Null, undefined, and object values are skipped.

### 11.4.4 Detection Results

Each detected pattern produces a `FlatlineResult`:

```typescript
interface FlatlineResult {
  blockId: string;       // Which block was flagged
  pattern: PatternType;  // 'all_same' | 'alternating' | 'sequential'
  matchRatio: number;    // Fraction of responses matching (0-1)
  values: unknown[];     // The analyzed response values
}
```

Summary properties:

| Property        | Type       | Description                           |
|----------------|------------|---------------------------------------|
| `isFlagged`     | `boolean`  | Whether any block has detected patterns |
| `flaggedBlocks` | `string[]` | Block IDs with detected patterns      |

---

## 11.5 Configuring Data Quality in the Designer

### 11.5.1 Attention Check Configuration

1. In the questionnaire designer, select a question to use as an attention check.
2. In the **Question Properties** panel, expand **Data Quality**.
3. Toggle **Attention Check** to enabled.
4. Select the type: **Instructed Response** or **Trap Question**.
5. Enter the **Correct Answer** that attentive participants should provide.
6. In the **Questionnaire Settings**, set the **Failure Threshold** (how many checks can be failed before flagging).

### 11.5.2 Speeder Detection Configuration

1. Open **Questionnaire Settings** > **Data Quality**.
2. Toggle **Speeder Detection** to enabled.
3. Set the **Minimum Page Time** (default: 2,000 ms).
4. Optionally set a **Minimum Total Time** for the entire questionnaire.

### 11.5.3 Flatline Detection Configuration

1. Open **Questionnaire Settings** > **Data Quality**.
2. Toggle **Flatline Detection** to enabled.
3. Set the **Pattern Match Threshold** (default: 0.80).
4. Set the **Minimum Responses per Block** for checking (default: 3).

---

## 11.6 Quality Reports and Flags

### 11.6.1 Per-Participant Quality Report

When a participant completes the questionnaire, QDesigner generates a quality report containing:

| Section               | Data                                          |
|-----------------------|-----------------------------------------------|
| Attention Checks      | Pass/fail per check, total passed/failed/total |
| Speeder Detection     | Per-page timings, flagged pages, speed ratio   |
| Flatline Detection    | Per-block pattern analysis, flagged blocks      |
| Overall Quality Flag  | Combined pass/fail based on all mechanisms     |

### 11.6.2 Overall Quality Classification

The overall quality flag combines all three mechanisms:

| Classification | Criteria                                                           |
|---------------|-------------------------------------------------------------------|
| **Pass**       | No attention check failures AND no speeder flags AND no flatline flags |
| **Warning**    | One mechanism flagged (borderline quality)                          |
| **Fail**       | Two or more mechanisms flagged, or attention check threshold exceeded |

### 11.6.3 Quality Dashboard

The analytics dashboard displays aggregate quality metrics:

- **Attention check pass rate** across all participants
- **Speeder rate** (percentage of participants flagged for speeding)
- **Flatline rate** (percentage of participants with detected patterns)
- **Overall data quality rate** (percentage passing all checks)

---

## 11.7 Filtering by Quality in Analysis

### 11.7.1 Exclusion Strategies

| Strategy               | Approach                                    | Use Case                    |
|------------------------|--------------------------------------------|-----------------------------|
| Strict exclusion       | Remove all flagged participants             | High-stakes confirmatory    |
| Threshold-based        | Remove only multi-flag participants         | Standard research           |
| Sensitivity analysis   | Analyze with and without flagged data       | Robustness checking         |
| Weighting              | Down-weight flagged responses               | Exploratory research        |

### 11.7.2 Export with Quality Flags

All export formats (CSV, Excel, SPSS, R, etc.) include quality flag columns:

| Column                    | Type    | Values                    |
|--------------------------|---------|---------------------------|
| `attention_check_passed`  | boolean | true/false                |
| `attention_check_count`   | integer | Number of checks          |
| `attention_check_failures`| integer | Number of failures        |
| `speeder_flagged`         | boolean | true/false                |
| `speed_ratio`             | float   | 0.0 - 1.0                |
| `flatline_flagged`        | boolean | true/false                |
| `flatline_patterns`       | string  | Comma-separated patterns  |
| `overall_quality`         | string  | "pass" / "warning" / "fail" |

---

## 11.8 Best Practices for Research Data Quality

### 11.8.1 Attention Check Placement

- Place attention checks **after** the first substantive block (not at the very start when participants are still engaged).
- Space checks **evenly** throughout the questionnaire (e.g., one per block or one every 10-15 questions).
- Use **2-3 attention checks** for a typical 50-question survey.
- Use a **mix** of instructed response items and trap questions to detect different types of inattention.

### 11.8.2 Speeder Thresholds

- **Pilot test** your survey with attentive respondents to establish realistic minimum times.
- Set page minimums conservatively -- they should catch only clearly impossible speeds, not fast-but-legitimate respondents.
- Consider the **speed ratio** distribution across participants rather than a binary cutoff.

### 11.8.3 Flatline Thresholds

- A threshold of **0.80** (default) works well for blocks with 5+ items on a Likert scale.
- For blocks with **binary items** (yes/no), increase the threshold to 0.90 or use only the alternating/sequential checks.
- For blocks with **few items** (3-4), consider raising `minResponses` to avoid false positives.

### 11.8.4 Reporting Quality

In research publications, report:

1. **Which quality mechanisms** were used and their configuration.
2. **How many participants** were flagged by each mechanism.
3. **Exclusion criteria** (which flags led to exclusion).
4. **Sensitivity analyses** showing results are robust to inclusion/exclusion of borderline cases.

### 11.8.5 Ethical Considerations

- **Inform participants** in the consent form that response quality will be monitored.
- **Do not use quality flags punitively** (e.g., do not withhold compensation solely based on attention check failures).
- **Consider why** participants may fail quality checks -- survey fatigue, accessibility issues, or language barriers may be causes beyond inattention.

---

## 11.9 Summary

| Mechanism          | What It Detects           | Key Config             | Default            |
|-------------------|--------------------------|------------------------|--------------------|
| Attention Check    | Inattentive responses     | `correctAnswer`, `type`| threshold = 1      |
| Speeder Detection  | Rushing through survey    | `minPageTimeMs`        | 2,000 ms           |
| Flatline Detection | Repetitive patterns       | `threshold`            | 0.80               |
| Quality Report     | Combined assessment       | All three mechanisms   | Per-participant     |
| Export Flags       | Analysis-ready columns    | Included in all formats| Automatic           |
