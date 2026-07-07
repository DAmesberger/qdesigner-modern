<script lang="ts">
  import { api } from '$lib/services/api';
  import { toast } from '$lib/stores/toast';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { appPaths } from '$lib/routing/paths';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ShareDialog from '$lib/components/ShareDialog.svelte';
  import { ArrowLeft, UserPlus, Share2 } from 'lucide-svelte';
  import type { ProjectMember } from '$lib/api/generated/types.gen';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Project role ladder (mirrors projects.rs role validation).
  const ROLE_OPTIONS = ['viewer', 'editor', 'admin', 'owner'] as const;

  let members = $state<ProjectMember[]>(data.members ?? []);
  let updatingUserId = $state<string | null>(null);
  let removingUserId = $state<string | null>(null);
  let error = $state<string | null>(null);

  // Add-member form.
  let addEmail = $state('');
  let addRole = $state<string>('editor');
  let adding = $state(false);

  // External sharing (E-RBAC-10) — grant a scoped, time-limited role to a
  // collaborator/guest who is NOT (and need not become) an org member.
  let shareDialogOpen = $state(false);

  const currentUserId = data.currentUserId;

  // The viewer's effective role: project owner/admin OR org owner/admin may
  // manage members (mirrors projects.rs:568-586).
  const currentProjectRole = $derived(
    members.find((m) => m.user_id === currentUserId)?.role ?? null
  );
  const currentOrgRole = $derived(
    (data.orgMembers ?? []).find((m) => m.userId === currentUserId)?.role ?? null
  );
  const canManage = $derived(
    currentProjectRole === 'owner' ||
      currentProjectRole === 'admin' ||
      currentOrgRole === 'owner' ||
      currentOrgRole === 'admin'
  );

  // Org members not yet on the project — candidates for the add picker.
  const addableOrgMembers = $derived(
    (data.orgMembers ?? []).filter(
      (om) => !members.some((pm) => pm.user_id === om.userId)
    )
  );

  function roleLabel(role: string): string {
    return getRoleBadge(role).label;
  }

  function getRoleBadge(role: string): {
    variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
    label: string;
  } {
    switch (role) {
      case 'owner':
        return { variant: 'primary', label: 'Owner' };
      case 'admin':
        return { variant: 'warning', label: 'Admin' };
      case 'editor':
        return { variant: 'info', label: 'Editor' };
      case 'viewer':
        return { variant: 'secondary', label: 'Viewer' };
      default:
        return { variant: 'secondary', label: role };
    }
  }

  // Only an owner may grant/revoke the owner role; nobody edits their own row
  // (guards against self-lockout).
  function canEditRole(member: ProjectMember): boolean {
    if (!canManage) return false;
    if (member.user_id === currentUserId) return false;
    if (member.role === 'owner' && currentProjectRole !== 'owner' && currentOrgRole !== 'owner')
      return false;
    return true;
  }

  async function reloadMembers() {
    members = await api.projects.members.list(data.project.id);
  }

  async function addMember() {
    const email = addEmail.trim();
    if (!email) return;

    adding = true;
    error = null;
    try {
      await api.projects.members.add(data.project.id, { email, role: addRole });
      toast.success('Member added');
      addEmail = '';
      addRole = 'editor';
      await reloadMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add member';
      error = message;
      toast.error(message);
    } finally {
      adding = false;
    }
  }

  async function changeRole(member: ProjectMember, newRole: string) {
    if (newRole === member.role) return;

    const name = member.full_name || member.email || 'this member';
    if (
      !(await confirmDialog({
        title: 'Change role?',
        message: `Change ${name}'s project role to ${roleLabel(newRole)}?`,
        confirmLabel: 'Change role',
      }))
    ) {
      members = members; // revert the <select>
      return;
    }

    const prevRole = member.role;
    updatingUserId = member.user_id;
    member.role = newRole;
    members = members; // optimistic
    try {
      await api.projects.members.update(data.project.id, member.user_id, { role: newRole });
      toast.success('Role updated');
      await reloadMembers();
    } catch (err) {
      member.role = prevRole;
      members = members; // roll back
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      updatingUserId = null;
    }
  }

  // E-RBAC-5: hand the project to another member. The server promotes the
  // target to owner and demotes any prior owner to admin in one guarded tx —
  // the sanctioned path past the "can't remove the last owner" guard. Allowed
  // for the current project owner or an org owner/admin.
  const canTransferOwnership = $derived(
    currentProjectRole === 'owner' || currentOrgRole === 'owner' || currentOrgRole === 'admin'
  );
  let transferringUserId = $state<string | null>(null);

  async function transferOwnership(member: ProjectMember) {
    const name = member.full_name || member.email || 'this member';
    if (
      !(await confirmDialog({
        title: 'Transfer ownership?',
        message: `Make ${name} the owner of ${data.project.name}? Any current owner is demoted to admin.`,
        confirmLabel: 'Transfer ownership',
      }))
    )
      return;

    transferringUserId = member.user_id;
    try {
      await api.projects.transferOwnership(data.project.id, member.user_id);
      toast.success('Ownership transferred');
      await reloadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
    } finally {
      transferringUserId = null;
    }
  }

  async function removeMember(member: ProjectMember) {
    const name = member.full_name || member.email || 'this member';
    if (
      !(await confirmDialog({
        title: 'Remove member?',
        message: `Remove ${name} from ${data.project.name}?`,
        confirmLabel: 'Remove',
        destructive: true,
      }))
    )
      return;

    removingUserId = member.user_id;
    try {
      await api.projects.members.remove(data.project.id, member.user_id);
      members = members.filter((m) => m.user_id !== member.user_id);
      toast.success('Member removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      removingUserId = null;
    }
  }

  function formatDate(date: string | null | undefined) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <a
      href={appPaths.project(data.project.id)}
      class="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft class="h-4 w-4 mr-1" />
      Back to {data.project.name}
    </a>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-foreground">Members</h1>
        <p class="mt-2 text-muted-foreground">
          Manage who can access and edit {data.project.name}.
        </p>
      </div>
      {#if canManage}
        <Button variant="outline" onclick={() => (shareDialogOpen = true)}>
          <Share2 class="h-4 w-4 mr-2" />
          Share externally
        </Button>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="mb-4">
      <Alert variant="error">{error}</Alert>
    </div>
  {/if}

  {#if canManage}
    <Card class="mb-6">
      <h3 class="text-lg font-semibold mb-4">Add member</h3>
      <p class="text-sm text-muted-foreground mb-4">
        Add an existing organization member to this project. Editors and above can
        edit the questionnaire; viewers have read-only access.
      </p>
      <form
        class="flex flex-wrap items-end gap-3"
        onsubmit={(e) => {
          e.preventDefault();
          addMember();
        }}
      >
        <div class="flex-1 min-w-[220px]">
          <label for="add-email" class="block text-sm font-medium text-foreground mb-1">
            Organization member
          </label>
          {#if addableOrgMembers.length > 0}
            <select
              id="add-email"
              bind:value={addEmail}
              class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select a member…</option>
              {#each addableOrgMembers as om}
                <option value={om.user?.email ?? ''}>
                  {om.user?.fullName || om.user?.full_name || om.user?.email}
                </option>
              {/each}
            </select>
          {:else}
            <input
              id="add-email"
              type="email"
              bind:value={addEmail}
              placeholder="member@example.com"
              class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          {/if}
        </div>
        <div class="min-w-[140px]">
          <label for="add-role" class="block text-sm font-medium text-foreground mb-1">
            Role
          </label>
          <select
            id="add-role"
            bind:value={addRole}
            class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {#each ROLE_OPTIONS as opt}
              <option
                value={opt}
                disabled={opt === 'owner' &&
                  currentProjectRole !== 'owner' &&
                  currentOrgRole !== 'owner'}
              >
                {roleLabel(opt)}
              </option>
            {/each}
          </select>
        </div>
        <Button type="submit" variant="primary" loading={adding} disabled={!addEmail.trim()}>
          <UserPlus class="h-4 w-4 mr-2" />
          Add
        </Button>
      </form>
    </Card>
  {/if}

  <Card>
    {#if members.length === 0}
      <div class="text-center py-8">
        <p class="text-muted-foreground">No members yet</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left">
              <th class="pb-3 text-sm font-medium text-muted-foreground">User</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground">Role</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground">Joined</th>
              {#if canManage}
                <th class="pb-3 text-sm font-medium text-muted-foreground text-right">Actions</th>
              {/if}
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each members as member}
              <tr>
                <td class="py-3">
                  <div>
                    <p class="font-medium text-foreground">
                      {member.full_name || 'Unnamed user'}
                    </p>
                    <p class="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </td>
                <td class="py-3">
                  {#if canEditRole(member)}
                    <select
                      class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      value={member.role}
                      disabled={updatingUserId === member.user_id}
                      aria-label="Change role for {member.email}"
                      onchange={(e) => changeRole(member, e.currentTarget.value)}
                    >
                      {#each ROLE_OPTIONS as opt}
                        <option
                          value={opt}
                          disabled={opt === 'owner' &&
                            currentProjectRole !== 'owner' &&
                            currentOrgRole !== 'owner'}
                        >
                          {roleLabel(opt)}
                        </option>
                      {/each}
                    </select>
                  {:else}
                    <Badge {...getRoleBadge(member.role)} />
                  {/if}
                </td>
                <td class="py-3 text-sm text-muted-foreground">
                  {formatDate(member.joined_at)}
                </td>
                {#if canManage}
                  <td class="py-3 text-right">
                    {#if member.user_id === currentUserId}
                      <span class="text-sm text-muted-foreground">You</span>
                    {:else}
                      <div class="inline-flex items-center gap-2">
                        {#if canTransferOwnership && member.role !== 'owner'}
                          <button
                            type="button"
                            class="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={transferringUserId === member.user_id}
                            onclick={() => transferOwnership(member)}
                          >
                            {transferringUserId === member.user_id ? 'Transferring…' : 'Make owner'}
                          </button>
                        {/if}
                        <button
                          type="button"
                          class="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={removingUserId === member.user_id}
                          onclick={() => removeMember(member)}
                        >
                          {removingUserId === member.user_id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    {/if}
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>
</div>

<ShareDialog
  bind:open={shareDialogOpen}
  kind="project"
  resourceId={data.project.id}
  resourceName={data.project.name}
/>
