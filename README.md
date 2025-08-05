# QDesigner Modern

A modern, high-performance questionnaire platform built with Svelte, TypeScript, and WebGL 2.0. Features a sophisticated designer interface with real-time persistence to Supabase.

## ✨ Features

- **🎨 Visual Questionnaire Designer**: Drag-and-drop interface with real-time preview
- **💾 Cloud Persistence**: Automatic save/load with Supabase integration
- **⚡ WebGL 2.0 Rendering**: 120+ FPS support for precise reaction time measurements
- **🧮 Sophisticated Variable System**: Mathematical formulas, dependencies, and custom functions
- **🎬 Multimedia Stimuli**: Support for images, videos, audio, and composite stimuli
- **⏱️ High-Precision Timing**: Microsecond-accurate response collection
- **🚀 Modern Stack**: Svelte 5, TypeScript, Tailwind CSS, Vite, Supabase

## 🏗️ Architecture

This is a monorepo managed with pnpm workspaces:

```
qdesigner-modern/
├── apps/
│   ├── designer/           # Main designer application
│   ├── fillout/           # Questionnaire runtime (planned)
│   └── admin/             # Admin interface (planned)
├── packages/
│   ├── api/               # Backend API server
│   ├── database/          # Supabase client and types
│   ├── renderer/          # WebGL 2.0 rendering engine
│   ├── scripting-engine/  # Variable system & formula evaluation
│   └── shared/            # Shared types and utilities
├── supabase/
│   └── migrations/        # Database schema
└── docs/                  # Technical documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker and Docker Compose

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd qdesigner-modern

# Install dependencies
pnpm install

# First-time setup (creates database, runs migrations, seeds data)
pnpm dev:setup

# Start development (Supabase + app)
pnpm dev:full
```

That's it! No manual configuration needed. The development environment includes:
- 🐘 PostgreSQL database (via Supabase)
- 🔐 Authentication service
- 📦 File storage
- 📧 Email testing (Mailhog)

### Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| App | http://localhost:5173 | QDesigner application |
| Supabase | http://localhost:54321 | Database management UI |
| Mailhog | http://localhost:8025 | Email testing interface |

### Test Credentials

For local development, you can use the following test account:

- **Email**: `demo@example.com`
- **Password**: `demo123456`

#### Auto-Login Test Mode

For faster development, enable test mode to automatically log in as the demo user:

```javascript
// In browser console (dev mode only):
window.testMode.enable()   // Enable auto-login
window.testMode.disable()  // Disable auto-login
```

When enabled, navigating to protected routes automatically logs you in.

## 📝 Variable System

The variable system supports complex formulas with:

- **Basic Operations**: `+`, `-`, `*`, `/`, `^`, `sqrt()`, etc.
- **Conditional Logic**: `IF(condition, trueValue, falseValue)`
- **Array Functions**: `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()`
- **String Functions**: `CONCAT()`, `LENGTH()`
- **Time Functions**: `NOW()`, `TIME_SINCE()`
- **Random Functions**: `RANDOM()`, `RANDINT(min, max)`

Example formula:
```javascript
IF(reactionTime < 300, "Fast", IF(reactionTime < 500, "Normal", "Slow"))
```

## 🎯 Question Types

- **Text/Instructions**: Display information or instructions
- **Choice Questions**: Single/multiple choice with customizable options
- **Scale Questions**: Likert scales, sliders, visual analog scales
- **Reaction Tests**: High-precision timing tasks with WebGL rendering
- **Multimedia Questions**: Image/video/audio stimuli presentation
- **Matrix Questions**: Grid-based questions for complex data collection

## 📊 Data Collection

- ⏱️ Microsecond-precision timing for all responses
- ⌨️ Complete keystroke logging with timestamps
- 🖱️ Optional mouse tracking and click coordinates
- 📝 Response history and corrections
- 🔄 Automatic variable computation and updates
- 💾 Real-time data persistence to Supabase

## 🛠️ Development Commands

```bash
# Start everything (recommended)
pnpm dev:full

# Start only the app (if services are already running)
pnpm dev

# Manage Supabase services
pnpm dev:services        # Start services
pnpm dev:services:down   # Stop services
pnpm dev:services:logs   # View logs

# Testing
pnpm test               # Run unit tests
pnpm test:e2e          # Run E2E tests
pnpm test:coverage     # Generate coverage report

# Code quality
pnpm lint              # Check linting
pnpm lint:fix          # Auto-fix issues
pnpm format            # Format code
pnpm check             # Type checking
```

## 🐳 Docker Support

```bash
# Development with Docker
docker-compose up qdesigner-dev

# Production build
docker-compose up qdesigner-prod

# Run specific services
docker-compose up supabase-db supabase-auth
```

## 📚 Documentation

- [Development Setup](docs/DEVELOPMENT.md) - Detailed development environment guide
- [Designer Overview](docs/DESIGNER_OVERVIEW.md) - Architecture of the designer interface
- [Runtime Architecture](docs/RUNTIME_ARCHITECTURE.md) - How questionnaires are executed
- [Precise Timing](docs/PRECISE_TIMING.md) - Technical details on timing precision

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

See LICENSE file for details.