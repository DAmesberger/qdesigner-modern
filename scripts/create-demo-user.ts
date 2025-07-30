import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.development') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Create admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createDemoUser() {
  console.log('🔑 Creating demo user...');

  try {
    // Create demo user in Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: 'demo@example.com',
      password: 'demo123456',
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: 'Demo User'
      }
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        console.log('ℹ️  Demo user already exists in Auth');
        
        // Get the existing user
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;
        
        const existingUser = users.find(u => u.email === 'demo@example.com');
        if (existingUser) {
          console.log('✅ Demo user found:', existingUser.email);
          console.log('   ID:', existingUser.id);
        }
      } else {
        throw authError;
      }
    } else {
      console.log('✅ Demo user created in Auth');
      console.log('   Email: demo@example.com');
      console.log('   Password: demo123456');
      console.log('   ID:', authUser.user.id);
    }

    console.log('\n📝 You can now login with:');
    console.log('   Email: demo@example.com');
    console.log('   Password: demo123456');

  } catch (error) {
    console.error('❌ Error creating demo user:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

createDemoUser();