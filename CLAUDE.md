# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Project overview

QDesigner Modern is a questionnaire platform for psychological and behavioral research. Reaction timing (post-Phase 3): frame-accurate stimulus onset with measured display-latency correction, high-resolution input timestamps (`event.timeStamp`), and audio onset corrected for output latency — yielding sub-millisecond *relative* precision on difference scores (not absolute microsecond accuracy). Full timer resolution requires cross-origin isolation (COOP/COEP). Plus WebGL 2.0 rendering, fully offline-capable fillout, semver-versioned questionnaire definitions. Svelte 5 + SvelteKit + TypeScript strict on the frontend; Rust/Axum on the backend.

## Workspace layout

```
apps/
  web/          @qdesigner/web — SvelteKit app (frontend, fillout runtime, designer)
  server/       qdesigner-server — Rust/Axum bin+lib (handlers, RLS, JWT, S3, Yjs)
packages/
  contracts/             @qdesigner/contracts — generated OpenAPI types
  questionnaire-core/    @qdesigner/questionnaire-core — domain types (Questionnaire, Variable, …)
  scripting-engine/      @qdesigner/scripting-engine — formula evaluator, VariableEngine, ScriptEngine, MonacoConfig
docs/decisions/          Authoritative ADRs (0001-0009 + supervisor protocol + baseline)
```

Workspace is `pnpm-workspace.yaml`: `apps/*` and `packages/*`. Imports use `@qdesigner/<package>` aliases — not relative paths to `packages/`.

## Essential commands

```bash
# Bootstrap toolchain (devShell pins nodejs_22, pnpm_8, rustc/cargo/rustfmt/clippy, just, openssl)
direnv allow                     # auto-loads the flake on cd into the repo

# Dependencies
pnpm install                     # always pnpm, never npm

# Infrastructure
docker compose up -d             # postgres, redis, minio, mailpit
docker compose -f docker-compose.test.yml up -d   # ephemeral test stack

# Backend (runs migrations on startup)
cargo run --manifest-path apps/server/Cargo.toml

# Frontend
pnpm --filter @qdesigner/web dev

# Verification (the full Phase gate)
pnpm --filter @qdesigner/web check
pnpm --filter @qdesigner/web test
pnpm --filter @qdesigner/scripting-engine test
pnpm --filter @qdesigner/web build
cargo check --manifest-path apps/server/Cargo.toml
cargo build --manifest-path apps/server/Cargo.toml
# Server tests inherit DATABASE_URL from .env.development (qdesigner_app
# for the app pool; tests that need to seed RLS-bound tables fall back
# to DATABASE_URL_MIGRATIONS — qdesigner — via the get_test_pool helper).
cargo test --manifest-path apps/server/Cargo.toml -- --include-ignored
```

Test count baseline (post-Phase 6):
- frontend web suite: 43 files / 716 passing (includes package tests via vitest glob)
- scripting-engine standalone: 6 files / 223
- server: 44 across 1 lib + 7 integration files (12 bin unit + 8 auth_flows + 3 sync_session_dedup + 5 bump_version_semver + 8 rbac_integration + 1 revoked_tokens_purge + 1 rls_context + 6 rls_enforcement). The bin-unit count went 10→12 with the two unit tests in `middleware::fillout_rls_context` covering the URL-path session-id matcher; rbac_integration went 8 (after P6.2 deleted the now-incoherent `organizations_policy_denies_non_member`) → 7 → 8 (P6.6 added `cross_tenant_org_membership_check_denies_non_member`).

## Ports

| Service | Host port |
|---|---|
| Frontend (Vite dev) | 5173 (`pnpm dev` default) / 4173 (preview) |
| Backend (Axum) | 4100 (from `.env.development`) |
| PostgreSQL | 15434 |
| Redis | 16381 |
| MinIO API | 19003 |
| MinIO Console | 19004 |
| MailPit SMTP | 11026 |
| MailPit Web UI | 18026 |

`.env.development` is authoritative; values above match it.

## Frontend architecture

