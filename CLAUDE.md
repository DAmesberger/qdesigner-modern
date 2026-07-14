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
docs/decisions/          Authoritative ADRs (0001-0036 + phase plans + supervisor protocol + baseline)
```

Workspace is `pnpm-workspace.yaml`: `apps/*` and `packages/*`. Imports use `@qdesigner/<package>` aliases — not relative paths to `packages/`.

## Essential commands

```bash
# Bootstrap toolchain (devShell pins nodejs_22, pnpm_8, rustc/cargo/rustfmt/clippy,
# cargo-watch, sqlx-cli, just, openssl, chromium + playwright-driver.browsers)
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

# Verification (the full gate — `pnpm verify` at the repo root runs the whole chain)
pnpm --filter @qdesigner/web check
pnpm --filter @qdesigner/web test
pnpm --filter @qdesigner/scripting-engine test
pnpm --filter @qdesigner/web build
pnpm contracts:check              # regenerate OpenAPI + fail on drift
cargo check --manifest-path apps/server/Cargo.toml
cargo clippy --manifest-path apps/server/Cargo.toml --all-targets -- -D warnings   # exactly what CI runs
cargo build --manifest-path apps/server/Cargo.toml
# Server tests bootstrap themselves via `tests/common/mod.rs`: it runs
# `sqlx::migrate!` against DATABASE_URL_MIGRATIONS, then hands out
# `fixture_pool()` (qdesigner superuser — BYPASSRLS, for seeding RLS-bound
# fixture tables) or `app_pool()` (qdesigner_app — the production posture).
# Both DSNs are read from .env.development unless already set in the env
# (CI's values win). `REQUIRE_DB=1` turns an unreachable DB into a hard
# failure instead of a silent skip.
cargo test --manifest-path apps/server/Cargo.toml -- --include-ignored
```

E2E lanes are Playwright projects, not part of the above gate: `pnpm test:e2e:{smoke,regression,fullstack,reaction,form,visual}`.

Test count baseline (verified 2026-07-14, ADR 0036 branch):
- frontend web suite: 175 files / 1867 passing (includes package tests via the vitest glob)
- scripting-engine standalone: 8 files / 256
- server: 302 passing across the lib + 46 integration files in `apps/server/tests/`

These are a smoke signal, not a contract — they drift the moment anyone adds a test. If they
disagree with a fresh run, trust the run and update the line.

Do not run two `cargo test` invocations concurrently — the suites share `auth_sessions` fixtures and deadlock.

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
    (auth)/                      login, signup, forgot-password, reset-password, onboarding, sso
    (app)/                       dashboard, projects/[id]/designer, analytics, admin, settings, style-guide
    (fillout)/q/[code]/          public fillout runtime (ssr=false, offline-capable)
    (public)/                    redirects / → /login (no marketing surface; cleanup Phase 1.0.6)
    invite/[token]               accept-invitation (org invitation)
    project-invite/[token]       accept project invitation (ADR 0033 cross-org membership)
    test-runtime/                dev-only runtime harness
  lib/
    runtime/         core/ (QuestionnaireRuntime, FormQuestionHost + moduleConfigAdapter, FlowGraph, ScriptExecutor, …), reaction/ (ReactionEngine + presets/input/feedback), timing/, validation/, quality/, resources/
    renderer/        WebGLRenderer + shaders — the ONLY drawing path (v1 reaction stimuli only)
    fillout/         FilloutPageController, runtime/FilloutRuntime, services/ (OfflineSessionService, OfflineResponsePersistence, OfflineTrialPersistence, OfflineBinaryPersistence, FilloutUploadSync, FilloutContentCache, QuotaService, ScreenerController, …)
    services/        api client, auth, offline, persistence, media; db/indexeddb.ts (Dexie)
    shared/          types, factories, utils (the canonical type root post-P2.2)
    modules/         question modules (questions/: reaction-time, reaction-experiment, webgl, multiple-choice, matrix, rating, scale, ranking, drawing, file-upload, media-response, date-time, number-input, text-input) and display modules (display/: text, text-instruction, bar-chart, statistical-feedback); registry.ts + register-all.ts
    collaboration/   Y.Doc instantiation + presence (auto-init for authenticated designer sessions)
    components/      designer UI, common UI (ui/), question components, analytics components
    analytics/       StatisticalEngine, psychometrics, CATEngine, ResponseExportService, reactionTrialExport
    api/             generated OpenAPI client + runtime (CSRF interceptor)
    paraglide/       Paraglide compile output (ADR 0019) — generated, do not hand-edit; i18n/ holds the locale switcher
    stores/          designer store, theme, toast, confirm
    help/, wysiwyg/, theme/, routing/, styles/, utils/
```

The fillout route (`/q/[code]`) runs entirely client-side. Online-first load with IndexedDB fallback; sessions are client-generated UUIDs; responses carry a `client_id UUID UNIQUE` for server-side dedup via `ON CONFLICT (client_id) DO NOTHING`.

**Hybrid rendering contract (ADR 0023).** The runtime has exactly one WebGL path and one DOM path. WebGL (`renderer/WebGLRenderer` driven by `runtime/reaction/ReactionEngine`) draws **only** stimuli for modules that register a `questionRuntime` v1 contract (reaction-time, reaction-experiment, webgl) — frame-exact onset is their reason to exist. **Everything else** — form questions *and* display/analytics/instruction items — renders as Svelte DOM mounted into `(fillout)/q/[code]/+page.svelte` via the `FormQuestionHost` overlay (`runtime/core/FormQuestionHost.ts` + `moduleConfigAdapter.ts`, ADR 0018). The fork is the single predicate `isFormStyle()` in `QuestionnaireRuntime`. Phase 8 deleted the parallel hollow stack that never drew — `runtime/QuestionPresenter`, `runtime/renderers/*`, `runtime/stimuli/*` (its `RenderContext` type was inlined into `WebGLRenderer`) — keeping only the loader/cache half of `ResourceManager`. Fillout media resolves through a same-origin streaming proxy (`GET /api/media/{id}/content`, ADR 0023 D1: stable cache key, `immutable`, Range support — fixes cross-origin texture taint, COEP, offline cache expiry); the designer keeps presigned URLs. Results take one offline-first write path (ADR 0023 D2): IndexedDB first with a `clientId` UUID, then `FilloutUploadSync.syncNow()`, idempotent on `ON CONFLICT (client_id) DO NOTHING`. Sessions pin an exact `(questionnaireId, major.minor.patch)` + definition snapshot; resumed/offline sessions load the pinned snapshot, never the latest cached one. Reaction timing is **frame-accurate onset with sub-ms relative precision** (display/output-latency corrected, COOP/COEP required for full timer resolution) — not microsecond-absolute; each trial persists a `timing_provenance` blob.

## Backend architecture

```
apps/server/src/
  lib.rs           crate root (declares all modules)
  main.rs          thin shell, imports from `qdesigner_server::*`
  api/             route handlers: auth, zitadel_auth, sso, organizations, projects, project_invitations,
                   questionnaires, templates, sessions/ (crud, ingestion, sync, analytics, quotas, models),
                   series, comments, media, csv, users, roles, api_keys, scim, gdpr, health, dev
                   + access.rs (coarse membership/role gates — reached through `authz::authorize`)
  authz.rs         THE application-layer authorization entry point (ADR 0030/0032):
                   `authorize(conn, user, Scope::{Organization,Project,Questionnaire}, Permission)`
  auth/            JwtManager, password (argon2), crypto, session, models, oidc_client (ADR 0031)
  audit/           audit-event emission (`audit_events`)
  series/          study-series domain + scheduling
  middleware/      auth, api_key, cors, csrf, rate_limit (Redis-backed with in-memory fallback),
                   rls_context, fillout_rls_context, series_rls_context, tx
  rbac/            manager.rs (custom-role resolution + `require_permission` tightening — composed inside
                   `authorize`, plus ~21 direct `has_org_role` sites in gdpr/scim/sso/roles/organizations),
                   models.rs (Org/Project role enums, Permission)
  websocket/       handler, yjs_store, yjs_relay, yjs_seed, redis_bridge, manager
  state.rs         AppState (pool, jwt_manager, rbac, storage, websocket_state, yjs_store, redis, config,
                   and six purpose-scoped RateLimiters — auth, verify-send, verify-attempt, api-key,
                   session-create per-IP, session-create per-questionnaire, session-media)
  config.rs        env-driven; JWT_SECRET and JWT_REFRESH_SECRET both env_required
  db/              connection + sqlx::migrate!("./migrations")
  error.rs         ApiError
  storage/         S3 (MinIO) client
  openapi.rs       utoipa schema for /openapi.json
```

The crate is bin+lib hybrid: `tests/` integration tests import via `qdesigner_server::...`. `tests/common/mod.rs` is the shared harness — self-provisioning migrations, `fixture_pool()` / `app_pool()`, and `build_test_state()` (a full `AppState` for the `http_*` tower round-trip suites).

**Authorization is one call.** Every authenticated handler calls `authz::authorize(&mut **tx, user_id, scope, permission)`; it derives the coarse membership/role-tier gate from `(scope, permission)`, runs it, *then* runs the custom-role tightening — deny wins, and a caller can no longer hold half the check. `api::access::verify_*` and `RbacManager::require_permission` are the composed halves, not the entry point. Project scope is tiered (`min_project_role_for` + `verify_project_access`); questionnaire scope is read-only (questionnaire mutations authorize at project scope). `authorize()` decisions are **RLS-independent** — every query it issues goes through a `SECURITY DEFINER` function (migration `00051`), so an authorization decision can never 404 because RLS hid the row. Residual divergent sites are ledgered in `docs/decisions/0030-divergence-ledger.md`; `tests/authz_matrix.rs` regression-locks the matrix.

## Database

- Migrations: `apps/server/migrations/00001 … 00059` (single live directory; the dead `db/migrations/` directory was deleted in Phase 2.4 per ADR 0009 — schemas had diverged, port wasn't viable). Numbering jumps `00014 → 00018` — the gap reflects the abandoned `00017_rls_force` plan from ADR 0010, never shipped. (`apps/server/db/seed/` is *not* migrations: `baseline/` seeds roles+permissions, `test/` seeds the dev personas; `just db-seed` / `just db-seed-test`.)
- **Two roles.** `qdesigner` is the postgres bootstrap superuser (`SUPERUSER` + `BYPASSRLS`). It runs migrations and is available as an ad-hoc bypass connection in tests. `qdesigner_app` (created by `00018_app_role.sql`, ADR 0014) is the non-superuser, non-BYPASSRLS role the application connects as; it has DML on all tables in `public` and USAGE/SELECT on sequences, nothing more.
- **DSNs.** `.env.development` carries both: `DATABASE_URL=postgresql://qdesigner_app:…` (app pool), `DATABASE_URL_MIGRATIONS=postgresql://qdesigner:…` (migration pool, opens briefly at startup to run `sqlx::migrate!`, then closed). See `apps/server/src/main.rs` for the split.
- **RLS infrastructure** (Phase 5, ADR 0011): every authenticated handler runs inside a per-request transaction opened by `middleware/rls_context.rs`; `app.user_id` and `app.user_role` are set as transaction-local GUCs via `set_config(..., true)`. Handlers take a `Tx` extractor from `middleware/tx.rs` and pass `&mut **tx` to queries; `api/access::*` and the `sessions/` helpers take `executor: impl PgExecutor<'_>` (single-shot) or `&mut PgConnection` (multi-shot) so the same call site works for `&PgPool` and `&mut **tx`.
- **Three sibling context layers**, each opening its own tx and setting its own GUCs: `rls_context` (authenticated, `app.user_id` + `app.user_role`), `fillout_rls_context` (ADR 0012, `app.user_id` + `app.session_id`), `series_rls_context` (`app.user_id` + `app.enrollment_token`). `api_key` also sets `app.user_id` for the machine surface.
- **Fillout middleware** (Phase 6.3, ADR 0012): `middleware/fillout_rls_context.rs` is a sibling layer on `session_routes`. It *always* opens a tx, extracts the optional JWT into `app.user_id`, and parses the URL path for `/<uuid>/...` to populate `app.session_id`. Anonymous create (`POST /api/sessions`) generates its session id in the handler and sets the GUC before the INSERT so RETURNING-applied SELECT admission works.
- **Policy posture:**
  - **RLS-exempt** — `users` and `organizations` (ADR 0015: anonymous read by email/domain is intentional product behaviour; RLS explicitly DISABLEd in `00020`), `questionnaire_definitions` (ADR 0012: public `GET /api/q/by-code/{code}`; DISABLEd in `00021`).
  - **Admin-RLS-bound** — `organization_members`, `projects`, `project_members`, `media_assets`. SELECT policies enforce cross-tenant denial; INSERT/UPDATE/DELETE policies from `00020_admin_mutation_policies.sql` are permissive `_all` (ADR 0013 D2a — **`authz::authorize` is the mutation authorization gate**, not RLS). Amended since: `00023` lets an org admin see co-members; `00025` lets anonymous fillout read media referenced by a *published* questionnaire; `00033` scopes project reads by `org_project_visibility` + the `is_project_member` SECURITY DEFINER helper; `projects` also carries `projects_select_via_published_questionnaire` so anonymous by-code reads can JOIN.
  - **Fillout-RLS-dual** — `sessions`, `responses`, `interaction_events`, `session_variables`. Dual-path policies in `00021_fillout_dual_policies.sql` admit via either `app.user_id = sessions.user_id` (authenticated) or `app.session_id = sessions.id` (anonymous). `sessions_insert_dual` has a bootstrap branch for the entry-point anonymous create. `00054` adds an `is_project_member` SELECT branch to each so a **cross-org project member** (ADR 0033) can read that project's study data.
  - **Also RLS-bound** (added post-Phase-6, each with its own policies): `trials` (`00048`), `audit_events` (`00034`), `org_roles` (`00035`), `data_exports` (`00040`), `study_series` / `series_enrollment` / `series_prompt` (`00042`).
  - **FORCE** on the four admin-RLS-bound tables (`00022_force_rls_admin.sql`). Empirically confirmed declarative posture only — non-owner ENABLE already binds `qdesigner_app`; `qdesigner`'s BYPASSRLS overrides FORCE; no current role's behaviour depends on FORCE. Future-proofing for any new owner-but-non-BYPASSRLS role.
- Authorization on application traffic is enforced by **both** `authz::authorize` in handlers (the sole application-layer gate — see Backend architecture) **and** RLS (defense-in-depth against SQL-injection or compromised handler code that issues queries without an explicit access check). The two are deliberately independent: `authorize()` resolves through `SECURITY DEFINER` functions (`00051`/`00052`) so it is RLS-immune, and RLS is a net beneath it — never the decision.
- **Cross-org project membership** (ADR 0033): `resource_shares` and its policies/functions are **dropped** (`00058`); the `trg_project_members_org_check` trigger is **dropped** (`00055`) — a project member need not be an org member. External collaboration goes through `project_invitations` (`00056`/`00057`). Any doc or comment still describing shares or the trigger is stale.
- `tests/rls_enforcement.rs` (P6.6) asserts the RLS contract end-to-end; `tests/authz_matrix.rs` regression-locks the `authorize()` matrix; `tests/cross_org_project_membership.rs` covers ADR 0033.

## Offline fillout

- `OfflineSessionService` — client-generated session UUIDs (no server round-trip needed).
- `OfflineResponsePersistence` / `OfflineTrialPersistence` / `OfflineBinaryPersistence` — IndexedDB writes carry a per-record `clientId` (used by server's `ON CONFLICT (client_id) DO NOTHING`). Binary answers go IndexedDB-first with deferred upload and pin-until-ack (ADR 0029).
- `FilloutUploadSync` — watches `online` events, retries with exponential backoff, chunks, marks records synced after server ack; `filloutSyncLedger` is the append-only no-silent-loss audit trail (dead-letter + reconcile).
- `FilloutContentCache` — definition + media offline-completeness (ADR 0026: fail-closed at run). Cache API caches media (`fillout-media-v2`).
- Service worker `static/sw.js` precaches `/offline.html` and build bundles (caches `qdesigner-v4`, `qdesigner-runtime`, `qdesigner-bundles`, `fillout-media-v2`; manifest.json removed in Phase 1.0.6).
- At-rest encryption: fillout payloads written from v6 onward are encrypted (`filloutKeys`, per-session); pre-v6 plaintext rows stay readable and are cleared by purge-after-sync.

Dexie tables (**v9**): designer side — `questionnaires, syncQueue, resources, drafts`; fillout side — `filloutQuestionnaires, filloutSessions, filloutResponses, filloutEvents, filloutVariables, filloutMedia, filloutServerVariables, filloutTrials, filloutBinaries, filloutKeys, filloutSyncLedger`.

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
- Function table: `functions/{statistical,array,psychometric,irt}.ts` (typecheck-clean as of P2.1) + `customFunctions.ts`
- `math/eigen.ts` — the one symmetric (cyclic Jacobi) eigensolver, shared by every consumer that needs eigendecomposition (ADR 0036 D1). Do not hand-roll another.
- `VariableEngine` (mathjs-backed, runtime evaluator); `sandbox-math.ts` + `policies.ts` back the sandbox
- `ScriptEngine` (Web Worker isolation; sandbox via `with(Proxy)`, hard timeout via `Worker.terminate()`)
- `MonacoConfig` (themes + completion providers consumed by `lib/components/designer/FormulaEditor.svelte`)

Consumers import via `@qdesigner/scripting-engine` (no subpath imports needed; MonacoConfig is re-exported through the main entry — see P2.5 alias-order note).

## Collaboration

Yjs end-to-end:
- `/api/ws?token=<jwt>` (server `apps/server/src/api/mod.rs`) — JWT-verified upgrade, per-questionnaire `yrs::Doc` rooms, channel format `designer:{questionnaire_id}`.
- Client: `CollaborativeDesigner` auto-initializes from `routes/(app)/projects/{projectId}/designer/[[questionnaireId]]/+page.svelte` whenever the user has an access token and a questionnaire id.
- See `docs/decisions/0006-collaboration.md` for the keep-decision and a tour of the wiring.

## ADR trail

All architectural and scoping decisions live in `docs/decisions/`:

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
- `0013-admin-mutation-permissive.md` — Phase 6 admin-table mutation policies are permissive `WITH CHECK (true)`; the application layer is the gate. (The gate named here was `api/access::*`; since ADR 0030/0032 it is `authz::authorize`. The *posture* — RLS does not decide mutations — is unchanged.)
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
- `0024-response-model-and-hardware.md` — reaction arc: semantic response model + hardware (WebHID) response devices.
- `0024-sqlx-offline-macros.md` — sqlx offline mode for query macros. (Duplicate number with the above — both kept.)
- `0025-generation-time-materialization.md` — trials fully materialize at generation time (seeded TimingSpec sampling); the engine never samples at runtime.
- `0026-media-fail-closed-offline.md` — reaction media is offline-complete at load and fail-closed at run; pending assets pin against eviction.
- `0027-validity-policy-record-by-default.md` — timing-validity problems record by default; per-study ValidityPolicy `enforce` is opt-in.
- `0028-trial-aggregates-explicit-minn.md` — trial aggregates carry an explicit minN disclosure floor.
- `0029-form-enforcement-and-offline-binaries.md` — form validation blocks at capture (modules own validity; script `onValidate` blocks on verdict, fails open on crash); binary answers go IndexedDB-first with deferred upload, pending provenance, pin-until-ack; storage modes deleted.
- `0030-single-authorize-entry-point.md` — one `authz::authorize(executor, user, Scope, Permission)` replaces the access::/RbacManager pair at all ~70 authenticated sites (reads included); halves go private post-sweep; behavior-preserving sweep + divergence ledger; matrix test gate. Executes 0008's anticipated consolidation; 0013's RLS posture untouched.
- `0031-sso-two-products-shared-oidc-client.md` — zitadel_auth (platform auth) and sso (org federation) are deliberate products; the duplicated OIDC mechanism extracts into one `OidcClient` returning verified claims; protocol-scoped seam (future SAML ACS bypasses it); nonce standardized hashed-at-rest; rejection-matrix wiremock gate.
- `0032-authz-tiered-scopes-rls-independent.md` — continues 0030: project scope becomes tiered (`min_project_role_for` + `verify_project_access`, folds the 6 inline `has_project_role(Admin)` sites); questionnaire scope is read-only (mutations authorize at project scope); `authorize()` decisions are RLS-independent (every internal query `SECURITY DEFINER`, RLS stays a separate defense-in-depth net); `Scope` stays 3 variants with an exhaustive permission→gate match; tiers strictly preserve behavior with candidates ledgered; guardrails = real `0030-divergence-ledger.md` + regression-locking `authz_matrix` tests + keep migration 00050. Motivated by the `resource_shares:486` 404 regression (questionnaire-share guest org-resolution RLS-blocked; fixed at RLS layer by 00050). **Implemented + merged to main** (2026-07-13, commits 12d106a + ebb87ea; ledger L1–L17).
- `0033-cross-org-project-membership-replaces-shares.md` — **deletes the external-guest/`resource_shares` role** (table, `shares.rs`, share SECURITY DEFINER fns + RLS branches, purge, `ShareDialog`/`guestAnalytics`/`/shared` frontend); replaces external collaboration with **cross-org project membership** (drop the `trg_project_members_org_check` trigger + `verify_org_membership(target)` at add_project_member; project members needn't be org members; `is_project_member` RLS branches on study-data tables; dedicated `project_invitations` flow). Reuses ADR 0032's `ProjectRole` tiers + `authorize()` path. Supersedes migration 00050/L8/R1 and the share branches. Anonymous fillout untouched. Comment/series fold split to ADR 0034. **Implemented + merged (2026-07-13, branch authz/adr-0033-remove-shares → main; units 1/3/4a/4b; live-QA passed).**
- `0034-comments-series-authz-fold.md` — resolves ledger L12/L13: folds `comments.rs` + `series.rs` into `authorize()` at `Scope::Project` (no new `Permission` — mapped to project tiers) and fixes two audit bugs. Comments: list/create/resolve→`ProjectRead`, edit-body author-only (removes the `resolved`-flag body-edit leak), delete→author OR project-Admin (moderation). Series: reads→`ProjectRead`, mutations (create/update/enroll)→`ProjectWrite` (viewer can no longer mutate). Incidentally closes the `projectVisibility='members'` bypass for these endpoints. **Implemented** (`comments.rs` / `series.rs` authorize at `Scope::Project`; `tests/comments_authz.rs`, `tests/series_authz.rs`).
- `0035-sso-verified-domain-binding.md` — **fixes the audit's one CRITICAL (SSO account takeover)**. `sso_callback` linked a federated subject to any local account matching the id_token email, with no `email_verified` check and no domain binding — so an org's IdP could assert `victim@othercompany.com` and take over that account. Now BOTH link and provision require (1) `email_verified == true` and (2) the email's domain be a **verified** `organization_domains` row of the **IdP's own org**; anything else **fails closed** (no link, no provision, no session, no account-existence disclosure). Trade accepted: an identity outside the org's verified domains cannot SSO in (verify the domain, or invite them — incl. ADR 0033 cross-org project membership). **Implemented** in `api/sso.rs`.
- `0036-honest-statistics.md` — **a research platform may report a statistic, or report that it cannot compute one; it may not report a number that looks like the statistic and isn't.** Continues the distribution-core repair in `701bf8d`. Real cyclic Jacobi eigensolver in `scripting-engine/src/math/eigen.ts` (replacing the diagonal-only `calculateEigenvalues` stub) and thus a real PCA and real omega; coherent Tukey; participant-keyed server correlations and honest completion-rate denominators; version pins + `timing_provenance` + CSV formula-injection guards on both export paths; trial aggregates exclude practice trials and invalidate anticipatory responses (ADR 0028). Accepted 2026-07-14.
- `0030-divergence-ledger.md` — the live ledger of call sites that still diverge from the single `authorize()` entry point (L1–L17). Not an ADR; a working artifact of 0030/0032/0034.
- `PHASE_6_PLAN.md` — Phase 6 implementation plan (with mid-phase amendments).
- `PHASE_7_PLAN.md` / `PHASE_7_FINDINGS.md` — Phase 7 product-completion arc plan + findings ledger.
- `PHASE_8_FILLOUT_FIX_PLAN.md` — Phase 8 fillout renderer & reaction-framework remediation plan (Phases 1–5).
- `SUPERVISOR_PROTOCOL.md` — message format for the team-lead / supervisor / user loop
- `baseline.md` — metrics captured at the start of Phase 1 + per-phase rows added at closeout

When an ADR's status changes, a new ADR supersedes it rather than editing in place.

## Known TODOs

- ~~**`check_duplicate` anonymous regression**~~ RESOLVED (R5-4, 2026-07-10): the endpoint was removed — the suggested alternative already existed and is the live path: `create_session` fingerprints server-side via the `count_completed_fingerprint_sessions` SECURITY DEFINER function and returns a `duplicate` flag at create time.
- **Test fixture pool pattern**: tests that need to seed RLS-bound tables use `common::fixture_pool()` (reads `DATABASE_URL_MIGRATIONS`, the `qdesigner` superuser) so fixture INSERTs aren't denied; tests that exercise the production posture use `common::app_pool()` (`DATABASE_URL`, non-BYPASSRLS `qdesigner_app`). Tests that exercise RLS policies use `SET LOCAL ROLE` inside a transaction to switch to a fresh non-owner test role. See `tests/rbac_integration.rs` and `tests/rls_enforcement.rs`.
- **Production password handling for `qdesigner_app`** (ADR 0014 §Deferred): dev/test use a literal `'qdesigner_app'` password. Production needs env-sourced or cert auth before the role goes live in any non-dev environment.
- **Migration role for ad-hoc workflows**: any future migration that needs to bulk-update a FORCE'd admin table across tenants works because `qdesigner` has BYPASSRLS. If the BYPASSRLS attribute is ever dropped from `qdesigner`, those migrations need a temporary `ALTER TABLE … NO FORCE …; … ; FORCE …` dance.
- **`.env.development` discovery from tests**: `CARGO_MANIFEST_DIR` is `apps/server`, so reaching the repo root is `.parent().and_then(|p| p.parent())`. `tests/common/mod.rs` already does this and only fills vars **not already set**, so CI's explicit DSNs win over the committed dev file. Don't hand-roll it again.
- ~~**Testability gaps surfaced in Phase 4**~~ RESOLVED: `tests/common/mod.rs::build_test_state()` constructs a full `AppState`, and the `http_*.rs` suites (`http_auth_flows`, `http_access_denial`, `http_fillout_sessions`, `http_media_email`) drive real Axum tower round-trips against it.
- **Frontend build prerender** requires every `<a href>` target to either exist as a route or be marked external. Phase 1.0.6 cleaned up the marketing surface; any new internal links should be backed by a real `+page.svelte`.

## Test credentials

Seeded by `just db-seed-test` (`apps/server/db/seed/test/01-test-users.sql`) — do NOT use `create-test-user.sql`, deleted in P1.1. Password for **every** seeded user is `TestPassword123!`:

| Email | Role |
|---|---|
| `admin@test.local` | org admin |
| `editor@test.local` | editor |
| `viewer@test.local` | viewer |
| `participant@test.local` | participant |
| `demo@example.com` | demo user |

Never hardcode these in `src/` — `scripts/guard-no-hardcoded.sh` (run by `pnpm lint`) fails the build on the literals. They belong in `.env.development` / `e2e/helpers/test-config.ts`.

### Dev quick-login (dev only)

The login page renders quick-login buttons for the four `@test.local` personas from `VITE_DEV_LOGIN_*_EMAIL`/`_PASSWORD` in `.env.development`; `auth.ensureDevQuickLoginPersonas()` bootstraps them via `POST /api/dev/bootstrap-personas`. This is the live path.

### Auto-login test mode (dev only)

Inert unless you set `VITE_TEST_MODE_EMAIL` + `VITE_TEST_MODE_PASSWORD` (both commented out in `.env.development`); without them `(app)/+layout.ts` logs a warning and clears the flag.

```js
window.testMode.enable();
// or: localStorage.setItem('qdesigner-test-mode', 'true');
window.testMode.disable();
```

## Working in this repo

- pnpm only. Never npm. `package-lock.json` was removed in P1.1.
- Tools resolve from the project's nix flake (which also pins `chromium` + `playwright-driver.browsers` for live QA and e2e). CI lives in `.github/workflows/`: `ci.yml` is the PR gate; `e2e.yml` is **on-demand**, not automatic — a green PR does not mean the browser lanes ran.
- `cargo clippy --all-targets -- -D warnings` is a real gate, not advisory (`ci.yml`). Note `--all-targets`: clippy without it skips test code and will pass locally while CI fails.
- `pnpm verify` (repo root) chains lint → check → unit → integration → contracts:check → server fmt/clippy/test. It is the local superset; it is **not** what CI runs — do not assume the two are identical.
- If you add or change a `sqlx::query!` / `query_as!` macro, regenerate the committed offline cache: `cargo sqlx prepare` (writes `apps/server/.sqlx/`, ADR 0024). CI builds with `SQLX_OFFLINE=true`, so a stale cache fails the build.
- Always commit through CLAUDE/the human, not from automated scripts.
- For UI/frontend changes start `pnpm dev` and test the golden path in a browser — `pnpm check` and `pnpm test` verify types/contracts, not feature correctness.
- Questionnaire objects must carry semver fields (`versionMajor/Minor/Patch`).
- When the audit/spec docs in `specs/` conflict with the code, the code wins. Several rounds of cleanup confirmed that the original audit's claims (about RbacManager being unused, RLS portability, renderer fragmentation, marketing-surface viability, even some test counts) were diagnostic-only and didn't survive contact with the actual codebase.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (DAmesberger/qdesigner-modern) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage labels use their default names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md`; ADRs live in `docs/decisions/` (not `docs/adr/`). See `docs/agents/domain.md`.
