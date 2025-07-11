#!/bin/bash

# Reset Supabase Database Script
# WARNING: This will delete all existing data!

echo "⚠️  WARNING: This will completely reset your database!"
echo "All existing data will be lost."
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Operation cancelled."
    exit 1
fi

echo "🔄 Resetting Supabase database..."

# Reset the local database
npx supabase db reset

echo "✅ Database reset complete!"
echo ""
echo "Next steps:"
echo "1. Check that all tables were created correctly"
echo "2. Update your application code for the new schema"
echo "3. Test the authentication flow"