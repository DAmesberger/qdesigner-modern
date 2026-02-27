# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QDesigner Modern is a high-performance questionnaire platform for psychological and behavioral research, featuring microsecond-accurate reaction time measurements and WebGL 2.0 rendering for 120+ FPS support combined with standard questionnaire features. It is built using Svelte 5, SvelteKit, and TypeScript, with a focus on performance, extensibility, and user experience with the goal of having FAANG level UI/UX.

## Test Credentials

For local development, use these credentials to log in (use playwright MCP to create the user after bootstrapping):

- **Email**: `demo@example.com`
- **Password**: `demo123456`

### Auto-Login Test Mode

For faster development, you can enable test mode to automatically log in as the demo user:

1. **Enable test mode** (in browser console):

   ```javascript
   window.testMode.enable();
   ```

2. **Or set directly in localStorage**:

   ```javascript
   localStorage.setItem('qdesigner-test-mode', 'true');
   ```

3. **Disable test mode**:
   ```javascript
   window.testMode.disable();
   ```

When enabled, navigating to any protected route (e.g., `/dashboard`, `/designer`) will automatically log you in as `demo@example.com`. This only works in development mode.

## Essential Commands

```bash
# Install dependencies (use pnpm, not npm)
pnpm install

# Start infrastructure (PostgreSQL 18, Redis 7, MinIO, MailPit)
docker compose up -d

# Start the Rust backend (auto-runs migrations)
cd server && cargo run

# Start the frontend dev server
pnpm dev

# Testing
pnpm test                    # Run all tests
pnpm test:coverage          # With coverage
cd packages/scripting-engine && pnpm test  # Run tests in specific package

# Linting and formatting
pnpm lint                   # Check linting
pnpm lint:fix              # Auto-fix linting issues
pnpm format                # Format with Prettier

# Type checking
pnpm check                 # Run svelte-check

# Building
pnpm build                 # Build frontend

# Rust backend
cd server && cargo check    # Type check
cd server && cargo test     # Run tests
cd server && cargo build    # Build

# E2E tests (requires browsers)
pnpm install:browsers      # Install Playwright browsers first
pnpm test:e2e             # Run E2E tests
```

## Architecture Overview

### Stack

