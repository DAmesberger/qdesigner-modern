<script lang="ts">
  import type { ApplyResult } from '$lib/api/generated/types.gen';
  import { api } from '$lib/services/api';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';

  interface Props {
    open?: boolean;
    projectId: string;
  }

  let { open = $bindable(false), projectId }: Props = $props();
  let inspecting = $state(false);
  let filename = $state('');
  let localError = $state('');
  let result = $state<ApplyResult | null>(null);

  function readText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
      reader.readAsText(file);
    });
  }

  async function inspectFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || inspecting) return;

    filename = file.name;
    localError = '';
    result = null;
    inspecting = true;
    try {
      result = await api.questionnaires.dryRunDefinition(projectId, await readText(file));
    } catch (error) {
      localError =
        error instanceof Error ? error.message : 'The definition could not be inspected.';
    } finally {
      inspecting = false;
      input.value = '';
    }
  }

  function close() {
    open = false;
  }
</script>

<Dialog bind:open title="Inspect Questionnaire Definition" size="lg">
  <div class="space-y-5">
    <div class="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
      <span class="font-medium">Dry run only.</span>
      This validates a Questionnaire Definition and never changes Questionnaire state. It does not import
      or export participant responses.
    </div>

    <div>
      <label for="qdef-file" class="block text-sm font-medium text-foreground">
        Questionnaire Definition file
      </label>
      <p class="mt-1 text-xs text-muted-foreground">
        Choose a canonical <code>.qdef.json</code> file.
      </p>
      <Input
        id="qdef-file"
        type="file"
        accept=".qdef.json,application/json,application/vnd.qdesigner.questionnaire+json"
        onchange={inspectFile}
        disabled={inspecting}
        class="mt-3 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
        testid="qdef-file-input"
      />
    </div>

    {#if inspecting}
      <p class="text-sm text-muted-foreground" role="status">Inspecting {filename}…</p>
    {/if}

    {#if localError}
      <div
        class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        role="alert"
      >
        {localError}
      </div>
    {/if}

    {#if result}
      <section class="space-y-4" aria-live="polite">
        <div class="rounded-md border border-border p-4">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-medium text-foreground">
              {result.valid ? 'Definition is valid' : 'Definition needs attention'}
            </h3>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium {result.valid
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'}"
            >
              {result.valid ? 'Valid' : 'Invalid'}
            </span>
          </div>

          {#if result.metadata}
            <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-muted-foreground">Questionnaire</dt>
                <dd class="font-medium text-foreground">{result.metadata.questionnaireName}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Questionnaire version</dt>
                <dd class="font-medium text-foreground">{result.metadata.questionnaireVersion}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">QDef format</dt>
                <dd class="font-medium text-foreground">{result.metadata.formatVersion}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Questions</dt>
                <dd class="font-medium text-foreground">{result.metadata.questionCount}</dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Pages</dt>
                <dd class="font-medium text-foreground">{result.metadata.pageCount}</dd>
              </div>
            </dl>
          {/if}

          {#if result.digest}
            <div class="mt-4">
              <div class="text-sm text-muted-foreground">Canonical digest</div>
              <code
                class="mt-1 block break-all rounded bg-muted px-2 py-1.5 text-xs text-foreground"
                >{result.digest}</code
              >
            </div>
          {/if}
        </div>

        <div>
          <h3 class="text-sm font-medium text-foreground">Diagnostics</h3>
          {#if result.diagnostics.length === 0}
            <p class="mt-2 text-sm text-muted-foreground">No diagnostics.</p>
          {:else}
            <ul class="mt-2 space-y-2">
              {#each result.diagnostics as diagnostic}
                <li class="rounded-md border border-border p-3 text-sm">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-mono text-xs font-semibold text-foreground"
                      >{diagnostic.code}</span
                    >
                    <span
                      class="rounded px-1.5 py-0.5 text-xs {diagnostic.severity === 'error'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-warning/10 text-warning'}"
                    >
                      {diagnostic.severity}
                    </span>
                    <code class="text-xs text-muted-foreground">{diagnostic.path}</code>
                  </div>
                  <p class="mt-1 text-foreground">{diagnostic.message}</p>
                  {#if diagnostic.hint}
                    <p class="mt-1 text-xs text-muted-foreground">{diagnostic.hint}</p>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <p class="text-sm font-medium text-foreground">No changes were made.</p>
      </section>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="outline" onclick={close}>Close</Button>
  {/snippet}
</Dialog>
