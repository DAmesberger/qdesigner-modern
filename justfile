# QDesigner Modern - Development Task Runner

# Default recipe
default:
    @just --list

# === Development ===

# Start all services (docker + backend + frontend)
dev-all: local-up
    #!/usr/bin/env bash
    echo "Starting backend and frontend..."
    just dev-backend &
    sleep 3
    just dev-frontend

# Start frontend dev server
dev-frontend:
    pnpm dev

# Start backend dev server with auto-reload
dev-backend:
    cd server && cargo watch -x run

# Start docker services (postgres, redis, minio, mailpit)
local-up:
    docker compose up -d
    @echo "Waiting for services to be healthy..."
    @sleep 3
    @just health || (echo "Some services not ready yet, waiting..." && sleep 5 && just health)

# Stop docker services
local-down:
    docker compose down

# Stop and remove all docker data
local-clean:
    docker compose down -v

# === Database ===

# Run database migrations (backend auto-migrates on start, or run manually)
db-migrate:
    cd server && cargo run -- --migrate-only

# Seed baseline data (roles, permissions)
db-seed:
    #!/usr/bin/env bash
    for f in server/db/seed/baseline/*.sql; do
        echo "Seeding: $f"
        psql "$DATABASE_URL" -f "$f"
    done

# Seed test data (test users, org, project)
db-seed-test:
    #!/usr/bin/env bash
    for f in server/db/seed/test/*.sql; do
        echo "Seeding: $f"
        psql "$DATABASE_URL" -f "$f"
    done

# Reset database (drop, recreate, migrate, seed)
db-reset:
    #!/usr/bin/env bash
    echo "Dropping and recreating database..."
    psql "postgresql://qdesigner:qdesigner@localhost:15434/postgres" -c "DROP DATABASE IF EXISTS qdesigner;"
    psql "postgresql://qdesigner:qdesigner@localhost:15434/postgres" -c "CREATE DATABASE qdesigner OWNER qdesigner;"
    echo "Running migrations..."
    just db-migrate
    echo "Seeding baseline data..."
    just db-seed
    echo "Database reset complete!"

# Open psql shell
db-shell:
    psql "$DATABASE_URL"

# === Testing ===

# Run backend tests
test-server:
    cd server && cargo test

# Run frontend unit tests
test-web:
    pnpm test

# Run all unit tests
test-all: test-server test-web

# Run E2E tests (starts test services if needed)
e2e:
    docker compose -f docker-compose.test.yml up -d
    @sleep 3
    pnpm test:e2e

# Run E2E tests (assume test services already running)
e2e-quick:
    pnpm test:e2e

# Run E2E tests with UI
e2e-ui:
    pnpm test:e2e:ui

# === Building ===

# Build backend (release)
build-server:
    cd server && cargo build --release

# Build frontend
build-web:
    pnpm build

# Build all
build-all: build-server build-web

# === Code Quality ===

# Run all linters
lint:
    pnpm lint
    cd server && cargo clippy -- -D warnings

# Fix linting issues
lint-fix:
    pnpm lint:fix
    cd server && cargo clippy --fix --allow-dirty

# Format all code
format:
    pnpm format
    cd server && cargo fmt

# Type check
check:
    pnpm check
    cd server && cargo check

# === Utilities ===

# Check health of all services
health:
    #!/usr/bin/env bash
    echo "Checking service health..."

    # PostgreSQL
    if pg_isready -h localhost -p 15434 -U qdesigner > /dev/null 2>&1; then
        echo "  ✓ PostgreSQL"
    else
        echo "  ✗ PostgreSQL"
    fi

    # Redis
    if redis-cli -p 16381 ping > /dev/null 2>&1; then
        echo "  ✓ Redis"
    else
        echo "  ✗ Redis"
    fi

    # MinIO
    if curl -sf http://localhost:19003/minio/health/live > /dev/null 2>&1; then
        echo "  ✓ MinIO"
    else
        echo "  ✗ MinIO"
    fi

    # MailPit
    if curl -sf http://localhost:18026/api/v1/info > /dev/null 2>&1; then
        echo "  ✓ MailPit"
    else
        echo "  ✗ MailPit"
    fi

    # Backend
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo "  ✓ Backend"
    else
        echo "  ✗ Backend (not running)"
    fi

# Generate a JWT token for testing (requires jq)
login-as email password="TestPassword123!":
    #!/usr/bin/env bash
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"{{email}}\", \"password\": \"{{password}}\"}")
    TOKEN=$(echo "$RESPONSE" | jq -r '.tokens.access_token')
    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
        echo "Login failed: $RESPONSE"
    else
        echo "Access token: $TOKEN"
        echo ""
        echo "Usage: curl -H 'Authorization: Bearer $TOKEN' http://localhost:3000/api/auth/me"
    fi

# Install all dependencies
setup:
    pnpm install
    cd server && cargo build
    just local-up
    @sleep 3
    just db-seed
    @echo "Setup complete! Run 'just dev-all' to start."

# Fresh setup (clean + setup)
setup-fresh: local-clean setup
