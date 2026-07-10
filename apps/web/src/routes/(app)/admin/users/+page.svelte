<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import { toast } from '$lib/stores/toast';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import type { OrganizationMember } from '$lib/shared/types/api';
  import type { OrgRole } from '$lib/services/api/roles';

  const ROLE_OPTIONS = ['owner', 'admin', 'member', 'viewer'] as const;

  let members = $state<OrganizationMember[]>([]);
  let customRoles = $state<OrgRole[]>([]);
  let loading = $state(true);

  // The members endpoint returns the full org roster in one shot, so page the
  // table client-side: render a growing slice via "Load more" (audit-log idiom).
  const PAGE_SIZE = 25;
  let visibleCount = $state(PAGE_SIZE);
  const visibleMembers = $derived(members.slice(0, visibleCount));
  let error = $state<string | null>(null);
  let removingUserId = $state<string | null>(null);
  let updatingUserId = $state<string | null>(null);
  let assigningUserId = $state<string | null>(null);
  let currentUserId = $state<string | null>(null);

  let currentOrg = $state<any>(null);

  // The current user's own role in this org drives which controls are enabled.
  const currentUserRole = $derived(members.find((m) => m.userId === currentUserId)?.role ?? null);
  const canManageRoles = $derived(currentUserRole === 'owner' || currentUserRole === 'admin');

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
      // Custom roles are admin-only; failure just hides the assignment column.
      try {
        const res = await api.roles.list(currentOrg.id);
        customRoles = res.roles.filter((r) => !r.is_system);
      } catch {
        customRoles = [];
      }
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
      visibleCount = PAGE_SIZE;
    } catch (err) {
      console.error('Error loading members:', err);
      error = 'Failed to load members';
    }
  }

  async function removeMember(member: OrganizationMember) {
    if (!currentOrg) return;

    const name = member.user?.fullName || member.user?.full_name || member.user?.email || 'this member';
    if (
      !(await confirmDialog({
        title: 'Remove member?',
        message: `Remove ${name} from ${currentOrg.name || 'the organization'}?`,
        confirmLabel: 'Remove',
        destructive: true,
      }))
    )
      return;

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

  // ── Ownership transfer (E-RBAC-5) ──────────────────────────────────
  // Only a current owner may hand the org to another member. Unlike a role
  // change, this promotes the target AND demotes the caller in one guarded
  // server tx, so the org is never left ownerless. Password re-confirmation
  // is required for the sensitive action.
  let transferOpen = $state(false);
  let transferTarget = $state<OrganizationMember | null>(null);
  let transferPassword = $state('');
  let transferDemote = $state(true);
  let transferring = $state(false);

  const canTransferOwnership = $derived(currentUserRole === 'owner');

  function openTransfer(member: OrganizationMember) {
    transferTarget = member;
    transferPassword = '';
    transferDemote = true;
    transferOpen = true;
  }

  async function confirmTransfer() {
    if (!currentOrg || !transferTarget || !transferPassword) return;
    transferring = true;
    try {
      await api.organizations.members.transferOwnership(
        currentOrg.id,
        transferTarget.userId,
        transferPassword,
        transferDemote
      );
      toast.success('Ownership transferred');
      transferOpen = false;
      transferTarget = null;
      transferPassword = '';
      await loadMembers();
    } catch (err) {
      console.error('Error transferring ownership:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to transfer ownership');
    } finally {
      transferring = false;
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
    if (
      !(await confirmDialog({
        title: 'Change role?',
        message: `Change ${name}'s role to ${roleLabel(newRole)}?`,
        confirmLabel: 'Change role',
      }))
    ) {
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

  // Assign (or clear, with '') a custom role for a member (E-RBAC-3).
  async function assignCustomRole(member: OrganizationMember, roleId: string) {
    if (!currentOrg) return;
    const next = roleId === '' ? null : roleId;
    if ((member.customRoleId ?? null) === next) return;

    const prev = member.customRoleId ?? null;
    const prevName = member.customRoleName ?? null;
    assigningUserId = member.userId;
    member.customRoleId = next;
    member.customRoleName = next ? (customRoles.find((r) => r.id === next)?.name ?? null) : null;
    members = members; // optimistic
    try {
      await api.roles.assign(currentOrg.id, member.userId, next);
      toast.success(next ? 'Custom role assigned' : 'Custom role cleared');
    } catch (err) {
      member.customRoleId = prev;
      member.customRoleName = prevName;
      members = members; // roll back
      console.error('Error assigning custom role:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to assign custom role');
    } finally {
      assigningUserId = null;
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
              {#if canManageRoles && customRoles.length > 0}
                <th class="pb-3 text-sm font-medium text-muted-foreground">Custom role</th>
              {/if}
              <th class="pb-3 text-sm font-medium text-muted-foreground">Joined</th>
              <th class="pb-3 text-sm font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each visibleMembers as member}
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
                      onchange={(e) => changeRole(member, e.currentTarget.value)}
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
                {#if canManageRoles && customRoles.length > 0}
                  <td class="py-3">
                    <select
                      class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                      value={member.customRoleId ?? ''}
                      disabled={assigningUserId === member.userId}
                      aria-label="Assign custom role for {member.user?.email || 'member'}"
                      onchange={(e) => assignCustomRole(member, e.currentTarget.value)}
                    >
                      <option value="">None</option>
                      {#each customRoles as role}
                        <option value={role.id}>{role.name}</option>
                      {/each}
                    </select>
                  </td>
                {/if}
                <td class="py-3 text-sm text-muted-foreground">
                  {formatDate(member.joinedAt)}
                </td>
                <td class="py-3 text-right">
                  {#if member.role === 'owner'}
                    <span class="text-sm text-muted-foreground">—</span>
                  {:else}
                    <div class="inline-flex items-center gap-2">
                      {#if canTransferOwnership && member.userId !== currentUserId}
                        <button
                          type="button"
                          class="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                          onclick={() => openTransfer(member)}
                        >
                          Transfer ownership
                        </button>
                      {/if}
                      <button
                        type="button"
                        class="inline-flex items-center px-3 py-1.5 rounded-md border border-border text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={removingUserId === member.userId}
                        onclick={() => removeMember(member)}
                      >
                        {removingUserId === member.userId ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if visibleCount < members.length}
        <div class="mt-4 text-center">
          <button
            type="button"
            class="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            onclick={() => (visibleCount += PAGE_SIZE)}
          >
            Load more ({members.length - visibleCount} remaining)
          </button>
        </div>
      {/if}
    </Card>
  {/if}
</div>

<Dialog bind:open={transferOpen} title="Transfer organization ownership" size="md">
  <div class="space-y-4">
    <p class="text-sm text-muted-foreground">
      You are about to make
      <span class="font-medium text-foreground">
        {transferTarget?.user?.fullName ||
          transferTarget?.user?.full_name ||
          transferTarget?.user?.email ||
          'this member'}
      </span>
      the owner of {currentOrg?.name || 'this organization'}. This is a privileged,
      audited action.
    </p>

    <label class="flex items-start gap-2 text-sm text-foreground">
      <input type="checkbox" bind:checked={transferDemote} class="mt-0.5" />
      <span>
        Step down to <span class="font-medium">admin</span> after the transfer.
        Leave unchecked to keep your own owner role (the org will have two owners).
      </span>
    </label>

    <div>
      <label for="transfer-password" class="block text-sm font-medium text-foreground mb-1">
        Confirm your password
      </label>
      <input
        id="transfer-password"
        type="password"
        autocomplete="current-password"
        bind:value={transferPassword}
        placeholder="Your account password"
        class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </div>
  </div>

  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="ghost" onclick={() => (transferOpen = false)} disabled={transferring}>
        Cancel
      </Button>
      <Button
        variant="primary"
        loading={transferring}
        disabled={!transferPassword || transferring}
        onclick={confirmTransfer}
      >
        Transfer ownership
      </Button>
    </div>
  {/snippet}
</Dialog>
