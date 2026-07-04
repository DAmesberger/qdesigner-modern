# Baseline metrics — Phase 1

**Captured:** 2026-05-15
**Branch:** `cleanup/phase-1-to-4`
**Commit (parent of baseline):** `8f157be8fbb8b338540747955bb9008f72875f8f`
**Environment:** aarch64-darwin, project flake-pinned toolchain (nodejs_22, pnpm 8.15.9, rustc 1.94.1, cargo 1.94.0)

The flake also declares `x86_64-darwin` and `x86_64-linux` outputs; this baseline only validates on `aarch64-darwin`. CI when added should exercise the other two.

## Summary table

| # | Metric | Command | Value |
|---|---|---|---|
| 1 | Frontend tests | `pnpm --filter @qdesigner/web test` ¹ | 40 files, **691 passed / 0 failed**, 10.43s |
| 2 | Server tests (with DB) | `DATABASE_URL=postgresql://qdesigner:qdesigner@localhost:15434/qdesigner cargo test --manifest-path apps/server/Cargo.toml -- --include-ignored` ² | 6 unit passed, 5 rbac failed, **6/11 passed, exit 101** |
| 3 | Server tests (rbac_integration alone) | `DATABASE_URL=postgresql://qdesigner:qdesigner@localhost:15434/qdesigner cargo test --test rbac_integration --manifest-path apps/server/Cargo.toml` ² | **0/5 passed, exit 101** (schema empty — see note 3) |
| 4 | svelte-check errors/warnings | `pnpm --filter @qdesigner/web check` | 4620 files, **0 errors / 0 warnings** |
| 5 | Lint warnings | `pnpm --filter @qdesigner/web lint` (guard + eslint) | **0 errors / 0 warnings**, exit 0 |
| 6 | Frontend build status | `pnpm --filter @qdesigner/web build` | **FAILED** — prerender 404 on `/favicon.png`, exit 1 (see note 4) |
| 7 | Server check | `cargo check --manifest-path apps/server/Cargo.toml` | **exit 0**, 0.33s (cached from Phase 0.5 step 6) |
| 8 | Server build | `cargo build --manifest-path apps/server/Cargo.toml` | **exit 0**, 0.19s (cached) |

Notes:
1. Command form correction: the Phase 0.5 closeout advisory specified `pnpm --filter @qdesigner/web test --run`, but pnpm 8.15.9 treats `--run` as an unknown pnpm-level flag and exits 1. The `apps/web` `test` script is already `svelte-kit sync && vitest run`, so dropping `--run` is the correct form. Will use `pnpm --filter @qdesigner/web test` for the Phase 1 verification gate (condition 6).
2. Inline `DATABASE_URL=…` per the closeout advisory's workaround. Not exported. Temporary until Phase 3 Task 3.4 fixes the test's env-file path discovery.
3. The 5 rbac_integration tests fail at first SQL (`relation "users" does not exist`) because the test harness does not call `sqlx::migrate!` or otherwise bootstrap the schema. Connecting to the docker-compose Postgres yields an empty DB until the server's `db::run_migrations()` runs. See deferred item 3.
4. `Error: 404 /favicon.png (linked from /)` during SvelteKit prerender. Pre-existing content gap, not an environment-coupling defect.

## Raw outputs

### Row 1 — Frontend tests

```
> @qdesigner/web@0.0.0 test /Users/amd/dev/qdesigner-modern/apps/web
> svelte-kit sync && vitest run
…
 Test Files  40 passed (40)
      Tests  691 passed (691)
   Start at  11:58:22
   Duration  10.43s (transform 790ms, setup 172ms, collect 1.56s, tests 8.02s, environment 314ms, prepare 47ms)
```

### Row 2 — Server tests with DB (`--include-ignored`)

