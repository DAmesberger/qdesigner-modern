import { api } from '$lib/services/api';
import type { Invitation as ApiInvitation } from '$lib/types/api';

export interface CreateInvitationOptions {
  organizationId: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  customMessage?: string;
}

export interface Invitation {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  token: string;
  status: 'pending' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
  customMessage?: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy?: {
    id: string;
    email: string;
    fullName?: string | null;
  };
}

export interface BulkInviteResult {
  sent: string[];
  failed: Array<{ email: string; error: string }>;
}

/**
 * Transform API invitation to local interface
 */
function transformInvitation(apiInvitation: ApiInvitation): Invitation {
  return {
    id: apiInvitation.id,
    organizationId: apiInvitation.organizationId,
    email: apiInvitation.email,
    role: apiInvitation.role,
    token: apiInvitation.token,
    status: apiInvitation.status,
    expiresAt: apiInvitation.expiresAt,
    createdAt: apiInvitation.createdAt,
    acceptedAt: apiInvitation.acceptedAt,
    customMessage: apiInvitation.customMessage ?? undefined,
    organization: apiInvitation.organization,
    invitedBy: apiInvitation.invitedBy
      ? {
          id: apiInvitation.invitedBy.id,
          email: apiInvitation.invitedBy.email,
          fullName: apiInvitation.invitedBy.fullName
        }
      : undefined
  };
}

/**
 * Create a single invitation
 */
export async function createInvitation({
  organizationId,
  email,
  role,
  customMessage
}: CreateInvitationOptions): Promise<{ data?: Invitation; error?: string }> {
  try {
    const invitation = await api.organizations.invitations.create(organizationId, {
      email,
      role,
      customMessage
    });

    return { data: transformInvitation(invitation) };
  } catch (error) {
    console.error('Error creating invitation:', error as Error);
    return { error: error instanceof Error ? error.message : 'Failed to create invitation' };
  }
}

/**
 * Create multiple invitations
 */
export async function createBulkInvitations({
  organizationId,
  invitations
}: {
  organizationId: string;
  invitations: Array<{ email: string; role: CreateInvitationOptions['role'] }>;
}): Promise<BulkInviteResult> {
  const result: BulkInviteResult = {
    sent: [],
    failed: []
  };

  for (const invite of invitations) {
    const { data, error } = await createInvitation({
      organizationId,
      email: invite.email,
      role: invite.role
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
    const invitation = await api.organizations.invitations.getByToken(token);
    return { data: transformInvitation(invitation) };
  } catch (error) {
    console.error('Error getting invitation:', error as Error);
    return { error: error instanceof Error ? error.message : 'Failed to retrieve invitation' };
  }
}

/**
 * Accept invitation
 */
export async function acceptInvitation(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    await api.organizations.invitations.accept(token);
    return { success: true };
  } catch (error) {
    console.error('Error accepting invitation:', error as Error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to accept invitation' };
  }
}

/**
 * Decline invitation
 */
export async function declineInvitation(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    await api.organizations.invitations.decline(token);
    return { success: true };
  } catch (error) {
    console.error('Error declining invitation:', error as Error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to decline invitation' };
  }
}

/**
 * Get pending invitations for an email
 */
export async function getPendingInvitations(email: string): Promise<Invitation[]> {
  try {
    const invitations = await api.organizations.invitations.getPending(email);
    return invitations.map(transformInvitation);
  } catch (error) {
    console.error('Error getting pending invitations:', error as Error);
    return [];
  }
}

/**
 * Revoke invitation
 */
export async function revokeInvitation(orgId: string, invitationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await api.organizations.invitations.revoke(orgId, invitationId);
    return { success: true };
  } catch (error) {
    console.error('Error revoking invitation:', error as Error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to revoke invitation' };
  }
}
