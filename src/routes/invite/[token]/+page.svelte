<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import { supabase } from '$lib/services/supabase';
  import { 
    getInvitationByToken, 
    acceptInvitation, 
    declineInvitation,
    type Invitation 
  } from '$lib/services/invitations';
  
  let invitation: Invitation | null = null;
  let loading = true;
  let error: string | null = null;
  let actionLoading = false;
  let isAuthenticated = false;
  let currentUser: any = null;
  
  onMount(async () => {
    const token = $page.params.token;
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    isAuthenticated = !!user;
    
    if (user) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single();
      currentUser = userData;
    }
    
    // Load invitation
    const { data, error: fetchError } = await getInvitationByToken(token);
    
    if (fetchError) {
      error = fetchError;
    } else if (data) {
      invitation = data;
      
      // Check if already accepted
      if (data.status === 'accepted') {
        error = 'This invitation has already been accepted';
      } else if (data.status === 'declined') {
        error = 'This invitation has been declined';
      } else if (data.status === 'expired') {
        error = 'This invitation has expired';
      } else if (data.status === 'revoked') {
        error = 'This invitation has been revoked';
      }
    }
    
    loading = false;
  });
  
  async function handleAccept() {
    if (!invitation || !currentUser) return;
    
    actionLoading = true;
    error = null;
    
    const { success, error: acceptError } = await acceptInvitation(
      invitation.token,
      currentUser.id
    );
    
    if (success) {
      // Redirect to dashboard
      await goto('/dashboard');
    } else {
      error = acceptError || 'Failed to accept invitation';
      actionLoading = false;
    }
  }
  
  async function handleDecline() {
    if (!invitation || !currentUser) return;
    
    if (!confirm('Are you sure you want to decline this invitation?')) {
      return;
    }
    
    actionLoading = true;
    error = null;
    
    const { success, error: declineError } = await declineInvitation(
      invitation.token,
      currentUser.id
    );
    
    if (success) {
      // Show success and redirect
      error = null;
      invitation = { ...invitation, status: 'declined' };
      setTimeout(() => {
        goto('/');
      }, 2000);
    } else {
      error = declineError || 'Failed to decline invitation';
    }
    
    actionLoading = false;
  }
  
  function getRoleBadgeVariant(role: string): 'primary' | 'secondary' | 'warning' {
    switch (role) {
      case 'owner':
      case 'admin':
        return 'warning';
      case 'member':
        return 'primary';
      default:
        return 'secondary';
    }
  }
</script>

<div class="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-background">
  <div class="sm:mx-auto sm:w-full sm:max-w-lg">
    {#if loading}
      <div class="text-center">
        <div class="text-muted-foreground">Loading invitation...</div>
      </div>
    {:else if error}
      <Card>
        <div class="text-center py-8">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
            <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-foreground mb-2">Invalid Invitation</h3>
          <p class="text-muted-foreground">{error}</p>
          <div class="mt-6">
            <Button variant="secondary" on:click={() => goto('/')}>
              Go to Home
            </Button>
          </div>
        </div>
      </Card>
    {:else if invitation}
      <Card>
        <div class="text-center mb-6">
          <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <svg class="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 class="text-2xl font-bold text-foreground">
            You're Invited!
          </h2>
        </div>
        
        <div class="space-y-4">
          <div class="text-center">
            <p class="text-lg text-muted-foreground">
              {invitation.invitedBy?.full_name || invitation.invitedBy?.email} has invited you to join
            </p>
            <h3 class="text-xl font-semibold text-foreground mt-2">
              {invitation.organization?.name}
            </h3>
          </div>
          
          <div class="flex justify-center">
            <Badge variant={getRoleBadgeVariant(invitation.role)} size="lg">
              Role: {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </Badge>
          </div>
          
          {#if invitation.customMessage}
            <div class="bg-muted/50 rounded-lg p-4">
              <p class="text-sm text-muted-foreground mb-1">Personal message:</p>
              <p class="italic">{invitation.customMessage}</p>
            </div>
          {/if}
          
          {#if invitation.status === 'declined'}
            <Alert variant="info">
              You have declined this invitation.
            </Alert>
          {:else if !isAuthenticated}
            <Alert variant="info">
              Please sign in or create an account to accept this invitation.
            </Alert>
            <div class="flex gap-3">
              <Button
                variant="primary"
                class="flex-1"
                on:click={() => invitation && goto(`/login?redirect=/invite/${invitation.token}`)}
              >
                Sign In
              </Button>
              <Button
                variant="secondary"
                class="flex-1"
                on:click={() => invitation && goto(`/signup?email=${encodeURIComponent(invitation.email)}`)}
              >
                Create Account
              </Button>
            </div>
          {:else if currentUser?.email !== invitation!.email}
            <Alert variant="warning">
              This invitation was sent to {invitation!.email}, but you're signed in as {currentUser?.email}.
              Please sign in with the correct account.
            </Alert>
            <Button
              variant="secondary"
              class="w-full"
              on:click={async () => {
                await supabase.auth.signOut();
                invitation && goto(`/login?redirect=/invite/${invitation.token}`);}
              }}
            >
              Switch Account
            </Button>
          {:else}
            <div class="flex gap-3">
              <Button
                variant="secondary"
                class="flex-1"
                on:click={handleDecline}
                loading={actionLoading}
              >
                Decline
              </Button>
              <Button
                variant="primary"
                class="flex-1"
                on:click={handleAccept}
                loading={actionLoading}
              >
                Accept & Join
              </Button>
            </div>
          {/if}
        </div>
      </Card>
    {/if}
  </div>
</div>