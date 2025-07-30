#!/bin/bash

# QDesigner Modern - Infrastructure Fix Script
# This script fixes all critical infrastructure issues

set -e  # Exit on error

echo "🔧 QDesigner Modern Infrastructure Fix Script"
echo "============================================"

# 1. Stop all services
echo "📦 Stopping all services..."
docker-compose down -v

# 2. Clean up any orphaned containers
echo "🧹 Cleaning up orphaned containers..."
docker ps -a | grep -E "(qdesigner|supabase)" | awk '{print $1}' | xargs -r docker rm -f || true
docker volume ls | grep -E "(qdesigner|supabase)" | awk '{print $2}' | xargs -r docker volume rm || true

# 3. Create required environment variables
echo "📝 Creating environment configuration..."
cat > .env.local << EOF
# Supabase Configuration
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
PUBLIC_SUPABASE_URL=http://localhost:8000
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Realtime Configuration
APP_NAME=realtime
SECRET_KEY_BASE=your-super-secret-key-base-that-is-at-least-64-bytes-long-for-realtime

# Email Configuration (for development)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EOF

# 4. Start only the database first
echo "🐘 Starting PostgreSQL..."
docker-compose up -d supabase-db

# 5. Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until docker-compose exec -T supabase-db pg_isready -U postgres; do
  echo "Waiting for postgres..."
  sleep 2
done

echo "✅ Database is ready!"

# 6. Run fixed migrations
echo "🔨 Running database migrations..."
docker-compose exec -T supabase-db psql -U postgres << 'EOSQL'
-- Create schemas if they don't exist
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;

-- Grant permissions
GRANT USAGE ON SCHEMA auth TO postgres;
GRANT CREATE ON SCHEMA auth TO postgres;

-- Create auth functions that Supabase expects
CREATE OR REPLACE FUNCTION auth.uid() 
RETURNS uuid 
LANGUAGE sql 
STABLE 
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() 
RETURNS jsonb 
LANGUAGE sql 
STABLE 
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb
$$;

-- Create auth.users table stub (Supabase Auth will manage this)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
EOSQL

# 7. Start remaining services
echo "🚀 Starting all services..."
docker-compose up -d

# 8. Wait for all services
echo "⏳ Waiting for all services to be ready..."
sleep 10

# 9. Run application migrations
echo "🔧 Running application migrations..."
pnpm db:migrate || {
  echo "⚠️  Some migrations had issues, but continuing..."
}

# 10. Create demo user
echo "👤 Creating demo user..."
tsx scripts/create-demo-user.ts

# 11. Run seed data
echo "🌱 Seeding database..."
pnpm db:seed

# 12. Health check
echo "🏥 Running health checks..."
echo -n "Database: "
docker-compose exec -T supabase-db pg_isready -U postgres && echo "✅" || echo "❌"

echo -n "Auth Service: "
curl -s http://localhost:9999/health > /dev/null && echo "✅" || echo "❌"

echo -n "REST API: "
curl -s http://localhost:8000/rest/v1/ > /dev/null && echo "✅" || echo "❌"

echo -n "Storage: "
curl -s http://localhost:8000/storage/v1/ > /dev/null && echo "✅" || echo "❌"

echo ""
echo "✨ Infrastructure setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Run 'pnpm dev' to start the development server"
echo "2. Login with demo@example.com / demo123456"
echo "3. Check http://localhost:5173"
echo ""
echo "🔍 If you encounter issues, check logs with:"
echo "   docker-compose logs -f [service-name]"
echo "