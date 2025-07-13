import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

console.log('🔨 Running database migrations...');

try {
  // Check if migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('❌ Migrations directory not found:', MIGRATIONS_DIR);
    process.exit(1);
  }

  // Get all SQL files in migrations directory
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    console.log('ℹ️  No migration files found');
    process.exit(0);
  }

  console.log(`📄 Found ${migrationFiles.length} migration file(s)`);

  // Run each migration
  for (const file of migrationFiles) {
    console.log(`  → Running ${file}...`);
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    try {
      // Use cat and pipe to execute SQL
      execSync(
        `cat ${filePath} | docker-compose exec -T supabase-db psql -U postgres -d postgres`,
        { stdio: 'inherit' }
      );
      console.log(`  ✅ ${file} completed`);
    } catch (error) {
      console.error(`  ❌ ${file} failed:`, error instanceof Error ? error.message : String(error));
      // Continue with other migrations
    }
  }

  console.log('\n✅ Migrations completed');
} catch (error) {
  console.error('❌ Migration error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}