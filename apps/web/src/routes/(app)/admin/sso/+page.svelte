<script lang="ts">
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import type {
    IdentityProvider,
    CreateIdpBody,
    UpdateIdpBody,
  } from '$lib/services/api/sso';
  import type { ScimTokenRecord } from '$lib/services/api/scim-tokens';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import { toast } from '$lib/stores/toast';

  let loading = $state(true);
  let saving = $state(false);
  // Page-level load failure only (persists in place of the list); transient
  // create/update/revoke feedback goes through toast.
  let error = $state<string | null>(null);

  let currentOrg = $state<{ id: string; name: string } | null>(null);
  let providers = $state<IdentityProvider[]>([]);

  // ── SCIM provisioning tokens ──
  let scimTokens = $state<ScimTokenRecord[]>([]);
  let scimTokenName = $state('');
  let scimNewToken = $state<string | null>(null);
  let scimCopied = $state(false);
  const scimBaseUrl = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/scim/v2`;

  // ── Add-provider form ── (concrete non-null strings so they bind to <Input>)
  interface IdpForm {
    protocol: string;
    display_name: string;
    issuer: string;
    metadata_url: string;
    client_id: string;
    client_secret: string;
    default_role: string;
    group_claim: string;
    group_role_map_text: string;
    enforce_role_mapping: boolean;
    enabled: boolean;
  }
  let showAddForm = $state(false);
  const emptyForm = (): IdpForm => ({
    protocol: 'oidc',
    display_name: '',
    issuer: '',
    metadata_url: '',
    client_id: '',
    client_secret: '',
    default_role: 'member',
    group_claim: 'groups',
    group_role_map_text: '{\n  "lab-admins": "admin"\n}',
    enforce_role_mapping: false,
    enabled: true,
  });
  let form = $state<IdpForm>(emptyForm());

  // ── Per-provider inline edit state ──
  let editingId = $state<string | null>(null);
  let editDefaultRole = $state('member');
  let editGroupClaim = $state('groups');
  let editGroupMapText = $state('{}');
  let editEnforce = $state(false);
  let editNewSecret = $state('');

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
        error = 'You must belong to an organization to configure SSO';
        loading = false;
        return;
      }
      currentOrg = { id: org.id, name: org.name };
      await Promise.all([loadProviders(), loadScimTokens()]);
    } catch (err) {
      console.error('SSO load error:', err);
      error = 'Failed to load SSO configuration (owner access required)';
    } finally {
      loading = false;
    }
  }

  async function loadProviders() {
    if (!currentOrg) return;
    providers = await api.sso.list(currentOrg.id);
  }

  async function loadScimTokens() {
    if (!currentOrg) return;
    scimTokens = await api.scimTokens.list(currentOrg.id);
  }

  async function createScimToken() {
    if (!currentOrg) return;
    saving = true;
    try {
      const res = await api.scimTokens.create(currentOrg.id, scimTokenName.trim() || undefined);
      scimNewToken = res.token;
      scimCopied = false;
      scimTokenName = '';
      toast.success('SCIM token created', {
        message: 'Copy it now — it will not be shown again.',
      });
      await loadScimTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create SCIM token');
    } finally {
      saving = false;
    }
  }

  async function copyScimToken() {
    if (!scimNewToken) return;
    try {
      await navigator.clipboard.writeText(scimNewToken);
      scimCopied = true;
    } catch {
      scimCopied = false;
    }
  }

  async function revokeScimToken(t: ScimTokenRecord) {
    if (!currentOrg) return;
    const ok = await confirmDialog({
      title: 'Revoke SCIM token',
      message: `Revoke "${t.name}" (${t.prefix}…)? The IdP connector using it stops provisioning immediately.`,
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.scimTokens.revoke(currentOrg.id, t.id);
      toast.success('SCIM token revoked');
      await loadScimTokens();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke SCIM token');
    }
  }

  function parseGroupMap(text: string): Record<string, string> | null {
    const trimmed = text.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  async function handleAdd() {
    if (!currentOrg) return;
    const map = parseGroupMap(form.group_role_map_text);
    if (map === null) {
      toast.error('Group → role map must be a JSON object, e.g. {"lab-admins": "admin"}');
      return;
    }
    saving = true;
    try {
      const body: CreateIdpBody = {
        protocol: form.protocol,
        display_name: form.display_name || null,
        issuer: form.issuer || null,
        metadata_url: form.metadata_url || null,
        client_id: form.client_id || null,
        client_secret: form.client_secret || null,
        default_role: form.default_role,
        group_claim: form.group_claim || 'groups',
        group_role_map: map,
        enforce_role_mapping: form.enforce_role_mapping,
        enabled: form.enabled,
      };
      await api.sso.create(currentOrg.id, body);
      toast.success('Identity provider created');
      showAddForm = false;
      form = emptyForm();
      await loadProviders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create identity provider');
    } finally {
      saving = false;
    }
  }

  function startEdit(p: IdentityProvider) {
    editingId = p.id;
    editDefaultRole = p.default_role;
    editGroupClaim = p.group_claim;
    editGroupMapText = JSON.stringify(p.group_role_map ?? {}, null, 2);
    editEnforce = p.enforce_role_mapping;
    editNewSecret = '';
  }

  async function saveEdit(p: IdentityProvider) {
    if (!currentOrg) return;
    const map = parseGroupMap(editGroupMapText);
    if (map === null) {
      toast.error('Group → role map must be a JSON object');
      return;
    }
    saving = true;
    try {
      const body: UpdateIdpBody = {
        default_role: editDefaultRole,
        group_claim: editGroupClaim,
        group_role_map: map,
        enforce_role_mapping: editEnforce,
      };
      if (editNewSecret) body.client_secret = editNewSecret;
      await api.sso.update(currentOrg.id, p.id, body);
      toast.success('Identity provider updated');
      editingId = null;
      await loadProviders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update identity provider');
    } finally {
      saving = false;
    }
  }

  async function toggleEnabled(p: IdentityProvider) {
    if (!currentOrg) return;
    try {
      await api.sso.update(currentOrg.id, p.id, { enabled: !p.enabled });
      await loadProviders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update identity provider');
    }
  }

  async function handleDelete(p: IdentityProvider) {
    if (!currentOrg) return;
    const ok = await confirmDialog({
      title: 'Delete identity provider',
      message: `Delete "${p.display_name || p.protocol}"? Users can no longer sign in through it.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.sso.remove(currentOrg.id, p.id);
      toast.success('Identity provider deleted');
      await loadProviders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete identity provider');
    }
  }