```
apps/web/src/
  routes/
    (auth)/                      login, signup, forgot-password, reset-password, onboarding
    (app)/                       dashboard, projects/[id]/designer, analytics, admin, settings
    (fillout)/q/[code]/          public fillout runtime (ssr=false, offline-capable)
    (public)/                    redirects / → /login (no marketing surface; cleanup Phase 1.0.6)
    invite/[token]               accept-invitation
  lib/
    runtime/         QuestionnaireRuntime, FormQuestionHost + moduleConfigAdapter (DOM overlay), reaction/ReactionEngine + presets
    renderer/        WebGL rendering pipeline — the ONLY drawing path (v1 reaction stimuli only)
    fillout/         FilloutRuntime, OfflineSessionService, OfflineResponsePersistence, FilloutUploadSync
    services/        api client, auth, offline, persistence; db/indexeddb.ts (Dexie)
    shared/          types, factories, utils, validators (the canonical type root post-P2.2)
    modules/         question modules (reaction-time, statistical-feedback, instructions, …)
    collaboration/   Y.Doc instantiation + presence (auto-init for authenticated designer sessions)
    components/      designer UI, common UI, designer panels
    analytics/       statistical engine, export service
```

The fillout route (`/q/[code]`) runs entirely client-side. Online-first load with IndexedDB fallback; sessions are client-generated UUIDs; responses carry a `client_id UUID UNIQUE` for server-side dedup via `ON CONFLICT (client_id) DO NOTHING`.

**Hybrid rendering contract (ADR 0023).** The runtime has exactly one WebGL path and one DOM path. WebGL (`renderer/WebGLRenderer` driven by `runtime/reaction/ReactionEngine`) draws **only** stimuli for modules that register a `questionRuntime` v1 contract (reaction-time, reaction-experiment, webgl) — frame-exact onset is their reason to exist. **Everything else** — form questions *and* display/analytics/instruction items — renders as Svelte DOM mounted into `(fillout)/q/[code]/+page.svelte` via the `FormQuestionHost` overlay (`runtime/core/FormQuestionHost.ts` + `moduleConfigAdapter.ts`, ADR 0018). The fork is the single predicate `isFormStyle()` in `QuestionnaireRuntime`. Phase 8 deleted the parallel hollow stack that never drew — `runtime/QuestionPresenter`, `runtime/renderers/*`, `runtime/stimuli/*` (its `RenderContext` type was inlined into `WebGLRenderer`) — keeping only the loader/cache half of `ResourceManager`. Fillout media resolves through a same-origin streaming proxy (`GET /api/media/{id}/content`, ADR 0023 D1: stable cache key, `immutable`, Range support — fixes cross-origin texture taint, COEP, offline cache expiry); the designer keeps presigned URLs. Results take one offline-first write path (ADR 0023 D2): IndexedDB first with a `clientId` UUID, then `FilloutUploadSync.syncNow()`, idempotent on `ON CONFLICT (client_id) DO NOTHING`. Sessions pin an exact `(questionnaireId, major.minor.patch)` + definition snapshot; resumed/offline sessions load the pinned snapshot, never the latest cached one. Reaction timing is **frame-accurate onset with sub-ms relative precision** (display/output-latency corrected, COOP/COEP required for full timer resolution) — not microsecond-absolute; each trial persists a `timing_provenance` blob.

## Backend architecture

```
apps/server/src/
  lib.rs           crate root (declares all modules)
  main.rs          thin shell, imports from `qdesigner_server::*`
  api/             route handlers (auth, organizations, projects, questionnaires, sessions, media, comments, dev)
  auth/            JwtManager, password (argon2), session, models
  middleware/      cors, csrf, rate_limit (Redis-backed with in-memory fallback), rls_context, fillout_rls_context, tx
  rbac/            manager.rs (live, 28 call sites), models.rs (Org/Project role enums)
  websocket/       handler, yjs_store, yjs_relay, redis_bridge, manager
  state.rs         AppState (pool, jwt_manager, rbac, storage, websocket_state, yjs_store, redis, rate_limiter, config)
  config.rs        env-driven; JWT_SECRET and JWT_REFRESH_SECRET both env_required
  db/              connection + sqlx::migrate!("./migrations")
  storage/         S3 (MinIO) client
  openapi.rs       utoipa schema for /openapi.json
```

The crate is bin+lib hybrid: `tests/` integration tests import via `qdesigner_server::...`.

## Database

