# Questionnaire definition exchange and MCP requirements

**Decision date:** 2026-08-31  
**Status:** successor requirement; architecture reconciled by [ADR 0039](decisions/0039-safe-logic-only-and-qdef-boundary.md). JavaScript execution is removed immediately; compatibility is intentionally broken during development.  
**Related:** [Legacy feature audit](./legacy-qdesigner-feature-audit.md), [legacy-modern matrix](./legacy-modern-feature-matrix.md)

## Decision

QDesigner will not ship a legacy-migration CLI or migration GUI.

Legacy migration will be performed by agents. The product capabilities those agents—and ordinary researchers—need are:

1. a versioned, deterministic, exportable and importable questionnaire definition format;
2. a secure MCP server that can read, create, update, validate, export and test questionnaires through the same product rules as the visual designer;
3. deterministic questionnaire scenarios that verify behavior before a migrated or newly authored questionnaire is accepted.

“Import” remains a normal questionnaire capability. What is removed is a special-purpose legacy migration product. An agent may read any legacy source, construct the canonical definition, validate and test it through MCP, then import it as a draft.

## Why this is new work

The current product does not yet have a supported definition exchange contract:

- `apps/web/src/lib/components/designer/Designer.svelte:53-80` contains a legacy/alternate client-side `JSON.stringify`/`JSON.parse` path, but it is not the primary routed designer or a versioned format.
- `apps/web/src/lib/stores/designer/DocumentStore.ts:118-172` permissively normalizes arbitrary payloads and generates/defaults missing structure; its validation at `:533-603` checks only a small subset of semantic integrity.
- `DocumentStore.exportQuestionnaire()` at `:603-605` is only a deep clone.
- The server stores `content` and `settings` as arbitrary JSONB and its current `/questionnaires/:id/export` route at `apps/server/src/api/questionnaires.rs:750-1001` exports **responses**, not a questionnaire definition.
- Browser-only module registration (`apps/web/src/lib/modules/register-all.ts:19-23`) prevents server/MCP validation from using the complete module schemas.
- The current dev-only `/test-runtime` harness runs fixed scenarios rather than arbitrary questionnaire definitions.

The definition contract therefore needs its own deep Module. Adding an MCP wrapper around the current CRUD routes would preserve the existing lossy normalization and validation gaps.

## Interface alternatives considered

Three parallel designs were evaluated using Depth, Leverage, Locality and seam placement.

### Design A — minimal stateless definition interface

Three operations: `read`, `apply`, and `test`. `apply(commit: false)` canonicalizes and validates; `apply(commit: true)` creates/imports/updates. Full replacement and stable-ID edits share one atomic path.

Strengths:

- smallest Interface and highest Leverage per operation;
- easy for an agent to understand and retry;
- little ephemeral server state;
- import, validation, creation and editing cannot drift into separate Implementations.

Cost:

- the caller holds intermediate definitions;
- large iterative edits must use stable-ID changes or resend the definition.

### Design B — stateful questionnaire workbench

An ephemeral workspace supports `open`, `apply`, `validate`, `runScenarios`, `commit`, `publish`, and `export`.

Strengths:

- excellent iterative authoring workflow;
- invalid intermediate states stay isolated;
- scenario attestations can bind to a workspace digest.

Cost:

- a much wider Interface;
- workspace ownership, expiry, persistence and cleanup become new product concepts;
- duplicates much of what a normal saved draft and optimistic revisions already provide.

### Design C — extensible definition transaction interface

Four operations—`open`, `apply`, `verify`, `emit`—with capability negotiation, stable paths, optional extensions, package signing and several test runners.

Strengths:

- strongest future extension and package provenance story;
- stable-ID edits handle collaboration better than array-index JSON Patch;
- clean separation between portable semantics and installation bindings.

Cost:

- more abstraction and version negotiation than the first client migration requires;
- extension/signature support could delay the core exchange and MCP outcomes.

### Recommendation

Use Design A's three-entry Interface, enriched with Design C's stable-ID edits and portable/installational separation. Do not add stateful workspaces initially. A saved questionnaire draft is the durable collaboration unit; `apply(commit: false)` is the isolated dry run.

This recommendation creates one deep `QuestionnaireDefinition` Module. The web designer, HTTP endpoints, MCP Adapter, runtime tests and future automations cross the same seam.

## Canonical definition format

### Names

