#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkDatabase() {
  console.log('Checking database...\n');
  
  // Check users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*');
  console.log('Users:', users);
  if (usersError) console.log('Users error:', usersError);
  
  // Check organizations
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('*');
  console.log('\nOrganizations:', orgs);
  if (orgsError) console.log('Organizations error:', orgsError);
  
  // Check projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*');
  console.log('\nProjects:', projects);
  if (projectsError) console.log('Projects error:', projectsError);
  
  // Check questionnaires
  const { data: questionnaires, error: questionnairesError } = await supabase
    .from('questionnaires')
    .select('*');
  console.log('\nQuestionnaires:', questionnaires);
  if (questionnairesError) console.log('Questionnaires error:', questionnairesError);
  
  process.exit(0);
}

checkDatabase();