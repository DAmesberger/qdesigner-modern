<script lang="ts">
  import { MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Trash2 } from 'lucide-svelte';
  import { fly } from 'svelte/transition';
  import { clickOutside } from '$lib/utils/clickOutside';
  import { toast } from '$lib/stores/toast';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import { api } from '$lib/services/api';
  import type { QuestionnaireDefinition } from '$lib/shared/types/api';

  interface Props {
    questionnaire: QuestionnaireDefinition;
    /** Owning project id — the questionnaire endpoints are all project-nested. */
    projectId: string;
    /** Rename + duplicate + archive (server: project editor+ or org admin+). */
    canManage?: boolean;
    /** Delete (server: project write access — same tier as manage). */
    canDelete?: boolean;
    /** Which edge the dropdown aligns to. */
    align?: 'left' | 'right';
    onRenamed?: (questionnaire: QuestionnaireDefinition) => void;
    onArchived?: (questionnaire: QuestionnaireDefinition) => void;
    onDuplicated?: (questionnaire: QuestionnaireDefinition) => void;
    onDeleted?: (questionnaireId: string) => void;
  }

  let {
    questionnaire,
    projectId,
    canManage = false,
    canDelete = false,
    align = 'right',
    onRenamed,
    onArchived,
    onDuplicated,
    onDeleted,
  }: Props = $props();

  let showMenu = $state(false);

  // Rename
  let showRenameDialog = $state(false);
  let renameValue = $state('');
  let renaming = $state(false);

  // Duplicate
  let duplicating = $state(false);

  // Archive / restore
  let archiving = $state(false);

  // Delete (typed confirmation, mirrors the admin data-privacy pattern)
  let showDeleteDialog = $state(false);
  let deleteConfirmation = $state('');
  let deleting = $state(false);

  const isArchived = $derived(questionnaire.status === 'archived');
  const deleteConfirmed = $derived(deleteConfirmation.trim() === questionnaire.name);

  const menuItemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left';

  function openRename() {
    showMenu = false;
    renameValue = questionnaire.name;
    showRenameDialog = true;
  }

  async function submitRename() {
    const name = renameValue.trim();
    if (!name || renaming) return;
    renaming = true;
    try {
      const updated = await api.questionnaires.update(projectId, questionnaire.id, { name });
      toast.success('Questionnaire renamed');
      showRenameDialog = false;
      onRenamed?.(updated);
    } catch (err) {
      toast.error('Failed to rename questionnaire', {
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      renaming = false;
    }
  }

  async function duplicate() {
    if (duplicating) return;
    showMenu = false;
    duplicating = true;
    try {
      // Pull the full definition so the copy carries content + settings, then
      // create a fresh draft in the same project. The new questionnaire resets
      // to the create-time defaults (version 0.1.0 / draft) — it is a distinct
      // record with its own UUID (and therefore its own fillout code).
      const source = await api.questionnaires.get(projectId, questionnaire.id);
      const created = await api.questionnaires.create(projectId, {
        name: `Copy of ${source.name}`,
        description: source.description ?? undefined,
        content: source.content,
        settings: source.settings,
      });
      toast.success('Questionnaire duplicated');
      onDuplicated?.(created);
    } catch (err) {
      toast.error('Failed to duplicate questionnaire', {
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      duplicating = false;
    }
  }

  async function toggleArchive() {
    if (archiving) return;
    showMenu = false;
    archiving = true;
    // Restore lands the questionnaire back in the editable draft state (there is
    // no stored pre-archive status to return to; re-publishing is explicit).
    const nextStatus = isArchived ? 'draft' : 'archived';
    try {
      const updated = await api.questionnaires.update(projectId, questionnaire.id, {
        status: nextStatus,
      });
      toast.success(nextStatus === 'archived' ? 'Questionnaire archived' : 'Questionnaire restored');
      onArchived?.(updated);
    } catch (err) {
      toast.error(
        nextStatus === 'archived'
          ? 'Failed to archive questionnaire'
          : 'Failed to restore questionnaire',
        { message: err instanceof Error ? err.message : 'Please try again.' }
      );
    } finally {
      archiving = false;
    }
  }

  function openDelete() {
    showMenu = false;
    deleteConfirmation = '';
    showDeleteDialog = true;
  }

  async function submitDelete() {
    if (!deleteConfirmed || deleting) return;
    deleting = true;
    try {
      await api.questionnaires.delete(projectId, questionnaire.id);
      toast.success('Questionnaire deleted');
      showDeleteDialog = false;
      onDeleted?.(questionnaire.id);
    } catch (err) {
      toast.error('Failed to delete questionnaire', {
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      deleting = false;
    }
  }
</script>

{#if canManage || canDelete}
  <div
    class="relative"
    use:clickOutside={() => (showMenu = false)}
    onkeydown={(e) => {
      if (e.key === 'Escape') showMenu = false;
    }}
    role="presentation"
  >
    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        showMenu = !showMenu;
      }}
      class="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
      title="More options"
      aria-haspopup="menu"
      aria-expanded={showMenu}
      data-testid={`questionnaire-actions-${questionnaire.id}`}
    >
      <MoreVertical class="h-5 w-5" />
    </button>

    {#if showMenu}
      <div
        transition:fly={{ y: -6, duration: 150 }}
        class="absolute {align === 'right' ? 'right-0' : 'left-0'} top-full z-50 mt-2 w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
        role="menu"
      >
        {#if canManage}
          <button
            type="button"
            role="menuitem"
            class={menuItemClass}
            onclick={openRename}
            data-testid="questionnaire-action-rename"
          >
            <Pencil class="h-4 w-4" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            class={menuItemClass}
            disabled={duplicating}
            onclick={duplicate}
            data-testid="questionnaire-action-duplicate"
          >
            <Copy class="h-4 w-4" />
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            class={menuItemClass}
            disabled={archiving}
            onclick={toggleArchive}
            data-testid="questionnaire-action-archive"
          >
            {#if isArchived}
              <ArchiveRestore class="h-4 w-4" />
              Restore
            {:else}
              <Archive class="h-4 w-4" />
              Archive
            {/if}
          </button>
        {/if}
        {#if canDelete}
          <button
            type="button"
            role="menuitem"
            class="{menuItemClass} text-destructive hover:bg-destructive/10"
            onclick={openDelete}
            data-testid="questionnaire-action-delete"
          >
            <Trash2 class="h-4 w-4" />
            Delete
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<!-- Rename dialog -->
<Dialog bind:open={showRenameDialog} title="Rename questionnaire" size="sm">
  <FormGroup label="Questionnaire name" id="rename-questionnaire-name">
    <Input id="rename-questionnaire-name" bind:value={renameValue} placeholder="Questionnaire name" />
  </FormGroup>

  {#snippet footer()}
    <Button variant="outline" disabled={renaming} onclick={() => (showRenameDialog = false)}>
      Cancel
    </Button>
    <Button
      variant="primary"
      loading={renaming}
      disabled={!renameValue.trim() || renaming}
      onclick={submitRename}
      data-testid="questionnaire-rename-confirm"
    >
      Save
    </Button>
  {/snippet}
</Dialog>

<!-- Delete dialog (typed confirmation) -->
<Dialog bind:open={showDeleteDialog} title="Delete questionnaire" size="sm">
  <div class="space-y-4">
    <p class="text-sm text-muted-foreground">
      This removes <span class="font-medium text-foreground">{questionnaire.name}</span> and takes
      its fillout link offline. Already-collected responses are retained in the database but will no
      longer be accessible here.
    </p>
    <FormGroup label={`Type "${questionnaire.name}" to confirm`} id="delete-questionnaire-confirm">
      <Input
        id="delete-questionnaire-confirm"
        bind:value={deleteConfirmation}
        placeholder={questionnaire.name}
      />
    </FormGroup>
  </div>

  {#snippet footer()}
    <Button variant="outline" disabled={deleting} onclick={() => (showDeleteDialog = false)}>
      Cancel
    </Button>
    <Button
      variant="destructive"
      loading={deleting}
      disabled={!deleteConfirmed || deleting}
      onclick={submitDelete}
      data-testid="questionnaire-delete-confirm"
    >
      Delete questionnaire
    </Button>
  {/snippet}
</Dialog>