- Logical format name: **QDesigner Questionnaire Definition**, abbreviated **QDef**.
- JSON media type: `application/vnd.qdesigner.questionnaire+json`.
- Self-contained package media type: `application/vnd.qdesigner.questionnaire+zip`.
- Files: `.qdef.json` and `.qdef`.

JSON is canonical. YAML may be offered only as a noncanonical convenience view; it must not define hashing or round-trip semantics.

### Envelope

```json
{
  "$schema": "https://schemas.qdesigner.dev/questionnaire/1.0.0",
  "format": "qdesigner.questionnaire",
  "formatVersion": "1.0.0",
  "instrument": {
    "name": "Stroop study",
    "description": "Demonstration instrument",
    "version": "1.0.0",
    "defaultLocale": "en"
  },
  "assets": {
    "instructions-audio": {
      "mediaType": "audio/wav",
      "byteLength": 18432,
      "sha256": "3d63...9a",
      "path": "assets/3d63...9a.wav"
    }
  },
  "variables": {
    "score": {
      "type": "number",
      "scope": "global",
      "defaultValue": 0
    }
  },
  "questions": {
    "consent-answer": {
      "type": "single-choice",
      "required": true,
      "display": {
        "prompt": "Do you consent?",
        "options": [{ "value": "yes", "label": "Yes" }]
      },
      "response": { "saveAs": "consent" }
    }
  },
  "structure": {
    "pages": [
      {
        "id": "intro",
        "blocks": [
          {
            "id": "intro-main",
            "type": "standard",
            "questionIds": ["consent-answer"]
          }
        ]
      }
    ]
  },
  "flow": [],
  "rules": [],
  "settings": {
    "allowBackNavigation": false,
    "showProgressBar": true
  },
  "translations": {},
  "extensions": {}
}
```

The exact v1 schema will be generated from one authoritative model shared across TypeScript, Rust, JSON Schema and MCP tool schemas. The example establishes shape, not every field.

### Portable versus installation state

QDef includes behavior required to reproduce an instrument:

- stable internal IDs and order;
- question/module configuration;
- pages, blocks, flow and randomization;
- variables, formulas, structured rules and validation;
- consent, scoring, feedback, reports, translations and distribution behavior that is safe to transfer;
- logical asset references, content hashes and media types;
- instrument semantic version.

QDef excludes installation authority and mutable operational state:

- organization, project and database questionnaire IDs;
- creator, owner, permissions and credentials;
- draft/published/archive status;
- server revision, CRDT state, timestamps and audit history;
- signed asset URLs;
- participant sessions, responses, quota counts and cohort aggregates.

Import binds a portable definition to a target project after authorization. It never adopts authority embedded in a file.

### Determinism and round trip

- Format version, instrument semantic version and server revision are distinct.
- UTF-8 JSON only; finite JSON numbers; LF and a final newline.
- Registry objects such as questions, variables and assets serialize by key. Arrays are used only where order is behavioral: pages, blocks, item references, options and flow precedence.
- Internal IDs are stable, unique and independent of array position. Every reference resolves.
- Canonical semantic identity is `sha256(RFC8785(canonicalDefinition))`.
- `export(import(export(D)))` must be byte-identical for canonical JSON.
- Import/export must preserve all recognized fields and ordered sequences. It must never silently drop or invent behavioral content.
- Unknown core fields are errors. Unknown namespaced optional extensions are preserved; unknown required extensions prevent execution/publication.
- Normalization is idempotent and every default inserted by normalization is documented.

### Assets and packages

A `.qdef` package is a deterministic ZIP:

```text
manifest.json
questionnaire.json
assets/sha256/<digest>
tests/<suite-id>.json          # optional
provenance.json               # optional and nonsemantic
```

Package requirements:

- asset references use logical keys, not server media IDs;
- manifest declares SHA-256, sniffed media type and byte length;
- paths are normalized and may not be absolute, contain `..`, be symlinks or collide after case/Unicode normalization;
- files stream during import/export; complete packages are not held in memory;
- digest, media type, per-file limit, package limit, entry count and decompression ratio are verified before persistence;
- deterministic output fixes entry order and irrelevant ZIP metadata;
- a JSON-only definition may reference already available content digests and receives an explicit missing-asset diagnostic otherwise.

### Safe logic only

QDef must not contain executable JavaScript.

Allowed:

- `qexpr/1`: the constrained expression AST language;
- `qrule/1`: declarative event, condition and allowlisted action records.

Initial actions should cover:

