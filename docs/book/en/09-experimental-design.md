# Chapter 9: Experimental Design

Rigorous experimental design is the backbone of causal inference. QDesigner Modern provides a comprehensive suite of tools for implementing between-subjects, within-subjects, and mixed designs directly inside your questionnaire -- no external randomization software required. This chapter covers condition assignment strategies, counterbalancing algorithms, block randomization, factorial designs, and reproducible randomization with seeds.

---

## 9.1 Between-Subjects Designs

In a between-subjects (or independent-groups) design each participant is assigned to exactly one experimental condition. QDesigner implements condition assignment through the `ConditionAssigner` class, which supports three configurable strategies.

### 9.1.1 Defining Conditions

Each condition is defined with a **name** and a **weight**. The weight controls how the random strategy allocates participants; weights are ignored by sequential and balanced strategies.

| Property | Type     | Description                                      |
|----------|----------|--------------------------------------------------|
| `name`   | `string` | Human-readable label (e.g., "Control", "Treatment A") |
| `weight` | `number` | Relative allocation weight (default: 1)          |

**Example -- simple two-group design:**

```
Conditions:
  1. Control     (weight: 1)
  2. Treatment   (weight: 1)
```

**Example -- unequal allocation (2:1):**

```
Conditions:
  1. Treatment   (weight: 2)
  2. Control     (weight: 1)
```

### 9.1.2 Assignment Strategies

QDesigner offers three assignment strategies, selectable in the Experimental Design panel of the designer.

#### Random Assignment

```
Strategy: random
```

Each participant is assigned to a condition based on weighted random sampling. When all weights are equal, each condition has equal probability. When weights differ, the probability of assignment to condition *i* is:

$$P(C_i) = \frac{w_i}{\sum_{j=1}^{k} w_j}$$

The random number generator is seeded deterministically using `seed + participantNumber`, ensuring that the same participant always receives the same assignment for a given seed (see Section 9.6).

#### Sequential Assignment (Round-Robin)

```
Strategy: sequential
```

Participants are assigned in round-robin order through the conditions:

$$\text{conditionIndex} = \text{participantNumber} \bmod k$$

where *k* is the number of conditions. This guarantees exactly equal group sizes when the total sample is a multiple of *k*. Weights are ignored.

#### Balanced Assignment

```
Strategy: balanced
```

Each new participant is assigned to the condition with the fewest participants so far. When two or more conditions are tied, ties are broken first by higher weight, then by lower index. This strategy requires passing the current group counts at assignment time and produces the most uniform allocation in real time.

| Strategy   | Equal groups | Respects weights | Deterministic | Requires counts |
|------------|-------------|-----------------|---------------|----------------|
| Random     | Approximate  | Yes              | With seed      | No              |
| Sequential | Exact (mod k)| No               | Yes            | No              |
| Balanced   | Optimal      | Tie-break only   | Yes            | Yes             |

### 9.1.3 Setting Up a Between-Subjects Design

1. Open the **Experimental Design** panel in the designer sidebar.
2. Click **Add Condition** and define your conditions (name and weight).
3. Select an **Assignment Strategy** from the dropdown.
4. Optionally set a **Seed** for reproducible randomization.
5. Use **Condition-Based Visibility** on blocks to show different content per condition (see Section 9.5).

---

## 9.2 Within-Subjects Designs

In a within-subjects (or repeated-measures) design, every participant experiences all conditions, but the order of conditions varies across participants to control for order and carry-over effects. QDesigner provides three counterbalancing strategies.

### 9.2.1 Latin Square

A standard Latin square of size *n* produces *n* unique orderings, where each condition appears exactly once in each position. QDesigner generates the square using cyclic rotation:

$$\text{Square}[i][j] = (i + j) \bmod n$$

**Example -- 3 conditions (A, B, C):**

| Participant Group | Order       |
|-------------------|-------------|
| 0                 | A, B, C     |
| 1                 | B, C, A     |
| 2                 | C, A, B     |

Each condition appears once in each position (first, second, third). Participants are assigned to rows using `participantNumber mod n`.

