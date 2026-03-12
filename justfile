# QDesigner Modern - Development Task Runner

# Default recipe
default:
    @just --list

# === Development ===

# Start all services (docker + backend + frontend)
dev-all: local-up
    #!/usr/bin/env bash
    set -euo pipefail
    source .env.development 2>/dev/null || true

    APP_HOST="${APP_HOST:-localhost}"
    APP_PORT="${APP_PORT:-4173}"
    SERVER_PORT="${SERVER_PORT:-4100}"
    BACKEND_URL="http://localhost:${SERVER_PORT}"
    FRONTEND_URL="http://${APP_HOST}:${APP_PORT}"
    REPO_ROOT="$(pwd -P)"
    SERVER_ROOT="${REPO_ROOT}/apps/server"

    backend_pid=""
    backend_owned="0"
    frontend_pid=""
    frontend_owned="0"

    describe_process() {
        local pid="$1"
        ps -o pid=,ppid=,pgid=,command= -p "${pid}" 2>/dev/null || true
    }

    process_group() {
        local pid="$1"
        ps -o pgid= -p "${pid}" 2>/dev/null | tr -d ' ' || true
    }

    process_cwd() {
        local pid="$1"
        readlink -f "/proc/${pid}/cwd" 2>/dev/null || true
    }

    stop_process_group() {
        local pid="$1"
        local pgid
        pgid="$(ps -o pgid= -p "${pid}" 2>/dev/null | tr -d ' ' || true)"
        if [ -n "${pgid}" ]; then
            kill -- -"${pgid}" 2>/dev/null || kill "${pid}" 2>/dev/null || true
        else
            kill "${pid}" 2>/dev/null || true
        fi
    }

    stop_repo_backend_supervisors() {
        local pgids
        pgids="$(
            { pgrep -f 'cargo-watch watch -x run|just dev-backend' 2>/dev/null || true; } | while read -r pid; do
                [ -z "${pid}" ] && continue
                [ "${pid}" = "$$" ] && continue
                local cwd cmd pgid
                cwd="$(process_cwd "${pid}")"
                cmd="$(ps -o command= -p "${pid}" 2>/dev/null || true)"
                pgid="$(process_group "${pid}")"
                if [ -z "${pgid}" ]; then
                    continue
                fi
                if { [ "${cwd}" = "${SERVER_ROOT}" ] && echo "${cmd}" | grep -q 'cargo-watch'; } || \
                   { [ "${cwd}" = "${REPO_ROOT}" ] && echo "${cmd}" | grep -q 'just dev-backend'; }; then
                    printf '%s\n' "${pgid}"
                fi
            done | sort -u
        )"

        if [ -z "${pgids}" ]; then
            return 0
        fi

        echo "Stopping existing QDesigner backend supervisors..."
        while read -r pgid; do
            [ -z "${pgid}" ] && continue
            kill -- -"${pgid}" 2>/dev/null || true
        done <<< "${pgids}"

        for i in $(seq 1 30); do
            local still_running="0"
            while read -r pgid; do
                [ -z "${pgid}" ] && continue
                if ps -o pid= --no-headers -g "${pgid}" 2>/dev/null | grep -q .; then
                    still_running="1"
                    break
                fi
            done <<< "${pgids}"

            if [ "${still_running}" = "0" ]; then
                echo "Existing backend supervisors stopped."
                return 0
            fi
            sleep 1
        done

        echo "Failed to stop existing backend supervisors." >&2
        exit 1
    }

    wait_for_port_to_clear() {
        local port="$1"
        local label="$2"
        for i in $(seq 1 30); do
            if ! lsof -t -nP -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1; then
                echo "Existing ${label} stopped."
                return 0
            fi
            if [ "$i" -eq 30 ]; then
                echo "Failed to stop existing ${label} on port ${port}." >&2
                exit 1
            fi
            sleep 1
        done
    }

    cleanup() {
        if [ "${frontend_owned}" = "1" ] && [ -n "${frontend_pid}" ] && kill -0 "${frontend_pid}" 2>/dev/null; then
            kill -- -"${frontend_pid}" 2>/dev/null || kill "${frontend_pid}" 2>/dev/null || true
        fi
        if [ "${backend_owned}" = "1" ] && [ -n "${backend_pid}" ] && kill -0 "${backend_pid}" 2>/dev/null; then
            kill -- -"${backend_pid}" 2>/dev/null || kill "${backend_pid}" 2>/dev/null || true
        fi
        wait "${frontend_pid}" 2>/dev/null || true
        wait "${backend_pid}" 2>/dev/null || true
    }

    trap cleanup EXIT INT TERM

    stop_repo_backend_supervisors

    existing_backend_pid="$(lsof -t -nP -iTCP:${SERVER_PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [ -n "${existing_backend_pid}" ]; then
        existing_backend_cmd="$(ps -o command= -p "${existing_backend_pid}" 2>/dev/null || true)"
        existing_backend_cwd="$(process_cwd "${existing_backend_pid}")"
        echo "Backend port ${SERVER_PORT} is already in use:"
        describe_process "${existing_backend_pid}"

        if echo "${existing_backend_cmd}" | grep -q "qdesigner-server" || [ "${existing_backend_cwd}" = "${SERVER_ROOT}" ]; then
            echo "Stopping existing QDesigner backend on ${BACKEND_URL}..."
            stop_process_group "${existing_backend_pid}"
            wait_for_port_to_clear "${SERVER_PORT}" "backend"
        else
            echo "Refusing to start because ${BACKEND_URL} is owned by a different process." >&2
            exit 1
        fi
    fi

    existing_frontend_pid="$(lsof -t -nP -iTCP:${APP_PORT} -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [ -n "${existing_frontend_pid}" ]; then
        existing_frontend_cmd="$(ps -o command= -p "${existing_frontend_pid}" 2>/dev/null || true)"
        existing_frontend_cwd="$(process_cwd "${existing_frontend_pid}")"
        echo "Frontend port ${APP_PORT} is already in use:"
        describe_process "${existing_frontend_pid}"

        if [ "${existing_frontend_cwd}" = "${REPO_ROOT}" ] && echo "${existing_frontend_cmd}" | grep -Eq "vite|node|pnpm"; then
            echo "Stopping existing QDesigner frontend on ${FRONTEND_URL}..."
            stop_process_group "${existing_frontend_pid}"
            wait_for_port_to_clear "${APP_PORT}" "frontend"
        else
            echo "Refusing to start because ${FRONTEND_URL} is owned by a different process." >&2
            exit 1
        fi
    fi

    echo "Starting backend..."
    setsid bash -lc 'just dev-backend' \
        > >(sed -u 's/^/[backend] /') \
        2> >(sed -u 's/^/[backend] /' >&2) &
    backend_pid=$!
    backend_owned="1"

    echo "Waiting for backend to be ready..."
    for i in $(seq 1 30); do
        if ! kill -0 "${backend_pid}" 2>/dev/null; then
            echo "Backend exited before becoming ready." >&2
            wait "${backend_pid}"
            exit 1
        fi
        if curl -sf "${BACKEND_URL}/health" > /dev/null 2>&1; then
            echo "Backend is up at ${BACKEND_URL}."
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "Backend failed to start after 30 seconds on ${BACKEND_URL}." >&2
            exit 1
        fi
        sleep 1
    done

    echo "Starting frontend on ${FRONTEND_URL}..."
    setsid bash -lc 'just dev-frontend' \
        > >(sed -u 's/^/[frontend] /') \
        2> >(sed -u 's/^/[frontend] /' >&2) &
    frontend_pid=$!
    frontend_owned="1"

    while true; do
        if ! kill -0 "${backend_pid}" 2>/dev/null; then
            echo "Backend exited. Stopping frontend." >&2
            wait "${backend_pid}" || true
            exit 1
        fi
        if ! kill -0 "${frontend_pid}" 2>/dev/null; then
            echo "Frontend exited. Stopping backend." >&2
            wait "${frontend_pid}" || true
            exit 1
        fi
        sleep 1
    done