- set/unset variable;
- navigate/complete;
- accept/reject/invalidate response;
- start/stop media;
- emit a typed signal through a deployment-authorized integration Adapter.

Rejected with exact paths and remediation hints:

- `page.script`, `settings.script`, `globalScripts` or aliases;
- JavaScript custom-function bodies;
- dynamic imports, constructors or ambient global access;
- `javascript:` URLs, inline event handlers and executable HTML;
- unknown executable extension payloads.

The stable diagnostic is `UNSAFE_EXECUTABLE`. A migration agent translates behavior to expressions/rules or records an explicit unresolved capability; it never hides the loss.

## The deep QuestionnaireDefinition Module

```ts
interface QuestionnaireDefinition {
  read(input: {
    ref: { projectId: string; questionnaireId: string; revision?: string };
    representation?: 'document' | 'artifact';
    assets?: 'manifest' | 'package';
  }): Promise<ReadResult>;

  apply(input: {
    target?: {
      projectId: string;
      questionnaireId?: string;
      expectedRevision?: string;
    };
    change:
      | { replace: DefinitionSource }
      | { edits: StableDefinitionEdit[] };
    commit: boolean;
    version?: {
      createAs?: string;
      bump?: 'none' | 'patch' | 'minor' | 'major';
    };
    idempotencyKey?: string;
  }): Promise<ApplyResult>;

  test(input: {
    source: DefinitionSource;
    plan: TestPlan;
    mode?: 'model' | 'browser';
  }): Promise<TestReport>;
}
```

### Semantics

`read` is definition read and canonical export. Large documents/packages return resource links rather than oversized inline payloads.

`apply` covers:

- `commit: false`: parse, canonicalize, validate and return diagnostics without writes;
- create/import: project target without questionnaire ID plus full definition;
- replace: full desired definition with expected server revision;
- edit: atomic stable-ID changes, addressed as `/pages/@intro/blocks/@main/questions/@age` rather than fragile array indexes.

Create requires an idempotency key. Update requires `expectedRevision`; stale writes fail with `REVISION_CONFLICT`. A call is atomic, including assets, version snapshot, variable projections, collaboration-state handling and audit append. Import always produces a draft.

`test` validates first and runs a complete bounded plan. It never publishes, creates participant sessions, consumes quotas, changes aggregates or writes analytics.

Publication stays outside this Interface. It is a separate existing product action requiring `QuestionnairePublish`, exact committed revision/digest and explicit user authorization.

### Hidden Implementation

The Module owns:

- QDef/ZIP parsing, format-version dispatch and canonical emission;
- JSON Schema plus module-specific semantic validation;
- stable-path editing, reference indexes and semantic diffing;
- formula/rule parsing, type/reference/cycle analysis and safety policy;
- asset traversal, hashing, MIME validation and content-addressed binding;
- the sole portable ↔ current runtime/persistence mapper;
- deterministic test-plan compilation and reports;
- authorization, idempotency and optimistic-concurrency orchestration;
- transactional snapshot/persist/projection/audit behavior and correct Yjs invalidation.

The visual designer, server routes, MCP handlers and tests must not maintain separate serializers or validators. Deleting this Module would force that complexity back into every caller; that is why it earns the seam.

### Adapters

| Seam | Production Adapter | Test Adapter |
|---|---|---|
| Definition repository | Postgres/RLS | isolated test database or in-memory |
| Asset store | configured object/media store | content-addressed memory store |
| Identity | user session and scoped API/MCP token | test principal |
| Audit | append-only tenant audit log | capturing audit store |
| Runtime host | production browser runtime | deterministic headless host |
| Render host | Playwright/browser worker | recording host |
| Clock/randomness | monotonic clock and seeded PRNG | virtual clock and replay PRNG |
| External signals | permissioned integration | scripted fake capability |

The module/question catalog must become server-usable data rather than being derived only from browser component registration.

## MCP server

The MCP server is an Adapter over `QuestionnaireDefinition` and existing identity/authorization—not a second questionnaire Implementation and never a direct database client.

### Tools

Keep the model-controlled surface to three tools:

1. `qdesigner_definition_get`
   - reads a draft or immutable version;
   - returns canonical document metadata and/or a QDef artifact resource;
   - requires `QuestionnaireRead`.
2. `qdesigner_definition_apply`
   - dry-run validation, create/import, full replacement or batched stable-ID edits;
   - returns canonical digest, semantic diff, revision and structured diagnostics;
   - requires `QuestionnaireWrite`, plus media permission when assets are introduced.