**Limitation:** A standard Latin square does not guarantee first-order balance -- that is, each condition does not necessarily follow every other condition equally often.

### 9.2.2 Balanced Latin Square (Williams Design)

For first-order balance (each condition follows every other condition exactly once), QDesigner uses the Williams design algorithm:

**For even *n*:** Produces *n* rows. Row *i* is constructed as:
- Position 0: *i*
- Position *j* (j >= 1):
  - If *j* is odd: *(i + ceil(j/2)) mod n*
  - If *j* is even: *(i + n - floor(j/2)) mod n*

**For odd *n*:** The algorithm produces *n* rows, then appends *n* mirrored rows (each value mapped to *n - 1 - value*), yielding *2n* total orderings.

**Example -- 4 conditions (even n):**

| Participant Group | Order          |
|-------------------|----------------|
| 0                 | 0, 1, 3, 2    |
| 1                 | 1, 2, 0, 3    |
| 2                 | 2, 3, 1, 0    |
| 3                 | 3, 0, 2, 1    |

In this design, every condition follows every other condition exactly once across rows.

**Example -- 3 conditions (odd n, 2n = 6 rows):**

| Group | Order   |
|-------|---------|
| 0     | 0, 1, 2 |
| 1     | 1, 2, 0 |
| 2     | 2, 0, 1 |
| 3     | 2, 1, 0 |
| 4     | 1, 0, 2 |
| 5     | 0, 2, 1 |

### 9.2.3 Full Counterbalancing

Full counterbalancing generates all *n!* permutations of the conditions. This is only practical for small numbers of conditions:

| Conditions | Permutations |
|-----------|-------------|
| 2          | 2           |
| 3          | 6           |
| 4          | 24          |
| 5          | 120         |
| 6          | 720         |
| 7          | 5,040       |
| 8          | 40,320      |

QDesigner enforces a safety limit of *n <= 8* to prevent memory issues. For 8 conditions, you would need at least 40,320 participants to cover every permutation once.

### 9.2.4 Choosing a Counterbalancing Strategy

| Strategy                | First-order balance | Number of orderings | Best for                     |
|------------------------|--------------------|--------------------|------------------------------|
| None                   | No                  | 1                   | Fixed order (pilot studies)   |
| Latin Square           | No                  | *n*                 | Position balance, many conditions |
| Balanced Latin Square  | Yes                 | *n* (even) / *2n* (odd) | Sequence balance, standard   |
| Full Counterbalancing  | Yes (complete)      | *n!*                | Small *n*, maximum control    |

---

## 9.3 Block Randomization

Block randomization controls the order in which blocks (groups of questions) are presented to each participant. This is distinct from counterbalancing, which controls the order of *conditions*; block randomization shuffles the order of *blocks* within a condition.

### 9.3.1 Standard Block Randomization

When enabled, all blocks in the questionnaire (or within a condition) are shuffled into a random order using the participant's seeded PRNG. This ensures each participant sees the same set of blocks in a different sequence.

### 9.3.2 Preserve First / Preserve Last

Researchers often need to keep certain blocks in fixed positions:

- **Preserve First:** The first block (e.g., informed consent, demographics) always appears first; the remaining blocks are randomized.
- **Preserve Last:** The last block (e.g., debriefing, final questions) always appears last; all other blocks are randomized.
- **Preserve Both:** The first and last blocks are fixed; only intermediate blocks are shuffled.

### 9.3.3 Configuration

In the designer, open the **Block Settings** panel:

1. Toggle **Randomize Block Order**.
2. Select **Preserve** options (First, Last, Both, or None).
3. The randomization respects the participant's seed for reproducibility.

---

## 9.4 Condition-Based Block Visibility

In between-subjects designs, you typically want each condition to see only its relevant blocks. QDesigner's condition-based visibility system allows you to attach visibility rules to any block:

1. Select a block in the designer.
2. In the **Block Properties** panel, find **Visibility Conditions**.
3. Choose **Show this block only for condition:** and select one or more conditions.

When a participant is assigned to a condition, only blocks whose visibility includes that condition (or blocks with no visibility restriction) are displayed. This lets you build a single questionnaire with branches for each condition.

