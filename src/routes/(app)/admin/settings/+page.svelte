<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';

  let loading = true;
  let saving = false;
  let error: string | null = null;
  let success: string | null = null;

  let currentOrg: any = null;

  // Settings form
  let orgName = '';
  let orgSlug = '';

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      const user = await auth.getUser();
      if (!user) return;

      const orgs = await api.organizations.list();
      if (!orgs || orgs.length === 0) {
        error = 'Only organization owners can manage settings';
        loading = false;
        return;
      }

      currentOrg = orgs[0];
      orgName = currentOrg.name || '';
      orgSlug = currentOrg.slug || '';
    } catch (err) {
      console.error('Error loading settings:', err);
      error = 'Failed to load settings';
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    if (!currentOrg) return;

    saving = true;
    error = null;
    success = null;

    try {
      await api.organizations.update(currentOrg.id, {
        name: orgName,
      });
      success = 'Settings saved successfully';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save settings';
    } finally {
      saving = false;
    }
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground">Settings</h1>
    <p class="mt-2 text-muted-foreground">
      Manage settings for {currentOrg?.name || 'your organization'}
    </p>
  </div>

  {#if error}
    <div class="mb-4">
      <Alert variant="error">{error}</Alert>
    </div>
  {/if}

  {#if success}
    <div class="mb-4">
      <Alert variant="success">{success}</Alert>
    </div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-8">
      <div class="text-muted-foreground">Loading settings...</div>
    </div>
  {:else}
    <div class="space-y-6">
      <Card>
        <h3 class="text-lg font-semibold mb-4">Organization</h3>
        <form on:submit|preventDefault={handleSave} class="space-y-4">
          <FormGroup label="Organization Name" id="org-name">
            <Input id="org-name" type="text" required bind:value={orgName} />
          </FormGroup>

          <FormGroup label="Slug" id="org-slug">
            <Input id="org-slug" type="text" disabled value={orgSlug} />
            <p class="text-sm text-muted-foreground mt-1">
              The organization slug cannot be changed after creation.
            </p>
          </FormGroup>

          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={saving}>Save Changes</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Defaults</h3>
        <p class="text-muted-foreground">
          Default questionnaire settings, notification preferences, and other organization-wide
          defaults will be configurable here in a future update.
        </p>
      </Card>
    </div>
  {/if}
</div>
