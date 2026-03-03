<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';

  let loading = $state(true);
  let saving = $state(false);
  let error: string | null = $state(null);
  let success: string | null = $state(null);

  let currentOrg: any = $state(null);

  // Settings form
  let orgName = $state('');
  let orgSlug = $state('');

  // Defaults form
  let defaultTimeLimit = $state('30');
  let defaultRandomization = $state(false);
  let defaultRandomSeed = $state('');
  let emailNotifications = $state(true);
  let digestFrequency = $state<'daily' | 'weekly' | 'none'>('weekly');
  let savingDefaults = $state(false);

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

  async function handleSaveDefaults() {
    if (!currentOrg) return;

    savingDefaults = true;
    error = null;
    success = null;

    try {
      // Store defaults in organization metadata via the existing update API
      await api.organizations.update(currentOrg.id, {
        name: orgName,
        settings: {
          defaults: {
            timeLimit: parseInt(defaultTimeLimit, 10) || 30,
            randomization: defaultRandomization,
            randomSeed: defaultRandomSeed || null,
            emailNotifications,
            digestFrequency,
          },
        },
      });
      success = 'Defaults saved successfully';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save defaults';
    } finally {
      savingDefaults = false;
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
        <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
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
        <form onsubmit={(e) => { e.preventDefault(); handleSaveDefaults(); }} class="space-y-6">
          <!-- Time Limits -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-medium text-foreground">Time Limits</legend>
            <FormGroup label="Default Time Limit (minutes)" id="default-time-limit">
              <input
                id="default-time-limit"
                type="number"
                min="1"
                max="180"
                bind:value={defaultTimeLimit}
                class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <p class="text-sm text-muted-foreground mt-1">
                Maximum time allowed per questionnaire session. Participants will be warned when time is running low.
              </p>
            </FormGroup>
          </fieldset>

          <!-- Randomization -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-medium text-foreground">Randomization</legend>
            <div class="flex items-center gap-3">
              <input
                id="default-randomization"
                type="checkbox"
                bind:checked={defaultRandomization}
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label for="default-randomization" class="text-sm text-foreground">
                Enable randomization by default for new questionnaires
              </label>
            </div>
            {#if defaultRandomization}
              <FormGroup label="Random Seed (optional)" id="default-random-seed">
                <Input
                  id="default-random-seed"
                  type="text"
                  placeholder="Leave empty for random seed"
                  bind:value={defaultRandomSeed}
                />
                <p class="text-sm text-muted-foreground mt-1">
                  A fixed seed ensures reproducible ordering across sessions.
                </p>
              </FormGroup>
            {/if}
          </fieldset>

          <!-- Notifications -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-medium text-foreground">Notification Preferences</legend>
            <div class="flex items-center gap-3">
              <input
                id="email-notifications"
                type="checkbox"
                bind:checked={emailNotifications}
                class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label for="email-notifications" class="text-sm text-foreground">
                Enable email notifications for new responses
              </label>
            </div>
            {#if emailNotifications}
              <FormGroup label="Digest Frequency" id="digest-frequency">
                <select
                  id="digest-frequency"
                  bind:value={digestFrequency}
                  class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="daily">Daily digest</option>
                  <option value="weekly">Weekly digest</option>
                  <option value="none">Instant (no digest)</option>
                </select>
              </FormGroup>
            {/if}
          </fieldset>

          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={savingDefaults}>Save Defaults</Button>
          </div>
        </form>
      </Card>
    </div>
  {/if}
</div>
