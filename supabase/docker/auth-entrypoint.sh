#!/bin/sh
# Custom entrypoint for GoTrue that ensures migrations are skipped

echo "Starting GoTrue with migrations disabled..."

# Set environment variable to disable auto-migration
export GOTRUE_DB_AUTO_MIGRATE=false

# Start the auth service
exec /usr/local/bin/auth