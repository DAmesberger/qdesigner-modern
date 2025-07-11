# Database Migration Guide

This guide explains how to update your Supabase database with the new multi-tenant schema.

## ⚠️ WARNING

This migration will **DELETE ALL EXISTING DATA**. Make sure to backup any important data before proceeding.

## Prerequisites

- Supabase CLI installed (`npm install -g supabase`)
- Access to your Supabase project

## Migration Steps

### 1. Backup Existing Data (if needed)

If you have any data you want to keep, export it first:

```bash
# Export data using Supabase dashboard or pg_dump
```

### 2. Reset Local Database

For local development:

```bash
# Stop Supabase if running
npx supabase stop

# Reset the database (this will apply the new init.sql)
npx supabase db reset

# Start Supabase again
npx supabase start
```

### 3. Update Remote Database (Production)

For production database, you have two options:

#### Option A: Complete Reset (Recommended for new projects)

1. Go to your Supabase dashboard
2. Navigate to Settings > Database
3. Click "Reset database" (this will delete everything)
4. Run the new schema:

```bash
# Push the new schema to remote
npx supabase db push
```

#### Option B: Manual Migration (For existing projects with data)

This requires careful planning. Contact Supabase support for assistance with major schema changes.

## What Changed?

### Authentication Flow

The login process now includes:

1. **User Creation**: When a user signs up, a record is created in the `users` table linked to Supabase Auth
2. **Organization Check**: After login, the system checks if the user belongs to any organization
3. **Onboarding**: New users without an organization are redirected to `/onboarding/organization`

### New Tables

- `organizations`: Multi-tenant top-level isolation
- `organization_members`: User membership and roles
- `projects`: Projects within organizations  
- `project_members`: Project-level access control
- `participants`: Separate from users, for study participants
- `sessions`: Replaces `response_sessions`
- Many more for analytics, audit logs, etc.

### Updated Authentication Code

The login page now:
- Syncs authenticated users with the `users` table
- Checks for organization membership
- Redirects to onboarding if no organization exists

## Testing the New Schema

1. Create a new user account
2. You should be redirected to the organization setup page
3. Create an organization
4. You'll be redirected to the dashboard
5. Check the database to verify:
   - User record exists in `users` table
   - Organization exists in `organizations` table
   - User is a member with 'owner' role in `organization_members`

## Troubleshooting

### "relation does not exist" errors

Make sure you've run the database reset:
```bash
npx supabase db reset
```

### Authentication errors

1. Clear your browser's local storage
2. Make sure the auth helpers are imported correctly
3. Check that RLS policies are applied

### Permission errors

The new schema has Row Level Security (RLS) enabled. Make sure:
- You're authenticated
- Your user has the appropriate role
- The RLS policies are correctly applied

## Next Steps

After migration:

1. Update your application code to use the new table structure
2. Update any API calls to match the new schema
3. Test all authentication flows
4. Set up your first project in the system
5. Configure role-based access for your team

## Rollback Plan

If you need to rollback:

1. Keep a backup of your old schema
2. You can restore it using:
```bash
psql -h [host] -U [user] -d [database] < backup.sql
```

Remember: This is a major architectural change. Test thoroughly in development before applying to production!