```
     Running unittests src/main.rs (apps/server/target/debug/deps/qdesigner_server-…)

running 6 tests
test api::sessions::tests::computes_summary_statistics_with_percentiles ... ok
test websocket::yjs_relay::tests::decodes_length_prefixed_yjs_payload ... ok
test api::sessions::tests::parses_numeric_json_values ... ok
test api::sessions::tests::parses_aggregate_source_with_default ... ok
test websocket::yjs_relay::tests::rejects_truncated_yjs_payload ... ok
test websocket::yjs_relay::tests::encodes_and_decodes_length_prefixed_yjs_payload ... ok

test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out

     Running tests/rbac_integration.rs (apps/server/target/debug/deps/rbac_integration-…)

running 5 tests
test project_member_must_be_org_member ... FAILED
test cross_tenant_project_member_insertion_denied ... FAILED
test rls_helper_functions_exist ... FAILED
test project_member_trigger_exists ... FAILED
test rls_context_set_and_reset ... FAILED

failures:

---- project_member_must_be_org_member stdout ----
thread 'project_member_must_be_org_member' panicked at tests/rbac_integration.rs:166:6:
create user a: Database(PgDatabaseError { code: "42P01", message: "relation \"users\" does not exist" })

---- cross_tenant_project_member_insertion_denied stdout ----
thread 'cross_tenant_project_member_insertion_denied' panicked at tests/rbac_integration.rs:269:6:
create user org1: Database(PgDatabaseError { code: "42P01", message: "relation \"users\" does not exist" })

---- rls_helper_functions_exist stdout ----
thread 'rls_helper_functions_exist' panicked at tests/rbac_integration.rs:354:5:
current_app_user_id() should exist

---- project_member_trigger_exists stdout ----
thread 'project_member_trigger_exists' panicked at tests/rbac_integration.rs:387:5:
trg_project_members_org_check trigger should exist on project_members

---- rls_context_set_and_reset stdout ----
thread 'rls_context_set_and_reset' panicked at tests/rbac_integration.rs:131:10:
current_setting should work: ColumnDecode { index: "0", source: UnexpectedNullError }


test result: FAILED. 0 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out

error: test failed, to rerun pass `--test rbac_integration`
```

### Row 3 — `cargo test --test rbac_integration` alone

```
     Running tests/rbac_integration.rs (apps/server/target/debug/deps/rbac_integration-…)

running 5 tests
test cross_tenant_project_member_insertion_denied ... FAILED
test project_member_must_be_org_member ... FAILED
test rls_helper_functions_exist ... FAILED
test project_member_trigger_exists ... FAILED
test rls_context_set_and_reset ... FAILED

[same panic messages as Row 2]

test result: FAILED. 0 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.08s

error: test failed, to rerun pass `--test rbac_integration`
INNER_EXIT=101
```

### Row 4 — `pnpm --filter @qdesigner/web check`

```
> @qdesigner/web@0.0.0 check /Users/amd/dev/qdesigner-modern/apps/web
> svelte-kit sync && svelte-check --tsconfig ./tsconfig.json && tsc

…
COMPLETED 4620 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS
```

### Row 5 — `pnpm --filter @qdesigner/web lint`

```
> @qdesigner/web@0.0.0 lint /Users/amd/dev/qdesigner-modern/apps/web
> pnpm guard:no-hardcoded && eslint --config ./eslint.config.js .

> @qdesigner/web@0.0.0 guard:no-hardcoded /Users/amd/dev/qdesigner-modern/apps/web
> bash ../../scripts/guard-no-hardcoded.sh

Hardcoded-token guard passed.
```

(eslint produced no output — its convention is to print nothing on a clean run. Exit 0.)

### Row 6 — `pnpm --filter @qdesigner/web build` (FAILED)