- **Frontend**: Svelte 5 (runes) + SvelteKit + TypeScript strict + Tailwind CSS 4.1
- **Backend**: Rust/Axum REST API (`server/`)
- **Database**: PostgreSQL 18 via Docker
- **Cache**: Redis 7 (optional, for rate limiting)
- **Storage**: MinIO (S3-compatible, for file uploads)
- **Email**: MailPit (dev SMTP, web UI at http://localhost:18026)
- **Auth**: JWT with Argon2id password hashing

### Project Structure

- **`src/`**: SvelteKit frontend (Svelte 5 + TypeScript)
  - `src/routes/(auth)/`: Auth pages (login, signup, onboarding)
  - `src/routes/(app)/`: App pages (dashboard, projects, designer)
  - `src/lib/services/`: API client, auth, persistence services
  - `src/lib/stores/`: Svelte stores (designer, etc.)
  - `src/lib/shared/`: Shared types and utilities
- **`server/`**: Rust/Axum backend
  - `server/src/api/`: Route handlers (auth, organizations, projects, questionnaires, etc.)
  - `server/src/auth/`: JWT, password hashing, session management
  - `server/src/middleware/`: CORS, rate limiting, auth middleware
  - `server/src/db/`: Database connection and migrations
  - `server/db/migrations/`: SQL migration files
- **`packages/scripting-engine/`**: Variable system with formula evaluation

### Ports (development)

- Frontend: **5173** (SvelteKit dev server)
- Backend: **3000** (Rust/Axum)
- PostgreSQL: **15434** (mapped from container 5432)
- Redis: **16381** (mapped from container 6379)
- MinIO API: **19003** / Console: **19004**
- MailPit SMTP: **11026** / Web UI: **18026**

### Key Design Patterns

1. **State Management**: Svelte 5 runes (`$state`, `$derived`, `$effect`)
2. **Variable System**: Custom formula engine supporting mathematical expressions, conditionals (IF), and array operations
3. **Rendering**: Custom WebGL 2.0 renderer for high-performance display at 120+ FPS
4. **Drag & Drop**: Uses @dnd-kit for questionnaire designer interface
5. **Code Editing**: Monaco Editor integration for formula editing
6. **Questionnaire Persistence**: JSONB content stored in `questionnaire_definitions` table

### Database Schema

- Multi-tenant architecture with organizations
- User roles: owner, admin, editor, viewer
- Key tables: users, organizations, organization_members, projects, project_members, questionnaire_definitions, responses
- High-precision timing columns using BIGINT for microsecond accuracy
- Email verification via 6-digit codes (email_verification_codes table)

### Variable Engine

The variable system (`packages/scripting-engine`) supports:

- Mathematical operations: `+`, `-`, `*`, `/`, `^`, `sqrt()`
- Conditionals: `IF(condition, trueValue, falseValue)`
- Array functions: `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()`
- String operations: `CONCAT()`, `LENGTH()`
- Time functions: `NOW()`, `TIME_SINCE()`
- Random: `RANDOM()`, `RANDINT(min, max)`

### Testing Strategy

- Unit tests with Vitest for logic and utilities
- Component tests with @testing-library/svelte
- E2E tests with Playwright for user workflows
- Test files use `.test.ts` or `.spec.ts` suffix

### Development Workflow

1. The project uses pnpm workspaces - always use `pnpm` instead of `npm`
2. Start infrastructure: `docker compose up -d`
3. Start backend: `cd server && cargo run` (reads `.env.development` from parent dir)
4. Start frontend: `pnpm dev`
5. Frontend runs on port 5173, backend on port 3000
6. Hot module replacement is enabled for rapid development
7. TypeScript strict mode is enabled - ensure proper typing

### Important Technical Details

- Svelte 5 with runes syntax (`$state`, `$derived`, `$effect`)
- Tailwind CSS 4.1 for styling (uses new syntax)
- Microsecond timing precision requires performance.now() API
- Database migrations in `server/db/migrations/` (applied automatically on backend start via sqlx)
- SSR only for public pages, the questionnaire designer and fillout parts of the app need full offline support
- Frontend API base URL configured via `VITE_API_URL` in `.env.development`

### Common Tasks

**Adding a new question type:**

1. Define interface in `src/lib/shared/types/questions.ts`
2. Add renderer component in `src/lib/components/questions/`
3. Update question factory in designer
4. Add runtime handler in `src/lib/shared/runtime/`

**Working with variables:**

1. Variable definitions in `src/lib/shared/types/variables.ts`
2. Formula evaluation in `packages/scripting-engine/src/evaluator.ts`
3. Variable UI in `src/lib/components/variables/`

**Database changes:**

1. Create migration SQL file in `server/db/migrations/` (numbered, e.g., `012_my_change.sql`)
2. Also add to `server/migrations/` for sqlx embed (numbered, e.g., `00003_my_change.sql`)
3. Restart the Rust backend - migrations apply automatically
4. Update Rust models in `server/src/api/` if needed

**Adding a new API endpoint:**

1. Add handler function in `server/src/api/`
2. Add route in `server/src/api/mod.rs`
3. Add request/response types as needed
4. Run `cargo check` to verify

**Logging in:**

- User: demo@example.com
- Password: demo123456

## Code Guidance

- Do not use tests scripts, simplifications or workarounds, ask when in doubt
- Never use simpler approaches without asking
- For development, start infrastructure with `docker compose up -d`, then `cd server && cargo run` for the backend, and `pnpm dev` for the frontend
- When using Playwright MCP, prefer using html, only use screenshots if interpreting html is not possible.
- Users should not be created via script, only using the playwright MCP to test the actual user flow
- Never fix things quick and dirty. We always want to fix the underlying issue, in a way that it also works when the app is bootstrapped.

## Navigation Guidance

- Never guess URLs, navigate from the landing page
