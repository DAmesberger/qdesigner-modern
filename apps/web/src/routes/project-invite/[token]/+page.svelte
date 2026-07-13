<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import type { ProjectInvitationDetail } from '$lib/services/api/project-invitations';
  import type { User } from '$lib/shared/types/auth';
  import { X, FolderKanban } from 'lucide-svelte';

  let invitation = $state<ProjectInvitationDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionLoading = $state(false);
  let isAuthenticated = $state(false);
  let currentUser = $state<User | null>(null);

  onMount(async () => {
    const token = page.params.token;

    if (!token) {
      error = 'Invalid invitation link';
      loading = false;
      return;
    }

    // Check if user is authenticated
    const user = await auth.getUser();
    isAuthenticated = !!user;
    if (user) {
      currentUser = user;
    }

    try {
      const data = await api.projectInvitations.getByToken(token);
      invitation = data;

      if (data.status === 'accepted') {
        error = 'This invitation has already been accepted';
      } else if (data.status === 'declined') {
        error = 'This invitation has been declined';
      } else if (data.status === 'expired') {
        error = 'This invitation has expired';
      } else if (data.status === 'revoked') {
        error = 'This invitation has been revoked';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to retrieve invitation';
    }

    loading = false;
  });

  async function handleAccept() {
    if (!invitation || !currentUser) return;

    actionLoading = true;
    error = null;

    try {
      await api.projectInvitations.accept(invitation.token);
      // Land on the project the invitation grants access to.
      await goto(`/projects/${invitation.project_id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to accept invitation';
      actionLoading = false;
    }
  }

  async function handleDecline() {
    if (!invitation || !currentUser) return;

    if (
      !(await confirmDialog({
        title: 'Decline invitation?',
        message: 'Are you sure you want to decline this invitation?',
        confirmLabel: 'Decline',
        destructive: true,
      }))
    ) {
      return;
    }

    actionLoading = true;
    error = null;

    try {
      await api.projectInvitations.decline(invitation.token);
      invitation = { ...invitation, status: 'declined' };
      setTimeout(() => {
        goto('/');
      }, 2000);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to decline invitation';
    } finally {
      actionLoading = false;
    }
  }

  function getRoleBadgeVariant(role: string): 'primary' | 'secondary' | 'warning' | 'info' {
    switch (role) {
      case 'owner':
      case 'admin':
        return 'warning';
      case 'editor':
        return 'info';
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
          <div
            class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4"
          >
            <X size={24} class="text-destructive" />
          </div>
          <h3 class="text-lg font-semibold text-foreground mb-2">Invalid Invitation</h3>
          <p class="text-muted-foreground">{error}</p>
          <div class="mt-6">
            <Button variant="secondary" onclick={() => goto('/')}>Go to Home</Button>
          </div>
        </div>
      </Card>
    {:else if invitation}
      <Card>
        <div class="text-center mb-6">
          <div
            class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4"
          >
            <FolderKanban size={24} class="text-primary" />
          </div>
          <h2 class="text-2xl font-bold text-foreground">You're Invited to Collaborate!</h2>
        </div>

        <div class="space-y-4">
          <div class="text-center">
            <p class="text-lg text-muted-foreground">
              {invitation.invited_by?.full_name || invitation.invited_by?.email || 'Someone'} has
              invited you to collaborate on
            </p>
            <h3 class="text-xl font-semibold text-foreground mt-2">
              {invitation.project.name}
            </h3>
          </div>

          <div class="flex justify-center">
            <Badge variant={getRoleBadgeVariant(invitation.role)} size="lg">
              Role: {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </Badge>
          </div>

          {#if invitation.custom_message}
            <div class="bg-muted/50 rounded-lg p-4">
              <p class="text-sm text-muted-foreground mb-1">Personal message:</p>
              <p class="italic">{invitation.custom_message}</p>
            </div>
          {/if}

          {#if invitation.status === 'declined'}
            <Alert variant="info">You have declined this invitation.</Alert>
          {:else if !isAuthenticated}
            <Alert variant="info">
              Please sign in or create an account to accept this invitation.
            </Alert>
            <div class="flex gap-3">
              <Button
                variant="primary"
                class="flex-1"
                onclick={() =>
                  invitation && goto(`/login?redirect=/project-invite/${invitation.token}`)}
              >
                Sign In
              </Button>
              <Button
                variant="secondary"
                class="flex-1"
                onclick={() =>
                  invitation && goto(`/signup?email=${encodeURIComponent(invitation.email)}`)}
              >
                Create Account
              </Button>
            </div>
          {:else if currentUser?.email !== invitation.email}
            <Alert variant="warning">
              This invitation was sent to {invitation.email}, but you're signed in as {currentUser?.email}.
              Please sign in with the correct account.
            </Alert>
            <Button
              variant="secondary"
              class="w-full"
              onclick={async () => {
                await auth.signOut();
                invitation && goto(`/login?redirect=/project-invite/${invitation.token}`);
              }}
            >
              Switch Account
            </Button>
          {:else}
            <div class="flex gap-3">
              <Button
                variant="secondary"
                class="flex-1"
                onclick={handleDecline}
                loading={actionLoading}
              >
                Decline
              </Button>
              <Button
                variant="primary"
                class="flex-1"
                onclick={handleAccept}
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