```
> @qdesigner/web@0.0.0 build /Users/amd/dev/qdesigner-modern/apps/web
> vite build

vite v6.4.1 building SSR bundle for production...
…
"autoUpdate" is imported from external module "@floating-ui/dom" but never used in "src/lib/help/components/TourOverlay.svelte" and "src/lib/help/components/Popover.svelte".
"produce" is imported from external module "immer" but never used in "src/lib/wysiwyg/QuestionVisualRenderer.svelte".
✓ 4406 modules transformed.
Unknown output options: codeSplitting. […]
rendering chunks…
vite v6.4.1 building for production...
…
✓ 6542 modules transformed.
…
Error: 404 /favicon.png (linked from /)
To suppress or handle this error, implement `handleHttpError` in https://svelte.dev/docs/kit/configuration#prerender

 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @qdesigner/web@0.0.0 build: `vite build`
Exit status 1
```

### Row 7 — `cargo check`

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.33s
[exit 0]
```

### Row 8 — `cargo build`

```
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.19s
[exit 0]
```

## Deferred / known limitations

1. **`rbac_integration.rs:86-89` env-discovery path bug.** Reads `.env.development` from `CARGO_MANIFEST_DIR.parent() == apps/` (post-restructure: doesn't exist there), instead of repo root. Inline `DATABASE_URL=...` is a temporary workaround per the Phase 0.5 closeout advisory. **To be removed in Phase 3 Task 3.4** alongside the RLS execution fix.

2. **`pnpm test --run` command form**: pnpm 8.15.9 rejects the unknown `--run` flag. The correct form is `pnpm --filter @qdesigner/web test` (no flag); the `apps/web` `test` script already includes `vitest run`. The Phase 1 verification gate (condition 6) and any Phase 1+ advisories should use the corrected form.

3. **Test schema not bootstrapped.** `rbac_integration` tests do not call `sqlx::migrate!` or otherwise apply migrations; they INSERT INTO empty tables. Today the only way to make these tests pass is to run `cargo run --manifest-path apps/server/Cargo.toml` once (which applies migrations via `apps/server/src/db/mod.rs:19`) and then run `cargo test`. **Phase 4.1 (server handler tests) should add a setup-once test fixture that applies migrations.** Until then, the baseline value "0/5 rbac passed" reflects the empty-schema state, NOT the policy/trigger correctness the tests are meant to assert.

4. **Frontend build prerender failure.** `Error: 404 /favicon.png (linked from /)`. Pre-existing content gap. Pre-cleanup, pre-restructure. Two fixes: add `apps/web/static/favicon.png`, or set `handleHttpError` in `svelte.config.js`'s `kit.prerender` block. **Until fixed, the Phase 1 verification gate's `pnpm build` check is meaningless** (regressions would be masked). Surfacing for the next advisory; not in scope of Phase 1 deletions.

5. **`x86_64-darwin` and `x86_64-linux` flake outputs unverified.** Declared in `flake.nix`; only `aarch64-darwin` was exercised. CI when added will validate the others.

6. **`just` duplication outside flake shell.** Home-manager's `just` at `/etc/profiles/per-user/amd/bin/just` is on PATH outside the dev shell. Inside the shell the flake's `just` wins. Benign; no action.

7. **Healthcheck timing.** Postgres reached healthy in ~12s (dev) / ~8s (test); well under the 55s ceiling. No action.

8. **`psql` not in the project flake.** Used `nix shell nixpkgs#postgresql -c psql ...` as a one-shot in Phase 1.0.5 verification. Per the Phase 1.0.5 closeout advisory's disposition of D-1.0.5/1, `pkgs.postgresql` will be added to `flake.nix` when first regularly needed (Phase 2.4 or Phase 3.4).

---

# Phase 6 — RLS enforcement (closeout)

**Captured:** 2026-05-16
**Branch:** `phase-6` (8 commits, ready to fast-forward into `main`)
**Final commit:** P6.7 closeout (this commit)
**Parent of phase:** `303ecff` (Phase 5 closeout)

## Phase 6 summary

