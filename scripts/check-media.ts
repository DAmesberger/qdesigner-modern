#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://localhost:54321';
// Use service role key for full access
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMedia() {
  console.log('Checking media assets...\n');
  
  // Check media assets table
  const { data: assets, error: assetsError } = await supabase
    .from('media_assets')
    .select('*')
    .limit(10);
    
  if (assetsError) {
    console.error('Error fetching media assets:', assetsError);
  } else {
    console.log(`Found ${assets?.length || 0} media assets:`);
    assets?.forEach(asset => {
      console.log(`- ID: ${asset.id}`);
      console.log(`  Filename: ${asset.filename}`);
      console.log(`  MIME Type: ${asset.mime_type}`);
      console.log(`  Storage Path: ${asset.storage_path}`);
      console.log(`  Organization: ${asset.organization_id}`);
      console.log('');
    });
  }
  
  // Check storage buckets
  console.log('\nChecking storage buckets...');
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  
  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError);
  } else {
    console.log(`Found ${buckets?.length || 0} buckets:`);
    buckets?.forEach(bucket => {
      console.log(`- ${bucket.name} (${bucket.public ? 'public' : 'private'})`);
    });
  }
  
  // Check files in media bucket
  console.log('\nChecking files in media bucket...');
  
  // List organization folders
  const { data: orgFolders, error: orgError } = await supabase.storage
    .from('media')
    .list('', { limit: 10 });
    
  if (orgError) {
    console.error('Error listing organization folders:', orgError);
  } else {
    console.log(`Found ${orgFolders?.length || 0} organization folders`);
    
    // For each org folder, list user folders
    for (const orgFolder of orgFolders || []) {
      console.log(`\nOrganization: ${orgFolder.name}`);
      const { data: userFolders } = await supabase.storage
        .from('media')
        .list(orgFolder.name, { limit: 10 });
        
      for (const userFolder of userFolders || []) {
        console.log(`  User: ${userFolder.name}`);
        const { data: files } = await supabase.storage
          .from('media')
          .list(`${orgFolder.name}/${userFolder.name}`, { limit: 10 });
          
        files?.forEach(file => {
          console.log(`    - ${file.name}`);
        });
      }
    }
  }
  
  // Check if specific files exist
  console.log('\nChecking if specific media files exist in storage...');
  if (assets && assets.length > 0) {
    for (const asset of assets) {
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('media')
        .download(asset.storage_path);
        
      if (downloadError) {
        console.log(`❌ File not found: ${asset.storage_path}`);
        console.log(`   Error: ${downloadError.message}`);
      } else {
        console.log(`✅ File exists: ${asset.storage_path} (${downloadData.size} bytes)`);
      }
    }
  }
}

checkMedia().catch(console.error);