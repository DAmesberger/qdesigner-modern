import { createClient } from '@supabase/supabase-js';

// Get environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Create and export the Supabase client
// With Kong API Gateway, we can use standard Supabase configuration
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'qdesigner-auth',
    autoRefreshToken: true,
  }
});