| # | Metric | Phase 1 baseline | Post-Phase 5 | Post-Phase 6 |
|---|---|---|---|---|
| 1 | Frontend tests | 40 files / 691 | 43 files / 716 | 43 files / 716 (unchanged) |
| 2 | Scripting-engine standalone | not tracked | 6 files / 223 | 6 files / 223 |
| 3 | Server tests (`--include-ignored`) | 6/11 (5 rbac FAILED, schema empty) | 36/36 | **44/44** |
| 4 | svelte-check | 0/0 | 0/0 | 0/0 (no frontend changes) |
| 5 | Lint | 0/0 | 0/0 | 0/0 (no frontend changes) |
| 6 | Frontend build | FAILED (favicon prerender) | varies | not re-run (no frontend changes) |
| 7 | `cargo check` | exit 0 | exit 0 | exit 0 |
| 8 | `cargo build` | exit 0 | exit 0 | exit 0 |

Server test breakdown after Phase 6 (`cargo test --include-ignored`):

| File | Tests | Notes |
|---|---|---|
| bin unit | 12 | +2 from P6.3 (`middleware::fillout_rls_context::tests`) |
| `tests/auth_flows.rs` | 8 | unchanged |
| `tests/bump_version_semver.rs` | 5 | unchanged (get_test_pool switched to migration DSN in P6.2) |
| `tests/rbac_integration.rs` | 8 | –1 deleted (`organizations_policy_denies_non_member`, ADR 0015), +1 added (`cross_tenant_org_membership_check_denies_non_member`, P6.6) |
| `tests/revoked_tokens_purge.rs` | 1 | unchanged |
| `tests/rls_context.rs` | 1 | unchanged (Phase 5 GUC contract test) |
| `tests/rls_enforcement.rs` | **6 new** | P6.6 — admin SELECT denial, D2a permissive INSERT, anonymous fillout session isolation, authenticated fillout user-bound isolation |
| `tests/sync_session_dedup.rs` | 3 | unchanged (get_test_pool switched in P6.2) |

## Phase 6 deliverables

- **5 new migrations** (`00018`–`00022`):
  - `00018_app_role.sql` — `qdesigner_app` non-superuser role + grants (ADR 0014)
  - `00019_sessions_user_id.sql` — `sessions.user_id` column + partial index
  - `00020_admin_mutation_policies.sql` — DISABLE on `users`/`organizations` (ADR 0015), permissive `_all` policies on the six admin tables
  - `00021_fillout_dual_policies.sql` — `current_app_session_id()` helper, dual-path policies on the four fillout-path tables, DISABLE on `questionnaire_definitions`, `projects_select_via_published_questionnaire`
  - `00022_force_rls_admin.sql` — FORCE RLS on the four admin-RLS-bound tables
- **1 new middleware** — `apps/server/src/middleware/fillout_rls_context.rs` (sibling to `set_rls_context`; always opens tx, extracts both GUCs)
- **3 new code patterns**:
  - Split-DSN startup (migration DSN runs migrations, then app pool opens) — `apps/server/src/main.rs`
  - `executor: impl PgExecutor<'_>` / `&mut PgConnection` for all 11 helpers in `sessions.rs` (folded P6.4 into P6.3)
  - `OptionalUser` handlers take `Tx` and pass `&mut **tx` to queries
- **4 new ADRs** (`0012`–`0015`) + 1 PHASE_6_PLAN amendments
- **2 ADR status updates** — `0001` → Complete; `0011` → Superseded
- **2 plan-text mid-phase amendments** — `P6.1` (correcting "RLS doesn't bind yet"); `P6.2` (recording the ADR 0015 discovery)

## Operational notes for future work

