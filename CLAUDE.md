# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repo.

## Project overview

QDesigner Modern is a questionnaire platform for psychological and behavioral research. Microsecond-accurate reaction time measurements, WebGL 2.0 rendering, fully offline-capable fillout, semver-versioned questionnaire definitions. Svelte 5 + SvelteKit + TypeScript strict on the frontend; Rust/Axum on the backend.

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
DATABASE_URL=postgresql://qdesigner:qdesigner@localhost:15434/qdesigner \
  cargo test --manifest-path apps/server/Cargo.toml -- --include-ignored
```

Test count baseline (post-Phase 4):
- frontend web suite: 43 files / 716 passing (includes package tests via vitest glob)
- scripting-engine standalone: 6 files / 223
- server: 35 across 1 lib + 5 integration files (10 bin unit + 8 auth_flows + 3 sync_session_dedup + 5 bump_version_semver + 8 rbac_integration + 1 revoked_tokens_purge)

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
    runtime/         QuestionnaireRuntime, QuestionPresenter, reaction-time engine + presets
    renderer/        WebGL rendering pipeline (used by fillout)
    fillout/         FilloutRuntime, OfflineSessionService, OfflineResponsePersistence, FilloutSyncEngine
    services/        api client, auth, offline, persistence; db/indexeddb.ts (Dexie)
    shared/          types, factories, utils, validators (the canonical type root post-P2.2)
    modules/         question modules (reaction-time, statistical-feedback, instructions, …)
    collaboration/   Y.Doc instantiation + presence (auto-init for authenticated designer sessions)
    components/      designer UI, common UI, designer panels
    analytics/       statistical engine, export service
```

The fillout route (`/q/[code]`) runs entirely client-side. Online-first load with IndexedDB fallback; sessions are client-generated UUIDs; responses carry a `client_id UUID UNIQUE` for server-side dedup via `ON CONFLICT (client_id) DO NOTHING`.

## Backend architecture

```
apps/server/src/
  lib.rs           crate root (declares all modules)
  main.rs          thin shell, imports from `qdesigner_server::*`
  api/             route handlers (auth, organizations, projects, questionnaires, sessions, media, comments, dev)
  auth/            JwtManager, password (argon2), session, models
  middleware/      cors, csrf, rate_limit (Redis-backed with in-memory fallback), rls_context
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

- Migrations: `apps/server/migrations/00001 … 00016` (single live directory; the dead `db/migrations/` directory was deleted in Phase 2.4 per ADR 0009 — schemas had diverged, port wasn't viable).
- `00014_rls_policies.sql` declares helper functions (`current_app_user_id`, `current_app_user_role`, `is_super_admin`) and `ENABLE ROW LEVEL SECURITY` policies on users, organizations, organization_members, projects, project_members, questionnaire_definitions, sessions, responses, interaction_events, session_variables, media_assets.
- **RLS enforcement status**: policies are `ENABLE`d but not `FORCE`d. The Rust backend connects as the table owner and **bypasses RLS on application traffic**. Policies enforce defense-in-depth against ad-hoc DB sessions only. Connection-pinning (per-request transactions so `set_config('app.user_id', …)` persists) is **deferred to Phase 5** — see ADR 0001 status.
- Authorization on application traffic is enforced by `api/access::*` checks composed in handlers, plus the trigger `trg_project_members_org_check` for cross-tenant project_member inserts.

## Offline fillout

- `OfflineSessionService` — client-generated session UUIDs (no server round-trip needed).
- `OfflineResponsePersistence` — IndexedDB writes carry a per-record `clientId` (used by server's `ON CONFLICT (client_id) DO NOTHING`).
- `FilloutSyncEngine` — watches `online` events, retries with exponential backoff, marks records synced after server ack.
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

All architectural and scoping decisions through Phase 4 live in `docs/decisions/`:

- `0001-rls.md` — RLS as defense-in-depth (connection-pinning deferred to Phase 5)
- `0002-pipeline.md` — `lib/pipeline/` deleted
- `0003-scripting.md` — scripting consolidated into the package
- `0004-aliases.md` — `@qdesigner/*` adopted
- `0005-types.md` — `questionnaire-core` kept separate from `contracts`
- `0006-collaboration.md` — Yjs kept (active feature)
- `0007-rbac-manager.md` — superseded by 0008 (RbacManager has live consumers)
- `0008-rbac-manager-retained.md` — keep RbacManager; delete only the unused middleware
- `0009-rls-author-not-port.md` — RLS authored against live schema (not ported from dead dir)
- `SUPERVISOR_PROTOCOL.md` — message format for the team-lead / supervisor / user loop
- `baseline.md` — metrics captured at the start of Phase 1

When an ADR's status changes, a new ADR supersedes it rather than editing in place.

## Known TODOs

- **Phase 5 (not yet started): connection-pinning refactor.** Every authenticated handler currently takes `&PgPool`. To make RLS policies enforce against application traffic, each handler needs to take a `&mut Transaction<'_, Postgres>` (or use a task-local connection registry) so `set_config('app.user_id', …)` persists across the queries it runs. ADR 0001 details the choice.
- **rbac_integration env-file path** was fixed in P3.4a; if you copy that test pattern elsewhere, use `.parent().and_then(|p| p.parent())` to reach the repo root from `CARGO_MANIFEST_DIR`.
- **Testability gaps surfaced in Phase 4** (logged in commit `44cbb5e`): handler-level HTTP round-trip tests (auth, sessions, questionnaires) need a server harness with full AppState construction. The pure-logic and SQL-level tests cover the building blocks.
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
