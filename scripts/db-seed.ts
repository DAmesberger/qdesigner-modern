import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, '..', 'supabase', 'seed.sql');

console.log('🌱 Seeding database...');

try {
  // Check if seed file exists
  if (!fs.existsSync(SEED_FILE)) {
    console.log('ℹ️  No seed file found at:', SEED_FILE);
    process.exit(0);
  }

  // Run seed file
  console.log('📄 Running seed file...');
  
  try {
    // First, read the file to check if it's not empty
    const seedContent = fs.readFileSync(SEED_FILE, 'utf8');
    if (!seedContent.trim()) {
      console.log('ℹ️  Seed file is empty');
      process.exit(0);
    }

    // Execute the seed file
    execSync(
      `docker-compose exec -T supabase-db psql -U postgres -d postgres < ${SEED_FILE}`,
      { stdio: 'inherit' }
    );
    
    console.log('✅ Database seeded successfully');
  } catch (error) {
    if (error.status === 0) {
      // Sometimes psql returns 0 even with notices
      console.log('✅ Database seeded (with notices)');
    } else {
      throw error;
    }
  }
} catch (error) {
  console.error('❌ Seeding error:', error.message);
  process.exit(1);
}