1. Every developer needs a fresh DB after pulling Phase 6 (`docker compose down -v; up`). The `qdesigner_app` role is created by `00018`; pre-existing volumes don't have it.
2. The bonus probe in P6.6 confirmed: rls_enforcement tests pass with FORCE removed because non-owner ENABLE is what binds the test role. FORCE in `00022` is declarative posture / future-proofing, not load-bearing protection against current roles.
3. `check_duplicate` is functionally a no-op for anonymous callers post-Phase-6 (dual-path SELECT hides other sessions). Logged as the only behavioural regression — see Known TODOs in `CLAUDE.md`.
4. `tests/rbac_integration.rs::organizations_policy_denies_non_member` was deleted in P6.2 because the policy it tested no longer exists (ADR 0015 disabled RLS on `organizations`). The handler-layer test (`cross_tenant_org_membership_check_denies_non_member`, P6.6) covers the surviving contract.

---

# Phase 8 — Fillout renderer & reaction-framework remediation (closeout)

**Captured:** 2026-07-04
**Branch:** `phase-8/design-system` (carries the design-system arc + Phases 1–5 of the fillout fix)
**Plan:** `PHASE_8_FILLOUT_FIX_PLAN.md` (Phases 1–5; ADR 0023)

## Phase 8 summary

| # | Metric | Post-Phase 6 | Post-Phase 8 |
|---|---|---|---|
| 1 | Frontend web suite | 43 files / 716 | **~800 passed** (768 → 770 → 784 → 800 across fillout-fix Phases 1→2→3→4) |
| 2 | Scripting-engine standalone | 6 files / 223 | 6 files / 223 (unchanged) |
| 3 | Server tests (`--include-ignored`) | 44/44 | **44/44** (new fillout migrations 00024/00025/00026 apply in order on a clean DB; `sync_session_dedup` exercises the `timing_provenance` insert) |
| 4 | svelte-check | 0/0 | 0/0 |
| 5 | Lint | 0/0 | 0/0 |
| 6 | Frontend build | FAILED (favicon) → later fixed | not re-captured here |
| 7 | `cargo check` | exit 0 | exit 0 |
| 8 | `cargo build` | exit 0 | exit 0 |

The web-suite growth tracks per-phase additions: persistence-timing + offline-roundtrip
regressions (Phases 1–2), deterministic `ReactionEngine` tests with a mock renderer + injected
clock (Phase 3), and `WebGLRenderer`/engine-robustness tests (Phase 4).

## Phase 8 deliverables (fillout fix)

- **3 new migrations** (`00024`–`00026`) — `responses.timing_provenance JSONB` + supporting
  columns/indexes for version-pinned sessions and media proxying.
- **Rendering finalized to a single hybrid contract** (ADR 0023): one WebGL path
  (`ReactionEngine` + `WebGLRenderer`, v1 reaction stimuli only); the DOM overlay
  (`FormQuestionHost`) renders all form/display/analytics/instruction items. The hollow
  `QuestionPresenter` + `runtime/renderers/*` + `runtime/stimuli/*` stacks were deleted (its
  `RenderContext` type inlined into `WebGLRenderer`); the loader/cache half of `ResourceManager`
  was kept.
- **D1 same-origin media proxy** (`GET /api/media/{id}/content`) + **D2 offline-first single
  write path** (IndexedDB-first, `clientId` dedup) + **per-session version pinning**.
- **Reaction-timing correctness** — display/output-latency correction, rVFC video onset,
  anticipatory/false-start flagging, and the corrected "frame-accurate onset; sub-ms relative
  precision" claim across CLAUDE.md / README / app.html / help / tour.
- **1 new ADR** (`0023-fillout-hybrid-rendering.md`) finalizing ADR 0018; CLAUDE.md architecture
  sections updated; this baseline row.

## Operational notes

1. Migrations `00024`/`00025`/`00026` must apply in order on a clean DB; a fresh volume is the
   safe path after pulling Phase 8.
2. Each fillout-fix phase carried a live-browser golden-path gate in addition to type/test green
   — type/test green has demonstrably lied about this surface (the prompt-never-renders bug
   passed a green suite). Live browser QA consolidation is tracked in the plan.
3. Slices 5.2 (delete the hollow stacks) and 5.3 (this doc + ADR 0023) are companion slices; the
   docs describe the finalized end state where the dead stacks are gone.
