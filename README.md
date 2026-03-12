# QDesigner Modern

A high-performance questionnaire platform for psychological and behavioral research. Features microsecond-accurate reaction time measurements, WebGL 2.0 rendering at 120+ FPS, fully offline-capable questionnaire fillout, and semantic versioning for questionnaire definitions.

## Stack

- **Frontend**: Svelte 5 (runes) + SvelteKit + TypeScript strict + Tailwind CSS 4.1
- **Backend**: Rust/Axum REST API
- **Database**: PostgreSQL 18
- **Cache**: Redis 7 (rate limiting)
- **Storage**: MinIO (S3-compatible)
- **Email**: MailPit (dev SMTP + web UI)
- **Auth**: JWT access/refresh tokens with Argon2id password hashing
- **Offline**: Dexie/IndexedDB + Service Worker + Cache API

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure
docker compose up -d

# Start backend (auto-runs migrations, port from `.env.development`, default `4100`)
cd server && cargo run

# Start frontend (port from `.env.development`, default `4173`)
pnpm dev
```

## Service URLs

| Service         | URL                     |
|-----------------|-------------------------|
| App             | http://localhost:4173   |
| Backend API     | http://localhost:4100   |
| MinIO Console   | http://localhost:19001  |
| MailPit         | http://localhost:18026  |

## Test Credentials

- **Email**: `demo@example.com`
- **Password**: `demo123456`

Enable auto-login in dev:
```javascript
window.testMode.enable();
```

## Features

- **Visual Questionnaire Designer**: Drag-and-drop with real-time preview
- **WebGL 2.0 Rendering**: 120+ FPS for precise reaction time measurements
- **Variable System**: 47+ formula functions, conditional logic, array operations
- **Offline-First Fillout**: Full offline capability with background sync
- **Semantic Versioning**: Questionnaire definitions versioned for data comparability
- **High-Precision Timing**: Microsecond-accurate response collection
- **Multimedia Stimuli**: Images, video, audio, composite stimuli
- **Statistical Analysis**: Built-in bell curve, gauge, and feedback chart components

## Development Commands

```bash
pnpm test              # Unit tests (Vitest)
pnpm check             # svelte-check + tsc
pnpm api:export        # Export backend OpenAPI to openapi/openapi.json
pnpm api:generate      # Export OpenAPI and regenerate src/lib/api/generated
pnpm api:check         # Fail if exported spec or generated client drifted
pnpm lint              # ESLint
pnpm lint:fix          # Auto-fix
pnpm format            # Prettier
pnpm build             # Production build
pnpm test:e2e          # E2E tests (Playwright)
cd server && cargo test    # Rust tests
cd server && cargo check   # Rust type check
```

## Documentation

- [CLAUDE.md](CLAUDE.md) — Architecture, API reference, and development guidance
- [openapi/openapi.json](openapi/openapi.json) — Generated REST contract
- [src/lib/api/generated/index.ts](src/lib/api/generated/index.ts) — Generated TypeScript client
- [docs/asyncapi/realtime.asyncapi.yaml](docs/asyncapi/realtime.asyncapi.yaml) — WebSocket/AsyncAPI contract
