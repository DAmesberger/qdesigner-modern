import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: string;
}

export class SupabaseTestInstance {
  private schema: string;
  public client: SupabaseClient;
  public serviceClient: SupabaseClient;
  private users: TestUser[] = [];
  
  constructor(private testName: string) {
    // Create unique schema name for test isolation
    this.schema = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create client with anon key for regular operations
    this.client = createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );
    
    // Create service client for admin operations
    this.serviceClient = createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        db: {
          schema: this.schema
        }
      }
    );
  }
  
  async setup() {
    console.log(`🔧 Setting up test database for: ${this.testName}`);
    
    try {
      // Create isolated schema
      const { error: schemaError } = await this.serviceClient.rpc('create_schema', {
        schema_name: this.schema
      });
      
      if (schemaError) {
        // If function doesn't exist, create schema directly
        await this.serviceClient.from('_test_helper').select('*').limit(1);
        await this.runSQL(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      }
      
      // Run migrations in the test schema
      await this.runMigrations();
      
      // Set up RLS policies for test schema
      await this.setupRLS();
      
      console.log(`✅ Test database ready: ${this.schema}`);
    } catch (error) {
      console.error('Failed to setup test database:', error);
      throw error;
    }
  }
  
  async cleanup() {
    console.log(`🧹 Cleaning up test database: ${this.schema}`);
    
    try {
      // Sign out all test users
      for (const user of this.users) {
        await this.client.auth.signOut();
      }
      
      // Drop the test schema
      await this.runSQL(`DROP SCHEMA IF EXISTS ${this.schema} CASCADE`);
      
      console.log(`✅ Test database cleaned up: ${this.schema}`);
    } catch (error) {
      console.error('Failed to cleanup test database:', error);
      // Don't throw - cleanup errors shouldn't fail tests
    }
  }
  
  async createTestUser(options: {
    email?: string;
    password?: string;
    role?: 'owner' | 'admin' | 'editor' | 'viewer' | 'participant';
    organizationId?: string;
  } = {}) {
    const email = options.email || `test_${Date.now()}@example.com`;
    const password = options.password || 'Test123456!';
    const role = options.role || 'participant';
    
    // Create user via service client
    const { data: authData, error: authError } = await this.serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        organizationId: options.organizationId
      }
    });
    
    if (authError) throw authError;
    
    const user: TestUser = {
      id: authData.user!.id,
      email,
      password,
      role
    };
    
    this.users.push(user);
    
    // Create user profile
    const { error: profileError } = await this.serviceClient
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        name: `Test User ${this.users.length}`,
        role: user.role,
        organization_id: options.organizationId
      });
      
    if (profileError) throw profileError;
    
    return user;
  }
  
  async signIn(user: TestUser) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: user.email,
      password: user.password
    });
    
    if (error) throw error;
    return data;
  }
  
  async createTestOrganization(name?: string) {
    const { data, error } = await this.serviceClient
      .from('organizations')
      .insert({
        name: name || `Test Org ${Date.now()}`,
        slug: `test-org-${Date.now()}`
      })
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }
  
  async createTestProject(organizationId: string, name?: string) {
    const { data, error } = await this.serviceClient
      .from('projects')
      .insert({
        organization_id: organizationId,
        name: name || `Test Project ${Date.now()}`,
        description: 'Created for testing'
      })
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }
  
  async createTestQuestionnaire(projectId: string, userId: string, definition?: any) {
    const defaultDefinition = {
      name: `Test Questionnaire ${Date.now()}`,
      description: 'Created for testing',
      version: 1,
      pages: [{
        id: `page_${Date.now()}`,
        title: 'Test Page',
        blocks: [],
        order: 0
      }],
      questions: [],
      variables: [],
      settings: {}
    };
    
    const { data, error } = await this.serviceClient
      .from('questionnaire_definitions')
      .insert({
        project_id: projectId,
        name: definition?.name || defaultDefinition.name,
        code: `TEST_${Date.now()}`,
        version: 1,
        definition: definition || defaultDefinition,
        created_by: userId,
        is_active: false
      })
      .select()
      .single();
      
    if (error) throw error;
    return data;
  }
  
  private async runMigrations() {
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
    const migrations = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
      
    for (const migration of migrations) {
      const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
      // Replace schema references
      const testSql = sql
        .replace(/public\./g, `${this.schema}.`)
        .replace(/CREATE TABLE /g, `CREATE TABLE ${this.schema}.`)
        .replace(/ALTER TABLE /g, `ALTER TABLE ${this.schema}.`)
        .replace(/CREATE INDEX /g, `CREATE INDEX ON ${this.schema}.`);
        
      await this.runSQL(testSql);
    }
  }
  
  private async setupRLS() {
    // Enable RLS on all tables in test schema
    const tables = [
      'organizations', 'users', 'projects', 'questionnaire_definitions',
      'questionnaire_responses', 'response_data', 'media_files'
    ];
    
    for (const table of tables) {
      await this.runSQL(`ALTER TABLE ${this.schema}.${table} ENABLE ROW LEVEL SECURITY`);
    }
  }
  
  private async runSQL(sql: string) {
    // Use service client to run raw SQL
    const { error } = await this.serviceClient.rpc('exec_sql', {
      sql_query: sql
    }).single();
    
    if (error && !error.message.includes('already exists')) {
      throw error;
    }
  }
  
  // Helper to get client with specific user context
  getClientForUser(user: TestUser) {
    return createClient(
      process.env.SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        db: {
          schema: this.schema
        },
        global: {
          headers: {
            Authorization: `Bearer ${user.id}` // Simplified for testing
          }
        }
      }
    );
  }
  
  // Utility to wait for real-time updates
  async waitForRealtimeUpdate(table: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Realtime update timeout for table: ${table}`));
      }, timeout);
      
      const subscription = this.client
        .channel(`test-${table}`)
        .on('postgres_changes', {
          event: '*',
          schema: this.schema,
          table
        }, (payload) => {
          clearTimeout(timer);
          subscription.unsubscribe();
          resolve(payload);
        })
        .subscribe();
    });
  }
}