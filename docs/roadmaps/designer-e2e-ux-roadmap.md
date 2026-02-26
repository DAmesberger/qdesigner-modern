# Designer + Runtime E2E and UX Roadmap

## Objectives
- Add true end-to-end coverage for questionnaire creation in the UI, publish, and participant fillout.
- Make focused scenario tests (flow control, randomization, programmability, answer options, chart feedback) easy to author and maintain.
- Improve designer UI/UX so questionnaire building is fast, clear, and reliable.
- Add visual regression protection for critical designer and fillout paths.

## Scope and sequencing
1. **Step 1: True designer creation -> publish -> fillout E2E**
2. **Step 2: Fixture/helper layer for programmable scenarios**
3. **Step 3: Designer UX redesign implementation**
4. **Step 4: Visual regression suite + gating**

---

## Step 1: True designer creation -> publish -> fillout E2E

### Deliverables
- New fullstack spec using real backend + real designer UI interactions:
  - `e2e/fullstack/designer-creation-fillout.fullstack.spec.ts`
- Auth/project bootstrap helper for E2E that avoids mocked `test-project-1` paths.
- E2E flow covered in one test:
  - login/register test user
  - open real project
  - create questionnaire from project page modal
  - add/edit at least one question in designer
  - save + publish in designer header
  - open public code URL
  - complete fillout
  - assert completion and persisted session existence

### Acceptance criteria
- Test runs green on `fullstack-chromium` with local backend up.
- No use of mocked project route (`test-project-1`) in this new spec.
- Failing publish/session API calls fail the test with actionable error messages.

### Implementation notes
- Reuse current API bootstrap patterns from `e2e/helpers/fullstack-api.ts`.
- Keep selectors anchored to `data-testid`.
- Add retry-safe waits around save/publish status transitions.

---

## Step 2: Fixture/helper layer for programmable scenarios

### Deliverables
- Builder utilities for questionnaire definitions:
  - `e2e/helpers/questionnaire-builder.ts`
  - supports pages, blocks, flow rules, variables/formulas, answer options, chart feedback modules.
- Assertion helpers:
  - `e2e/helpers/runtime-assertions.ts` for runtime state and session assertions.
- Scenario fixtures:
  - control flow
  - randomization (including block-scoped randomization)
  - programmability/formulas/derived variables
  - answer option variants
  - instant chart feedback

### Acceptance criteria
- Existing `runtime-scenarios.regression.spec.ts` migrated to helpers/builders.
- Adding a new scenario requires only fixture composition + assertions, not large inline JSON.
- Shared helpers used by both regression and fullstack tests where applicable.

### Implementation notes
- Keep formulas and variable naming conventions consistent with runtime (`*_value`, `*_rt`, etc.).
- Provide deterministic seeds for all randomization tests.

---

## Step 3: Designer UX redesign implementation

### Deliverables
- Refined information architecture:
  - left panel: structure/questions/flow
  - center: canvas with clear selected state and empty-state actions
  - right panel: context properties with stable sections
- Faster editing affordances:
  - keyboard-first operations (add/duplicate/delete/reorder)
  - bulk option editing for multiple-choice
  - clearer save/publish states and validation feedback
- Flow authoring improvements:
  - more legible rule targeting and condition editing
  - clearer branching visualization and errors

### Acceptance criteria
- Core authoring path requires fewer clicks and no hidden controls on desktop.
- Mobile drawer behavior remains functional and test-covered.
- No regressions in save/publish/preview flows.

### Implementation plan inside step
- 3.1 UX audit + interaction spec
- 3.2 Shell/layout refactor
- 3.3 Question editing UX (especially options)
- 3.4 Flow editor usability pass
- 3.5 Stabilization with regression tests

---

## Step 4: Visual regression suite + gating

### Deliverables
- Playwright screenshot specs for high-value states:
  - project page create modal
  - designer shell (structure + visual modes)
  - properties panels for key question types
  - flow editor states
  - fillout welcome/runtime/completion
- Baseline management doc and CI command integration.

### Acceptance criteria
- Deterministic screenshot runs in Chromium on CI.
- Intentional UI changes require explicit baseline update PRs.
- Failures provide easy-to-review diffs.

### Implementation notes
- Freeze viewport, fonts, and seed data for stable snapshots.
- Keep visual tests focused; avoid highly animated/transient states.

---

## Risks and mitigations
- **Flaky startup/runtime timing**: standardize waits around explicit state transitions and network responses.
- **Auth/environment variability**: keep backend bootstrap in helper layer with clear failure output.
- **Designer refactor regressions**: ship in slices with tests at each slice.
- **Visual diff noise**: lock rendering env and avoid dynamic timestamps/content in snapshots.

## Execution order (recommended)
1. Ship Step 1 and keep it green in CI.
2. Immediately refactor scenario tests via Step 2 helpers.
3. Implement Step 3 in small UX slices, each protected by tests.
4. Add Step 4 visual gating after primary UX changes settle.
