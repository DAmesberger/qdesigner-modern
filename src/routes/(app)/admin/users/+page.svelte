<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import Card from '$lib/components/common/Card.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import type { OrganizationMember } from '$lib/types/api';

  let members: OrganizationMember[] = [];
  let loading = true;
  let error: string | null = null;

  let currentOrg: any = null;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    try {
      const user = await auth.getUser();
      if (!user) return;

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
    <div class="flex justify-center py-8">
      <div class="text-muted-foreground">Loading users...</div>
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
                  <Badge {...getRoleBadge(member.role)} />
                </td>
                <td class="py-3 text-sm text-muted-foreground">
                  {formatDate(member.joinedAt)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {/if}
</div>
