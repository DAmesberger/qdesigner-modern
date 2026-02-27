# Feature Capabilities Roadmap

## Scope
This roadmap covers:
- extensible question-type architecture
- precise reaction-task suite (including n-back)
- configurable questionnaire flow/programmability/randomization
- charting and statistical feedback
- cross-user comparison analytics

## Current status summary
- `QuestionnaireRuntime` supports flow rules (`skip`, `branch`, `loop`, `terminate`), variable formulas, and block-scoped randomization.
- `ReactionEngine` is abstracted and supports high-frequency trials with frame logs and stimulus onset timing.
- `createNBackTrials` exists, but reaction question runtime/designer are not fully wired to task presets (`standard` / `n-back` / `custom`).
- `bar-chart` supports per-session variable visualization and simple aggregation.
- cross-session analytics and person-vs-cohort comparison are not implemented end-to-end.
- `statistical-feedback` currently points to placeholder text components.

---

## Step 1: Reaction Suite Abstraction (standard + n-back + custom)

### Deliverables
- Introduce canonical reaction task config:
  - `task.type: 'standard' | 'n-back' | 'custom'`
  - deterministic `customTrials` schema
  - seeded sequence generation for reproducibility
- Wire reaction runtime to task presets:
  - `ReactionTimeRuntime` generates trial plans based on `task.type`
  - uses `createNBackTrials` for n-back
- Update reaction designer:
  - task selector
  - n-back parameter editor
  - custom trial editor with schema validation
- Keep response values computation-friendly (no hardcoded y/n semantics).

### Acceptance criteria
- n-back is fully authorable in designer and executable in runtime.
- runtime output includes per-trial metadata (`isTarget`, expected response, onset, frame stats).
- deterministic runs when randomization seed is set.

### Tests
- unit: reaction task planners (`standard`, `n-back`, `custom`)
- regression E2E: n-back scenario with deterministic sequence assertions
- performance test: stable timing capture under 120 FPS target

---

## Step 2: Analytics Data Layer (cross-session statistics)

### Deliverables
- Add backend session query/aggregation endpoints:
  - list sessions by questionnaire/filters
  - aggregate stats by variable/question (mean, median, std, percentiles, count)
  - optional pairwise participant comparison endpoint
- Add frontend analytics service for these endpoints.
- Define chart-ready data contracts for runtime/designer consumption.

### Acceptance criteria
- designer can target both:
  - current participant/session data
  - cohort/historical data
- computed metrics are consistent across API and UI.

### Tests
- backend integration tests for aggregation correctness
- frontend contract tests for analytics service mappings

---

## Step 3: Charting + Statistical Feedback Builder

### Deliverables
- Replace placeholder statistical-feedback runtime/designer with real module.
- Unify chart modules around shared analytics base with:
  - source mode: current session vs cohort
  - metric selection (mean/std/percentile/z-score)
  - comparison mode (participant A vs participant B / participant vs cohort)
- Designer UX:
  - visual chart builder with variable/metric pickers
  - preview against sample and live API data
  - validation for invalid formulas/data source combinations

### Acceptance criteria
- designer can build runtime feedback charts without code.
- charts can use custom variables defined in questionnaire.
- participant-vs-cohort and participant-vs-participant views are supported.

### Tests
- E2E: create chart in designer -> publish -> fillout renders expected chart
- E2E: cohort comparison chart reflects seeded historical sessions

---

## Step 4: Questionnaire UX and Quality Hardening

### Deliverables
- Improve authoring UX for complex studies:
  - clearer flow authoring and debugging
  - randomization editors at page/block scope
  - variable formula assistant with validation feedback
- Establish CI quality gates:
  - selector-safe Playwright lint rules for active E2E suites
  - runtime scenario E2E matrix (flow/randomization/programmability/answer options/charting/reaction presets)

### Acceptance criteria
- non-technical designer can configure complex logic without direct JSON editing.
- CI blocks regressions in key authoring + fillout paths.

### Tests
- smoke/regression/fullstack E2E gates
- focused scenario suites for flow/randomization/programmability/charting

---

## Execution order
1. Step 1 (reaction abstraction)
2. Step 2 (analytics data layer)
3. Step 3 (chart builder + feedback runtime)
4. Step 4 (UX hardening + gates)

