<script lang="ts">
  /**
   * Share a project or a single questionnaire's analytics with a collaborator
   * or external guest by email (E-RBAC-10). Grants a scoped, optionally
   * time-limited `viewer`/`editor` role via `POST /api/{projects|questionnaires}/{id}/shares`.
   *
   * The dialog lists current shares (with pending/active/expired status) and
   * lets a manager add or revoke them. It never touches org/project membership,
   * so a grantee gains exactly the shared resource and nothing else.
   */
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Badge from '$lib/components/ui/feedback/Badge.svelte';
  import { api } from '$lib/services/api';
  import type { ShareRecord, ShareResourceKind, ShareRole } from '$lib/services/api/shares';
  import { Trash2, Clock, Mail } from 'lucide-svelte';

  interface Props {
    open?: boolean;
    kind: ShareResourceKind;
    resourceId: string;
    resourceName?: string;
    onclose?: () => void;
  }

  let { open = $bindable(false), kind, resourceId, resourceName = '', onclose }: Props = $props();

  let shares = $state<ShareRecord[]>([]);
  let loading = $state(false);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  let email = $state('');
  let role = $state<ShareRole>('viewer');
  let expiresAt = $state(''); // yyyy-mm-dd from a date input, or ''

  const roleOptions = [
    { value: 'viewer', label: 'Viewer — read / analytics only' },
    { value: 'editor', label: 'Editor — read and edit' },
  ];

  const kindLabel = $derived(kind === 'project' ? 'project' : 'questionnaire');

  // Load current shares whenever the dialog opens for a resource.
  $effect(() => {
    if (open && resourceId) {
      void refresh();
    }
  });

  async function refresh() {
    loading = true;
    error = null;
    try {
      shares = await api.shares.list(kind, resourceId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load shares';
    } finally {
      loading = false;
    }
  }

  function statusVariant(status: ShareRecord['status']): 'success' | 'warning' | 'secondary' {
    if (status === 'active') return 'success';
    if (status === 'pending') return 'warning';
    return 'secondary';
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      error = 'Enter an email address to share with.';
      return;
    }
    submitting = true;
    error = null;
    try {
      // A bare yyyy-mm-dd date is sent as end-of-day UTC so the grant is valid
      // through the selected day.
      const expires_at = expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null;
      await api.shares.create(kind, resourceId, { email: trimmed, role, expires_at });
      email = '';
      expiresAt = '';
      role = 'viewer';
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create share';
    } finally {
      submitting = false;
    }
  }

  async function revoke(shareId: string) {
    error = null;
    try {
      await api.shares.revoke(kind, resourceId, shareId);
      shares = shares.filter((s) => s.id !== shareId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to revoke share';
    }
  }

  function fmtExpiry(iso: string | null): string {
    if (!iso) return 'No expiry';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'No expiry';
    return `Expires ${d.toLocaleDateString()}`;
  }

  function handleClose() {
    open = false;
    onclose?.();
  }
</script>

<Dialog
  bind:open
  size="lg"
  title={`Share ${kindLabel}`}
  description={resourceName ? `Grant scoped access to “${resourceName}”.` : undefined}
  onclose={handleClose}
  data-testid="share-dialog"
>
  <div class="space-y-6">
    {#if error}
      <Alert variant="error">{error}</Alert>
    {/if}

    <form class="space-y-4" onsubmit={submit}>
      <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
        <FormGroup label="Collaborator email" id="share-email">
          <Input
            id="share-email"
            type="email"
            bind:value={email}
            placeholder="colleague@example.org"
            autocomplete="off"
          />
        </FormGroup>
        <FormGroup label="Role" id="share-role">
          <Select id="share-role" bind:value={role} options={roleOptions} />
        </FormGroup>
      </div>

      <div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <FormGroup label="Access expires (optional)" id="share-expiry">
          <Input id="share-expiry" type="date" bind:value={expiresAt} />
        </FormGroup>
        <Button type="submit" loading={submitting} disabled={submitting}>Share</Button>
      </div>
      <p class="text-xs text-muted-foreground">
        The collaborator gains access to this {kindLabel} only — never to other projects or
        member management. If they don't have an account yet, access activates the first time they
        sign in with this email.
      </p>
    </form>

    <div class="border-t border-border pt-4">
      <h3 class="mb-3 text-sm font-semibold text-foreground">People with access</h3>

      {#if loading}
        <p class="text-sm text-muted-foreground">Loading…</p>
      {:else if shares.length === 0}
        <p class="text-sm text-muted-foreground">
          No one has been given scoped access to this {kindLabel} yet.
        </p>
      {:else}
        <ul class="divide-y divide-border rounded-md border border-border">
          {#each shares as s (s.id)}
            <li class="flex items-center justify-between gap-3 px-3 py-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span class="truncate text-sm font-medium text-foreground">
                    {s.grantee_name || s.grantee_email}
                  </span>
                  <Badge variant={statusVariant(s.status)} size="sm">{s.status}</Badge>
                </div>
                <div class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span class="capitalize">{s.role}</span>
                  <span aria-hidden="true">·</span>
                  <span class="inline-flex items-center gap-1">
                    <Clock class="h-3 w-3" />{fmtExpiry(s.expires_at)}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => revoke(s.id)}
                aria-label={`Revoke access for ${s.grantee_email}`}
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <Button variant="secondary" onclick={handleClose}>Done</Button>
  {/snippet}
</Dialog>
