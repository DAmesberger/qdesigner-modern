# Reaction Designer Programmability Roadmap (No DSL)

## Goal
Make reaction paradigms fully visual and fully editable inside the existing questionnaire designer, with no hardcoded runtime task branches and no JSON/DSL authoring requirement.

This roadmap targets:
- mixed questionnaires (normal + reaction questions on same pages/blocks)
- fully designable reaction tasks (including Stroop/Flanker/IAT/Dot-Probe as editable starters)
- frame-exact runtime where needed, with clear timing tiers
- creator analytics and participant instant feedback from the same execution model

## Non-Negotiables
- No new DSL.
- No hardcoded task behavior in runtime by task name.
- Presets are starter templates that compile to editable design data.
- Designer and runtime use one canonical reaction schema.

## Current Gaps (Verified)
- Designer exposes `stroop`/`flanker`/`iat`/`dot-probe`, but runtime executes only `standard`/`n-back`/`custom`.
- Reaction config types are duplicated and inconsistent across designer/runtime/shared types.
- Preset generators exist but are not the primary runtime path.
- Visual authoring still relies on `customTrials` JSON for full flexibility.
- Trial-level analytics metadata is not normalized for condition/block-level scientific reporting.

## Target Architecture
1. Canonical visual model
- Introduce a single `ReactionStudyConfig` with:
  - blocks (`practice`, `test`, optional `calibration`)
  - trial templates with factors/conditions and randomization strategy
  - phase timeline per trial (`fixation`, `cue`, `stimulus`, `probe`, `feedback`, `iti`)
  - response mapping and correctness rules
  - scoring definitions (built-ins + formula hooks)
- Keep model as plain questionnaire JSON config authored by UI controls.

2. Single compile path
- `ReactionStudyConfig` -> deterministic `CompiledReactionPlan` -> `ReactionTrialConfig[]`.
- Runtime only executes compiled plans; no per-task hardcoded branches.

3. Presets as editable starters
- Stroop/Flanker/IAT/Dot-Probe become template generators producing `ReactionStudyConfig`.
- After applying a preset, everything is editable in the same visual editor.

4. Unified analytics contract
- Every response includes standardized tags (`blockId`, `trialIndex`, `condition`, `congruency`, `correctKey`, timing method).
- Storage/scoring consumes one schema for all paradigms.

## Execution Backlog

### Phase 1 (P0): Schema Unification + Compatibility Layer
Deliverables:
- Add canonical schema and normalizer.
- Add backward-compat parser for existing `task.*` configs.
- Keep old configs readable while writing new schema.

Files:
- Add `src/lib/modules/questions/reaction-time/model/reaction-schema.ts`
- Add `src/lib/modules/questions/reaction-time/model/reaction-normalize.ts`
- Update `src/lib/modules/questions/reaction-time/metadata.ts`
- Update `src/lib/shared/types/questionnaire.ts`
- Update `src/lib/shared/migration/question-migration.ts`

Acceptance criteria:
- Existing reaction questionnaires load and run unchanged.
- New questionnaires persist only the canonical schema.
- Typecheck/lint/test stay green.

### Phase 2 (P0): Runtime Refactor to Compiler Pipeline
Deliverables:
- Replace task-type branching in runtime with compiled plan execution.
- Preserve deterministic seeding and warm-up.
- Include phase-level metadata in runtime outputs.

Files:
- Add `src/lib/modules/questions/reaction-time/model/reaction-compiler.ts`
- Add `src/lib/modules/questions/reaction-time/model/reaction-plan-types.ts`
- Update `src/lib/modules/questions/reaction-time/ReactionTimeRuntime.ts`
- Update `src/lib/runtime/reaction/types.ts` (metadata extension)

Acceptance criteria:
- No runtime `if taskType === 'stroop'` style branches.
- Runtime accepts one plan format for all paradigms.
- Seeded runs are reproducible.

### Phase 3 (P0): Visual Trial/Block Designer (No JSON Authoring)
Deliverables:
- Replace `customTrials` textarea with visual builders:
  - block editor
  - condition/factor editor
  - phase timeline editor
  - response/correctness mapping editor
- Keep inline preview of generated trial count and balance.

Files:
- Refactor `src/lib/modules/questions/reaction-time/ReactionTimeDesigner.svelte`
- Add `src/lib/modules/questions/reaction-time/designer/BlockEditor.svelte`
- Add `src/lib/modules/questions/reaction-time/designer/TrialTemplateEditor.svelte`
- Add `src/lib/modules/questions/reaction-time/designer/PhaseTimelineEditor.svelte`
- Add `src/lib/modules/questions/reaction-time/designer/ResponseMappingEditor.svelte`

