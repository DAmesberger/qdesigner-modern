# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QDesigner Modern is a high-performance questionnaire platform for psychological and behavioral research. It features microsecond-accurate reaction time measurements, WebGL 2.0 rendering at 120+ FPS, fully offline-capable questionnaire fillout, and semantic versioning for questionnaire definitions. Built with Svelte 5, SvelteKit, TypeScript strict, and a Rust/Axum backend.

## Essential Commands

```bash
# Install dependencies (always use pnpm, never npm)
pnpm install

# Start infrastructure (PostgreSQL 18, Redis 7, MinIO, MailPit)
docker compose up -d

# Start the Rust backend (auto-runs migrations, port 4000)
cd server && cargo run

# Start the frontend dev server (port 5173, proxies /api to :4000)
pnpm dev

# Testing
pnpm test                    # Unit tests (Vitest, 257 tests)
pnpm test:coverage           # With coverage
pnpm check                   # svelte-check + tsc
cd server && cargo check     # Rust type check
cd server && cargo test      # Rust tests

# Linting and formatting
pnpm lint                    # Check linting
pnpm lint:fix                # Auto-fix
pnpm format                  # Prettier

# Building
pnpm build                   # Build frontend
cd server && cargo build     # Build backend

# E2E tests
pnpm install:browsers        # Install Playwright browsers first
pnpm test:e2e                # Run E2E tests

# Database access
pnpm db:psql                 # Connect to PostgreSQL
```

## Architecture

### Stack

- **Frontend**: Svelte 5 (runes) + SvelteKit + TypeScript strict + Tailwind CSS 4.1
- **Backend**: Rust/Axum REST API (`server/`)
- **Database**: PostgreSQL 18 via Docker
- **Cache**: Redis 7 (rate limiting)
- **Storage**: MinIO (S3-compatible, file uploads)
- **Email**: MailPit (dev SMTP + web UI)
- **Auth**: JWT access/refresh tokens with Argon2id password hashing
- **Offline**: Dexie/IndexedDB + Service Worker + Cache API

### Ports

| Service           | Port  |
|-------------------|-------|
| Frontend (Vite)   | 5173  |
| Backend (Axum)    | 4000  |
| PostgreSQL        | 15434 |
| Redis             | 16381 |
| MinIO API         | 19003 |
| MinIO Console     | 19001 |
| MailPit SMTP      | 11026 |
| MailPit Web UI    | 18026 |

The frontend uses relative URLs (`/api/*`); Vite proxies these to `http://localhost:4000`. `VITE_API_URL` in `.env.development` is intentionally empty.

### Project Structure

```
src/
├── routes/
│   ├── (auth)/          Login, signup, onboarding, password reset
│   ├── (app)/           Dashboard, projects, designer, admin, settings
│   ├── (fillout)/       Questionnaire fillout (client-side only, offline-capable)
│   └── (public)/        Public pages
├── lib/
│   ├── components/      Reusable UI (designer/, questions/, common/, ui/)
│   ├── fillout/         Fillout runtime, services, components
│   │   ├── runtime/     FilloutRuntime, RuntimeEventBus
│   │   ├── services/    Session, response persistence, offline sync engine
│   │   └── components/  WelcomeScreen, ConsentScreen, CompletionScreen
│   ├── runtime/         Core questionnaire runtime
│   │   ├── core/        QuestionnaireRuntime, BlockRandomizer, ScriptExecutor
│   │   ├── reaction/    Reaction time engine + presets (Stroop, IAT, Flanker, etc.)
│   │   ├── experimental/ ExperimentalDesign, Counterbalancing
│   │   └── validation/  MediaValidator, response validation
│   ├── renderer/        WebGL 2.0 rendering engine
│   ├── services/        API client, auth, persistence, offline, IndexedDB
│   │   └── db/          Dexie IndexedDB schema (designer + fillout tables)
│   ├── stores/          Svelte stores (designer.svelte.ts, toast.ts, theme.ts)
│   ├── shared/          Types, factories, utilities
│   ├── i18n/            Internationalization
│   ├── analytics/       Statistical engine, export service
│   └── scripting-engine/ → packages/scripting-engine (symlink)
server/
├── src/api/             Route handlers (auth, organizations, projects, questionnaires, sessions, media, templates)
├── src/auth/            JWT, password hashing, session management
├── src/middleware/       CORS, rate limiting, auth middleware
├── db/migrations/       SQL migrations (001-016, applied automatically)
└── migrations/          sqlx embed migrations (00001-00008)
packages/
└── scripting-engine/    Formula evaluation engine (@qdesigner/scripting-engine)
```

### Database Schema

Multi-tenant architecture with 16 migrations covering:

- **Auth**: users, refresh_tokens, revoked_tokens, email_verifications, password_resets
- **Orgs**: organizations, organization_members, organization_invitations, organization_domains
- **Projects**: projects, project_members
- **Questionnaires**: questionnaire_definitions (JSONB content, semver versioning), questionnaire_versions
- **Sessions**: sessions (with questionnaire version tracking), responses (client_id for dedup), interaction_events (client_id for dedup), session_variables
- **Media**: media_assets, session_media

Key details:
- Semver versioning: `version_major`, `version_minor`, `version_patch` on questionnaire_definitions, questionnaire_versions, and sessions
- Microsecond precision: `reaction_time_us` (BIGINT) on responses, `timestamp_us` on interaction_events
- Offline dedup: `client_id UUID UNIQUE` on responses and interaction_events
- Soft deletes via `deleted_at` column

