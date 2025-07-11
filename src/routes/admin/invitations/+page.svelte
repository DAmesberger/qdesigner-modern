<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/services/supabase';
  import { createInvitation, revokeInvitation, type Invitation } from '$lib/services/invitations';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  
  let invitations: Invitation[] = [];
  let loading = true;
  let error: string | null = null;
  let success: string | null = null;
  
  // New invitation form
  let showNewInviteForm = false;
  let inviteEmail = '';
  let inviteRole: 'member' | 'admin' | 'viewer' = 'member';
  let inviteMessage = '';
  let inviteLoading = false;
  
  // Current user and organization
  let currentUser: any = null;
  let currentOrg: any = null;
  
  onMount(async () => {
    await loadData();
  });
  
  async function loadData() {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single();
      
      currentUser = userData;
      
      // Get user's organization (assuming they're viewing their active org)
      const { data: membership } = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name,
            slug
          )
        `)
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .single();
      
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        error = 'You do not have permission to manage invitations';
        loading = false;
        return;
      }
      
      currentOrg = membership.organizations;
      
      // Load invitations
      await loadInvitations();
    } catch (err) {
      console.error('Error loading data:', err);
      error = 'Failed to load data';
    } finally {
      loading = false;
    }
  }
  
  async function loadInvitations() {
    if (!currentOrg) return;
    
    const { data, error: fetchError } = await supabase
      .from('organization_invitations')
      .select(`
        *,
        invited_by:users!organization_invitations_invited_by_fkey (
          email,
          full_name
        )
      `)
      .eq('organization_id', currentOrg.id)
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      console.error('Error loading invitations:', fetchError);
      error = 'Failed to load invitations';
    } else {
      invitations = data || [];
    }
  }
  
  async function sendInvitation() {
    if (!inviteEmail || !currentOrg || !currentUser) return;
    
    inviteLoading = true;
    error = null;
    success = null;
    
    const { data, error: inviteError } = await createInvitation({
      organizationId: currentOrg.id,
      email: inviteEmail,
      role: inviteRole as any,
      customMessage: inviteMessage || undefined,
      invitedBy: currentUser.id
    });
    
    if (inviteError) {
      error = inviteError;
    } else {
      success = `Invitation sent to ${inviteEmail}`;
      inviteEmail = '';
      inviteMessage = '';
      showNewInviteForm = false;
      await loadInvitations();
    }
    
    inviteLoading = false;
  }
  
  async function handleRevokeInvitation(invitationId: string) {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    
    const { success: revokeSuccess, error: revokeError } = await revokeInvitation(
      invitationId,
      currentUser.id
    );
    
    if (revokeError) {
      error = revokeError;
    } else {
      success = 'Invitation revoked';
      await loadInvitations();
    }
  }
  
  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return { variant: 'warning', label: 'Pending' };
      case 'viewed':
        return { variant: 'info', label: 'Viewed' };
      case 'accepted':
        return { variant: 'success', label: 'Accepted' };
      case 'declined':
        return { variant: 'error', label: 'Declined' };
      case 'expired':
        return { variant: 'secondary', label: 'Expired' };
      case 'revoked':
        return { variant: 'secondary', label: 'Revoked' };
      default:
        return { variant: 'secondary', label: status };
    }
  }
  
  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-foreground">Invitations</h1>
        <p class="mt-2 text-muted-foreground">
          Manage invitations to {currentOrg?.name || 'your organization'}
        </p>
      </div>
      <Button
        variant="primary"
        on:click={() => showNewInviteForm = !showNewInviteForm}
      >
        {showNewInviteForm ? 'Cancel' : 'Send Invitation'}
      </Button>
    </div>
  </div>
  
  {#if error}
    <Alert variant="error" class="mb-4">
      {error}
    </Alert>
  {/if}
  
  {#if success}
    <Alert variant="success" class="mb-4">
      {success}
    </Alert>
  {/if}
  
  {#if showNewInviteForm}
    <Card class="mb-8">
      <h3 class="text-lg font-semibold mb-4">Send New Invitation</h3>
      <form on:submit|preventDefault={sendInvitation} class="space-y-4">
        <FormGroup label="Email Address" id="invite-email">
          <Input
            id="invite-email"
            type="email"
            required
            bind:value={inviteEmail}
            placeholder="colleague@example.com"
          />
        </FormGroup>
        
        <FormGroup label="Role" id="invite-role">
          <select
            id="invite-role"
            bind:value={inviteRole}
            class="w-full rounded-md border-border bg-background px-3 py-2"
          >
            <option value="viewer">Viewer - Can view questionnaires and data</option>
            <option value="member">Member - Can create and edit questionnaires</option>
            <option value="admin">Admin - Can manage users and settings</option>
          </select>
        </FormGroup>
        
        <FormGroup label="Custom Message (Optional)" id="invite-message">
          <textarea
            id="invite-message"
            bind:value={inviteMessage}
            rows="3"
            class="w-full rounded-md border-border bg-background px-3 py-2"
            placeholder="Add a personal message to the invitation..."
          />
        </FormGroup>
        
        <div class="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            on:click={() => showNewInviteForm = false}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={inviteLoading}
          >
            Send Invitation
          </Button>
        </div>
      </form>
    </Card>
  {/if}
  
  {#if loading}
    <div class="flex justify-center py-8">
      <div class="text-muted-foreground">Loading invitations...</div>
    </div>
  {:else if invitations.length === 0}
    <Card>
      <div class="text-center py-8">
        <p class="text-muted-foreground">No invitations sent yet</p>
        <p class="text-sm text-muted-foreground mt-2">
          Click "Send Invitation" to invite team members
        </p>
      </div>
    </Card>
  {:else}
    <div class="space-y-4">
      {#each invitations as invitation}
        <Card>
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h3 class="font-semibold text-lg">{invitation.email}</h3>
                <Badge {...getStatusBadge(invitation.status)} />
                <Badge variant="secondary">{invitation.role}</Badge>
              </div>
              
              <div class="text-sm text-muted-foreground space-y-1">
                <p>
                  Invited by {invitation.invited_by?.full_name || invitation.invited_by?.email}
                  on {formatDate(invitation.created_at)}
                </p>
                {#if invitation.status === 'pending'}
                  <p>Expires on {formatDate(invitation.expires_at)}</p>
                {/if}
                {#if invitation.accepted_at}
                  <p>Accepted on {formatDate(invitation.accepted_at)}</p>
                {/if}
                {#if invitation.custom_message}
                  <p class="italic mt-2">"{invitation.custom_message}"</p>
                {/if}
              </div>
            </div>
            
            {#if invitation.status === 'pending'}
              <div class="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  on:click={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/invite/${invitation.token}`
                    );
                    success = 'Invitation link copied to clipboard';
                  }}
                >
                  Copy Link
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  on:click={() => handleRevokeInvitation(invitation.id)}
                >
                  Revoke
                </Button>
              </div>
            {/if}
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>