3. `qdesigner_questionnaire_test`
   - runs static validation and deterministic model/browser scenarios against an inline, artifact or stored definition;
   - returns bounded structured results plus resource links for traces/screenshots.

There is deliberately no `migrate_legacy`, migration wizard, migration CLI or migration GUI. There is also no MCP publish tool in the initial server; creation and testing are reversible, while publication exposes participant-facing state.

### Resources

- `qdesigner://schema/questionnaire-definition/v1`
- `qdesigner://schema/test-plan/v1`
- `qdesigner://catalog/question-types`
- `qdesigner://catalog/formula-language/1`
- `qdesigner://catalog/rule-actions/1`
- `qdesigner://examples/questionnaires/{name}`
- `qdesigner://projects/{projectId}/questionnaires`
- `qdesigner://projects/{projectId}/questionnaires/{id}/definition`
- `qdesigner://projects/{projectId}/questionnaires/{id}/versions/{semver}`
- `qdesigner://test-runs/{runId}`

Resource URIs are opaque references, not bearer capabilities. Authorization is checked on every read/call. Large schemas, definitions, packages, traces and screenshots travel as resources rather than bloating tool results.

MCP distinguishes application-controlled resources from model-controlled tools, supports structured tool results/resource links, and requires input validation, access controls, rate limiting and audit-conscious handling. The server should pin and test against a named MCP protocol revision rather than assuming clients follow a moving draft. See the official [server overview](https://modelcontextprotocol.io/specification/2025-06-18/server/index), [tools specification](https://modelcontextprotocol.io/specification/draft/server/tools), [resources specification](https://modelcontextprotocol.io/specification/draft/server/resources), and [authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

### Authorization and audit

- Remote HTTP transport uses MCP-compatible OAuth protected-resource discovery and audience-bound tokens; local stdio may use explicitly configured environment credentials.
- Existing QDesigner permissions remain authoritative. MCP does not receive a platform-wide service identity.
- Token scopes and tenant/project RLS both apply.
- Handles/resource URIs never bypass authorization.
- Every mutation records human/agent principal, MCP client, delegation/correlation ID, intent summary, before/after digest, semantic change summary and idempotency key.
- Tool inputs and results are size bounded and sanitized; tool calls are rate limited.
- Definition validation failures are structured tool-execution results so agents can correct them. Authentication, malformed protocol calls and unavailable resources use protocol/transport errors.

## Deterministic questionnaire testing

### Test plan

```json
{
  "format": "qdesigner.test-plan",
  "formatVersion": "1.0.0",
  "definitionDigest": "sha256:4db6...",
  "defaults": {
    "seed": "minor-path-v1",
    "locale": "de",
    "timeZone": "Europe/Berlin",
    "viewport": { "width": 1280, "height": 800 },
    "online": true
  },
  "scenarios": [
    {
      "id": "minor-is-screened-out",
      "fixtures": {
        "serverVariables": {},
        "capabilities": {}
      },
      "steps": [
        { "expectPresented": { "pageId": "consent" } },
        { "consent": { "accepted": true } },
        { "respond": { "questionId": "age", "value": 17, "afterMs": 500 } },
        { "advance": true }
      ],
      "expect": {
        "outcome": "screened_out",
        "visitedPages": ["consent", "demographics"],
        "notVisitedPages": ["main-study"],
        "responses": { "age": 17 },
        "variables": { "adult": false },
        "errors": []
      }
    }
  ]
}
```

### Modes

`model` mode uses production formula, flow, randomization, scoring and reaction calculation code behind in-memory Adapters. Time is virtual, randomness is seeded, hardware/network/cohort inputs are fixtures, and no wall-clock sleep occurs.

`browser` mode mounts the exact definition in an isolated production-like browser host for rendering, interaction, responsive layout, media, accessibility, screenshots and WebGL behavior. It is slower and cancellable.

Synthetic reaction-time tests prove calculation and flow, not physical device/display latency. Reports must label that distinction.

### Steps and assertions

Initial steps:

- expect presented/not-presented;
- consent;
- answer, key and pointer input;
- next/back;
- advance virtual time;
- disconnect/reconnect;
- suspend/resume;
- scripted device/signal fixture.

Initial assertions:

- current/visited/skipped page and item order;
- response value, validity, timing and correctness;
- variable and score values;
- flow decision and completion/screen-out/timeout outcome;
- randomization stability for a seed;
- resume state and offline replay;
- validation messages and absence of runtime errors;
- browser accessibility and screenshot artifacts.

Every report records the exact definition digest, QDef/schema version, runtime/module/formula/rule versions, scenario, seed, virtual-clock trace, ordered presentation trace, responses, variable changes, flow decisions, assertions and artifact URIs. Applying any definition change invalidates prior test attestation for that digest.

Hard limits cover steps, virtual duration, wall time, trace events and artifacts. Missing external inputs fail as `MISSING_FIXTURE`; tests never call arbitrary networks.

## Stable diagnostics

```json
{
  "code": "REFERENCE_MISSING",
  "severity": "error",
  "path": "/flow/@under-age/target",
  "message": "Page 'screened-out' does not exist",
  "hint": "Create the page or change the target",
  "relatedPaths": []
}
```

Required codes include:

- `FORMAT_UNSUPPORTED`, `SCHEMA_INVALID`, `UNKNOWN_FIELD`;
- `DUPLICATE_ID`, `REFERENCE_MISSING`, `REFERENCE_CYCLE`;
- `MODULE_UNAVAILABLE`, `EXTENSION_REQUIRED`;
- `FORMULA_INVALID`, `FORMULA_TYPE_ERROR`, `UNSAFE_EXECUTABLE`;
- `ASSET_MISSING`, `ASSET_HASH_MISMATCH`, `ASSET_TYPE_REJECTED`, `LIMIT_EXCEEDED`;
- `REVISION_CONFLICT`, `PERMISSION_DENIED`;
- `MISSING_FIXTURE`, `TEST_ASSERTION_FAILED`, `TEST_LIMIT_EXCEEDED`, `RUNTIME_ERROR`.

Invalid definition/test content returns diagnostics without partial writes. Infrastructure failures, cancellation and programmer faults remain errors.

## Agent-driven migration workflow

1. Agent audits a legacy template and assets externally.
2. Agent reads QDef, question-type, formula and rule catalogs through MCP resources.
3. Agent constructs QDef and calls `qdesigner_definition_apply` with `commit: false`.
4. Agent resolves every validation error and records intentional behavior changes.
5. Agent supplies representative deterministic scenarios and calls `qdesigner_questionnaire_test` in model mode.
6. Agent adds browser scenarios for layout, media, accessibility and timing-sensitive presentation.
7. Agent imports the validated definition as a draft with an idempotency key.
8. Agent exports the stored canonical QDef and checks digest/round-trip equality.
9. A human reviews the draft, diagnostics, scenario report and behavior-change record before publication.

This workflow is reusable for legacy QDesigner, other survey systems, generated studies and routine source-control handoff. No migration-specific product surface is needed.

## Acceptance criteria

### QDef

- JSON Schema and generated TypeScript/Rust models have one authoritative source.
- Canonical JSON round-trip and deterministic package tests pass across platforms.
- Every registered question/module, flow, scoring, report, translation and safe rule field survives import/export.
- Server/installational state is absent from portable artifacts.
- Corrupt, unsafe, ambiguous and unsupported content produces stable path-addressed diagnostics without partial writes.
- Asset integrity, archive safety and limits are tested.
- A legacy-derived agent-authored fixture imports and re-exports without semantic drift.

### Definition Module and product import/export

- Visual designer, REST and MCP use the same codec/validator/persistence mapper.
- Definition import creates a draft; update requires optimistic revision; publication is separate.
- Generic Export definition and Import definition actions are available in the primary designer/project UI.
- Version snapshot, asset references, variable projections, Yjs state and audit are transactionally correct.
- No special legacy migration CLI or GUI exists.

### MCP

- Tools and resources expose the documented schemas with bounded structured outputs.
- Authentication, RBAC, RLS, idempotency, concurrency, rate limiting and audit are covered by integration tests.
- The MCP Adapter cannot access the database or bypass the Definition Module.
- Definition creation/update and model/browser testing work end to end from a standard MCP client.
- Publication is not exposed by the initial MCP server.

### Testing

- Same definition digest, engine versions, seed and fixtures produce the same logical trace digest.
- Scenarios cover conditional flow, randomization, validation, scoring, timeout, resume/offline behavior and completion states.
- Browser mode verifies responsive rendering, media, accessibility and screenshots without writing participant data.
- Test reports are reproducible, bounded and bound to the exact definition digest.
