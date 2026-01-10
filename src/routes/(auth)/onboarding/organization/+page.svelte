<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Card from '$lib/components/common/Card.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import { supabase } from '$lib/services/supabase';
  import { createFirstOrganization, userHasOrganization } from '$lib/database/auth-helpers';
  import {
    getPendingInvitations,
    acceptInvitation,
    type Invitation,
  } from '$lib/services/invitations';

  let organizationName = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let currentUser = $state<any>(null);
  let pendingInvitations = $state<Invitation[]>([]);
  let showCreateForm = $state(false);
  let acceptingInvitation = $state(false);

  onMount(async () => {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      await goto('/login');
      return;
    }

    // Get user data
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', user.id)
      .single();

    currentUser = userData;

    // Check if user already has organizations
    if (currentUser && (await userHasOrganization(currentUser.id))) {
      await goto('/dashboard');
      return;
    }

    // For now, skip invitation check due to RLS issues
    // TODO: Fix RLS policies for organization_invitations table
    showCreateForm = true;
  });

  async function handleAcceptInvitation(invitation: Invitation) {
    if (!currentUser) return;

    acceptingInvitation = true;
    error = null;

    const { success, error: acceptError } = await acceptInvitation(
      invitation.token,
      currentUser.id
    );

    if (success) {
      await goto('/dashboard');
    } else {
      error = acceptError || 'Failed to accept invitation';
      acceptingInvitation = false;
    }
  }

  async function handleCreateOrganization(e: Event) {
    e.preventDefault();
    if (!organizationName.trim()) {
      error = 'Please enter an organization name';
      return;
    }

    loading = true;
    error = null;

    try {
      if (!currentUser) {
        throw new Error('User not found');
      }

      await createFirstOrganization(currentUser.id, organizationName);
      // Invalidate all load functions to refresh organization data
      await invalidateAll();
      // Small delay to ensure data propagation
      await new Promise((resolve) => setTimeout(resolve, 100));
      await goto('/dashboard');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create organization';
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-background">
  <div class="sm:mx-auto sm:w-full sm:max-w-md">
    <div class="text-center">
      <h2 class="mt-6 text-3xl font-bold tracking-tight text-foreground">Welcome to QDesigner!</h2>
      <p class="mt-2 text-lg text-muted-foreground">
        Let's set up your organization to get started
      </p>
    </div>
  </div>

  <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-card px-4 py-8 shadow sm:rounded-lg sm:px-10">
      {#if pendingInvitations.length > 0 && !showCreateForm}
        <div class="space-y-4">
          <h3 class="text-lg font-semibold text-center mb-4">
            You have {pendingInvitations.length} pending invitation{pendingInvitations.length > 1
              ? 's'
              : ''}
          </h3>

          {#each pendingInvitations as invitation}
            <Card class="p-4">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h4 class="font-semibold text-foreground">
                    {invitation.organization?.name}
                  </h4>
                  <p class="text-sm text-muted-foreground">
                    Invited by {invitation.invitedBy?.full_name || invitation.invitedBy?.email}
                  </p>
                </div>
                <Badge variant="primary" size="sm">
                  {invitation.role}
                </Badge>
              </div>

              {#if invitation.customMessage}
                <p class="text-sm italic text-muted-foreground mb-3">
                  "{invitation.customMessage}"
                </p>
              {/if}

              <Button
                variant="primary"
                size="sm"
                class="w-full"
                onclick={() => handleAcceptInvitation(invitation)}
                loading={acceptingInvitation}
              >
                Accept & Join
              </Button>
            </Card>
          {/each}

          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-border"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="bg-card px-4 text-muted-foreground">Or</span>
            </div>
          </div>

          <Button variant="secondary" class="w-full" onclick={() => (showCreateForm = true)}>
            Create New Organization Instead
          </Button>
        </div>
      {:else}
        <form class="space-y-6" onsubmit={handleCreateOrganization}>
          <div>
            <FormGroup
              label="Organization Name"
              id="org-name"
              hint="This is typically your company, university, or research group name"
            >
              <Input
                id="org-name"
                type="text"
                required
                bind:value={organizationName}
                placeholder="e.g., Acme Research Lab"
              />
            </FormGroup>
          </div>

          {#if error}
            <Alert variant="error">
              {error}
            </Alert>
          {/if}

          <div>
            <Button type="submit" variant="primary" size="lg" class="w-full" {loading}>
              Create Organization
            </Button>
          </div>
        </form>
      {/if}

      {#if showCreateForm && pendingInvitations.length > 0}
        <div class="mt-6 text-center">
          <button
            type="button"
            class="text-sm text-primary hover:text-primary/80"
            onclick={() => (showCreateForm = false)}
          >
            ← Back to invitations
          </button>
        </div>
      {/if}

      {#if showCreateForm}
        <div class="mt-6">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-border"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="bg-card px-4 text-muted-foreground">What happens next?</span>
            </div>
          </div>

          <div class="mt-6 space-y-4 text-sm text-muted-foreground">
            <div class="flex gap-3">
              <div
                class="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center"
              >
                <span class="text-primary font-semibold">1</span>
              </div>
              <div>
                <p class="font-medium text-foreground">Create your first project</p>
                <p>Projects help you organize your questionnaires and research</p>
              </div>
            </div>

            <div class="flex gap-3">
              <div
                class="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center"
              >
                <span class="text-primary font-semibold">2</span>
              </div>
              <div>
                <p class="font-medium text-foreground">Invite team members</p>
                <p>Collaborate with your team by inviting them to your organization</p>
              </div>
            </div>

            <div class="flex gap-3">
              <div
                class="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center"
              >
                <span class="text-primary font-semibold">3</span>
              </div>
              <div>
                <p class="font-medium text-foreground">Build your first questionnaire</p>
                <p>Use our visual designer to create powerful research instruments</p>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
