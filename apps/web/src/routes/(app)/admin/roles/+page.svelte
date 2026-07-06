<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import { toast } from '$lib/stores/toast';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import type { OrgRole } from '$lib/services/api/roles';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';

  // Human labels for the wire permission tokens (mirror Permission::as_str).
  const PERMISSION_LABELS: Record<string, string> = {
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

  const GROUP_LABELS: Record<string, string> = {
    org: 'Organization',
    project: 'Projects',
    questionnaire: 'Questionnaires',
    session: 'Sessions',
    response: 'Responses',
    media: 'Media',
  };

  function permLabel(token: string): string {
    return PERMISSION_LABELS[token] ?? token;
  }

  let orgId = $state<string | null>(null);
  let orgName = $state<string>('your organization');
  let roles = $state<OrgRole[]>([]);
  let availablePermissions = $state<string[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let saving = $state(false);

  // Editor state. `editorRoleId` is null while creating a new role, the
  // role id while editing one, and the whole editor is hidden when
  // `editorOpen` is false.
  let editorOpen = $state(false);
  let editorRoleId = $state<string | null>(null);
  let draftName = $state('');
  let draftPermissions = $state<Set<string>>(new Set());

  // Permissions grouped by resource prefix, preserving server order.
  const groupedPermissions = $derived.by(() => {
    const groups: { key: string; label: string; tokens: string[] }[] = [];
    const byKey = new Map<string, { key: string; label: string; tokens: string[] }>();
    for (const token of availablePermissions) {
      const prefix = token.split(':')[0] ?? token;
      let group = byKey.get(prefix);
      if (!group) {
        group = { key: prefix, label: GROUP_LABELS[prefix] ?? prefix, tokens: [] };
        byKey.set(prefix, group);
        groups.push(group);
      }
      group.tokens.push(token);
    }
    return groups;
  });

  onMount(loadData);

  async function loadData() {
    loading = true;
    error = null;
    try {
      const user = await auth.getUser();
      if (!user) return;
      const orgs = await api.organizations.list();
      const org = orgs?.[0];
      if (!org) {
        error = 'Only organization admins can manage roles';
        return;
      }
      orgId = org.id;
      orgName = org.name || 'your organization';
      await loadRoles();
    } catch (err) {
      console.error('Failed to load roles:', err);
      error = err instanceof Error ? err.message : 'Failed to load roles';
    } finally {
      loading = false;
    }
  }

  async function loadRoles() {
    if (!orgId) return;
    const res = await api.roles.list(orgId);
    roles = res.roles;
    availablePermissions = res.available_permissions;
  }

  function openCreate() {
    editorRoleId = null;
    draftName = '';
    draftPermissions = new Set();
    editorOpen = true;
  }

  function openEdit(role: OrgRole) {
    editorRoleId = role.id;
    draftName = role.name;
    draftPermissions = new Set(role.permissions);
    editorOpen = true;
  }

  function closeEditor() {
    editorOpen = false;
    editorRoleId = null;
  }

  function togglePermission(token: string) {
    const next = new Set(draftPermissions);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    draftPermissions = next;
  }

  async function saveRole() {
    if (!orgId) return;
    const name = draftName.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    const permissions = availablePermissions.filter((p) => draftPermissions.has(p));
    saving = true;
    try {
      if (editorRoleId) {
        await api.roles.update(orgId, editorRoleId, { name, permissions });
        toast.success('Role updated');
      } else {
        await api.roles.create(orgId, { name, permissions });
        toast.success('Role created');
      }
      await loadRoles();
      closeEditor();
    } catch (err) {
      console.error('Failed to save role:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save role');
    } finally {
      saving = false;
    }
  }

  async function deleteRole(role: OrgRole) {
    if (!orgId) return;
    if (
      !(await confirmDialog({
        title: 'Delete role?',
        message: `Delete the "${role.name}" role? Members holding it revert to their base role's defaults.`,
        confirmLabel: 'Delete',
        destructive: true,
      }))
    )
      return;
    try {
      await api.roles.remove(orgId, role.id);
      toast.success('Role deleted');
      if (editorRoleId === role.id) closeEditor();
      await loadRoles();
    } catch (err) {
      console.error('Failed to delete role:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete role');
    }
  }

  const systemRoles = $derived(roles.filter((r) => r.is_system));
  const customRoles = $derived(roles.filter((r) => !r.is_system));
</script>

<div class="p-8">
  <div class="mb-8 flex items-start justify-between">
    <div>
      <h1 class="text-3xl font-bold text-foreground">Roles &amp; Permissions</h1>
      <p class="mt-2 text-muted-foreground">
        Custom roles for {orgName}. Assign them to members on the
        <a href="/admin/users" class="text-primary hover:underline">Users</a> page.
      </p>
    </div>
    {#if !loading && orgId}
      <button
        type="button"
        class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        onclick={openCreate}
      >
        New Role
      </button>
    {/if}
  </div>

  {#if error}
    <div class="mb-4"><Alert variant="error">{error}</Alert></div>
  {/if}

  {#if loading}
    <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div class="space-y-4">
        {#each Array(4) as _}
          <div class="h-4 w-64 animate-pulse rounded bg-muted"></div>
        {/each}
      </div>
    </div>
  {:else if orgId}
    <!-- Editor -->
    {#if editorOpen}
      <div class="mb-6">
        <Card>
          <div class="p-1">
            <h2 class="mb-4 text-lg font-semibold text-foreground">
              {editorRoleId ? 'Edit role' : 'New custom role'}
            </h2>
            <label class="mb-4 block">
              <span class="mb-1 block text-sm font-medium text-foreground">Role name</span>
              <input
                type="text"
                class="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                placeholder="e.g. Analyst"
                bind:value={draftName}
              />
            </label>

            <p class="mb-2 text-sm font-medium text-foreground">Permissions</p>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {#each groupedPermissions as group}
                <fieldset class="rounded-md border border-border p-3">
                  <legend class="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </legend>
                  <div class="space-y-2">
                    {#each group.tokens as token}
                      <label class="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-border"
                          checked={draftPermissions.has(token)}
                          onchange={() => togglePermission(token)}
                        />
                        {permLabel(token)}
                      </label>
                    {/each}
                  </div>
                </fieldset>
              {/each}
            </div>

            <div class="mt-5 flex items-center gap-3">
              <button
                type="button"
                class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                disabled={saving}
                onclick={saveRole}
              >
                {saving ? 'Saving…' : editorRoleId ? 'Save changes' : 'Create role'}
              </button>
              <button
                type="button"
                class="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                onclick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      </div>
    {/if}

    <!-- Custom roles -->
    <div class="mb-8">
      <h2 class="mb-3 text-lg font-semibold text-foreground">Custom roles</h2>
      {#if customRoles.length === 0}
        <Card>
          <div class="py-8 text-center text-muted-foreground">
            No custom roles yet. Create one to grant a tailored set of permissions
            (e.g. an “Analyst” who can read analytics and export but not edit questionnaires).
          </div>
        </Card>
      {:else}
        <div class="space-y-3">
          {#each customRoles as role}
            <Card>
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="font-medium text-foreground">{role.name}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {#if role.permissions.length === 0}
                      <span class="text-sm text-muted-foreground">No permissions</span>
                    {:else}
                      {#each role.permissions as p}
                        <span class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {permLabel(p)}
                        </span>
                      {/each}
                    {/if}
                  </div>
                </div>
                <div class="flex shrink-0 gap-2">
                  <button
                    type="button"
                    class="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    onclick={() => openEdit(role)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    onclick={() => deleteRole(role)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          {/each}
        </div>
      {/if}
    </div>

    <!-- System presets (read-only) -->
    <div>
      <h2 class="mb-3 text-lg font-semibold text-foreground">System roles</h2>
      <p class="mb-3 text-sm text-muted-foreground">
        Built-in tiers. Their defaults apply to any member without a custom role and cannot be edited.
      </p>
      <div class="space-y-3">
        {#each systemRoles as role}
          <Card>
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium text-foreground">{role.name}</p>
                  <Badge variant="secondary" label="System" />
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  {#each role.permissions as p}
                    <span class="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {permLabel(p)}
                    </span>
                  {/each}
                </div>
              </div>
            </div>
          </Card>
        {/each}
      </div>
    </div>
  {/if}
</div>
