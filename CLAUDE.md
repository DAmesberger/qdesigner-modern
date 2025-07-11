# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QDesigner Modern is a high-performance questionnaire platform for psychological and behavioral research, featuring microsecond-accurate reaction time measurements and WebGL 2.0 rendering for 120+ FPS support.

## Essential Commands

```bash
# Install dependencies (use pnpm, not npm)
pnpm install

# Development - runs all apps in parallel
pnpm dev

# Run only the designer app
cd apps/designer && pnpm dev

# Testing
pnpm test                    # Run all tests
pnpm test:coverage          # With coverage
pnpm -r run test            # Run tests in all packages
cd packages/scripting-engine && pnpm test  # Run tests in specific package

# Linting and formatting
pnpm lint                   # Check linting
pnpm lint:fix              # Auto-fix linting issues
pnpm format                # Format with Prettier

# Type checking
pnpm check                 # Run svelte-check across all packages

# Building
pnpm build                 # Build all packages

# E2E tests (requires browsers)
pnpm install:browsers      # Install Playwright browsers first
pnpm test:e2e             # Run E2E tests
```

## Architecture Overview

### Monorepo Structure
- **apps/designer**: Main designer application (Svelte 5 + SvelteKit)
- **apps/fillout**: Questionnaire runtime (not yet implemented)
- **apps/admin**: Admin interface (not yet implemented)
- **packages/api**: Backend API server
- **packages/database**: Supabase client and types
- **packages/renderer**: WebGL 2.0 rendering engine
- **packages/scripting-engine**: Variable system with formula evaluation
- **packages/shared**: Shared types and utilities

### Key Design Patterns

1. **State Management**: Uses Svelte stores with Immer for immutability
2. **Variable System**: Custom formula engine supporting mathematical expressions, conditionals (IF), and array operations
3. **Rendering**: Custom WebGL 2.0 renderer for high-performance display at 120+ FPS
4. **Drag & Drop**: Uses @dnd-kit for questionnaire designer interface
5. **Code Editing**: Monaco Editor integration for formula editing

### Database Schema
- Multi-tenant architecture with organizations
- User roles: owner, admin, editor, viewer
- Tables: organizations, users, questionnaires, questions, responses
- High-precision timing columns using BIGINT for microsecond accuracy

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
2. Run `pnpm dev` from root to start all services
3. Designer app runs on port 5173 by default
4. Hot module replacement is enabled for rapid development
5. TypeScript strict mode is enabled - ensure proper typing

### Important Technical Details
- Svelte 5 with runes syntax (`$state`, `$derived`, `$effect`)
- Tailwind CSS 4.1 for styling (uses new syntax)
- WebGL 2.0 for rendering - check browser compatibility
- Microsecond timing precision requires performance.now() API
- Database migrations in `supabase/migrations`

### Common Tasks

**Adding a new question type:**
1. Define interface in `packages/shared/src/types/questions.ts`
2. Add renderer component in `apps/designer/src/lib/components/questions/`
3. Update question factory in designer
4. Add runtime handler in `packages/shared/src/runtime/`

**Working with variables:**
1. Variable definitions in `packages/shared/src/types/variables.ts`
2. Formula evaluation in `packages/scripting-engine/src/evaluator.ts`
3. Variable UI in `apps/designer/src/lib/components/variables/`

**Database changes:**
1. Create migration in `supabase/migrations/`
2. Update types in `packages/database/src/types/`
3. Run `supabase db push` to apply locally

## Code Guidance

- Never use simpler approaches without asking