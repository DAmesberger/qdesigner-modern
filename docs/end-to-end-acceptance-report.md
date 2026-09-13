# End-to-end acceptance evidence

Status: local software acceptance passed, 2026-09-11. Publication and hosted CI remain outstanding.
Scope: [acceptance goal](end-to-end-acceptance-goal.md),
[tracking issue #147](https://github.com/DAmesberger/qdesigner-modern/issues/147).

## Revision and environment

This is local working-tree evidence over HEAD
`9e5fdcc3e4bc19decf2dc24250adf0dd6963e337`. The implementation and preceding ADR
reconciliation are uncommitted/unpublished. No hosted CI result is claimed.
The evidence bundle includes a 1,048-file source manifest, tracked source patch
and new source files. Its code-state SHA-256 is
`5c21f1dbc5227ed85def6d9840f6d63b2c42fd667dae76afa0504849fbba01f2`.
The manifest defines its source/config scope; documentation and unrelated skill
deletions are excluded. It includes pre-existing working-tree changes.

- Linux x86_64, kernel 6.12.93; Node 22.22.2, pnpm 8.15.9, Playwright 1.59.1.
- Actual local browsers: Chromium 147.0.7727.15, Firefox 148.0.2, WebKit 26.4.
  These are the environment-provided browser builds. CI installs its browsers
  through the pinned Playwright package.
- Rust 1.94.1 / Cargo 1.94.0. Real Rust server on 4100; Vite on 4173.
- Dedicated test Compose services: PostgreSQL 18-alpine on 15435
  (`678d990e0468`), Redis 7-alpine on 16382 (`13105d2858de`), MinIO on 19005
  (`69b2ec208575`), MailPit SMTP on 11027 (`8316041a1b10`). Image identifiers
  identify the local run; floating image tags are not a reproducibility pin.
- Application database connections use `qdesigner_app`; migrations use the
  separate migration connection. Test data is isolated from the development
  stack. Studies/accounts are synthetic and uniquely provisioned per test/worker.
- Same-origin `/api` proxy, normal product limits, no CSRF/CSP/RLS bypass.
  Reaction tests use real browser keyboard input and the production renderer.
  The phase observer only coordinates input after presentation. API-seeded
  reaction fixtures use `rt6-seed`; the UI-authored Standard RT plan has three
  fixed trials and explicit semantic `left`/`right` bindings.

## Acceptance matrix

The combined command discovers 20 tests. Results below describe the implemented
assertions; the two final combined run results are recorded separately.

| Area | What is verified |
|---|---|
| Form authoring | Create through the designer; configure text length, choice labels/values and numeric range; save/reload with stable IDs and settings; publish through the UI. |
| Form participation | A separate anonymous browser context stays online. Invalid text/number answers block advance. Exactly three matching question IDs/values, numeric version association and `completed` session state are read back from the real server. |
| Reaction authoring | Configure the existing Standard RT editor with three test trials, no practice, timing settings and semantic F/J bindings; save/reload and publish through the UI. |
| Reaction participation | Real F/J input and one withheld response produce exactly three ordered correct/incorrect/timeout rows. Assert question/version association, distinct client IDs, bounded nonnegative recorded RT, raw timing and provenance. |
| Recovery | Offline form binary capture/upload and mid-block reaction continuity/reconnect. A form reload resumes at the second question with the first answer preserved. |
| Duplicate delivery | For answers and reaction trials, the real server commits a sync before its acknowledgement is deliberately lost. Automatic delivery retries, and the exact persisted counts/client IDs remain unique. |
| Retry and concurrent participants | Inject one HTTP 429 with `Retry-After: 3`; successful retries still reach the real server. The retry arrives no earlier than the deadline while another participant behind the same IP completes independently. |
| Timing validity and media | Missing required media blocks execution and can recover after retry; a hung audio resume cannot wedge trial start. Real documents served without isolation headers record `crossOriginIsolated: false` under `record`; `enforce` blocks before session creation. |
| JavaScript rejection | Stored questionnaire, page and question hooks produce actionable authoring/runtime errors, never set the execution marker, and remain unchanged on the server. Unit tests cover raw envelopes, known global-script aliases, preview and Yjs boundaries; a static AST guard prevents dynamic compilation reintroduction. |

The ordinary form module suite also covers choice, scale, rating, matrix, ranking,
date, drawing, file capture and module-owned constraints. It stays online except
for explicitly named offline recovery cases. The former 45-second inter-test
gates and ordinary-form offline workarounds are removed.

## Run results

| Command / check | Result |
|---|---|
| `pnpm test:e2e:acceptance --reporter=line,html` — final run A | 20 passed, retries 0, 4.8 minutes |
| Same command, new browser process/contexts and fresh fixtures — final run B | 20 passed, retries 0, 4.8 minutes |
| Firefox + WebKit online form capture and validation | 6 passed, retries 0 |
| Interactive designer preview + explicit reaction lost-acknowledgement regression | 2 passed, retries 0 |
| Earlier combined set, before the last alias/dedup assertions | 19 passed, retries 0, 4.8 minutes; not counted as either final run |
| Unit suite with corrected package discovery | 187 files, 1,884 tests passed |
| `pnpm check` | 0 errors, 20 existing warnings |
| `pnpm --filter @qdesigner/web build` | Passed |
| Required-DB `anon_path_limits` server integration suite | 9 passed, no skips |
| Targeted ESLint, whitespace check and workflow YAML parsing | Passed; existing UI primitive warnings remain |

Unit discovery now scans package roots without traversing their dependency
symlinks. Earlier totals included repeated package tests; 1,884 is the final
configured run after removing that duplicate discovery.

Commands use one worker and `--retries=0 --trace=on`. Each acceptance invocation
starts fresh browser state and provisions new synthetic studies; the dedicated
backend database is reused without deleting previous run evidence. Browser
processes/frontends are restarted between the two final invocations. Full
cross-browser authoring and physical reaction timing are not claimed.

## Reproducing the software checks

Use the isolated stack setup and same-origin environment in
[the E2E guide](../apps/web/e2e/README.md) or the acceptance workflow. Generate
Paraglide/SvelteKit modules before starting the browser-test frontend. From the
repository root, with the server and test infrastructure available:

```sh
pnpm test:e2e:acceptance --reporter=line,html
pnpm --filter @qdesigner/web exec playwright test \
  e2e/form/capture-smoke.form.spec.ts e2e/form/validation.form.spec.ts \
  --project=form-firefox --project=form-webkit --workers=1 --retries=0 --trace=on
pnpm --filter @qdesigner/web exec playwright test \
  e2e/smoke/questionnaire-creation-preview-fillout.smoke.spec.ts \
  e2e/reaction/duplicate-delivery.reaction.spec.ts \
  --project=smoke-chromium --project=reaction-chromium --workers=1 --retries=0 --trace=on
```

Run source checks separately from the active browser frontend:

```sh
pnpm test:unit
pnpm check
pnpm --filter @qdesigner/web build
REQUIRE_DB=1 cargo test --manifest-path apps/server/Cargo.toml --test anon_path_limits -- --test-threads=1
```

The final unit run invoked Vitest directly with the unit integration exclusion,
after module generation had already completed. Environment-provided local browser
builds required `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true`; CI uses
Playwright's normal browser/dependency installation.

## Product fixes exposed by verification

- **#51:** transient transport failures formerly consumed the rejection budget.
  The sync endpoint also shared a small IP budget with unrelated requests.
  It now has a bounded per-session quota and Retry-After; clients preserve queued
  records and store retry deadlines in IndexedDB. The durable deadline matters:
  the page controller and response persistence own separate upload engines, and
  an in-memory per-engine deadline let the second engine retry immediately.
- **Designer type switch:** the old asynchronously loaded properties editor
  received the newly selected question's incompatible config and threw. A
  component regression reproduces this; the panel now mounts an editor only for
  its loaded question type and ignores obsolete load results.
- **#91:** raw designer envelopes are checked before normalization can discard
  executable fields. Invalid definitions render an explicit load error and
  cannot be autosaved as a silently stripped copy. Preview/runtime/Yjs rejection
  and the source guard complement the removed engines/editors and CSP concession.

An initial absolute API URL conflicted with CSP and was corrected to the normal
same-origin proxy. A development HMR failure occurred when Paraglide was generated
while Vite browser tests were active. Code generation/build and browser runs are
now serialized; those intermediate failures are retained as diagnostic evidence.
Test-driver corrections (palette backdrop, labelled controls, one-based stored
trial indices and automatic same-tab resume) follow the actual product contract.

## CI and retained evidence

[Questionnaire acceptance workflow](../.github/workflows/e2e-acceptance.yml) runs
on PRs/pushes to main and manually. It starts the dedicated services and real
backend, generates frontend modules, runs rejection/retry regressions, then runs
the bounded Chromium set with retries disabled. Failure is visible; artifacts
include all traces, failure screenshots/video, HTML report, console output and
server/infrastructure logs for 14 days. The broader on-demand workflow remains
separate. Repository branch-protection settings were not changed.

During implementation, logs and traces are under `/tmp/qdesigner-e2e-goal/`.
Local evidence: [HTML run A](../test-results/acceptance-2026-09-11/report-a/index.html),
[HTML run B](../test-results/acceptance-2026-09-11/report-b/index.html), and
[downloadable evidence bundle](../test-results/acceptance-2026-09-11.tar.gz).
The bundle contains both complete trace sets/reports, supplementary browser traces,
source manifest/patch/new files, diagnostic logs and this report. It uses synthetic
test accounts; traces contain their test session state. The bundle is gitignored. Hosted CI evidence and publication remain
outstanding, so implementation tickets stay open for review/publication.

## Limits and next work

This milestone proves the bounded authoring-to-data workflows, not all legacy
parity. It does not deliver full Safe Logic/QDef/MCP, all Reaction Lab authoring
modes, PCA, or every interruption point inside a reaction trial. Those remain
separately tracked delivery work. Preview smoke proves module interaction, not
complete preview/runtime flow parity (#36).

Physical display/input timing qualification has not been performed. Before
claiming measurement precision, use representative lab machines, displays and
input devices with an external onset/input reference and measure latency/error
under normal and degraded conditions. Browser automation's input latency is not
that reference.
