import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types/database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

let supabaseClient: TypedSupabaseClient | null = null;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  options?: {
    auth?: {
      autoRefreshToken?: boolean;
      persistSession?: boolean;
      detectSessionInUrl?: boolean;
    };
    realtime?: {
      params?: {
        eventsPerSecond?: number;
      };
    };
    global?: {
      headers?: Record<string, string>;
    };
  };
}

export function createSupabaseClient(config: SupabaseConfig): TypedSupabaseClient {
  if (!config.url || !config.anonKey) {
    throw new Error('Supabase URL and anonymous key are required');
  }

  supabaseClient = createClient<Database>(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      ...config.options?.auth,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
        ...config.options?.realtime?.params,
      },
    },
    global: config.options?.global,
  });

  return supabaseClient;
}

export function getSupabaseClient(): TypedSupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call createSupabaseClient first.');
  }
  return supabaseClient;
}

// Admin client for server-side operations
export function createSupabaseAdmin(config: { url: string; serviceKey: string }): TypedSupabaseClient {
  return createClient<Database>(config.url, config.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}