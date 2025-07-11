# QDesigner Modern - Development Setup Guide

## Prerequisites
- Docker and Docker Compose
- Node.js 18+ and pnpm
- Git

## Quick Start

### Option 1: Full Supabase Stack with Kong (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd qdesigner-modern
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Start all Supabase services with Kong**
   ```bash
   docker-compose -f docker-compose.kong.yml up -d
   ```

4. **Wait for services to initialize**
   ```bash
   # Check all services are running
   docker-compose -f docker-compose.kong.yml ps
   
   # View logs if needed
   docker-compose -f docker-compose.kong.yml logs -f kong
   ```

5. **Install dependencies**
   ```bash
   pnpm install
   ```

6. **Start the development server**
   ```bash
   pnpm dev
   ```

### Option 2: Minimal Setup (Without Kong)

1. **Use the simplified docker-compose**
   ```bash
   docker-compose up -d supabase-db supabase-auth
   ```

2. **Update .env to use port 54321**
   ```env
   VITE_SUPABASE_URL=http://localhost:54321
   ```

3. **Note**: This setup requires the custom fetch configuration in `supabase.ts`

## Environment Configuration

### Required Environment Variables

Create a `.env` file with these variables:

```env
# Vite requires VITE_ prefix for client-side env vars
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Database
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres

# JWT Secret (must be at least 32 characters)
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long

# Supabase Keys
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# URLs
API_EXTERNAL_URL=http://localhost:54321
SITE_URL=http://localhost:5173

# Email Configuration (using mailhog for dev)
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
SMTP_ADMIN_EMAIL=admin@qdesigner.local
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_SENDER_NAME=QDesigner Dev
```

## Key Benefits of Kong Setup

- **Production-like environment** - Matches Supabase cloud architecture
- **Automatic CORS handling** - No need for workarounds
- **Standard Supabase endpoints** - Use `/auth/v1/*` like in production
- **API key validation** - Proper security from the start
- **Ready for additional services** - Easy to add Storage, Realtime, etc.

## Creating Test Users

### Option 1: Using the API

```bash
# Create a test user
curl -X POST http://localhost:54321/auth/v1/signup \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### Option 2: Direct Database Insert

```bash
docker-compose exec supabase-db psql -U postgres -c "
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at) 
VALUES ('test@example.com', crypt('testpassword123', gen_salt('bf')), NOW());"
```

### Option 3: Using the provided script

```bash
pnpm db:create-test-user
```

## Troubleshooting

### Port Conflicts
If port 5173 is already in use:
1. Kill the process: `lsof -ti:5173 | xargs kill -9`
2. Or use a different port: `pnpm dev --port 5174`

### Supabase Connection Issues
1. Check logs: `docker-compose logs -f supabase-auth`
2. Verify services are running: `docker-compose ps`
3. Ensure environment variables are loaded: Check for `.env` file

### CORS Errors
1. Check browser console for specific CORS errors
2. Verify the origin in error matches your dev server URL
3. Try clearing browser cache and cookies
4. Use browser incognito mode to test

### Database Issues
1. Reset database: `docker-compose down -v && docker-compose up -d`
2. Re-run migrations: `pnpm db:migrate`
3. Check logs: `docker-compose logs -f supabase-db`

## Development Workflow

1. **Start all services**: `pnpm dev:all`
2. **Watch logs**: `pnpm services:logs`
3. **Run tests**: `pnpm test`
4. **Type checking**: `pnpm check`
5. **Linting**: `pnpm lint`

## VS Code Setup

Install recommended extensions:
- Svelte for VS Code
- Tailwind CSS IntelliSense
- ESLint
- Prettier

## Next Steps

1. Access the app at http://localhost:5173
2. Sign in with test credentials or create a new account
3. Explore the three main routes:
   - `/designer` - Questionnaire designer
   - `/fillout` - Participant interface
   - `/admin` - Admin dashboard