### API Endpoints

```
/api/auth/*                  Authentication (login, register, refresh, verify-email, password-reset)
/api/users/me                User profile
/api/organizations/*         Org CRUD, members, invitations, domains, templates, analytics
/api/projects/*              Project CRUD, members, questionnaires
/api/questionnaires/
  /by-code/{code}            Public fillout lookup (returns semver fields)
  /{id}/versions             Version history
  /{id}/condition-counts     Between-subjects condition counts
/api/projects/{id}/questionnaires/{qid}/
  /publish                   Publish questionnaire
  /bump-version              Bump semver (major/minor/patch)
  /export                    Export responses (JSON/CSV)
/api/sessions/*              Session CRUD, responses, events, variables, media
  /{id}/sync                 Bulk offline sync with client_id dedup
  /aggregate                 Statistical aggregation
  /compare                   Participant comparison
  /dashboard                 Org dashboard summary
```

### Offline Architecture

The fillout route (`/[code]`) runs entirely client-side (`ssr = false`):

1. **Online-first load**: Fetches questionnaire from API, caches to IndexedDB
2. **Offline fallback**: Loads cached questionnaire from IndexedDB
3. **Session creation**: `crypto.randomUUID()` — no server needed
4. **Response persistence**: IndexedDB with `clientId` per record for dedup
5. **Sync engine**: Watches `online`/`offline` events, syncs via `POST /api/sessions/{id}/sync`
6. **Dedup**: Backend uses `INSERT ... ON CONFLICT (client_id) DO NOTHING`
7. **Media caching**: Cache API (`fillout-media-v1`) for questionnaire media assets

IndexedDB tables (Dexie v2):
- Designer: `questionnaires`, `syncQueue`, `resources`, `drafts`
- Fillout: `filloutQuestionnaires`, `filloutSessions`, `filloutResponses`, `filloutEvents`, `filloutVariables`

### Version Management

Questionnaires use semantic versioning (`major.minor.patch`):

| Change | Bump | Example |
|--------|------|---------|
| Add/remove/reorder questions, change response keys | Major | 1.0.0 → 2.0.0 |
| Edit question text/labels, add options, reorder pages | Minor | 1.0.0 → 1.1.0 |
| Fix typos, adjust styling, update descriptions | Patch | 1.0.0 → 1.0.1 |

Sessions record which version they were filled out against. Same major version = comparable data.

### Variable Engine

The scripting engine (`packages/scripting-engine`) supports 47+ formula functions:

- Math: `+`, `-`, `*`, `/`, `^`, `sqrt()`, `abs()`, `round()`, `ceil()`, `floor()`
- Conditionals: `IF(condition, trueValue, falseValue)`
- Arrays: `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()`, `FOREACH()`, `RANGE()`
- Strings: `CONCAT()`, `LENGTH()`, `UPPER()`, `LOWER()`, `TRIM()`
- Time: `NOW()`, `TIME_SINCE()`
- Random: `RANDOM()`, `RANDINT(min, max)`
- Variable interpolation: `{{variableName}}` in text fields

## Test Credentials

For local development (create via Playwright MCP after bootstrapping):

- **Email**: `demo@example.com`
- **Password**: `demo123456`

### Auto-Login Test Mode

```javascript
// Enable (browser console, dev mode only)
window.testMode.enable();
// Or: localStorage.setItem('qdesigner-test-mode', 'true');

// Disable
window.testMode.disable();
```

## Common Tasks

### Adding a new question type

1. Define interface in `src/lib/shared/types/questionnaire.ts`
2. Add renderer component in `src/lib/components/questions/`
3. Register in question factory (`src/lib/shared/factories/`)
4. Add runtime handler in `src/lib/runtime/`

### Database changes

1. Create migration in `server/db/migrations/` (e.g., `017_my_change.sql`)
2. Create corresponding file in `server/migrations/` (e.g., `00009_my_change.sql`)
3. Restart the backend — migrations apply automatically
4. Update Rust structs in `server/src/api/` if needed

### Adding a new API endpoint

1. Add handler in `server/src/api/`
2. Register route in `server/src/api/mod.rs`
3. Add request/response types
4. Run `cargo check` to verify
5. Add frontend API method in `src/lib/services/api.ts`

### Working with the fillout offline layer

- Questionnaire caching: `FilloutOfflineSyncService` (IndexedDB + Cache API for media)
- Session management: `OfflineSessionService` (client-side UUID sessions)
- Response persistence: `OfflineResponsePersistence` (IndexedDB with clientId dedup)
- Sync engine: `FilloutSyncEngine` (auto-sync on reconnect, exponential backoff)
- Service worker: `static/sw.js` (fillout media cache, offline queue)

## Code Guidance

- Do not use test scripts, simplifications, or workarounds — ask when in doubt
- Never use simpler approaches without asking
- Never fix things quick and dirty — fix the underlying issue so it works when the app is bootstrapped
- For development: `docker compose up -d`, then `cd server && cargo run`, then `pnpm dev`
- When using Playwright MCP, prefer using HTML; only use screenshots if interpreting HTML is not possible
- Users should not be created via script — only via the Playwright MCP to test the actual user flow
- Never guess URLs — navigate from the landing page
- Always include semver fields (`versionMajor`, `versionMinor`, `versionPatch`) when creating `Questionnaire` objects
