import { supabase } from '$lib/services/supabase';
import type { User } from '@supabase/supabase-js';
import { checkDomainAutoJoin } from '$lib/services/domain-verification';

/**
 * Handle user creation/update after authentication
 * This ensures our users table stays in sync with Supabase Auth
 */
export async function handleAuthUser(authUser: User) {
  try {
    // Check if user exists in our users table
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
      throw fetchError;
    }

    if (!existingUser) {
      // Create new user record
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          auth_id: authUser.id,
          email: authUser.email!,
          full_name: authUser.user_metadata?.full_name || null,
          avatar_url: authUser.user_metadata?.avatar_url || null,
          last_login_at: new Date().toISOString()
        });

      if (insertError) throw insertError;

      // Get the newly created user's ID
      const { data: newUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authUser.id)
        .single();

      // If user was invited to an organization, handle that here
      await handlePendingInvitations(authUser.email!, newUser?.id);
    } else {
      // Update last login - don't fail if this errors
      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            last_login_at: new Date().toISOString(),
            login_count: (existingUser.login_count || 0) + 1
          })
          .eq('id', existingUser.id);

        if (updateError) {
          console.warn('Failed to update last login:', updateError);
        }
      } catch (err) {
        console.warn('Failed to update last login:', err);
      }
    }

    // Get the user record we'll work with
    const userRecord = existingUser || await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authUser.id)
      .single()
      .then(res => res.data);
    
    // Check for domain auto-join
    if (!existingUser && authUser.email) {
      const domainCheck = await checkDomainAutoJoin(authUser.email);
      if (domainCheck.canAutoJoin && domainCheck.organizationId && userRecord?.id) {
        // Add user to organization via domain auto-join
        try {
          await supabase
            .from('organization_members')
            .insert({
              organization_id: domainCheck.organizationId,
              user_id: userRecord.id,
              role: domainCheck.defaultRole || 'member',
              status: 'active',
              joined_at: new Date().toISOString()
            });
        } catch (err) {
          // Ignore if already a member
          console.log('User might already be a member:', err);
        }

        // Log event
        await supabase
          .from('onboarding_events')
          .insert({
            user_id: userRecord.id,
            event_type: 'org_joined',
            organization_id: domainCheck.organizationId,
            metadata: { 
              method: 'domain_auto_join',
              domain: authUser.email.split('@')[1]
            }
          });
      }
    }

    // Get user's organizations using the public.users.id
    const { data: memberships } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        role,
        status,
        organizations (
          id,
          name,
          slug,
          subscription_tier,
          subscription_status
        )
      `)
      .eq('user_id', userRecord?.id)
      .eq('status', 'active');

    return {
      user: userRecord || { auth_id: authUser.id, email: authUser.email },
      organizations: memberships || []
    };
  } catch (error) {
    console.error('Error handling auth user:', error as Error);
    throw error;
  }
}

/**
 * Handle pending organization invitations
 */
async function handlePendingInvitations(email: string, userId?: string) {
  try {
    // Get all pending invitations for this email
    const { data: invitations } = await supabase
      .from('organization_invitations')
      .select('token')
      .eq('email', email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());

    if (!invitations || invitations.length === 0) {
      return;
    }

    // Auto-accept all pending invitations
    for (const invitation of invitations) {
      if (userId) {
        await supabase.rpc('accept_invitation', {
          invitation_token: invitation.token,
          user_id: userId
        });
      }
    }
  } catch (error) {
    console.error('Error handling pending invitations:', error as Error);
  }
}

/**
 * Create first organization for new users
 */
export async function createFirstOrganization(userId: string, orgName: string) {
  try {
    // Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        slug: orgName.toLowerCase().replace(/\s+/g, '-')
      })
      .select()
      .single();

    if (orgError) throw orgError;

    // Add user as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString()
      });

    if (memberError) throw memberError;

    return org;
  } catch (error) {
    console.error('Error creating organization:', error as Error);
    throw error;
  }
}

/**
 * Check if user has any organizations
 */
export async function userHasOrganization(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);

  return !error && data && data.length > 0;
}

/**
 * Get user's active organization
 */
export async function getUserActiveOrganization(userId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      role,
      organizations (
        id,
        name,
        slug,
        settings
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (error) {
    console.error('Error getting active organization:', error as Error);
    return null;
  }

  return data;
}