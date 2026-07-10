<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import { toast } from '$lib/stores/toast';

  let loading = $state(true);
  let saving = $state(false);
  // Page-level load failure only (persists in place of the form); transient
  // save/validation feedback goes through toast.
  let error: string | null = $state(null);

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

  // Seat model (E-RBAC-4).
  let seatUsage = $state<{
    limit: number | null;
    used: number;
    active_members: number;
    pending_invitations: number;
  } | null>(null);
  let seatLimitInput = $state('');
  let savingSeats = $state(false);

  // Branding / whitelabel (E-RBAC-8).
  let brandingPrimaryColor = $state('');
  let brandingLogoUrl = $state('');
  let brandingParticipantHeader = $state('');
  let savingBranding = $state(false);

  // Access defaults (E-RBAC-1 project visibility home).
  let projectVisibility = $state<'organization' | 'restricted'>('organization');
  let savingAccess = $state(false);

  // The color picker cannot be empty; show a sensible default when unset.
  const colorPickerValue = $derived(
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brandingPrimaryColor.trim())
      ? brandingPrimaryColor.trim()
      : '#4f46e5'
  );

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

      // Hydrate the Defaults form from the organization's saved settings so
      // it reflects the persisted state instead of always showing hard-coded
      // initial values (write-only regression).
      const defaults = currentOrg.settings?.defaults;
      if (defaults) {
        defaultTimeLimit = String(defaults.timeLimit ?? 30);
        defaultRandomization = !!defaults.randomization;
        defaultRandomSeed = defaults.randomSeed ?? '';
        emailNotifications = defaults.emailNotifications ?? true;
        digestFrequency = defaults.digestFrequency ?? 'weekly';
      }

      seatLimitInput =
        currentOrg.settings?.seatLimit != null ? String(currentOrg.settings.seatLimit) : '';

      // Branding + access hydrate from the same settings JSONB.
      const s = currentOrg.settings ?? {};
      brandingPrimaryColor = s.primaryColor ?? '';
      brandingLogoUrl = s.logoUrl ?? currentOrg.logoUrl ?? '';
      brandingParticipantHeader = s.participantHeader ?? '';
      projectVisibility = s.projectVisibility === 'restricted' ? 'restricted' : 'organization';

      // Seat usage is a live count; failure just hides the card values.
      try {
        seatUsage = await api.organizations.seats(currentOrg.id);
      } catch {
        seatUsage = null;
      }
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

    try {
      // Store defaults in organization metadata via the existing update API.
      // The settings column is replaced wholesale server-side, so preserve the
      // rest of the object (e.g. seatLimit) instead of clobbering it.
      const nextSettings = {
        ...(currentOrg.settings ?? {}),
        defaults: {
          timeLimit: parseInt(defaultTimeLimit, 10) || 30,
          randomization: defaultRandomization,
          randomSeed: defaultRandomSeed || null,
          emailNotifications,
          digestFrequency,
        },
      };
      await api.organizations.update(currentOrg.id, {
        name: orgName,
        settings: nextSettings,
      });
      currentOrg.settings = nextSettings;
      toast.success('Defaults saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save defaults');
    } finally {
      savingDefaults = false;
    }
  }

  async function handleSaveSeats() {
    if (!currentOrg) return;

    const trimmed = seatLimitInput.trim();
    let seatLimit: number | null = null;
    if (trimmed !== '') {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        toast.error('Seat limit must be a positive whole number, or blank for unlimited');
        return;
      }
      if (seatUsage && parsed < seatUsage.used) {
        toast.error(`Seat limit cannot be below current usage (${seatUsage.used} seats in use)`);
        return;
      }
      seatLimit = parsed;
    }

    savingSeats = true;
    try {
      const nextSettings = { ...(currentOrg.settings ?? {}), seatLimit };
      await api.organizations.update(currentOrg.id, {
        name: orgName,
        settings: nextSettings,
      });
      currentOrg.settings = nextSettings;
      seatUsage = await api.organizations.seats(currentOrg.id);
      toast.success(seatLimit == null ? 'Seat limit removed (unlimited)' : 'Seat limit saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save seat limit');
    } finally {
      savingSeats = false;
    }
  }

  async function handleSaveBranding() {
    if (!currentOrg) return;

    const color = brandingPrimaryColor.trim();
    if (color && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
      toast.error('Primary color must be a hex value like #4f46e5');
      return;
    }
    const logo = brandingLogoUrl.trim();
    if (logo && !(logo.startsWith('http://') || logo.startsWith('https://') || logo.startsWith('/'))) {
      toast.error('Logo URL must be an absolute http(s) URL or a same-origin path');
      return;
    }

    savingBranding = true;
    try {
      // Merge into the whole settings object so we never clobber defaults/seatLimit.
      const nextSettings = {
        ...(currentOrg.settings ?? {}),
        primaryColor: color || null,
        logoUrl: logo || null,
        participantHeader: brandingParticipantHeader.trim() || null,
      };
      await api.organizations.update(currentOrg.id, {
        name: orgName,
        settings: nextSettings,
      });
      currentOrg.settings = nextSettings;
      toast.success('Branding saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save branding');
    } finally {
      savingBranding = false;
    }
  }

  async function handleSaveAccess() {
    if (!currentOrg) return;

    savingAccess = true;
    try {
      const nextSettings = {
        ...(currentOrg.settings ?? {}),
        projectVisibility,
      };
      await api.organizations.update(currentOrg.id, {
        name: orgName,
        settings: nextSettings,
      });
      currentOrg.settings = nextSettings;
      toast.success('Access defaults saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save access defaults');
    } finally {
      savingAccess = false;
    }
  }

  async function handleSave() {
    if (!currentOrg) return;

    saving = true;

    try {
      await api.organizations.update(currentOrg.id, {
        name: orgName,
      });
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
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
        <h3 class="text-lg font-semibold mb-4">Seats</h3>
        {#if seatUsage}
          <div class="mb-4 flex flex-wrap gap-4">
            <div class="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p class="text-sm text-muted-foreground">Seats used</p>
              <p class="text-2xl font-bold text-foreground">
                {seatUsage.used}{#if seatUsage.limit != null}<span
                    class="text-base font-normal text-muted-foreground"> of {seatUsage.limit}</span
                  >{/if}
              </p>
            </div>
            <div class="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p class="text-sm text-muted-foreground">Active members</p>
              <p class="text-2xl font-bold text-foreground">{seatUsage.active_members}</p>
            </div>
            <div class="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p class="text-sm text-muted-foreground">Pending invitations</p>
              <p class="text-2xl font-bold text-foreground">{seatUsage.pending_invitations}</p>
            </div>
          </div>
        {/if}
        <form onsubmit={(e) => { e.preventDefault(); handleSaveSeats(); }} class="space-y-4">
          <FormGroup label="Seat limit" id="seat-limit">
            <input
              id="seat-limit"
              type="number"
              min="1"
              placeholder="Unlimited"
              bind:value={seatLimitInput}
              class="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p class="text-sm text-muted-foreground mt-1">
              Maximum number of seats (active members + pending invitations). Leave blank
              for unlimited. Adding a member or invitation beyond the limit is blocked.
            </p>
          </FormGroup>
          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={savingSeats}>Save Seat Limit</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Branding</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Whitelabel the participant-facing questionnaire chrome. These apply to the
          public fillout pages; unset fields fall back to platform defaults.
        </p>
        <form onsubmit={(e) => { e.preventDefault(); handleSaveBranding(); }} class="space-y-4">
          <FormGroup label="Primary color" id="brand-color">
            <div class="flex items-center gap-3">
              <input
                id="brand-color-picker"
                type="color"
                value={colorPickerValue}
                oninput={(e) => (brandingPrimaryColor = e.currentTarget.value)}
                aria-label="Primary color picker"
                class="h-10 w-14 cursor-pointer rounded border border-border bg-card p-1"
              />
              <Input
                id="brand-color"
                type="text"
                placeholder="#4f46e5"
                bind:value={brandingPrimaryColor}
              />
            </div>
            <p class="text-sm text-muted-foreground mt-1">
              Hex color (e.g. #4f46e5). Themes buttons and accents on participant screens.
            </p>
          </FormGroup>

          <FormGroup label="Logo URL" id="brand-logo">
            <Input
              id="brand-logo"
              type="text"
              placeholder="https://… or /media/…/content"
              bind:value={brandingLogoUrl}
            />
            <p class="text-sm text-muted-foreground mt-1">
              Absolute http(s) URL or a same-origin media path. Upload an asset in the
              designer media library, then paste its content URL here.
            </p>
          </FormGroup>

          <FormGroup label="Participant header text" id="brand-header">
            <Input
              id="brand-header"
              type="text"
              placeholder="e.g. Amescon Research Lab"
              bind:value={brandingParticipantHeader}
            />
          </FormGroup>

          <!-- Live preview of the participant chrome header. -->
          <div>
            <p class="text-sm font-medium text-foreground mb-2">Preview</p>
            <div
              class="flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-4"
              data-testid="branding-preview"
            >
              {#if brandingLogoUrl.trim()}
                <img
                  src={brandingLogoUrl.trim()}
                  alt="Logo preview"
                  class="max-h-10 max-w-[160px] object-contain"
                />
              {/if}
              {#if brandingParticipantHeader.trim()}
                <span class="text-sm font-semibold text-foreground"
                  >{brandingParticipantHeader.trim()}</span
                >
              {/if}
              {#if !brandingLogoUrl.trim() && !brandingParticipantHeader.trim()}
                <span class="text-sm text-muted-foreground">No logo or header set</span>
              {/if}
            </div>
            <div class="mt-3 flex items-center gap-3">
              <span class="text-sm text-muted-foreground">Primary button:</span>
              <span
                class="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style="background-color: {colorPickerValue};"
                data-testid="branding-button-preview"
              >
                Continue
              </span>
            </div>
          </div>

          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={savingBranding}>Save Branding</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Access</h3>
        <form onsubmit={(e) => { e.preventDefault(); handleSaveAccess(); }} class="space-y-4">
          <FormGroup label="Default project visibility" id="project-visibility">
            <Select id="project-visibility" bind:value={projectVisibility} placeholder="">
              <option value="organization">Visible to all organization members</option>
              <option value="restricted">Restricted to explicitly-added members</option>
            </Select>
            <p class="text-sm text-muted-foreground mt-1">
              Sets the default visibility applied to newly created projects.
            </p>
          </FormGroup>
          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={savingAccess}>Save Access</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 class="text-lg font-semibold mb-4">Identity &amp; SSO</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Manage verified email domains and auto-join rules for your organization.
          IdP-managed role provisioning is configured per verified domain.
        </p>
        <a
          href="/admin/domains"
          class="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Manage domains &amp; identity
        </a>
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
                class="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
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
                class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label for="email-notifications" class="text-sm text-foreground">
                Enable email notifications for new responses
              </label>
            </div>
            {#if emailNotifications}
              <FormGroup label="Digest Frequency" id="digest-frequency">
                <Select
                  id="digest-frequency"
                  bind:value={digestFrequency}
                  placeholder=""
                >
                  <option value="daily">Daily digest</option>
                  <option value="weekly">Weekly digest</option>
                  <option value="none">Instant (no digest)</option>
                </Select>
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
