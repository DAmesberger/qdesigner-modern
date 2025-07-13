import { createClient } from '@supabase/supabase-js';

// Database types (should be generated from database schema)
export interface Tables {
  organizations: {
    id: string;
    name: string;
    slug: string;
    domain?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
  };
  users: {
    id: string;
    email: string;
    name?: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
  };
  organization_members: {
    organization_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    created_at: string;
  };
  projects: {
    id: string;
    organization_id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
  };
  questionnaire_definitions: {
    id: string;
    project_id: string;
    name: string;
    description?: string;
    version: number;
    content: any; // JSONB
    created_by: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
  };
  sessions: {
    id: string;
    questionnaire_id: string;
    participant_id?: string;
    status: 'active' | 'completed' | 'abandoned';
    started_at: string;
    completed_at?: string;
    metadata?: any; // JSONB
  };
  responses: {
    id: string;
    session_id: string;
    question_id: string;
    value: any; // JSONB
    reaction_time?: number; // microseconds
    created_at: string;
  };
}

// Type for inserting records - makes all fields optional except for required ones
export type Inserts<T extends keyof Tables> = Partial<Tables[T]>;

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