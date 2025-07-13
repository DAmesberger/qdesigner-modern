import { supabase } from '$lib/services/supabase';
import type { User } from '@supabase/supabase-js';

export interface CreateInvitationOptions {
  organizationId: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  customMessage?: string;
  projectAssignments?: string[];
  invitedBy: string;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  token: string;
  status: 'pending' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'revoked';
  expiresAt: string;
  customMessage?: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

export interface BulkInviteResult {
  sent: string[];
  failed: Array<{ email: string; error: string }>;
}

/**
 * Transform database invitation to TypeScript interface
 */
function transformInvitation(dbInvitation: any): Invitation {
  return {
    id: dbInvitation.id,
    organizationId: dbInvitation.organization_id,
    email: dbInvitation.email,
    role: dbInvitation.role,
    token: dbInvitation.token,
    status: dbInvitation.status,
    expiresAt: dbInvitation.expires_at,
    customMessage: dbInvitation.custom_message,
    organization: dbInvitation.organizations,
    invitedBy: dbInvitation.invited_by
  };
}

/**
 * Create a single invitation
 */
export async function createInvitation({
  organizationId,
  email,
  role,
  customMessage,
  projectAssignments,
  invitedBy
}: CreateInvitationOptions): Promise<{ data?: Invitation; error?: string }> {
  try {
    // Check if user has permission to invite
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', invitedBy)
      .eq('status', 'active')
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return { error: 'You do not have permission to invite users to this organization' };
    }

    // Check if invitation already exists
    const { data: existingInvite } = await supabase
      .from('organization_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return { error: 'An invitation has already been sent to this email' };
    }

    // Create invitation
    const { data: invitation, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id: organizationId,
        email,
        role,
        invited_by: invitedBy,
        custom_message: customMessage,
        project_assignments: projectAssignments
      })
      .select(`
        *,
        organizations (
          id,
          name,
          slug
        ),
        invited_by:users!organization_invitations_invited_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .single();

    if (error) {
      throw error;
    }

    // Send invitation email
    await sendInvitationEmail(invitation);

    // Log event
    await supabase
      .from('onboarding_events')
      .insert({
        user_id: invitedBy,
        event_type: 'invitation_sent',
        organization_id: organizationId,
        invitation_id: invitation.id,
        metadata: { email, role }
      });

    return { data: transformInvitation(invitation) };
  } catch (error) {
    console.error('Error creating invitation:', error);
    return { error: 'Failed to create invitation' };
  }
}

/**
 * Create multiple invitations
 */
export async function createBulkInvitations({
  organizationId,
  invitations,
  invitedBy
}: {
  organizationId: string;
  invitations: Array<{ email: string; role: CreateInvitationOptions['role'] }>;
  invitedBy: string;
}): Promise<BulkInviteResult> {
  const result: BulkInviteResult = {
    sent: [],
    failed: []
  };

  for (const invite of invitations) {
    const { data, error } = await createInvitation({
      organizationId,
      email: invite.email,
      role: invite.role,
      invitedBy
    });

    if (error) {
      result.failed.push({ email: invite.email, error });
    } else if (data) {
      result.sent.push(invite.email);
    }
  }

  return result;
}

/**
 * Get invitation by token
 */
export async function getInvitationByToken(token: string): Promise<{ data?: Invitation; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select(`
        *,
        organizations (
          id,
          name,
          slug
        ),
        invited_by:users!organization_invitations_invited_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('token', token)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return { error: 'Invalid invitation token' };
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return { error: 'This invitation has expired' };
    }

    // Mark as viewed if still pending
    if (data.status === 'pending') {
      await supabase
        .from('organization_invitations')
        .update({ 
          status: 'viewed',
          viewed_at: new Date().toISOString()
        })
        .eq('id', data.id);
    }

    return { data: transformInvitation(data) };
  } catch (error) {
    console.error('Error getting invitation:', error);
    return { error: 'Failed to retrieve invitation' };
  }
}

/**
 * Accept invitation
 */
export async function acceptInvitation(token: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Use the database function for atomic operation
    const { data, error } = await supabase
      .rpc('accept_invitation', { 
        invitation_token: token,
        user_id: userId
      });

    if (error) {
      throw error;
    }

    if (!data) {
      return { success: false, error: 'Invalid or expired invitation' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return { success: false, error: 'Failed to accept invitation' };
  }
}

/**
 * Decline invitation
 */
export async function declineInvitation(token: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: invitation, error: fetchError } = await supabase
      .from('organization_invitations')
      .select('id, organization_id, status')
      .eq('token', token)
      .single();

    if (fetchError || !invitation) {
      return { success: false, error: 'Invalid invitation' };
    }

    if (invitation.status !== 'pending' && invitation.status !== 'viewed') {
      return { success: false, error: 'Invitation has already been processed' };
    }

    const { error: updateError } = await supabase
      .from('organization_invitations')
      .update({
        status: 'declined',
        declined_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    if (updateError) {
      throw updateError;
    }

    // Log event
    await supabase
      .from('onboarding_events')
      .insert({
        user_id: userId,
        event_type: 'invitation_declined',
        organization_id: invitation.organization_id,
        invitation_id: invitation.id
      });

    return { success: true };
  } catch (error) {
    console.error('Error declining invitation:', error);
    return { success: false, error: 'Failed to decline invitation' };
  }
}

/**
 * Get pending invitations for an email
 */
export async function getPendingInvitations(email: string): Promise<Invitation[]> {
  try {
    const { data, error } = await supabase
      .from('organization_invitations')
      .select(`
        *,
        organizations (
          id,
          name,
          slug
        ),
        invited_by:users!organization_invitations_invited_by_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('email', email)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map(transformInvitation);
  } catch (error) {
    console.error('Error getting pending invitations:', error);
    return [];
  }
}

/**
 * Revoke invitation
 */
export async function revokeInvitation(invitationId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check permissions
    const { data: invitation } = await supabase
      .from('organization_invitations')
      .select('organization_id, status')
      .eq('id', invitationId)
      .single();

    if (!invitation) {
      return { success: false, error: 'Invitation not found' };
    }

    if (invitation.status !== 'pending') {
      return { success: false, error: 'Can only revoke pending invitations' };
    }

    // Verify user has permission
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', invitation.organization_id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return { success: false, error: 'You do not have permission to revoke invitations' };
    }

    // Revoke invitation
    const { error } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error revoking invitation:', error);
    return { success: false, error: 'Failed to revoke invitation' };
  }
}

/**
 * Send invitation email
 */
async function sendInvitationEmail(invitation: any): Promise<void> {
  const inviteUrl = `${import.meta.env.VITE_APP_URL || 'http://localhost:5173'}/invite/${invitation.token}`;
  
  // TODO: Integrate with email service
  // For now, just log in development
  if (import.meta.env.DEV) {
    console.log('📧 Invitation email would be sent:', {
      to: invitation.email,
      inviteUrl,
      organization: invitation.organizations?.name,
      invitedBy: invitation.invited_by?.full_name || invitation.invited_by?.email
    });
  }
}