# Start frontend dev server
dev-frontend:
    pnpm dev:web

# Start backend dev server with auto-reload
dev-backend:
    cd apps/server && cargo watch -x run

# Start docker services (postgres, redis, minio, mailpit)
local-up:
    docker compose up -d --remove-orphans
    @echo "Waiting for services to be healthy..."
    @sleep 3
    @just health-infra || (echo "Some services not ready yet, waiting..." && sleep 5 && just health-infra)

# Stop docker services
local-down:
    docker compose down

# Stop and remove all docker data
local-clean:
    docker compose down -v

# === Database ===

# Run database migrations (backend auto-migrates on start, or run manually)
db-migrate:
    cd apps/server && cargo run -- --migrate-only

# Seed baseline compatibility fixtures
db-seed:
    #!/usr/bin/env bash
    shopt -s nullglob
    for f in apps/server/db/seed/baseline/*.sql; do
        echo "Seeding: $f"
        psql "$DATABASE_URL" -f "$f"
    done

# Seed local development users, organization, and project fixtures
db-seed-test:
    #!/usr/bin/env bash
    shopt -s nullglob
    for f in apps/server/db/seed/test/*.sql; do
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
    cd apps/server && cargo test

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
    cd apps/server && cargo build --release

# Build frontend
build-web:
    pnpm build

# Build all
build-all: build-server build-web

# === Code Quality ===

# Run all linters
lint:
    pnpm lint
    cd apps/server && cargo clippy -- -D warnings

# Fix linting issues
lint-fix:
    pnpm lint:fix
    cd apps/server && cargo clippy --fix --allow-dirty

# Format all code
format:
    pnpm format
    cd apps/server && cargo fmt

# Type check
check:
    pnpm check
    cd apps/server && cargo check

# === Utilities ===

# Check health of local infrastructure dependencies
health-infra:
    #!/usr/bin/env bash
    failed=0

    echo "Checking service health..."

    # PostgreSQL
    if pg_isready -h localhost -p 15434 -U qdesigner > /dev/null 2>&1; then
        echo "  ✓ PostgreSQL"
    else
        echo "  ✗ PostgreSQL"
        failed=1
    fi

    # Redis
    if docker inspect qdesigner-redis 2>/dev/null | jq -r '.[0].State.Health.Status // "unknown"' | grep -q '^healthy$'; then
        echo "  ✓ Redis"
    else
        echo "  ✗ Redis"
        failed=1
    fi

    # MinIO
    if curl -sf http://localhost:19003/minio/health/live > /dev/null 2>&1; then
        echo "  ✓ MinIO"
    else
        echo "  ✗ MinIO"
        failed=1
    fi

    # MailPit
    if curl -sf http://localhost:18026/api/v1/info > /dev/null 2>&1; then
        echo "  ✓ MailPit"
    else
        echo "  ✗ MailPit"
        failed=1
    fi

    exit "${failed}"

# Check health of all services
health:
    #!/usr/bin/env bash
    source .env.development 2>/dev/null || true
    SERVER_PORT="${SERVER_PORT:-4100}"
    BACKEND_URL="http://localhost:${SERVER_PORT}"
    failed=0

    just health-infra || failed=1

    # Backend
    if curl -sf "${BACKEND_URL}/health" > /dev/null 2>&1; then
        echo "  ✓ Backend (${BACKEND_URL})"
    else
        echo "  ✗ Backend (${BACKEND_URL}, not running)"
        failed=1
    fi

    exit "${failed}"

# Generate a JWT token for testing (requires jq)
login-as email password="TestPassword123!":
    #!/usr/bin/env bash
    source .env.development 2>/dev/null || true
    SERVER_PORT="${SERVER_PORT:-4100}"
    BACKEND_URL="http://localhost:${SERVER_PORT}"

    RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -H "X-Requested-With: XMLHttpRequest" \
        -d "{\"email\": \"{{email}}\", \"password\": \"{{password}}\"}")
    TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
        echo "Login failed: $RESPONSE"
    else
        echo "Access token: $TOKEN"
        echo ""
        echo "Usage: curl -H 'Authorization: Bearer $TOKEN' ${BACKEND_URL}/api/auth/me"
    fi

# Install all dependencies
setup:
    pnpm install
    cd apps/server && cargo build
    just local-up
    @sleep 3
    just db-seed
    @echo "Setup complete! Run 'just dev-all' to start."

# Fresh setup (clean + setup)
setup-fresh: local-clean setup
