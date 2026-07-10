<script lang="ts">
  import { MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-svelte';
  import { fly } from 'svelte/transition';
  import { clickOutside } from '$lib/utils/clickOutside';
  import { toast } from '$lib/stores/toast';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import FormGroup from '$lib/components/ui/forms/FormGroup.svelte';
  import { api } from '$lib/services/api';
  import type { Project } from '$lib/shared/types/api';

  interface Props {
    project: Project;
    /** Rename + archive (server: project editor+ or org admin+). */
    canManage?: boolean;
    /** Delete (server: project owner or org admin+). */
    canDelete?: boolean;
    /** Which edge the dropdown aligns to. */
    align?: 'left' | 'right';
    onRenamed?: (project: Project) => void;
    onArchived?: (project: Project) => void;
    onDeleted?: (projectId: string) => void;
  }

  let {
    project,
    canManage = false,
    canDelete = false,
    align = 'right',
    onRenamed,
    onArchived,
    onDeleted,
  }: Props = $props();

  let showMenu = $state(false);

  // Rename
  let showRenameDialog = $state(false);
  let renameValue = $state('');
  let renaming = $state(false);

  // Archive / restore
  let archiving = $state(false);

  // Delete (typed confirmation, mirrors the admin data-privacy pattern)
  let showDeleteDialog = $state(false);
  let deleteConfirmation = $state('');
  let deleting = $state(false);

  const isArchived = $derived(project.status === 'archived');
  const deleteConfirmed = $derived(deleteConfirmation.trim() === project.name);

  const menuItemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left';

  function openRename() {
    showMenu = false;
    renameValue = project.name;
    showRenameDialog = true;
  }

  async function submitRename() {
    const name = renameValue.trim();
    if (!name || renaming) return;
    renaming = true;
    try {
      const updated = await api.projects.update(project.id, { name });
      toast.success('Project renamed');
      showRenameDialog = false;
      onRenamed?.(updated);
    } catch (err) {
      toast.error('Failed to rename project', {
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      renaming = false;
    }
  }

  async function toggleArchive() {
    if (archiving) return;
    showMenu = false;
    archiving = true;
    const nextStatus = isArchived ? 'active' : 'archived';
    try {
      const updated = await api.projects.update(project.id, { status: nextStatus });
      toast.success(nextStatus === 'archived' ? 'Project archived' : 'Project restored');
      onArchived?.(updated);
    } catch (err) {
      toast.error(
        nextStatus === 'archived' ? 'Failed to archive project' : 'Failed to restore project',
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
      await api.projects.delete(project.id);
      toast.success('Project deleted');
      showDeleteDialog = false;
      onDeleted?.(project.id);
    } catch (err) {
      toast.error('Failed to delete project', {
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
      data-testid={`project-actions-${project.id}`}
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
            data-testid="project-action-rename"
          >
            <Pencil class="h-4 w-4" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            class={menuItemClass}
            disabled={archiving}
            onclick={toggleArchive}
            data-testid="project-action-archive"
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
            data-testid="project-action-delete"
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
<Dialog bind:open={showRenameDialog} title="Rename project" size="sm">
  <FormGroup label="Project name" id="rename-project-name">
    <Input id="rename-project-name" bind:value={renameValue} placeholder="Project name" />
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
      data-testid="project-rename-confirm"
    >
      Save
    </Button>
  {/snippet}
</Dialog>

<!-- Delete dialog (typed confirmation) -->
<Dialog bind:open={showDeleteDialog} title="Delete project" size="sm">
  <div class="space-y-4">
    <p class="text-sm text-muted-foreground">
      This removes <span class="font-medium text-foreground">{project.name}</span> along with its
      questionnaires and all collected responses. You won't be able to access them again.
    </p>
    <FormGroup label={`Type "${project.name}" to confirm`} id="delete-project-confirm">
      <Input id="delete-project-confirm" bind:value={deleteConfirmation} placeholder={project.name} />
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
      data-testid="project-delete-confirm"
    >
      Delete project
    </Button>
  {/snippet}
</Dialog>