</script>

<div class="p-8">
  <div class="mb-8 flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-foreground">Single Sign-On</h1>
      <p class="mt-2 text-muted-foreground">
        Configure federated login (OIDC) for {currentOrg?.name || 'your organization'}. New members
        are provisioned just-in-time at the mapped role.
      </p>
    </div>
    <Button variant="primary" onclick={() => (showAddForm = !showAddForm)}>
      {showAddForm ? 'Cancel' : 'Add Identity Provider'}
    </Button>
  </div>

  {#if error}
    <Alert variant="error" class="mb-4">{error}</Alert>
  {/if}

  {#if showAddForm}
    <Card class="mb-8">
      <h3 class="text-lg font-semibold mb-4">New Identity Provider</h3>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
        class="space-y-4"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <FormGroup label="Protocol" id="idp-protocol">
            <select
              id="idp-protocol"
              bind:value={form.protocol}
              class="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="oidc">OpenID Connect (OIDC)</option>
              <option value="saml" disabled>SAML — not yet available</option>
            </select>
            <p class="text-sm text-muted-foreground mt-1">
              SAML is not yet available in this build. Configure an OIDC provider for now.
            </p>
          </FormGroup>
          <FormGroup label="Display name" id="idp-name">
            <Input id="idp-name" type="text" bind:value={form.display_name} placeholder="Acme SSO" />
          </FormGroup>
        </div>

        <FormGroup label="Discovery / metadata URL" id="idp-meta">
          <Input
            id="idp-meta"
            type="url"
            bind:value={form.metadata_url}
            placeholder="https://idp.example.com/.well-known/openid-configuration"
          />
          <p class="text-sm text-muted-foreground mt-1">
            Reachability is verified when you save.
          </p>
        </FormGroup>

        <FormGroup label="Issuer" id="idp-issuer">
          <Input
            id="idp-issuer"
            type="text"
            bind:value={form.issuer}
            placeholder="https://idp.example.com/"
          />
        </FormGroup>

        <div class="grid gap-4 md:grid-cols-2">
          <FormGroup label="Client ID" id="idp-client-id">
            <Input id="idp-client-id" type="text" bind:value={form.client_id} />
          </FormGroup>
          <FormGroup label="Client secret" id="idp-client-secret">
            <Input
              id="idp-client-secret"
              type="password"
              bind:value={form.client_secret}
              placeholder="stored encrypted"
            />
          </FormGroup>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <FormGroup label="Default role" id="idp-default-role">
            <select
              id="idp-default-role"
              bind:value={form.default_role}
              class="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </FormGroup>
          <FormGroup label="Group claim" id="idp-group-claim">
            <Input id="idp-group-claim" type="text" bind:value={form.group_claim} placeholder="groups" />
          </FormGroup>
        </div>

        <FormGroup label="Group → role map (JSON)" id="idp-group-map">
          <textarea
            id="idp-group-map"
            bind:value={form.group_role_map_text}
            rows="4"
            class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
          ></textarea>
          <p class="text-sm text-muted-foreground mt-1">
            Map IdP group names to org roles. Unmatched groups fall back to the default role.
          </p>
        </FormGroup>

        <label class="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" bind:checked={form.enforce_role_mapping} />
          Enforce IdP-managed roles (block manual role changes for federated members)
        </label>
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" bind:checked={form.enabled} />
          Enabled
        </label>

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
          <div class="h-5 w-48 animate-pulse rounded bg-muted mb-2"></div>
          <div class="h-3 w-64 animate-pulse rounded bg-muted"></div>
        </div>
      {/each}
    </div>
  {:else if providers.length === 0}
    <Card>
      <div class="text-center py-8">
        <p class="text-muted-foreground">No identity providers configured yet</p>
        <p class="text-sm text-muted-foreground mt-2">
          Add an OIDC provider to enable federated sign-in for your organization.
        </p>
      </div>
    </Card>
  {:else}
    <div class="space-y-4">
      {#each providers as p (p.id)}
        <Card>
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3">
                <h3 class="font-semibold text-lg">{p.display_name || p.protocol.toUpperCase()}</h3>
                <Badge variant={p.enabled ? 'success' : 'secondary'}>
                  {p.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Badge variant="info">{p.protocol.toUpperCase()}</Badge>
                {#if p.enforce_role_mapping}
                  <Badge variant="warning">IdP-managed roles</Badge>
                {/if}
              </div>
              <p class="text-sm text-muted-foreground mt-1 break-all">{p.metadata_url}</p>
              <p class="text-sm text-muted-foreground mt-1">
                Default role: <span class="font-medium">{p.default_role}</span>
                · Client secret: {p.has_client_secret ? 'set' : 'none'}
              </p>
            </div>
            <div class="flex gap-2">
              <Button variant="secondary" onclick={() => toggleEnabled(p)}>
                {p.enabled ? 'Disable' : 'Enable'}
              </Button>
              <Button
                variant="secondary"
                onclick={() => (editingId === p.id ? (editingId = null) : startEdit(p))}
              >
                {editingId === p.id ? 'Close' : 'Edit'}
              </Button>
              <Button variant="destructive" onclick={() => handleDelete(p)}>Delete</Button>
            </div>
          </div>

          {#if editingId === p.id}
            <div class="mt-4 border-t border-border pt-4 space-y-4">
              <div class="grid gap-4 md:grid-cols-2">
                <FormGroup label="Default role" id={`edit-role-${p.id}`}>
                  <select
                    id={`edit-role-${p.id}`}
                    bind:value={editDefaultRole}
                    class="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </FormGroup>
                <FormGroup label="Group claim" id={`edit-claim-${p.id}`}>
                  <Input id={`edit-claim-${p.id}`} type="text" bind:value={editGroupClaim} />
                </FormGroup>
              </div>
              <FormGroup label="Group → role map (JSON)" id={`edit-map-${p.id}`}>
                <textarea
                  id={`edit-map-${p.id}`}
                  bind:value={editGroupMapText}
                  rows="4"
                  class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
                ></textarea>
              </FormGroup>
              <FormGroup label="Rotate client secret (optional)" id={`edit-secret-${p.id}`}>
                <Input
                  id={`edit-secret-${p.id}`}
                  type="password"
                  bind:value={editNewSecret}
                  placeholder="leave blank to keep current"
                />
              </FormGroup>
              <label class="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" bind:checked={editEnforce} />
                Enforce IdP-managed roles
              </label>
              <div class="flex justify-end gap-2">
                <Button variant="secondary" onclick={() => (editingId = null)}>Cancel</Button>
                <Button variant="primary" loading={saving} onclick={() => saveEdit(p)}>Save</Button>
              </div>
            </div>
          {/if}
        </Card>
      {/each}
    </div>
  {/if}

  <!-- ── SCIM provisioning ── -->
  <div class="mt-12">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-foreground">SCIM Provisioning</h2>
        <p class="mt-1 text-muted-foreground">
          Let your IdP automatically de/provision members. Point its SCIM connector at the base URL
          below and authenticate with a token.
        </p>
      </div>
      <Button variant="primary" onclick={() => void createScimToken()} loading={saving}>
        Generate SCIM Token
      </Button>
    </div>

    <Card class="mb-4">
      <FormGroup label="Optional token label" id="scim-name">
        <Input id="scim-name" type="text" bind:value={scimTokenName} placeholder="Okta production" />
      </FormGroup>
      <p class="mt-2 text-sm text-muted-foreground">
        SCIM 2.0 base URL: <code class="break-all text-xs">{scimBaseUrl}</code>
      </p>
    </Card>

    {#if scimNewToken}
      <Card class="mb-4 border-primary">
        <h3 class="mb-2 text-lg font-semibold">Your new SCIM token</h3>
        <p class="mb-3 text-sm text-muted-foreground">
          Copy it now — it is never shown again. Configure it as the bearer token in your IdP's SCIM
          connector.
        </p>
        <div class="flex items-center gap-2">
          <code
            class="flex-1 break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
            >{scimNewToken}</code
          >
          <Button variant="secondary" onclick={() => void copyScimToken()}>
            {scimCopied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" onclick={() => (scimNewToken = null)}>Dismiss</Button>
        </div>
      </Card>
    {/if}

    {#if scimTokens.length === 0}
      <Card>
        <div class="py-6 text-center text-muted-foreground">
          No SCIM tokens yet. Generate one to enable directory-driven provisioning.
        </div>
      </Card>
    {:else}
      <div class="space-y-3">
        {#each scimTokens as t (t.id)}
          <Card>
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-3">
                  <h3 class="font-semibold">{t.name}</h3>
                  <Badge variant={t.enabled ? 'success' : 'secondary'}>
                    {t.enabled ? 'Active' : 'Revoked'}
                  </Badge>
                  <code class="text-xs text-muted-foreground">{t.prefix}…</code>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  Created {t.created_at ? new Date(t.created_at).toLocaleString() : '—'} · Last used
                  {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'never'}
                </p>
              </div>
              {#if t.enabled}
                <Button variant="destructive" onclick={() => void revokeScimToken(t)}>Revoke</Button>
              {/if}
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
