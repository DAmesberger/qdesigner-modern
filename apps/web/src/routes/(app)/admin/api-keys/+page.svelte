<script lang="ts">
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import type { ApiKeyRecord } from '$lib/services/api/api-keys';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { toast } from '$lib/stores/toast';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';

  // Human labels for the wire permission tokens (mirror Permission::as_str).
  const SCOPE_LABELS: Record<string, string> = {
    'org:read': 'View organization',
    'org:write': 'Edit organization',
    'org:manage_members': 'Manage members',
    'org:delete': 'Delete organization',
    'project:read': 'View projects',
    'project:write': 'Edit projects',
    'project:manage_members': 'Manage project members',
    'project:delete': 'Delete projects',
    'questionnaire:read': 'View questionnaires',
    'questionnaire:write': 'Edit questionnaires',
    'questionnaire:publish': 'Publish questionnaires',
    'questionnaire:delete': 'Delete questionnaires',
    'session:read': 'View sessions & analytics',
    'session:write': 'Edit sessions',
    'response:read': 'Read / export responses',
    'response:write': 'Write responses',
    'media:read': 'View media',
    'media:write': 'Upload media',
    'media:delete': 'Delete media',
  };
  const scopeLabel = (t: string): string => SCOPE_LABELS[t] ?? t;

  let loading = $state(true);
  let saving = $state(false);
  // Page-level load failure only (persists in place of the list); transient
  // create/revoke feedback goes through toast.
  let error = $state<string | null>(null);

  let currentOrg = $state<{ id: string; name: string } | null>(null);
  let keys = $state<ApiKeyRecord[]>([]);
  let availableScopes = $state<string[]>([]);

  // ── Create form ──
  let showAddForm = $state(false);
  let formName = $state('');
  let formScopes = $state<Set<string>>(new Set(['session:read', 'response:read']));
  let formExpires = $state('');

  // Freshly-minted plaintext key, shown ONCE.
  let newKey = $state<string | null>(null);
  let copied = $state(false);

  $effect(() => {
    void loadData();
  });

  async function loadData() {
    try {
      const user = await auth.getUser();
      if (!user) return;
      const orgs = await api.organizations.list();
      const org = orgs?.[0];
      if (!org) {
        error = 'You must belong to an organization to manage API keys';
        loading = false;
        return;
      }
      currentOrg = { id: org.id, name: org.name };
      // Reuse the roles endpoint's permission catalogue for the scope picker.
      const rolesData = await api.roles.list(org.id);
      availableScopes = rolesData.available_permissions;
      await loadKeys();
    } catch (err) {
      console.error('API keys load error:', err);
      error = 'Failed to load API keys (admin access required)';
    } finally {
      loading = false;
    }
  }

  async function loadKeys() {
    if (!currentOrg) return;
    keys = await api.apiKeys.list(currentOrg.id);
  }

  function toggleScope(token: string) {
    const next = new Set(formScopes);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    formScopes = next;
  }

  function resetForm() {
    formName = '';
    formScopes = new Set(['session:read', 'response:read']);
    formExpires = '';
  }

  async function handleCreate() {
    if (!currentOrg) return;
    if (!formName.trim()) {
      toast.error('A name is required');
      return;
    }
    if (formScopes.size === 0) {
      toast.error('Select at least one scope');
      return;
    }
    saving = true;
    try {
      const res = await api.apiKeys.create(currentOrg.id, {
        name: formName.trim(),
        scopes: Array.from(formScopes),
        expires_at: formExpires ? new Date(formExpires).toISOString() : null,
      });
      newKey = res.key;
      copied = false;
      toast.success('API key created', {
        message: 'Copy it now — it will not be shown again.',
      });
      showAddForm = false;
      resetForm();
      await loadKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      saving = false;
    }
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      copied = true;
    } catch {
      copied = false;
    }
  }

  async function handleRevoke(k: ApiKeyRecord) {
    if (!currentOrg) return;
    const ok = await confirmDialog({
      title: 'Revoke API key',
      message: `Revoke "${k.name}" (${k.prefix}…)? Any integration using it stops working immediately.`,
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.apiKeys.revoke(currentOrg.id, k.id);
      toast.success('API key revoked');
      await loadKeys();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke API key');
    }
  }

  function fmtDate(s: string | null): string {
    if (!s) return '—';
    return new Date(s).toLocaleString();
  }

  function isExpired(k: ApiKeyRecord): boolean {
    return !!k.expires_at && new Date(k.expires_at).getTime() < Date.now();
  }
</script>

<div class="p-8">
  <div class="mb-8 flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-foreground">API Keys</h1>
      <p class="mt-2 text-muted-foreground">
        Machine keys for programmatic access to the analytics & export API of {currentOrg?.name ||
          'your organization'}, scoped to exactly the permissions you grant.
      </p>
    </div>
    <Button variant="primary" onclick={() => (showAddForm = !showAddForm)}>
      {showAddForm ? 'Cancel' : 'Create API Key'}
    </Button>
  </div>

  {#if error}
    <Alert variant="error" class="mb-4">{error}</Alert>
  {/if}

  {#if newKey}
    <Card class="mb-8 border-primary">
      <h3 class="text-lg font-semibold mb-2">Your new API key</h3>
      <p class="text-sm text-muted-foreground mb-3">
        Copy it now — for security it is never shown again. Use it as a bearer token:
        <code class="text-xs">Authorization: Bearer &lt;key&gt;</code>
      </p>
      <div class="flex items-center gap-2">
        <code
          class="flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
          >{newKey}</code
        >
        <Button variant="secondary" onclick={copyKey}>{copied ? 'Copied' : 'Copy'}</Button>
        <Button variant="ghost" onclick={() => (newKey = null)}>Dismiss</Button>
      </div>
    </Card>
  {/if}

  {#if showAddForm}
    <Card class="mb-8">
      <h3 class="text-lg font-semibold mb-4">New API Key</h3>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
        class="space-y-4"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <FormGroup label="Name" id="key-name">
            <Input id="key-name" type="text" bind:value={formName} placeholder="CI export bot" />
          </FormGroup>
          <FormGroup label="Expires (optional)" id="key-expires">
            <input
              id="key-expires"
              type="datetime-local"
              bind:value={formExpires}
              class="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </FormGroup>
        </div>

        <div>
          <span class="mb-2 block text-sm font-medium text-foreground">Scopes</span>
          <div class="grid gap-2 md:grid-cols-2">
            {#each availableScopes as scope (scope)}
              <label class="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={formScopes.has(scope)}
                  onchange={() => toggleScope(scope)}
                />
                <span>{scopeLabel(scope)}</span>
                <code class="text-xs text-muted-foreground">{scope}</code>
              </label>
            {/each}
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            A key can never exceed the access of its creator; scopes narrow it further. For
            export/analytics, <code class="text-xs">session:read</code> +
            <code class="text-xs">response:read</code> is typical.
          </p>
        </div>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="secondary" onclick={() => (showAddForm = false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>Create</Button>
        </div>
      </form>
    </Card>
  {/if}

  {#if loading}
    <div class="space-y-4">
      {#each Array(2) as _}
        <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div class="mb-2 h-5 w-48 animate-pulse rounded bg-muted"></div>
          <div class="h-3 w-64 animate-pulse rounded bg-muted"></div>
        </div>
      {/each}
    </div>
  {:else if keys.length === 0}
    <Card>
      <div class="py-8 text-center">
        <p class="text-muted-foreground">No API keys yet</p>
        <p class="mt-2 text-sm text-muted-foreground">
          Create a scoped key to let a script or integration read analytics and export responses.
        </p>
      </div>
    </Card>
  {:else}
    <div class="space-y-4">
      {#each keys as k (k.id)}
        <Card>
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3">
                <h3 class="text-lg font-semibold">{k.name}</h3>
                {#if k.revoked_at}
                  <Badge variant="secondary">Revoked</Badge>
                {:else if isExpired(k)}
                  <Badge variant="warning">Expired</Badge>
                {:else}
                  <Badge variant="success">Active</Badge>
                {/if}
                <code class="text-xs text-muted-foreground">{k.prefix}…</code>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                {#each k.scopes as s (s)}
                  <Badge variant="info">{scopeLabel(s)}</Badge>
                {/each}
              </div>
              <p class="mt-2 text-sm text-muted-foreground">
                Created {fmtDate(k.created_at)} · Last used {fmtDate(k.last_used_at)}
                {#if k.expires_at}
                  · Expires {fmtDate(k.expires_at)}
                {/if}
              </p>
            </div>
            <div class="flex gap-2">
              {#if !k.revoked_at}
                <Button variant="destructive" onclick={() => handleRevoke(k)}>Revoke</Button>
              {/if}
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>