**Example -- 2x2 Factorial with blocks:**

```
Block: Consent          (visible: all conditions)
Block: Demographics     (visible: all conditions)
Block: Treatment_A_High (visible: Condition "A-High")
Block: Treatment_A_Low  (visible: Condition "A-Low")
Block: Treatment_B_High (visible: Condition "B-High")
Block: Treatment_B_Low  (visible: Condition "B-Low")
Block: Dependent Var    (visible: all conditions)
Block: Debriefing       (visible: all conditions)
```

---

## 9.5 Reproducible Randomization (Seeds)

Every randomization operation in QDesigner -- condition assignment, block ordering, counterbalancing row selection -- uses a deterministic pseudo-random number generator (PRNG) seeded with a configurable base seed.

### 9.5.1 The Mulberry32 Algorithm

QDesigner uses the mulberry32 algorithm, a fast 32-bit PRNG suitable for experimental randomization:

```
seed = hash(baseSeed + ":" + participantNumber)
function nextRandom():
    t += 0x6D2B79F5
    r = imul(t XOR (t >>> 15), 1 | t)
    r ^= r + imul(r XOR (r >>> 7), 61 | r)
    return ((r XOR (r >>> 14)) >>> 0) / 4294967296
```

The seed is first hashed using a murmurhash-inspired function that incorporates both the base seed and the participant number, ensuring that different participants receive different (but reproducible) random sequences.

### 9.5.2 Why Seeds Matter

- **Reproducibility:** Given the same seed and participant number, the same assignment and ordering are always produced.
- **Pre-registration:** You can declare your seed in a pre-registration and later demonstrate that the randomization matched.
- **Debugging:** When a participant reports an issue, you can replay their exact experience by using their participant number and the study's seed.

### 9.5.3 Setting the Seed

1. In the **Experimental Design** panel, enter a numeric seed in the **Randomization Seed** field.
2. If left blank, the seed defaults to `Date.now()` at study launch.
3. For pre-registered studies, always set an explicit seed before data collection begins.

---

## 9.6 Practical Examples

### Example 1: Simple Between-Subjects Design

**Research question:** Does a mindfulness intervention reduce test anxiety?

**Setup:**
- Conditions: Control (weight 1), Mindfulness (weight 1)
- Strategy: Balanced
- Seed: 42

**Questionnaire structure:**
1. Block: Consent (all)
2. Block: Pre-test STAI (all)
3. Block: Mindfulness Exercise (Mindfulness only)
4. Block: Control Reading (Control only)
5. Block: Post-test STAI (all)
6. Block: Debriefing (all)

### Example 2: 2x2 Factorial Design

**Research question:** How do framing (positive vs. negative) and source credibility (high vs. low) affect risk perception?

**Setup:**
- 4 conditions: Pos-High, Pos-Low, Neg-High, Neg-Low (weight 1 each)
- Strategy: Random
- Seed: 12345

**Questionnaire structure:**
1. Block: Consent & Demographics
2. Block: Pos-High Stimulus (visible: Pos-High)
3. Block: Pos-Low Stimulus (visible: Pos-Low)
4. Block: Neg-High Stimulus (visible: Neg-High)
5. Block: Neg-Low Stimulus (visible: Neg-Low)
6. Block: Risk Perception Scale (all)
7. Block: Manipulation Checks (all)
8. Block: Debriefing

### Example 3: Within-Subjects with Balanced Latin Square

**Research question:** Does font type (Serif, Sans-Serif, Monospace) affect reading comprehension?

**Setup:**
- Counterbalancing: Balanced Latin Square
- 3 conditions -> 6 orderings (odd n)
- Seed: 9999

**Questionnaire structure:**
1. Block: Consent & Practice
2. Block: Passage A (Serif) -- position determined by counterbalancing
3. Block: Passage B (Sans-Serif) -- position determined by counterbalancing
4. Block: Passage C (Monospace) -- position determined by counterbalancing
5. Block: Preference Rating (all, always last)

Each participant sees all three passages, but in a different order. With 6 orderings and a balanced Latin square, every passage follows every other passage exactly once.

### Example 4: Mixed Design