- Migrations: `apps/server/migrations/00001 … 00022` (single live directory; the dead `db/migrations/` directory was deleted in Phase 2.4 per ADR 0009 — schemas had diverged, port wasn't viable). Numbering jumps `00014 → 00018` — the gap reflects the abandoned `00017_rls_force` plan from ADR 0010, never shipped.
- **Two roles.** `qdesigner` is the postgres bootstrap superuser (`SUPERUSER` + `BYPASSRLS`). It runs migrations and is available as an ad-hoc bypass connection in tests. `qdesigner_app` (created by `00018_app_role.sql`, ADR 0014) is the non-superuser, non-BYPASSRLS role the application connects as; it has DML on all tables in `public` and USAGE/SELECT on sequences, nothing more.
- **DSNs.** `.env.development` carries both: `DATABASE_URL=postgresql://qdesigner_app:…` (app pool), `DATABASE_URL_MIGRATIONS=postgresql://qdesigner:…` (migration pool, opens briefly at startup to run `sqlx::migrate!`, then closed). See `apps/server/src/main.rs` for the split.
- **RLS infrastructure** (Phase 5, ADR 0011): every authenticated handler runs inside a per-request transaction opened by `middleware/rls_context.rs`; `app.user_id` is set as a transaction-local GUC via `set_config(..., true)`. Handlers take a `Tx` extractor from `middleware/tx.rs` and pass `&mut **tx` to queries; `api/access::*` and the 11 `sessions.rs` helpers take `executor: impl PgExecutor<'_>` (single-shot) or `&mut PgConnection` (multi-shot) so the same call site works for `&PgPool` and `&mut **tx`.
- **Fillout middleware** (Phase 6.3, ADR 0012): `middleware/fillout_rls_context.rs` is a sibling layer on `session_routes`. It *always* opens a tx, extracts the optional JWT into `app.user_id`, and parses the URL path for `/<uuid>/...` to populate `app.session_id`. Anonymous create (`POST /api/sessions`) generates its session id in the handler and sets the GUC before the INSERT so RETURNING-applied SELECT admission works.
- **Policy posture** (Phase 6 closeout):
  - **RLS-exempt** — `users` and `organizations` (ADR 0015: anonymous read by email/domain is intentional product behaviour), `questionnaire_definitions` (ADR 0012: public `GET /api/q/by-code/{code}`).
  - **Admin-RLS-bound** — `organization_members`, `projects`, `project_members`, `media_assets`. SELECT policies from `00014` enforce cross-tenant denial; INSERT/UPDATE/DELETE policies from `00020_admin_mutation_policies.sql` are permissive `_all` (ADR 0013 D2a — `api/access::*` is the mutation authorization gate). `projects` additionally carries `projects_select_via_published_questionnaire` so anonymous by-code reads can JOIN.
  - **Fillout-RLS-dual** — `sessions`, `responses`, `interaction_events`, `session_variables`. Dual-path policies in `00021_fillout_dual_policies.sql` admit via either `app.user_id = sessions.user_id` (authenticated) or `app.session_id = sessions.id` (anonymous). `sessions_insert_dual` has a bootstrap branch for the entry-point anonymous create.
  - **FORCE** on the four admin-RLS-bound tables (`00022_force_rls_admin.sql`). Empirically confirmed declarative posture only — non-owner ENABLE already binds `qdesigner_app`; `qdesigner`'s BYPASSRLS overrides FORCE; no current role's behaviour depends on FORCE. Future-proofing for any new owner-but-non-BYPASSRLS role.
- Authorization on application traffic is enforced by **both** `api/access::*` checks in handlers (the sole gate for mutations on admin tables; the membership probe in `get_organization` for the RLS-exempt org reads) **and** RLS on the four still-bound admin tables + the four fillout-path tables (defense-in-depth against SQL-injection or compromised handler code that issues queries without an explicit access check). The trigger `trg_project_members_org_check` covers cross-tenant `project_members` INSERTs at the schema layer.
- `tests/rls_enforcement.rs` (P6.6) asserts the contract end-to-end: cross-tenant SELECT denial, D2a permissive INSERT, dual-path session-bound and user-bound isolation.

## Offline fillout

- `OfflineSessionService` — client-generated session UUIDs (no server round-trip needed).
- `OfflineResponsePersistence` — IndexedDB writes carry a per-record `clientId` (used by server's `ON CONFLICT (client_id) DO NOTHING`).
- `FilloutUploadSync` — watches `online` events, retries with exponential backoff, marks records synced after server ack.
- Cache API caches media (`fillout-media-v1`).
- Service worker `static/sw.js` precaches `/offline.html` (manifest.json removed in Phase 1.0.6).

Dexie tables (v2): designer side — `questionnaires, syncQueue, resources, drafts`; fillout side — `filloutQuestionnaires, filloutSessions, filloutResponses, filloutEvents, filloutVariables`.

## Semantic versioning

`questionnaire_definitions` carries `version_major, version_minor, version_patch`. The `bump_version` handler (`POST /api/projects/{id}/questionnaires/{qid}/bump-version`) increments per the supplied `bump_type` and resets lower components. Sessions record which version they were filled out against (`questionnaire_version_major/minor/patch`).

| Change | Bump |
|---|---|
| add/remove/reorder questions; change response keys | major |
| edit question text/labels; add options; reorder pages | minor |
| typo fixes; styling; descriptions | patch |

## Scripting engine

`packages/scripting-engine/`:
- Pure formula evaluator (`evaluator.ts`, `ast-evaluator.ts`, `parser.ts`)
- Function table: `functions/{statistical,array,psychometric,irt}.ts` (typecheck-clean as of P2.1)
- `VariableEngine` (mathjs-backed, runtime evaluator)
- `ScriptEngine` (Web Worker isolation; sandbox via `with(Proxy)`, hard timeout via `Worker.terminate()`)
- `MonacoConfig` (themes + completion providers consumed by `lib/components/designer/FormulaEditor.svelte`)

Consumers import via `@qdesigner/scripting-engine` (no subpath imports needed; MonacoConfig is re-exported through the main entry — see P2.5 alias-order note).

## Collaboration

Yjs end-to-end:
- `/api/ws?token=<jwt>` (server `apps/server/src/api/mod.rs`) — JWT-verified upgrade, per-questionnaire `yrs::Doc` rooms, channel format `designer:{questionnaire_id}`.
- Client: `CollaborativeDesigner` auto-initializes from `routes/(app)/projects/{projectId}/designer/[[questionnaireId]]/+page.svelte` whenever the user has an access token and a questionnaire id.
- See `docs/decisions/0006-collaboration.md` for the keep-decision and a tour of the wiring.

## ADR trail

All architectural and scoping decisions through Phase 8 live in `docs/decisions/`:

- `0001-rls.md` — RLS as defense-in-depth. **Complete** after Phase 6.
- `0002-pipeline.md` — `lib/pipeline/` deleted
- `0003-scripting.md` — scripting consolidated into the package
- `0004-aliases.md` — `@qdesigner/*` adopted
- `0005-types.md` — `questionnaire-core` kept separate from `contracts`
- `0006-collaboration.md` — Yjs kept (active feature)
- `0007-rbac-manager.md` — superseded by 0008 (RbacManager has live consumers)
- `0008-rbac-manager-retained.md` — keep RbacManager; delete only the unused middleware
- `0009-rls-author-not-port.md` — RLS authored against live schema (not ported from dead dir)
- `0010-rls-force.md` — superseded by 0011; archived partial-FORCE plan
- `0011-rls-infra-only.md` — Phase 5 RLS infrastructure (per-request tx, Tx extractor, GUC). **Superseded** by the Phase 6 closeout.
- `0012-fillout-dual-path-rls.md` — Phase 6 fillout-path strategy: dual GUC, dual-path policies, `questionnaire_definitions` exited from RLS.
- `0013-admin-mutation-permissive.md` — Phase 6 admin-table mutation policies are permissive `WITH CHECK (true)`; `api/access::*` is the gate.
- `0014-qdesigner-app-role.md` — Phase 6 introduces the non-superuser `qdesigner_app` application role; tests inherit the app DSN.
- `0015-anon-read-rls-exempt.md` — Phase 6 mid-step finding: `users` and `organizations` join `questionnaire_definitions` as RLS-exempt because they have intentional public-anonymous read paths.
- `0016-supervisor-protocol-v2.md` — bumps `SUPERVISOR_PROTOCOL.md` to v2.
- `0017-product-completion-arc.md` — opens the Phase 7 product-completion & wire-up arc.
- `0018-fillout-rendering-contract.md` — Phase 7 hybrid fillout rendering: form-style questions mount runtime Svelte components into the DOM overlay; v1 reaction paradigms stay on WebGL. **Finalized** by 0023.
- `0019-paraglide-i18n.md` — replace i18next with Paraglide (compile-time i18n).
- `0020-org-role-change.md` — Phase 8 org member role-change endpoint.
- `0021-analytics-psychometrics.md` — Phase 8 mounts the analytics psychometrics suite.
- `0022-questionnaire-translation.md` — Phase 8 per-questionnaire content translation.
- `0023-fillout-hybrid-rendering.md` — Phase 8 finalizes the hybrid fillout contract: one WebGL path (`ReactionEngine`+`WebGLRenderer`, v1 stimuli only), everything else on the DOM overlay; deletes the hollow `QuestionPresenter`/`runtime/renderers`/`runtime/stimuli` stacks; D1 same-origin media proxy + D2 offline-first single write path + per-session version pinning.
- `PHASE_6_PLAN.md` — Phase 6 implementation plan (with mid-phase amendments).
- `PHASE_8_FILLOUT_FIX_PLAN.md` — Phase 8 fillout renderer & reaction-framework remediation plan (Phases 1–5).
- `SUPERVISOR_PROTOCOL.md` — message format for the team-lead / supervisor / user loop
- `baseline.md` — metrics captured at the start of Phase 1 + per-phase rows added at closeout

When an ADR's status changes, a new ADR supersedes it rather than editing in place.

## Known TODOs

- **`check_duplicate` anonymous regression** (logged in P6.3 commit body): the OptionalUser `POST /api/sessions/check-duplicate` handler counts other sessions' `completed` rows by fingerprint, which the dual-path SELECT policy hides for anonymous callers (no GUC matches). Returns 0 for anonymous → frontend dedup probe becomes a no-op. The product behaviour needs an alternative path that doesn't require reading other sessions' metadata (e.g., server-side fingerprint hash dedup at create time).
- **Test fixture pool pattern** (introduced in P6.2): tests that need to seed RLS-bound tables read `DATABASE_URL_MIGRATIONS` (qdesigner superuser) so fixture INSERTs aren't denied. Tests that exercise RLS policies use `SET LOCAL ROLE` inside a transaction to switch to a fresh non-owner test role. See `tests/rbac_integration.rs` and `tests/rls_enforcement.rs` for the pattern.
- **Production password handling for `qdesigner_app`** (ADR 0014 §Deferred): dev/test use a literal `'qdesigner_app'` password. Production needs env-sourced or cert auth before the role goes live in any non-dev environment.
- **Migration role for ad-hoc workflows**: any future migration that needs to bulk-update a FORCE'd admin table across tenants works because `qdesigner` has BYPASSRLS. If the BYPASSRLS attribute is ever dropped from `qdesigner`, those migrations need a temporary `ALTER TABLE … NO FORCE …; … ; FORCE …` dance.
- **rbac_integration env-file path** was fixed in P3.4a; if you copy that test pattern elsewhere, use `.parent().and_then(|p| p.parent())` to reach the repo root from `CARGO_MANIFEST_DIR`.
- **Testability gaps surfaced in Phase 4** (logged in commit `44cbb5e`): handler-level HTTP round-trip tests (auth, sessions, questionnaires) need a server harness with full AppState construction. The pure-logic, SQL-level, and RLS-enforcement tests cover the building blocks; an end-to-end Axum tower-test harness would close the last gap.
- **Frontend build prerender** requires every `<a href>` target to either exist as a route or be marked external. Phase 1.0.6 cleaned up the marketing surface; any new internal links should be backed by a real `+page.svelte`.

## Test credentials

Created via the Playwright MCP after bootstrapping (do NOT use `create-test-user.sql` — that file was deleted in P1.1 because per-script user creation bypasses the real auth flow):

- email: `demo@example.com`
- password: `demo123456`

### Auto-login test mode (dev only)

```js
window.testMode.enable();
// or: localStorage.setItem('qdesigner-test-mode', 'true');
window.testMode.disable();
```

## Working in this repo

- pnpm only. Never npm. `package-lock.json` was removed in P1.1.
- Tools resolve from the project's nix flake; CI when it exists must enter the same shell.
- Always commit through CLAUDE/the human, not from automated scripts.
- For UI/frontend changes start `pnpm dev` and test the golden path in a browser — `pnpm check` and `pnpm test` verify types/contracts, not feature correctness.
- Questionnaire objects must carry semver fields (`versionMajor/Minor/Patch`).
- When the audit/spec docs in `specs/` conflict with the code, the code wins. Several rounds of cleanup confirmed that the original audit's claims (about RbacManager being unused, RLS portability, renderer fragmentation, marketing-surface viability, even some test counts) were diagnostic-only and didn't survive contact with the actual codebase.
