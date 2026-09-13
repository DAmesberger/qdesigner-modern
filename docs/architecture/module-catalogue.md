# Portable form module catalogue

The serializable module contracts live in
[`packages/questionnaire-core/src/module-catalogue.json`](../../packages/questionnaire-core/src/module-catalogue.json).
The server uses this catalogue to validate question configuration before typed
normalization or persistence. Browser metadata reads the same descriptions,
capabilities, defaults and options, adding only local component loaders.

The form inventory is explicit: `text-display`, `text-instruction`, `instruction`,
`media-display`, `bar-chart`, `statistical-feedback`, `text-input`, `number-input`,
`single-choice`, `multiple-choice`, `scale`, `rating`, `matrix`, `ranking`,
`date-time`, `file-upload`, `media-response` and `drawing`. The three reaction
modules belong to the reaction catalogue milestone (#82).

## Configuration boundary

Each `questionSchema` validates the portable question envelope, including its
`config`, `display`, `response` and `responseType` representations. Schemas use
JSON Schema 2020-12. Declarative `orderedBounds` rules compare effective bounds
using the runtime's field precedence; `uniqueItemKeys` rules reject ambiguous
option, row, column and ranking identifiers. The server has no HTTP or file
schema resolver enabled.

Bounds include declared runtime fallbacks where omission affects validity. Date
constraints reject invalid calendar dates and reversed bounds, including local
ISO date-times. Statistical feedback also declares an `effectiveConfigSchema`:
it checks mode-dependent source requirements after the runtime's display/config
merge, and reports failures at the originating authored field. Configuration
validation does not resolve installation-specific cohort bindings; that belongs
to the behavioral-model milestone.

Invalid configuration returns `QDEF_CONFIG_INVALID` with a JSON Pointer rooted at
`/questions/<stable-id>`. Unknown types return
`QDEF_QUESTION_TYPE_UNSUPPORTED` at the question's `/type`. The Definition boundary
validates raw fields first, so an explicit invalid `null` cannot disappear during
optional-field normalization. Definition creation, replacement and edit batches
use the same validator and retain their existing atomicity and revision rules.

Metadata's historical `defaultConfig` contains both question envelope properties
and flat module configuration. `QuestionFactory` extracts display, response,
navigation and analytics envelope fields, and puts module-specific properties
under `question.config`. An explicitly nested `config` stays at that level.
`text-display`'s object-shaped auto-advance configuration remains under `config`;
analytics' boolean auto-advance flag is a question property.

The persisted configuration stays unchanged when adapting it for participant
rendering. For example, a scale may store `display.style` and endpoint labels as
an object, while its component consumes `config.displayType` and a label array.
The runtime adapter derives that component shape without rewriting the definition.

Binary questions follow [ADR 0029](../decisions/0029-form-enforcement-and-offline-binaries.md):
file and recording constraints are portable, and runtime storage follows the
single offline-first binary-answer path. Obsolete storage-mode defaults are not
part of new authoring metadata. Drawing analysis flags belong under module
`config.analysis`, where the runtime reads them.

Common presentation, conditional visibility, timing, navigation, tags, media and
attention-check properties are explicit question fields. A deadline's `onTimeout`
is a closed enum (`auto-submit`, `skip`, `terminate`, `warn`), not a callback.
Authored JavaScript remains rejected. Broader variable, flow, Safe Logic rule,
report and installation-binding semantics retain milestone #83's acceptance
criteria; metadata portability alone does not satisfy those criteria.

## Verification

`http_questionnaire_modules.rs` exercises authenticated import/export with the
real database, exact canonical/digest equality, complete configuration fixtures,
all catalogue defaults, duplicate identifiers, invalid bounds and field-specific
failures. `module-catalogue.test.ts` uses the actual registry and question factory
to check discovery and default field placement. Mounted component tests verify
response capture through the production runtime adapter. Browser tests in
`qdef-modules.fullstack.spec.ts` cover authoring, portable exchange and editor
round trips; participant acceptance tests verify persisted outcomes.

The all-module exchange journey imports into another project, preserving the
authored name. Names are reserved within a project independently of mutable
revisions. Migration 00063 replaces the former `(project_id, name, version)`
uniqueness rule with a transaction-serialized name reservation on creation and
rename. Existing duplicates remain editable; the migration does not rename or
delete them. Conflicting QDef imports return `QDEF_NAME_CONFLICT`, and native
create/rename returns HTTP 409. Saving a draft does not release its name.