Acceptance criteria:
- Full authoring possible with UI controls only.
- No required raw JSON editing path.
- Mixed questionnaire pages continue to work.

### Phase 4 (P1): Preset Starter Migration (Editable by Design)
Deliverables:
- Convert preset generators to emit canonical schema starters.
- Add “Apply starter” UX for Stroop/Flanker/IAT/Dot-Probe/N-Back.
- Keep scientific defaults, but no lock-in.

Files:
- Add `src/lib/modules/questions/reaction-time/model/starter-templates.ts`
- Update `src/lib/runtime/reaction/presets/stroop.ts`
- Update `src/lib/runtime/reaction/presets/flanker.ts`
- Update `src/lib/runtime/reaction/presets/iat.ts`
- Update `src/lib/runtime/reaction/presets/dotProbe.ts`
- Update `src/lib/runtime/reaction/presets/index.ts`

Acceptance criteria:
- Applying a starter creates editable blocks/trials in designer.
- Changing any parameter rewrites plan preview without custom code.

### Phase 5 (P1): Timing + Media Precision Hardening
Deliverables:
- Ensure phase model supports image/video/audio onset semantics.
- Use best available timing source per modality (`rAF`, `rVFC`, `AudioContext`, fallback).
- Persist timing method per trial for quality auditing.

Files:
- Update `src/lib/runtime/reaction/ReactionEngine.ts`
- Update `src/lib/runtime/reaction/types.ts`
- Update `src/lib/modules/questions/reaction-time/ReactionTimeRuntime.ts`
- Update `docs/PRECISE_TIMING.md`

Acceptance criteria:
- Frame-exact path remains available for reaction-critical phases.
- Timing source is visible in stored response metadata.

### Phase 6 (P1): Scientific Analytics + Feedback Contracts
Deliverables:
- Normalize per-trial tags used by scoring.
- Add built-in derived metrics support (e.g., congruency effects, D-score, attentional bias) from unified response schema.
- Make instant participant feedback configurable by block/condition.

Files:
- Update `src/lib/modules/questions/reaction-time/ReactionTimeStorage.ts`
- Add `src/lib/modules/questions/reaction-time/model/reaction-scoring.ts`
- Update `src/lib/modules/questions/shared/answerTypes.ts`
- Update `src/lib/analytics/ScoringPipeline.ts`
- Update `src/lib/modules/display/statistical-feedback/*`

Acceptance criteria:
- Creator analytics can segment by block/condition/paradigm.
- Participant feedback can show configurable metrics immediately after completion.

### Phase 7 (P2): Legacy Cleanup + Convergence
Deliverables:
- Remove duplicated legacy runtime paths after migration window.
- Converge `ReactionTime.svelte` with runtime contract strategy or deprecate it safely.
- Remove dead task-specific config branches.

Files:
- Update or deprecate `src/lib/modules/questions/reaction-time/ReactionTime.svelte`
- Update `src/lib/modules/questions/reaction-time/ReactionTimeRuntime.ts`
- Update `src/lib/modules/questions/reaction-time/metadata.ts`

Acceptance criteria:
- One authoritative runtime path for reaction tasks.
- No stale task config surface left in codebase.

### Phase 8 (P0/P1 Ongoing): Test Matrix + E2E Coverage
Deliverables:
- Unit tests for schema normalization + compilation determinism.
- Runtime tests for phase timing and modality-specific onset behavior.
- E2E designer -> publish -> fillout flows for mixed questionnaires.

Files:
- Add `src/lib/modules/questions/reaction-time/model/*.test.ts`
- Update `src/lib/runtime/reaction/ReactionEngine.test.ts`
- Add `src/lib/modules/questions/reaction-time/ReactionTimeRuntime.test.ts`
- Update `e2e/helpers/questionnaire-builder.ts`
- Add/Update `e2e/*reaction*` specs

Acceptance criteria:
- Coverage includes Stroop/Flanker/IAT/Dot-Probe as starter-based editable designs.
- Mixed-page questionnaire flow with reaction + standard questions is green in CI.

## Rollout Strategy
1. Ship Phase 1+2 behind feature flag `reactionDesignerV2`.
2. Enable Phase 3 for internal users.
3. Migrate existing reaction configs on load/save with telemetry.
4. Switch default to V2 when migration success rate is stable.
5. Remove legacy branches after one release cycle.

## Definition of Done
- Any supported reaction paradigm can be built visually without JSON/DSL.
- Presets are templates, not runtime-locked implementations.
- Runtime has one compile-and-execute path.
- Scientific metrics are configurable and analyzable at block/condition/trial level.
- Mixed questionnaires and multi-tenant/RBAC behavior remain unchanged and fully functional.
