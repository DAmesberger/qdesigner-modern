<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/services/api';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import LanguageSwitcher from '$lib/i18n/components/LanguageSwitcher.svelte';

  let loading = $state(true);
  let saving = $state(false);
  let error: string | null = $state(null);
  let success: string | null = $state(null);

  // Profile data
  let fullName = $state('');
  let email = $state('');

  onMount(async () => {
    try {
      const profile = await api.users.getProfile();
      fullName = profile.full_name || '';
      email = profile.email || '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load profile';
    } finally {
      loading = false;
    }
  });

  async function handleSaveProfile() {
    saving = true;
    error = null;
    success = null;

    try {
      await api.users.updateProfile({ full_name: fullName });
      success = 'Profile updated successfully';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update profile';
    } finally {
      saving = false;
    }
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground">Settings</h1>
    <p class="mt-2 text-muted-foreground">Manage your account and preferences</p>
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
    <div class="space-y-6">
      <Card>
        <div class="animate-pulse space-y-4">
          <div class="h-5 w-24 rounded bg-muted"></div>
          <div class="h-9 w-full rounded bg-muted"></div>
          <div class="h-9 w-full rounded bg-muted"></div>
        </div>
      </Card>
      <Card>
        <div class="animate-pulse space-y-4">
          <div class="h-5 w-32 rounded bg-muted"></div>
          <div class="h-9 w-full rounded bg-muted"></div>
          <div class="h-9 w-full rounded bg-muted"></div>
          <div class="h-9 w-full rounded bg-muted"></div>
        </div>
      </Card>
    </div>
  {:else}
    <div class="space-y-6 max-w-2xl">
      <!-- Profile Section -->
      <Card>
        <h3 class="text-lg font-semibold text-foreground mb-4">Profile</h3>
        <form onsubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} class="space-y-4">
          <FormGroup label="Full Name" id="full-name">
            <Input id="full-name" type="text" bind:value={fullName} placeholder="Your full name" />
          </FormGroup>

          <FormGroup label="Email" id="email">
            <p class="py-1.5 text-sm text-foreground">{email}</p>
            <p class="text-sm text-muted-foreground mt-1">
              Email cannot be changed.
            </p>
          </FormGroup>

          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={saving}>Save Changes</Button>
          </div>
        </form>
      </Card>

      <!-- Password Section -->
      <Card>
        <h3 class="text-lg font-semibold text-foreground mb-4">Password</h3>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-foreground">Change your password</p>
            <p class="text-sm text-muted-foreground">
              We'll email you a secure link to set a new password.
            </p>
          </div>
          <a
            href="/forgot-password"
            class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Send Reset Link
          </a>
        </div>
      </Card>

      <!-- Appearance Section -->
      <Card>
        <h3 class="text-lg font-semibold text-foreground mb-4">Appearance</h3>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-foreground">Theme</p>
              <p class="text-sm text-muted-foreground">Toggle between light and dark mode</p>
            </div>
            <ThemeToggle />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-foreground">Language</p>
              <p class="text-sm text-muted-foreground">Choose your preferred language</p>
            </div>
            <LanguageSwitcher size="sm" showNativeNames={false} />
          </div>
        </div>
      </Card>

      <!-- Account Section -->
      <Card>
        <h3 class="text-lg font-semibold text-foreground mb-4">Account</h3>
        <div>
          <p class="text-sm font-medium text-foreground">Delete Account</p>
          <p class="text-sm text-muted-foreground">
            Self-service account deletion is not yet available. To permanently delete
            your account and all associated data, contact your organization administrator
            or email support.
          </p>
        </div>
      </Card>
    </div>
  {/if}
</div>
