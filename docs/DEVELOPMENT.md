# Development setup

QDesigner uses SvelteKit/Svelte 5, a Rust/Axum API, PostgreSQL 18, Redis and
S3-compatible object storage. [ADR 0038](decisions/0038-current-architecture-and-decision-records.md)
records the architecture baseline.

## Start development

Use the repository's Nix shell (`nix develop` or the configured direnv environment)
for Rust, Node.js, pnpm, just and database tools. Docker with Compose is needed for
local infrastructure. Environment variable names are documented in
[.env.example](../.env.example); retain existing local configuration and supply
`.env.development` before starting the stack.

From the repository root:

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs `just dev-all`: it starts the Compose services, loads the development
environment, and starts the API and frontend. The backend applies the migrations
in [apps/server/migrations](../apps/server/migrations) at startup using the migration
connection, then handles requests with the restricted application connection.

For individual processes and other tasks, consult `just --list` and the scripts in
[package.json](../package.json) and [apps/web/package.json](../apps/web/package.json).
The frontend and server packages live under `apps/web` and `apps/server`.

## Local services

[Compose](../docker-compose.yml) is authoritative for infrastructure ports. Its
current host defaults are:

| Service | Address |
|---|---|
| App | http://localhost:4173 (APP_HOST / APP_PORT) |
| Rust API | http://localhost:4100 (SERVER_PORT) |
| PostgreSQL | localhost:15434 |
| Redis | localhost:16381 |
| MinIO S3 API | http://localhost:19003 |
| MinIO console | http://localhost:19004 |
| MailPit SMTP / web UI | localhost:11026 / http://localhost:18026 |

Use `DATABASE_URL` for the `qdesigner_app` application role and
`DATABASE_URL_MIGRATIONS` for the schema-owning migration role. Local password/JWT
login and OIDC federation are implemented in the Rust service. Media is stored in
MinIO locally; participant media requests use the same-origin API proxy. Yjs
collaboration uses WebSocket with Redis relay.

## Verification

```bash
pnpm check
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm server:test
pnpm build
```

The full `pnpm verify` script additionally runs lint, contract regeneration/drift
checks, Rust formatting and Clippy. E2E configuration and infrastructure requirements
are documented in [apps/web/e2e/README.md](../apps/web/e2e/README.md).

## Troubleshooting

Use `docker compose ps` and `docker compose logs <service>` to inspect infrastructure.
Check configured ports and database role/connection settings before restarting.
`docker compose down` stops the local services while retaining their volumes.
