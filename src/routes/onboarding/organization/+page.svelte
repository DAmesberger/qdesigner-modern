<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import { supabase } from '$lib/services/supabase';
  import { createFirstOrganization } from '$lib/database/auth-helpers';
  
  let organizationName = '';
  let loading = false;
  let error: string | null = null;
  let currentUser: any = null;
  
  onMount(async () => {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
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
  });
  
  async function handleCreateOrganization() {
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
      <h2 class="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Welcome to QDesigner!
      </h2>
      <p class="mt-2 text-lg text-muted-foreground">
        Let's set up your organization to get started
      </p>
    </div>
  </div>

  <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
    <div class="bg-card px-4 py-8 shadow sm:rounded-lg sm:px-10">
      <form class="space-y-6" on:submit|preventDefault={handleCreateOrganization}>
        <div>
          <FormGroup 
            label="Organization Name" 
            id="org-name"
            helpText="This is typically your company, university, or research group name"
          >
            <Input
              id="org-name"
              type="text"
              required
              bind:value={organizationName}
              placeholder="e.g., Acme Research Lab"
              class="text-lg"
            />
          </FormGroup>
        </div>

        {#if error}
          <Alert variant="error">
            {error}
          </Alert>
        {/if}

        <div>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            class="w-full"
            {loading}
          >
            Create Organization
          </Button>
        </div>
      </form>

      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-border" />
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="bg-card px-4 text-muted-foreground">What happens next?</span>
          </div>
        </div>

        <div class="mt-6 space-y-4 text-sm text-muted-foreground">
          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span class="text-primary font-semibold">1</span>
            </div>
            <div>
              <p class="font-medium text-foreground">Create your first project</p>
              <p>Projects help you organize your questionnaires and research</p>
            </div>
          </div>
          
          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span class="text-primary font-semibold">2</span>
            </div>
            <div>
              <p class="font-medium text-foreground">Invite team members</p>
              <p>Collaborate with your team by inviting them to your organization</p>
            </div>
          </div>
          
          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span class="text-primary font-semibold">3</span>
            </div>
            <div>
              <p class="font-medium text-foreground">Build your first questionnaire</p>
              <p>Use our visual designer to create powerful research instruments</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>