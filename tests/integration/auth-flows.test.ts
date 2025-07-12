import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { SupabaseTestInstance } from '../utils/supabase-test';
import { createClient } from '@supabase/supabase-js';

describe('Authentication Flows Integration Tests', () => {
  let testDb: SupabaseTestInstance;
  let testOrg: any;
  
  beforeAll(async () => {
    testDb = new SupabaseTestInstance('auth-flows-tests');
    await testDb.setup();
    
    // Create test organization
    testOrg = await testDb.createTestOrganization('Auth Test Organization');
  });
  
  afterAll(async () => {
    await testDb.cleanup();
  });
  
  beforeEach(async () => {
    // Clean up any existing sessions
    await testDb.client.auth.signOut();
  });
  
  describe('User Registration', () => {
    it('should register new user with email/password', async () => {
      const email = `test_${Date.now()}@example.com`;
      const password = 'TestPassword123!';
      
      // Register user
      const { data, error } = await testDb.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: 'Test User',
            role: 'participant'
          }
        }
      });
      
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user?.email).toBe(email);
      expect(data.user?.user_metadata.name).toBe('Test User');
      expect(data.user?.user_metadata.role).toBe('participant');
      
      // Verify user profile was created
      const { data: profile } = await testDb.serviceClient
        .from('users')
        .select('*')
        .eq('id', data.user!.id)
        .single();
        
      expect(profile).toBeDefined();
      expect(profile.email).toBe(email);
      expect(profile.name).toBe('Test User');
      expect(profile.role).toBe('participant');
    });
    
    it('should prevent duplicate email registration', async () => {
      const email = `duplicate_${Date.now()}@example.com`;
      const password = 'TestPassword123!';
      
      // First registration
      await testDb.client.auth.signUp({ email, password });
      
      // Attempt duplicate registration
      const { data, error } = await testDb.client.auth.signUp({ 
        email, 
        password: 'DifferentPassword123!' 
      });
      
      expect(error).toBeDefined();
      expect(error?.message).toContain('already registered');
    });
    
    it('should validate password requirements', async () => {
      const email = `weak_pass_${Date.now()}@example.com`;
      
      // Test weak passwords
      const weakPasswords = [
        'short',           // Too short
        'alllowercase',    // No uppercase or numbers
        'ALLUPPERCASE',    // No lowercase or numbers
        'NoNumbers!',      // No numbers
        '12345678',        // No letters
      ];
      
      for (const password of weakPasswords) {
        const { error } = await testDb.client.auth.signUp({ email, password });
        expect(error).toBeDefined();
        expect(error?.message).toMatch(/password/i);
      }
    });
  });
  
  describe('User Login', () => {
    it('should login with valid credentials', async () => {
      // Create test user
      const user = await testDb.createTestUser({
        email: `login_test_${Date.now()}@example.com`,
        password: 'ValidPassword123!'
      });
      
      // Login
      const { data, error } = await testDb.client.auth.signInWithPassword({
        email: user.email,
        password: user.password
      });
      
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user?.id).toBe(user.id);
      expect(data.session).toBeDefined();
      expect(data.session?.access_token).toBeDefined();
      expect(data.session?.refresh_token).toBeDefined();
    });
    
    it('should fail login with invalid credentials', async () => {
      const user = await testDb.createTestUser({
        email: `invalid_login_${Date.now()}@example.com`,
        password: 'ValidPassword123!'
      });
      
      // Wrong password
      const { error: wrongPassError } = await testDb.client.auth.signInWithPassword({
        email: user.email,
        password: 'WrongPassword123!'
      });
      
      expect(wrongPassError).toBeDefined();
      expect(wrongPassError?.message).toContain('Invalid login credentials');
      
      // Non-existent email
      const { error: wrongEmailError } = await testDb.client.auth.signInWithPassword({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!'
      });
      
      expect(wrongEmailError).toBeDefined();
    });
    
    it('should handle session refresh', async () => {
      const user = await testDb.createTestUser();
      
      // Login
      const { data: loginData } = await testDb.client.auth.signInWithPassword({
        email: user.email,
        password: user.password
      });
      
      const originalAccessToken = loginData.session?.access_token;
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh session
      const { data: refreshData, error } = await testDb.client.auth.refreshSession();
      
      expect(error).toBeNull();
      expect(refreshData.session).toBeDefined();
      expect(refreshData.session?.access_token).toBeDefined();
      expect(refreshData.session?.access_token).not.toBe(originalAccessToken);
    });
  });
  
  describe('Role-Based Access Control', () => {
    it('should enforce organization membership for editors', async () => {
      // Create editor user
      const editor = await testDb.createTestUser({
        role: 'editor',
        organizationId: testOrg.id
      });
      
      // Sign in as editor
      await testDb.signIn(editor);
      const client = testDb.getClientForUser(editor);
      
      // Should be able to access own organization's data
      const { data: ownOrgData, error: ownOrgError } = await client
        .from('organizations')
        .select('*')
        .eq('id', testOrg.id)
        .single();
        
      expect(ownOrgError).toBeNull();
      expect(ownOrgData).toBeDefined();
      
      // Create another organization
      const otherOrg = await testDb.createTestOrganization('Other Organization');
      
      // Should NOT be able to access other organization's data
      const { data: otherOrgData, error: otherOrgError } = await client
        .from('organizations')
        .select('*')
        .eq('id', otherOrg.id)
        .single();
        
      expect(otherOrgData).toBeNull();
      expect(otherOrgError).toBeDefined();
    });
    
    it('should allow owners full access to organization', async () => {
      // Create owner user
      const owner = await testDb.createTestUser({
        role: 'owner',
        organizationId: testOrg.id
      });
      
      await testDb.signIn(owner);
      const client = testDb.getClientForUser(owner);
      
      // Create a project
      const { data: project, error: createError } = await client
        .from('projects')
        .insert({
          organization_id: testOrg.id,
          name: 'Owner Test Project',
          description: 'Created by owner'
        })
        .select()
        .single();
        
      expect(createError).toBeNull();
      expect(project).toBeDefined();
      
      // Update the project
      const { error: updateError } = await client
        .from('projects')
        .update({ description: 'Updated by owner' })
        .eq('id', project.id);
        
      expect(updateError).toBeNull();
      
      // Delete the project
      const { error: deleteError } = await client
        .from('projects')
        .delete()
        .eq('id', project.id);
        
      expect(deleteError).toBeNull();
    });
    
    it('should restrict viewers to read-only access', async () => {
      // Create test project
      const project = await testDb.createTestProject(testOrg.id);
      
      // Create viewer user
      const viewer = await testDb.createTestUser({
        role: 'viewer',
        organizationId: testOrg.id
      });
      
      await testDb.signIn(viewer);
      const client = testDb.getClientForUser(viewer);
      
      // Should be able to read
      const { data: readData, error: readError } = await client
        .from('projects')
        .select('*')
        .eq('id', project.id)
        .single();
        
      expect(readError).toBeNull();
      expect(readData).toBeDefined();
      
      // Should NOT be able to create
      const { error: createError } = await client
        .from('projects')
        .insert({
          organization_id: testOrg.id,
          name: 'Viewer Attempt',
          description: 'Should fail'
        });
        
      expect(createError).toBeDefined();
      expect(createError.code).toBe('42501'); // Insufficient privilege
      
      // Should NOT be able to update
      const { error: updateError } = await client
        .from('projects')
        .update({ description: 'Viewer update attempt' })
        .eq('id', project.id);
        
      expect(updateError).toBeDefined();
      
      // Should NOT be able to delete
      const { error: deleteError } = await client
        .from('projects')
        .delete()
        .eq('id', project.id);
        
      expect(deleteError).toBeDefined();
    });
  });
  
  describe('Password Reset Flow', () => {
    it('should send password reset email', async () => {
      const user = await testDb.createTestUser({
        email: `reset_test_${Date.now()}@example.com`
      });
      
      // Request password reset
      const { error } = await testDb.client.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'http://localhost:5173/auth/reset-password'
      });
      
      expect(error).toBeNull();
      
      // In a real test, we would check the email was sent
      // For now, we just verify the request succeeded
    });
    
    it('should not reveal if email exists', async () => {
      // Request reset for non-existent email
      const { error } = await testDb.client.auth.resetPasswordForEmail(
        'nonexistent@example.com'
      );
      
      // Should succeed even for non-existent emails (security best practice)
      expect(error).toBeNull();
    });
  });
  
  describe('Session Management', () => {
    it('should logout and invalidate session', async () => {
      const user = await testDb.createTestUser();
      
      // Login
      await testDb.signIn(user);
      
      // Verify logged in
      const { data: beforeLogout } = await testDb.client.auth.getSession();
      expect(beforeLogout.session).toBeDefined();
      
      // Logout
      const { error } = await testDb.client.auth.signOut();
      expect(error).toBeNull();
      
      // Verify logged out
      const { data: afterLogout } = await testDb.client.auth.getSession();
      expect(afterLogout.session).toBeNull();
    });
    
    it('should handle concurrent sessions', async () => {
      const user = await testDb.createTestUser();
      
      // Create two separate clients (simulating different devices)
      const client1 = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      
      const client2 = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );
      
      // Login on both clients
      const { data: session1 } = await client1.auth.signInWithPassword({
        email: user.email,
        password: user.password
      });
      
      const { data: session2 } = await client2.auth.signInWithPassword({
        email: user.email,
        password: user.password
      });
      
      // Both sessions should be valid
      expect(session1.session).toBeDefined();
      expect(session2.session).toBeDefined();
      expect(session1.session?.access_token).not.toBe(session2.session?.access_token);
      
      // Logout from one should not affect the other
      await client1.auth.signOut();
      
      const { data: client2Session } = await client2.auth.getSession();
      expect(client2Session.session).toBeDefined();
    });
  });
  
  describe('User Profile Management', () => {
    it('should update user profile', async () => {
      const user = await testDb.createTestUser();
      await testDb.signIn(user);
      
      // Update profile
      const { data, error } = await testDb.client.auth.updateUser({
        data: {
          name: 'Updated Name',
          avatar_url: 'https://example.com/avatar.jpg'
        }
      });
      
      expect(error).toBeNull();
      expect(data.user?.user_metadata.name).toBe('Updated Name');
      expect(data.user?.user_metadata.avatar_url).toBe('https://example.com/avatar.jpg');
      
      // Verify in users table
      const { data: profile } = await testDb.serviceClient
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
        
      expect(profile.name).toBe('Updated Name');
    });
    
    it('should change password', async () => {
      const user = await testDb.createTestUser({
        password: 'OldPassword123!'
      });
      
      await testDb.signIn(user);
      
      // Change password
      const { error: changeError } = await testDb.client.auth.updateUser({
        password: 'NewPassword123!'
      });
      
      expect(changeError).toBeNull();
      
      // Logout
      await testDb.client.auth.signOut();
      
      // Try to login with old password
      const { error: oldPassError } = await testDb.client.auth.signInWithPassword({
        email: user.email,
        password: 'OldPassword123!'
      });
      
      expect(oldPassError).toBeDefined();
      
      // Login with new password
      const { error: newPassError } = await testDb.client.auth.signInWithPassword({
        email: user.email,
        password: 'NewPassword123!'
      });
      
      expect(newPassError).toBeNull();
    });
  });
});