<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/services/supabase';
  import {
    addDomain,
    verifyDomain,
    updateDomainConfig,
    removeDomain,
    type DomainConfig,
  } from '$lib/services/domain-verification';
  import Card from '$lib/components/common/Card.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';

  let domains: DomainConfig[] = [];
  let loading = true;
  let error: string | null = null;
  let success: string | null = null;

  // Add domain form
  let showAddDomainForm = false;
  let newDomain = '';
  let addingDomain = false;

  // Current user and organization
  let currentUser: any = null;
  let currentOrg: any = null;

  // Domain settings
  let editingDomain: string | null = null;
  let domainSettings: Record<string, any> = {};

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single();

      currentUser = userData;

      // Get user's organization
      const { data: membership } = await supabase
        .from('organization_members')
        .select(
          `
          organization_id,
          role,
          organizations (
            id,
            name,
            slug
          )
        `
        )
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .single();

      if (!membership || membership.role !== 'owner') {
        error = 'Only organization owners can manage domains';
        loading = false;
        return;
      }

      currentOrg = membership.organizations;

      // Load domains
      await loadDomains();
    } catch (err) {
      console.error('Error loading data:', err);
      error = 'Failed to load data';
    } finally {
      loading = false;
    }
  }

  async function loadDomains() {
    if (!currentOrg) return;

    const { data, error: fetchError } = await supabase
      .from('organization_domains')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error loading domains:', fetchError);
      error = 'Failed to load domains';
    } else {
      domains = data || [];
      // Initialize settings for each domain
      domains.forEach((domain) => {
        domainSettings[domain.id] = {
          autoJoinEnabled: domain.autoJoinEnabled,
          includeSubdomains: domain.includeSubdomains,
          defaultRole: domain.defaultRole,
          welcomeMessage: domain.welcomeMessage || '',
        };
      });
    }
  }

  async function handleAddDomain() {
    if (!newDomain || !currentOrg || !currentUser) return;

    addingDomain = true;
    error = null;
    success = null;

    const { data, error: addError } = await addDomain({
      organizationId: currentOrg.id,
      domain: newDomain.toLowerCase().trim(),
      userId: currentUser.id,
    });

    if (addError) {
      error = addError;
    } else {
      success = `Domain ${newDomain} added. Please verify ownership to enable auto-join.`;
      newDomain = '';
      showAddDomainForm = false;
      await loadDomains();
    }

    addingDomain = false;
  }

  async function handleVerifyDomain(domainId: string) {
    const result = await verifyDomain(domainId, currentUser.id);

    if (result.success) {
      success = `Domain verified successfully using ${result.method} method!`;
      await loadDomains();
    } else {
      error = result.error || 'Verification failed';
    }
  }

  async function handleUpdateDomain(domainId: string) {
    const settings = domainSettings[domainId];
    if (!settings) return;

    const result = await updateDomainConfig({
      domainId,
      config: {
        autoJoinEnabled: settings.autoJoinEnabled,
        includeSubdomains: settings.includeSubdomains,
        defaultRole: settings.defaultRole,
        welcomeMessage: settings.welcomeMessage,
      },
      userId: currentUser.id,
    });

    if (result.success) {
      success = 'Domain settings updated';
      editingDomain = null;
      await loadDomains();
    } else {
      error = result.error || 'Failed to update settings';
    }
  }

  async function handleRemoveDomain(domainId: string, domainName: string) {
    if (!confirm(`Are you sure you want to remove ${domainName}? This cannot be undone.`)) {
      return;
    }

    const result = await removeDomain(domainId, currentUser.id);

    if (result.success) {
      success = 'Domain removed';
      await loadDomains();
    } else {
      error = result.error || 'Failed to remove domain';
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-foreground">Domain Management</h1>
        <p class="mt-2 text-muted-foreground">
          Configure domain auto-join for {currentOrg?.name || 'your organization'}
        </p>
      </div>
      <Button variant="primary" onclick={() => (showAddDomainForm = !showAddDomainForm)}>
        {showAddDomainForm ? 'Cancel' : 'Add Domain'}
      </Button>
    </div>
  </div>

  {#if error}
    <Alert variant="error" class="mb-4">
      {error}
    </Alert>
  {/if}

  {#if success}
    <Alert variant="success" class="mb-4">
      {success}
    </Alert>
  {/if}

  {#if showAddDomainForm}
    <Card class="mb-8">
      <h3 class="text-lg font-semibold mb-4">Add New Domain</h3>
      <form on:submit|preventDefault={handleAddDomain} class="space-y-4">
        <FormGroup label="Domain" id="new-domain">
          <Input
            id="new-domain"
            type="text"
            required
            bind:value={newDomain}
            placeholder="example.com"
            pattern={`^([a-z0-9]+(-[a-z0-9]+)*\\.)+[a-z]{2,}$`}
          />
          <p class="text-sm text-muted-foreground mt-1">
            Users with email addresses from this domain can automatically join your organization
          </p>
        </FormGroup>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="secondary" onclick={() => (showAddDomainForm = false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={addingDomain}>Add Domain</Button>
        </div>
      </form>
    </Card>
  {/if}

  {#if loading}
    <div class="flex justify-center py-8">
      <div class="text-muted-foreground">Loading domains...</div>
    </div>
  {:else if domains.length === 0}
    <Card>
      <div class="text-center py-8">
        <p class="text-muted-foreground">No domains configured yet</p>
        <p class="text-sm text-muted-foreground mt-2">
          Add a domain to enable automatic user joining
        </p>
      </div>
    </Card>
  {:else}
    <div class="space-y-4">
      {#each domains as domain}
        <Card>
          <div class="space-y-4">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-3">
                  <h3 class="font-semibold text-lg">{domain.domain}</h3>
                  {#if domain.verifiedAt}
                    <Badge variant="success">Verified</Badge>
                    {#if domain.autoJoinEnabled}
                      <Badge variant="info">Auto-join Enabled</Badge>
                    {/if}
                  {:else}
                    <Badge variant="warning">Pending Verification</Badge>
                  {/if}
                </div>
                <p class="text-sm text-muted-foreground mt-1">
                  Added on {formatDate(domain.created_at)}
                  {#if domain.verifiedAt}
                    • Verified on {formatDate(domain.verifiedAt)}
                  {/if}
                </p>
              </div>

              <div class="flex gap-2">
                {#if !domain.verifiedAt}
                  <Button size="sm" variant="primary" onclick={() => handleVerifyDomain(domain.id)}>
                    Verify Domain
                  </Button>
                {:else if editingDomain === domain.id}
                  <Button size="sm" variant="primary" onclick={() => handleUpdateDomain(domain.id)}>
                    Save Settings
                  </Button>
                  <Button size="sm" variant="secondary" onclick={() => (editingDomain = null)}>
                    Cancel
                  </Button>
                {:else}
                  <Button size="sm" variant="secondary" onclick={() => (editingDomain = domain.id)}>
                    Settings
                  </Button>
                {/if}
                <Button
                  size="sm"
                  variant="secondary"
                  onclick={() => handleRemoveDomain(domain.id, domain.domain)}
                >
                  Remove
                </Button>
              </div>
            </div>

            {#if !domain.verifiedAt}
              <Alert variant="info">
                <h4 class="font-semibold mb-2">Verification Instructions</h4>
                <p class="mb-2">Add one of the following records to verify domain ownership:</p>
                <div class="space-y-2 text-sm font-mono bg-background p-3 rounded">
                  <p><strong>DNS TXT Record:</strong></p>
                  <p>Name: _qdesigner.{domain.domain}</p>
                  <p>Value: {domain.verificationToken}</p>
                  <p class="mt-2"><strong>OR File Verification:</strong></p>
                  <p>URL: https://{domain.domain}/.well-known/qdesigner-verify.txt</p>
                  <p>Content: {domain.verificationToken}</p>
                </div>
              </Alert>
            {:else if editingDomain === domain.id}
              <div class="space-y-4 border-t pt-4">
                <FormGroup label="Auto-join Settings">
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      bind:checked={domainSettings[domain.id].autoJoinEnabled}
                      class="rounded"
                    />
                    <span>Enable automatic joining for users from this domain</span>
                  </label>
                </FormGroup>

                <FormGroup label="Subdomain Settings">
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      bind:checked={domainSettings[domain.id].includeSubdomains}
                      class="rounded"
                    />
                    <span>Include all subdomains (*.{domain.domain})</span>
                  </label>
                </FormGroup>

                <FormGroup label="Default Role" id={`role-${domain.id}`}>
                  <select
                    id={`role-${domain.id}`}
                    bind:value={domainSettings[domain.id].defaultRole}
                    class="w-full rounded-md border-border bg-background px-3 py-2"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                  </select>
                </FormGroup>

                <FormGroup label="Welcome Message" id={`welcome-${domain.id}`}>
                  <textarea
                    id={`welcome-${domain.id}`}
                    bind:value={domainSettings[domain.id].welcomeMessage}
                    rows="3"
                    class="w-full rounded-md border-border bg-background px-3 py-2"
                    placeholder="Optional message shown to users who join via this domain..."
                  ></textarea>
                </FormGroup>
              </div>
            {/if}
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>
