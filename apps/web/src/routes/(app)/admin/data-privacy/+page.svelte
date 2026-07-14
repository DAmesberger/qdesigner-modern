<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { auth } from '$lib/services/auth';
  import { api } from '$lib/services/api';
  import type { ExportJob } from '$lib/services/api/organizations';
  import type { Organization } from '$lib/shared/types/api';
  import Card from '$lib/components/ui/layout/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import Alert from '$lib/components/ui/feedback/Alert.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import { toast } from '$lib/stores/toast';

  const REGIONS: { value: string; label: string }[] = [
    { value: 'eu', label: 'European Union (eu)' },
    { value: 'us', label: 'United States (us)' },
    { value: 'uk', label: 'United Kingdom (uk)' },
    { value: 'ca', label: 'Canada (ca)' },
    { value: 'au', label: 'Australia (au)' },
    { value: 'ap', label: 'Asia-Pacific (ap)' },
  ];

  let loading = $state(true);
  // Page-level load failure only (persists in place of the content); transient
  // region/hold/export/erase feedback goes through toast. The erasure result
  // summary (`eraseDone`) stays inline as a persistent destructive-action record.
  let error = $state<string | null>(null);
  let org = $state<Organization | null>(null);

  // Residency
  let region = $state('eu');
  let savingRegion = $state(false);

  // Legal hold
  let legalHold = $state(false);
  let savingHold = $state(false);

  // Export
  let exportJob = $state<ExportJob | null>(null);
  let requesting = $state(false);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  // Erasure
  let erasePassword = $state('');
  let eraseConfirmation = $state('');
  let erasing = $state(false);
  let eraseDone = $state<string | null>(null);
  /** True when the erasure left objects undeleted — shown as a warning, not a success. */
  let eraseIncomplete = $state(false);

  const exportBusy = $derived(
    exportJob?.status === 'pending' || exportJob?.status === 'running'
  );

  onMount(async () => {
    await load();
  });

  onDestroy(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  async function load() {
    try {
      const user = await auth.getUser();
      if (!user) return;
      const orgs = await api.organizations.list();
      const first = orgs?.[0];
      if (!first) {
        error = 'You must own an organization to manage data & privacy';
        return;
      }
      org = first;
      region = first.dataRegion || 'eu';
      legalHold = !!first.legalHold;
    } catch (err) {
      console.error('data-privacy load failed', err);
      error = 'Failed to load organization';
    } finally {
      loading = false;
    }
  }

  async function saveRegion() {
    if (!org) return;
    savingRegion = true;
    try {
      org = await api.organizations.gdpr.setDataRegion(org.id, region);
      region = org.dataRegion;
      toast.success('Data region updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set data region');
    } finally {
      savingRegion = false;
    }
  }

  async function toggleHold(next: boolean) {
    if (!org) return;
    savingHold = true;
    try {
      org = await api.organizations.gdpr.setLegalHold(org.id, next);
      legalHold = org.legalHold;
      toast.success(legalHold ? 'Legal hold enabled' : 'Legal hold released');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update legal hold');
      legalHold = org.legalHold; // revert optimistic state
    } finally {
      savingHold = false;
    }
  }

  async function requestExport() {
    if (!org) return;
    requesting = true;
    try {
      exportJob = await api.organizations.gdpr.requestExport(org.id);
      schedulePoll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request export');
    } finally {
      requesting = false;
    }
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(pollExport, 1000);
  }

  async function pollExport() {
    if (!org || !exportJob) return;
    try {
      exportJob = await api.organizations.gdpr.getExport(org.id, exportJob.id);
      if (exportJob.status === 'pending' || exportJob.status === 'running') {
        schedulePoll();
      } else if (exportJob.status === 'failed') {
        toast.error(`Export failed${exportJob.error ? `: ${exportJob.error}` : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to poll export status');
    }
  }

  async function eraseOrgData() {
    if (!org) return;
    erasing = true;
    eraseDone = null;
    eraseIncomplete = false;
    try {
      const result = await api.organizations.gdpr.erase(
        org.id,
        erasePassword,
        eraseConfirmation
      );
      const rows = `${result.projects_deleted} project(s), ${result.sessions_deleted} session(s), ${result.responses_deleted} response(s)`;
      if (result.status === 'incomplete') {
        // The database erasure committed, but objects remain in storage. Saying
        // "erased" here would be the same false compliance claim the server now
        // refuses to make.
        eraseIncomplete = true;
        eraseDone = `Erased ${rows} from the database, but ${result.objects_pending} uploaded file(s) could not be deleted from storage. THE ERASURE IS NOT COMPLETE. The files are recorded and deletion will be retried automatically.${result.last_error ? ` Last error: ${result.last_error}` : ''}`;
      } else {
        eraseIncomplete = false;
        eraseDone = `Erased ${rows} and ${result.objects_deleted} uploaded file(s). Audit log retained.`;
      }
      erasePassword = '';
      eraseConfirmation = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erasure failed');
    } finally {
      erasing = false;
    }
  }

  function fmtBytes(n: number | null | undefined): string {
    if (n == null) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-foreground">Data &amp; Privacy</h1>
    <p class="mt-2 text-muted-foreground">
      GDPR data export, residency region, and guarded tenant erasure for
      {org?.name || 'your organization'}.
    </p>
  </div>

  {#if error}
    <div class="mb-4"><Alert variant="error">{error}</Alert></div>
  {/if}

  {#if loading}
    <div class="flex justify-center py-8">
      <div class="text-muted-foreground">Loading…</div>
    </div>
  {:else if org}
    <div class="space-y-6">
      <!-- Data residency -->
      <Card>
        <h3 class="text-lg font-semibold mb-1">Data residency</h3>
        <p class="text-sm text-muted-foreground mb-4">
          The region new media and export artifacts are stored under. Immutable
          once the organization owns data.
        </p>
        <form onsubmit={(e) => { e.preventDefault(); saveRegion(); }} class="space-y-4">
          <FormGroup label="Region" id="data-region">
            <Select id="data-region" bind:value={region} placeholder="">
              {#each REGIONS as r}
                <option value={r.value}>{r.label}</option>
              {/each}
            </Select>
            <p class="text-sm text-muted-foreground mt-1">
              Current: <span class="font-mono">{org.dataRegion}</span>. Changing
              this is only allowed before any project exists.
            </p>
          </FormGroup>
          <div class="flex justify-end">
            <Button type="submit" variant="primary" loading={savingRegion}>Save Region</Button>
          </div>
        </form>
      </Card>

      <!-- Data export -->
      <Card>
        <h3 class="text-lg font-semibold mb-1">Data export (DSAR)</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Generate a signed zip of every organization resource — projects,
          questionnaires, sessions, responses, variables, events, members, and
          media metadata — for a data-subject access request.
        </p>

        {#if exportJob}
          <div class="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-foreground">
                  Status:
                  <span class="font-medium">{exportJob.status}</span>
                  {#if exportBusy}
                    <span class="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent align-middle"></span>
                  {/if}
                </p>
                {#if exportJob.size_bytes}
                  <p class="text-muted-foreground">Size: {fmtBytes(exportJob.size_bytes)}</p>
                {/if}
                {#if exportJob.status === 'expired'}
                  <p class="text-warning">This export has expired. Request a new one.</p>
                {/if}
              </div>
              {#if exportJob.status === 'ready' && exportJob.download_url}
                <a
                  href={exportJob.download_url}
                  class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  download
                >
                  Download zip
                </a>
              {/if}
            </div>
          </div>
        {/if}

        <div class="flex justify-end">
          <Button
            variant="primary"
            loading={requesting || exportBusy}
            disabled={requesting || exportBusy}
            onclick={requestExport}
          >
            {exportBusy ? 'Preparing…' : 'Request Export'}
          </Button>
        </div>
      </Card>

      <!-- Legal hold -->
      <Card>
        <h3 class="text-lg font-semibold mb-1">Legal hold</h3>
        <p class="text-sm text-muted-foreground mb-4">
          When enabled, tenant erasure is blocked to preserve data under legal
          obligation. Export is unaffected.
        </p>
        <div class="flex items-center gap-3">
          <input
            id="legal-hold"
            type="checkbox"
            checked={legalHold}
            disabled={savingHold}
            onchange={(e) => toggleHold(e.currentTarget.checked)}
            class="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label for="legal-hold" class="text-sm text-foreground">
            Legal hold {legalHold ? 'enabled' : 'disabled'}
          </label>
        </div>
      </Card>

      <!-- Danger zone: erasure -->
      <Card>
        <h3 class="text-lg font-semibold mb-1 text-destructive">Delete organization data</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Permanently erases all participant data (projects, questionnaires,
          sessions, responses) and archives the organization. The audit log is
          retained for compliance. This cannot be undone.
        </p>

        {#if eraseDone}
          <div class="mb-4">
            <Alert variant={eraseIncomplete ? 'warning' : 'success'}>{eraseDone}</Alert>
          </div>
        {/if}

        {#if legalHold}
          <Alert variant="warning">
            A legal hold is active. Release it above before erasing data.
          </Alert>
        {:else}
          <form onsubmit={(e) => { e.preventDefault(); eraseOrgData(); }} class="space-y-4">
            <FormGroup label="Confirm your password" id="erase-password">
              <Input
                id="erase-password"
                type="password"
                autocomplete="current-password"
                bind:value={erasePassword}
              />
            </FormGroup>
            <FormGroup label={`Type the organization slug "${org.slug}" to confirm`} id="erase-confirm">
              <Input id="erase-confirm" type="text" placeholder={org.slug} bind:value={eraseConfirmation} />
            </FormGroup>
            <div class="flex justify-end">
              <Button
                type="submit"
                variant="destructive"
                loading={erasing}
                disabled={erasing ||
                  erasePassword.length === 0 ||
                  eraseConfirmation.trim().toLowerCase() !== org.slug.toLowerCase()}
              >
                Delete Organization Data
              </Button>
            </div>
          </form>
        {/if}
      </Card>
    </div>
  {/if}
</div>