**Research question:** Does training type (between: Spaced vs. Massed) interact with test difficulty (within: Easy, Medium, Hard)?

**Setup:**
- Between-subjects: 2 conditions (Spaced, Massed), Balanced strategy
- Within-subjects: 3 difficulty levels, Balanced Latin Square counterbalancing
- Seed: 7777

**Questionnaire structure:**
1. Block: Consent & Demographics (all)
2. Block: Spaced Training (visible: Spaced only)
3. Block: Massed Training (visible: Massed only)
4. Block: Easy Test (all, counterbalanced position)
5. Block: Medium Test (all, counterbalanced position)
6. Block: Hard Test (all, counterbalanced position)
7. Block: Debriefing (all)

The between-subjects factor (Training Type) uses condition assignment. The within-subjects factor (Difficulty) uses counterbalanced block ordering. Together they implement a complete mixed design.

---

## 9.7 Participation Quotas

Condition assignment decides *which* group a participant joins; **quotas** decide *how many* participants a condition or demographic cell may accept before it closes. Open them from the **Quotas** command in the designer (the target icon), which opens the **Quota Management** dialog: "Set participation caps per condition or demographic. When a quota is full, respondents matching that condition are routed according to the over-quota action."

### 9.7.1 What You Author

1. Click **Add Quota Group**. Each group has a name and a **logic**: **Independent** or **Cross-quota**.
2. Inside a group, click **Add Quota**. Each quota has:
   - **Target (n)** -- the maximum number of completed responses this quota accepts.
   - **Condition (formula)** -- who this quota counts. Use `true` for a catch-all quota, or comparisons such as `age >= 18` joined with `&&` / `||` (placeholder example: `gender == "female" && age >= 18`).
   - **Over-quota action** -- **Terminate**, **Redirect**, **Skip to end**, or **Continue (flag only)**.
   - An **Over-quota message** (for Terminate / Skip to end) or a **Redirect URL** (for Redirect).
   - An **Enabled** toggle.

Quota conditions are parsed with the same formula engine that runs them, so a condition the dialog accepts is one the runtime can evaluate. A syntax error is flagged inline and blocks **Save**; a reference to a variable the questionnaire has not declared warns but does not block.

### 9.7.2 How Gating Actually Behaves

Quota conditions are **evaluated**, not pattern-matched. Compound conditions with `&&` / `||`, parentheses, and function calls all resolve against the participant's live in-survey variables. (In earlier builds a condition was read by a regex that understood only a single `variable op value` comparison and silently *allowed* every compound condition through, so a multi-term quota never actually gated -- that is fixed.)

The gating rules:

- **Empty / blank condition** -- a catch-all that always matches.
- **A truthy result** -- the condition matches this respondent.
- **A parse or evaluation error** -- treated as **non-matching**: the quota simply does not apply to that respondent (and the error is logged). A broken targeting formula can never corrupt a quota by counting or blocking the wrong people.
- A quota gates a respondent **only when its condition matches *and* the quota is full** (its live completed count has reached the Target).

### 9.7.3 What the Participant Sees

Quota checking runs at entry, before a session is created. When a full quota's condition matches:

- **Terminate** / **Skip to end** -- the participant sees the **Study Full** screen showing the over-quota message (default: "This study has reached its target number of participants."). No completion code is shown.
- **Redirect** -- the participant is sent to the configured URL.
- **Continue (flag only)** -- the participant is admitted, but the session is flagged as over-quota for later filtering.

For example, a quota with **Target** = 1 that already has one completed response will correctly route a matching second participant to **Study Full**.

### 9.7.4 Interlocking (Cross-Quota) Cells

A **Cross-quota** group defines interlocking cells -- combinations of demographic values (e.g., age band x gender). As the dialog notes, "Interlocking cells fill independently; a participant is blocked only when their own cell (their combination of values) is full." A participant whose values fall outside the grid is not gated by the cross-quota. The default message for a full cell is "This study has reached its target for your group."

Because cells resolve from live in-survey answers, the cell check can be re-run after the demographic questions that determine the participant's cell, not only at entry.

### 9.7.5 Offline Enforcement

