<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import { toast } from '$lib/stores/toast';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import type { OrganizationMember } from '$lib/shared/types/api';

  const ROLE_OPTIONS = ['owner', 'admin', 'member', 'viewer'] as const;

  let members: OrganizationMember[] = [];
  let loading = true;
  let error: string | null = null;
  let removingUserId: string | null = null;
  let updatingUserId: string | null = null;
  let currentUserId: string | null = null;

  let currentOrg: any = null;

  // The current user's own role in this org drives which controls are enabled.
  $: currentUserRole = members.find((m) => m.userId === currentUserId)?.role ?? null;
  $: canManageRoles = currentUserRole === 'owner' || currentUserRole === 'admin';

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      const user = await auth.getUser();
      if (!user) return;
      currentUserId = user.id;

      const orgs = await api.organizations.list();
      if (!orgs || orgs.length === 0) {
        error = 'Only organization members can view users';
        loading = false;
        return;
      }

      currentOrg = orgs[0];
      await loadMembers();
    } catch (err) {
      console.error('Error loading data:', err);
      error = 'Failed to load data';
    } finally {
      loading = false;
    }
  }

  async function loadMembers() {
    if (!currentOrg) return;

    try {
      members = await api.organizations.members.list(currentOrg.id);
    } catch (err) {
      console.error('Error loading members:', err);
      error = 'Failed to load members';
    }
  }

  async function removeMember(member: OrganizationMember) {
    if (!currentOrg) return;

    const name = member.user?.fullName || member.user?.full_name || member.user?.email || 'this member';
    if (!confirm(`Remove ${name} from ${currentOrg.name || 'the organization'}?`)) return;

    removingUserId = member.userId;
    try {
      await api.organizations.members.remove(currentOrg.id, member.userId);
      members = members.filter((m) => m.userId !== member.userId);
      toast.success('Member removed');
    } catch (err) {
      console.error('Error removing member:', err);
      toast.error('Failed to remove member');
    } finally {
      removingUserId = null;
    }
  }

  // Whether the current user may change this member's role.
  function canEditRole(member: OrganizationMember): boolean {
    if (!canManageRoles) return false;
    if (member.userId === currentUserId) return false; // guard against self-lockout
    // Only an owner may grant or revoke the owner role.
    if (member.role === 'owner' && currentUserRole !== 'owner') return false;
    return true;
  }

  function roleLabel(role: string): string {
    return getRoleBadge(role).label;
  }

  async function changeRole(member: OrganizationMember, newRole: string) {
    if (!currentOrg || newRole === member.role) return;

    const name =
      member.user?.fullName || member.user?.full_name || member.user?.email || 'this member';
    if (!confirm(`Change ${name}'s role to ${roleLabel(newRole)}?`)) {
      members = members; // revert the <select> back to the current role
      return;
    }

    const prevRole = member.role;
    updatingUserId = member.userId;
    member.role = newRole as OrganizationMember['role'];
    members = members; // optimistic update
    try {
      await api.organizations.members.changeRole(currentOrg.id, member.userId, newRole);
      toast.success('Role updated');
      await loadMembers(); // refetch the authoritative list
    } catch (err) {
      member.role = prevRole;
      members = members; // roll back the optimistic change
      console.error('Error changing role:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      updatingUserId = null;
    }
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
      case 'member':
        return { variant: 'secondary', label: 'Member' };
      case 'viewer':
        return { variant: 'secondary', label: 'Viewer' };
      default:
        return { variant: 'secondary', label: role };
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
        <h1 class="text-3xl font-bold text-foreground">Users</h1>
        <p class="mt-2 text-muted-foreground">
          Members of {currentOrg?.name || 'your organization'}
        </p>
      </div>
      <a
        href="/admin/invitations"
        class="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
      >
        Invite User
      </a>
    </div>
  </div>

  {#if error}
    <div class="mb-4">
      <Alert variant="error">{error}</Alert>
    </div>
  {/if}

  {#if loading}
    <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div class="space-y-4">
        {#each Array(5) as _}
          <div class="flex items-center gap-4">
            <div class="h-4 w-40 animate-pulse rounded bg-muted"></div>
            <div class="h-4 w-20 animate-pulse rounded bg-muted"></div>
            <div class="h-4 w-24 animate-pulse rounded bg-muted"></div>
          </div>
        {/each}
      </div>
    </div>
  {:else if members.length === 0}
    <Card>
      <div class="text-center py-8">
        <p class="text-muted-foreground">No members found</p>
        <p class="text-sm text-muted-foreground mt-2">
          <a href="/admin/invitations" class="text-primary hover:underline">
            Invite members
          </a>
          to get started
        </p>
      </div>
    </Card>
  {:else}
    <Card>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-border text-left">
              <th class="pb-3 text-sm font-medium text-muted-foreground">User</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground">Role</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground">Joined</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each members as member}
              <tr>
                <td class="py-3">
                  <div>
                    <p class="font-medium text-foreground">
                      {member.user?.fullName || member.user?.full_name || 'Unnamed user'}
                    </p>
                    <p class="text-sm text-muted-foreground">{member.user?.email || ''}</p>
                  </div>
                </td>
                <td class="py-3">
                  {#if canEditRole(member)}
                    <select
                      class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      value={member.role}
                      disabled={updatingUserId === member.userId}
                      aria-label="Change role for {member.user?.email || 'member'}"
                      on:change={(e) => changeRole(member, e.currentTarget.value)}
                    >
                      {#each ROLE_OPTIONS as opt}
                        <option value={opt} disabled={opt === 'owner' && currentUserRole !== 'owner'}>
                          {roleLabel(opt)}
                        </option>
                      {/each}
                    </select>
                  {:else}
                    <Badge {...getRoleBadge(member.role)} />
                  {/if}
                </td>
                <td class="py-3 text-sm text-muted-foreground">
                  {formatDate(member.joinedAt)}
                </td>
                <td class="py-3 text-right">
                  {#if member.role === 'owner'}
                    <span class="text-sm text-muted-foreground">—</span>
                  {:else}
                    <button
                      type="button"
                      class="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={removingUserId === member.userId}
                      on:click={() => removeMember(member)}
                    >
                      {removingUserId === member.userId ? 'Removing…' : 'Remove'}
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {/if}
</div>
