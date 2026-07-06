<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '$lib/services/api';
  import { auth } from '$lib/services/auth';
  import { getApiErrorStatus, parseApiErrorMessage } from '$lib/services/api/http';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  import LanguageSwitcher from '$lib/i18n/LanguageSwitcher.svelte';

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

  // ── Account deletion (GDPR erasure) ─────────────────────────────────
  let deleteDialogOpen = $state(false);
  let deletePassword = $state('');
  let deleting = $state(false);
  // Inline (wrong-password) error, shown under the password field.
  let deletePasswordError: string | null = $state(null);
  // Blocking error (still owns a shared org), shown as an Alert in the dialog.
  let deleteBlockError: string | null = $state(null);

  function openDeleteDialog() {
    deletePassword = '';
    deletePasswordError = null;
    deleteBlockError = null;
    deleteDialogOpen = true;
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    deleting = true;
    deletePasswordError = null;
    deleteBlockError = null;

    try {
      await api.users.deleteAccount(deletePassword);
      // Erasure done — drop the local session and return to login.
      await auth.signOut();
      await goto('/login');
    } catch (err) {
      const status = getApiErrorStatus(err);
      if (status === 401) {
        deletePasswordError = 'Incorrect password. Please try again.';
      } else if (status === 409) {
        deleteBlockError = parseApiErrorMessage(
          err,
          'You still own an organization with other members. Transfer ownership before deleting your account.'
        );
      } else {
        deleteBlockError = parseApiErrorMessage(err, 'Failed to delete account.');
      }
    } finally {
      deleting = false;
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
        <div class="space-y-3">
          <div>
            <p class="text-sm font-medium text-foreground">Delete Account</p>
            <p class="text-sm text-muted-foreground">
              Permanently delete your account. Your personal information (name, email,
              avatar) is erased and your login is disabled immediately. Research data you
              contributed is retained in anonymized form for the integrity of studies you
              took part in — it can no longer be linked back to you. This action cannot be
              undone.
            </p>
          </div>
          <Button variant="destructive" onclick={openDeleteDialog}>Delete account</Button>
        </div>
      </Card>
    </div>
  {/if}
</div>

<Dialog
  bind:open={deleteDialogOpen}
  title="Delete your account"
  description="This permanently erases your personal data and disables your login."
  size="md"
  data-testid="delete-account-dialog"
>
  <div class="space-y-4">
    {#if deleteBlockError}
      <Alert variant="warning" title="Transfer ownership first">{deleteBlockError}</Alert>
    {/if}

    <p class="text-sm text-muted-foreground">
      Your name, email, and avatar will be permanently removed and you will be logged out.
      Research responses you submitted are kept in anonymized form and can no longer be
      linked to you. This cannot be undone.
    </p>

    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleDeleteAccount();
      }}
    >
      <FormGroup
        label="Confirm your password"
        id="delete-password"
        error={deletePasswordError ?? ''}
      >
        <Input
          id="delete-password"
          type="password"
          bind:value={deletePassword}
          placeholder="Current password"
          autocomplete="current-password"
          error={!!deletePasswordError}
        />
      </FormGroup>
    </form>
  </div>

  {#snippet footer()}
    <Button
      variant="ghost"
      onclick={() => (deleteDialogOpen = false)}
      disabled={deleting}
    >
      Cancel
    </Button>
    <Button
      variant="destructive"
      loading={deleting}
      disabled={deleting || deletePassword.length === 0}
      onclick={handleDeleteAccount}
    >
      Delete account
    </Button>
  {/snippet}
</Dialog>