The last successful quota snapshot is cached locally so an offline start can still enforce quotas. If neither a live check nor a cached snapshot is available, the participant is allowed to proceed and the session is flagged **unchecked** so unverified completions can be filtered afterward.

---

## 9.8 Eligibility Screeners

Quotas are a **capacity** decision -- a group is full. **Screeners** are an **eligibility** decision -- the participant falls outside the target population. The two route to different screens and are recorded distinctly.

### 9.8.1 Authoring a Screen-Out

An eligibility screen-out is authored as a flow-control **Terminate** rule (see Chapter 8: Flow Control and Logic). Filling the rule's **Screen-out message** (and optionally its **Redirect URL**) turns a plain early end into an eligibility screen-out. The designer states this directly: "Fill either field to turn this into an eligibility screen-out: the participant sees a distinct 'not eligible' screen (no completion code) instead of the thank-you page. Leave both blank for a plain early end."

Structured screener rules evaluate an `eligibleWhen` formula at a page boundary; the first rule that evaluates falsy screens the participant out with that rule's reason, message, and redirect.

### 9.8.2 What the Screened-Out Participant Sees

A screened-out participant is routed to a dedicated screen -- **not** the thank-you / completion screen, and with **no completion code**:

- **Title:** "You're not eligible for this study"
- **Message:** the author's screen-out message, or the default "Thank you for your interest. Based on your answers, you do not qualify to take part in this study. Your responses have not been recorded as a completion."
- An optional auto-redirect (with a visible countdown) when a Redirect URL is set.

The screen-out outcome is stamped onto the session metadata, so a resumed ineligible session still shows the screened-out screen rather than a completion. This corrects the older assumption that ineligible participants land on the thank-you page: they never see it, and no completion code is issued.

### 9.8.3 Fail-Open on Broken Formulas

A screener whose `eligibleWhen` formula throws (a bad formula or a missing variable) is treated as **eligible** and logged for the designer -- a broken rule never wrongly rejects a real participant. This is deliberately the opposite of a broken *quota* condition (which fails non-matching): a screener errs toward admitting, a quota errs toward not gating.

---

## 9.9 Design Validation

QDesigner includes built-in validation for experimental designs:

- **Minimum conditions:** At least one condition must be defined.
- **Counterbalancing limits:** Full counterbalancing warns if *n > 6* (720 permutations) and refuses *n > 8*.
- **Weight validation:** Zero or negative weights trigger warnings.
- **Visibility coverage:** The designer warns if any condition has no visible blocks (empty experience).
- **Sample size guidance:** For balanced Latin square designs, the designer recommends sample sizes that are multiples of the number of orderings.
- **Quota condition validation:** Quota targeting formulas are parsed with the runtime formula engine. A syntax error is flagged inline and blocks **Save** of the Quota Management dialog; references to undeclared variables warn but do not block.

---

## 9.10 Summary

| Feature                    | Implementation                          | Key Parameter          |
|---------------------------|----------------------------------------|----------------------|
| Between-subjects           | `ConditionAssigner` class               | `strategy`, `seed`     |
| Random assignment          | Weighted PRNG sampling                  | Condition `weight`     |
| Sequential assignment      | Round-robin mod *k*                     | `participantNumber`    |
| Balanced assignment        | Min-count with tie-breaking             | `groupCounts`          |
| Latin square               | Cyclic rotation                         | *n* orderings          |
| Balanced Latin square      | Williams design algorithm               | *n* or *2n* orderings  |
| Full counterbalancing      | All *n!* permutations                   | Max *n* = 8            |
| Block randomization        | Seeded shuffle with preserve options    | First/Last/Both/None   |
| Condition visibility       | Block-level condition filter            | Condition names        |
| Reproducible randomization | Mulberry32 PRNG with base seed + participant ID | `seed` field     |
| Participation quotas       | Formula-gated caps per condition / cell  | `condition`, `overQuotaAction` |
| Interlocking (cross) quotas| Independent per-cell occupancy           | Cell value tuple        |
| Eligibility screeners      | Terminate rule with screen-out fields    | `screenOutMessage`, `screenOutRedirectUrl` |
