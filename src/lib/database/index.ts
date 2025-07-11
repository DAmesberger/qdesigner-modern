export {
  createSupabaseClient,
  createSupabaseAdmin,
  getSupabaseClient,
  type SupabaseConfig,
  type TypedSupabaseClient,
} from './client';

export type { Database } from './types/database.types';

// Export commonly used Supabase types
export type { User, Session } from '@supabase/supabase-js';