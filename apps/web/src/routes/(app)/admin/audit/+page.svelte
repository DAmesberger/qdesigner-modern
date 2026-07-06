<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/services/api';
  import type { AuditEventRecord, AuditListParams } from '$lib/services/api/organizations';
  import type { OrganizationMember } from '$lib/shared/types/api';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';

  // Stable action → human label map. Mirrors AuditAction::as_str on the
  // server (apps/server/src/audit/mod.rs).
  const ACTION_LABELS: Record<string, string> = {
    'member.added': 'Member added',
    'member.role_changed': 'Member role changed',
    'member.removed': 'Member removed',
    'invitation.created': 'Invitation sent',
    'invitation.revoked': 'Invitation revoked',
    'domain.verified': 'Domain verified',
    'organization.updated': 'Organization updated',
    'organization.deleted': 'Organization deleted',
    'project.deleted': 'Project deleted',
    'project_member.added': 'Project member added',
    'project_member.role_changed': 'Project member role changed',
    'project_member.removed': 'Project member removed',
  };

  const PAGE_SIZE = 50;

  let orgId = $state<string | null>(null);
  let orgName = $state<string>('your organization');
  let members = $state<OrganizationMember[]>([]);

  let events = $state<AuditEventRecord[]>([]);
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);

  // Filters (bound to the controls; applied on submit).
  let filterAction = $state('');
  let filterActor = $state('');
  let filterFrom = $state('');
  let filterTo = $state('');

  onMount(async () => {
    try {
      const orgs = await api.organizations.list();
      const org = orgs?.[0];
      if (!org) {
        error = 'Only organization members can view the audit log';
        loading = false;
        return;
      }
      orgId = org.id;
      orgName = org.name || 'your organization';

      // Actor filter options — best-effort; failure just hides the facet.
      try {
        members = await api.organizations.members.list(orgId);
      } catch {
        members = [];
      }

      await loadEvents(true);
    } catch (err) {
      console.error('Failed to load audit log:', err);
      error = 'Failed to load audit log';
    } finally {
      loading = false;
    }
  });

  function currentParams(cursor?: string): AuditListParams {
    const params: AuditListParams = { limit: PAGE_SIZE };
    if (filterAction) params.action = filterAction;
    if (filterActor) params.actor = filterActor;
    // <input type="date"> yields YYYY-MM-DD; widen `to` to end-of-day so the
    // inclusive upper bound covers the whole selected day.
    if (filterFrom) params.from = new Date(`${filterFrom}T00:00:00`).toISOString();
    if (filterTo) params.to = new Date(`${filterTo}T23:59:59.999`).toISOString();
    if (cursor) params.cursor = cursor;
    return params;
  }

  async function loadEvents(reset: boolean) {
    if (!orgId) return;
    if (reset) {
      loading = true;
      error = null;
    } else {
      loadingMore = true;
    }
    try {
      const page = await api.organizations.audit.list(
        orgId,
        currentParams(reset ? undefined : (nextCursor ?? undefined))
      );
      events = reset ? page.events : [...events, ...page.events];
      nextCursor = page.next_cursor;
    } catch (err) {
      console.error('Failed to load audit events:', err);
      error = err instanceof Error ? err.message : 'Failed to load audit events';
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function applyFilters(e: Event) {
    e.preventDefault();
    nextCursor = null;
    loadEvents(true);
  }

  function clearFilters() {
    filterAction = '';
    filterActor = '';
    filterFrom = '';
    filterTo = '';
    nextCursor = null;
    loadEvents(true);
  }

  function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  function actorLabel(event: AuditEventRecord): string {
    return event.actor_full_name || event.actor_email || event.actor_user_id || 'Unknown actor';
  }

  function formatTime(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function metadataEntries(metadata: Record<string, unknown>): [string, string][] {
    return Object.entries(metadata ?? {})
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
  }

  function hasMetadata(event: AuditEventRecord): boolean {
    return metadataEntries(event.metadata).length > 0;
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground">Audit Log</h1>
    <p class="mt-2 text-muted-foreground">
      Immutable record of privileged actions in {orgName}
    </p>
  </div>

  {#if error}
    <div class="mb-4">
      <Alert variant="error">{error}</Alert>
    </div>
  {/if}

  <!-- Filters -->
  <Card>
    <form class="flex flex-wrap items-end gap-3" onsubmit={applyFilters}>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">Action</span>
        <select
          class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          bind:value={filterAction}
        >
          <option value="">All actions</option>
          {#each Object.entries(ACTION_LABELS) as [value, label]}
            <option {value}>{label}</option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">Actor</span>
        <select
          class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          bind:value={filterActor}
        >
          <option value="">All actors</option>
          {#each members as member}
            <option value={member.userId}>
              {member.user?.fullName || member.user?.full_name || member.user?.email || member.userId}
            </option>
          {/each}
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">From</span>
        <input
          type="date"
          class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          bind:value={filterFrom}
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-muted-foreground">To</span>
        <input
          type="date"
          class="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          bind:value={filterTo}
        />
      </label>

      <button
        type="submit"
        class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Apply
      </button>
      <button
        type="button"
        class="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        onclick={clearFilters}
      >
        Clear
      </button>
    </form>
  </Card>

  <div class="mt-6">
    {#if loading}
      <div class="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div class="space-y-4">
          {#each Array(6) as _}
            <div class="flex items-center gap-4">
              <div class="h-8 w-8 animate-pulse rounded-full bg-muted"></div>
              <div class="h-4 w-64 animate-pulse rounded bg-muted"></div>
              <div class="h-4 w-24 animate-pulse rounded bg-muted"></div>
            </div>
          {/each}
        </div>
      </div>
    {:else if events.length === 0}
      <Card>
        <div class="py-10 text-center">
          <p class="text-muted-foreground">No audit events match the current filters</p>
        </div>
      </Card>
    {:else}
      <Card>
        <ol class="relative space-y-1">
          {#each events as event (event.id)}
            <li class="border-l-2 border-border py-3 pl-5">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span class="font-medium text-foreground">{actionLabel(event.action)}</span>
                  <span class="text-muted-foreground"> by </span>
                  <span class="font-medium text-foreground">{actorLabel(event)}</span>
                </div>
                <time class="text-sm text-muted-foreground" datetime={event.created_at ?? ''}>
                  {formatTime(event.created_at)}
                </time>
              </div>
              <div class="mt-1 text-sm text-muted-foreground">
                {event.resource_type}{event.resource_id ? ` · ${event.resource_id}` : ''}
                {#if event.ip}<span class="ml-2">· {event.ip}</span>{/if}
              </div>
              {#if hasMetadata(event)}
                <details class="mt-2">
                  <summary class="cursor-pointer text-sm text-primary hover:underline">
                    Details
                  </summary>
                  <dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                    {#each metadataEntries(event.metadata) as [key, value]}
                      <dt class="font-mono text-muted-foreground">{key}</dt>
                      <dd class="break-all text-foreground">{value}</dd>
                    {/each}
                  </dl>
                </details>
              {/if}
            </li>
          {/each}
        </ol>

        {#if nextCursor}
          <div class="mt-4 text-center">
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              disabled={loadingMore}
              onclick={() => loadEvents(false)}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        {/if}
      </Card>
    {/if}
  </div>
</div>
