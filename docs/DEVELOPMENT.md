# Development Setup

QDesigner Modern is a modern monorepo using industry-standard tools and practices.

## Prerequisites

- Node.js 20+
- pnpm 8+ (`npm install -g pnpm@8`)
- Docker and Docker Compose
- Git

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd qdesigner-modern

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# First-time setup (starts services, runs migrations, seeds data)
pnpm setup

# Start development
pnpm dev:all
```

## Development Commands

### 🚀 Starting Development

```bash
# Start everything (recommended)
pnpm dev:all              # Starts services + all apps with proper logging

# Start individual apps
pnpm dev:designer         # Just the designer app
pnpm dev:api             # Just the API server
pnpm dev                 # All apps in parallel (basic)

# Manage services
pnpm services:start      # Start Docker services
pnpm services:stop       # Stop Docker services
pnpm services:logs       # View service logs
```

### 🗄️ Database Management

```bash
# Run migrations
pnpm db:migrate          # Apply database migrations

# Seed data
pnpm db:seed            # Insert test data

# Reset database
pnpm db:reset           # Drop, recreate, migrate, and seed

# Clean setup
pnpm setup:clean        # Complete fresh start
```

### 🧪 Testing

```bash
# Unit tests
pnpm test               # Run all tests
pnpm test:unit          # Run unit tests once
pnpm test:unit:watch    # Run tests in watch mode
pnpm test:coverage      # Generate coverage report

# E2E tests
pnpm test:e2e           # Run Playwright tests
pnpm test:e2e:ui        # Open Playwright UI
pnpm test:e2e:debug     # Debug mode
pnpm test:wysiwyg       # Run WYSIWYG tests specifically
```

### 🔍 Code Quality

```bash
# Linting
pnpm lint               # Check for lint errors
pnpm lint:fix           # Auto-fix lint errors

# Formatting
pnpm format             # Format all files
pnpm format:check       # Check formatting

# Type checking
pnpm typecheck          # Run TypeScript checks
```

### 🏗️ Building

```bash
# Build everything
pnpm build              # Build all packages and apps

# Build specific targets
pnpm build:packages     # Build shared packages
pnpm build:designer     # Build designer app

# Clean builds
pnpm clean              # Remove build artifacts
pnpm clean:all          # Remove everything (including node_modules)
```

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| App | http://localhost:5173 | QDesigner application |
| Supabase Studio | http://localhost:54321 | Database management UI |
| Mailhog | http://localhost:8025 | Email testing interface |
| PostgreSQL | localhost:54322 | Database connection |

## Default Credentials

The development environment uses these default values:

- **Supabase URL**: `http://localhost:54321`
- **Supabase Anon Key**: See `.env.development`
- **Test Users**:
  - admin@test.com (Admin role)
  - designer@test.com (Designer role)

## Environment Variables

Development environment variables are automatically loaded from:
- `.env.development` - Shared development settings
- `apps/designer/.env` - App-specific settings

No manual configuration needed!

## Troubleshooting

### Services won't start
```bash
# Reset everything
docker-compose down -v
pnpm dev:setup
```

### Database connection issues
```bash
# Check if services are running
docker-compose ps

# View logs
pnpm dev:services:logs
```

### Port conflicts
If ports are already in use, stop conflicting services or modify `docker-compose.yml`.

## Architecture

The development setup includes:
- **PostgreSQL 15**: Main database
- **Supabase Auth**: Authentication service
- **Supabase Realtime**: WebSocket connections
- **Supabase Storage**: File storage
- **Mailhog**: Email testing

All services are configured to work together automatically with no manual setup required.