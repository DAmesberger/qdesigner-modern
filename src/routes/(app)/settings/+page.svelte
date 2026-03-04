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

  // Password fields
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');

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
        <form onsubmit={(e) => e.preventDefault()} class="space-y-4">
          <FormGroup label="Current Password" id="current-password">
            <Input id="current-password" type="password" bind:value={currentPassword} placeholder="Enter current password" />
          </FormGroup>

          <FormGroup label="New Password" id="new-password">
            <Input id="new-password" type="password" bind:value={newPassword} placeholder="Enter new password" />
          </FormGroup>

          <FormGroup label="Confirm New Password" id="confirm-password">
            <Input id="confirm-password" type="password" bind:value={confirmPassword} placeholder="Confirm new password" />
          </FormGroup>

          <div class="flex items-center justify-end gap-3">
            <span class="text-sm text-muted-foreground">Coming soon</span>
            <Button type="submit" variant="primary" disabled title="Password change coming soon">Change Password</Button>
          </div>
        </form>
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
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-foreground">Delete Account</p>
            <p class="text-sm text-muted-foreground">Permanently delete your account and all associated data</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-muted-foreground">Coming soon</span>
            <Button variant="destructive" disabled title="Account deletion coming soon">Delete Account</Button>
          </div>
        </div>
      </Card>
    </div>
  {/if}
</div>
