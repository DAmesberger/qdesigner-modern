<script lang="ts">
  import type { Question } from '$lib/shared';
  import { nanoid } from 'nanoid';
  import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Edit, Trash } from 'lucide-svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

  interface MatrixRow {
    id: string;
    label: string;
    description?: string;
    required?: boolean;
  }

  interface MatrixColumn {
    id: string;
    label: string;
    value: any;
    width?: string;
  }

  interface MatrixConfig {
    rows: MatrixRow[];
    columns: MatrixColumn[];
    responseType: 'radio' | 'checkbox' | 'text' | 'dropdown' | 'scale';
    mobileLayout?: 'scroll' | 'accordion' | 'cards';
    stickyHeaders?: boolean;
    alternateRowColors?: boolean;
  }

  interface Props {
    question: Question & { config: MatrixConfig };
  }

  let { question = $bindable() }: Props = $props();

  // Defensive reads: a newly-created or legacy question may lack these
  // fields. Falling back keeps {#each} iteration and comparisons from
  // throwing during render and freezing the entire designer.
  const rows = $derived(question.config?.rows ?? []);
  const columns = $derived(question.config?.columns ?? []);
  const responseType = $derived(question.config?.responseType ?? 'radio');

  let editingRow: MatrixRow | null = $state(null);
  let editingColumn: MatrixColumn | null = $state(null);
  let newRowLabel = $state('');
  let newColumnLabel = $state('');
  let newColumnValue = $state('');

  function addRow() {
    if (!newRowLabel.trim()) return;

    const newRow: MatrixRow = {
      id: nanoid(8),
      label: newRowLabel.trim(),
      required: true,
    };

    question.config.rows = [...(question.config.rows ?? []), newRow];
    newRowLabel = '';
  }

  function updateRow(row: MatrixRow) {
    const current = question.config.rows ?? [];
    const index = current.findIndex((r) => r.id === row.id);
    if (index !== -1) {
      current[index] = row;
      question.config.rows = [...current];
    }
    editingRow = null;
  }

  function deleteRow(row: MatrixRow) {
    question.config.rows = (question.config.rows ?? []).filter((r) => r.id !== row.id);
  }

  function addColumn() {
    if (!newColumnLabel.trim()) return;

    const newColumn: MatrixColumn = {
      id: nanoid(8),
      label: newColumnLabel.trim(),
      value: newColumnValue.trim() || newColumnLabel.trim(),
    };

    question.config.columns = [...(question.config.columns ?? []), newColumn];
    newColumnLabel = '';
    newColumnValue = '';
  }

  function updateColumn(column: MatrixColumn) {
    const current = question.config.columns ?? [];
    const index = current.findIndex((c) => c.id === column.id);
    if (index !== -1) {
      current[index] = column;
      question.config.columns = [...current];
    }
    editingColumn = null;
  }

  function deleteColumn(column: MatrixColumn) {
    question.config.columns = (question.config.columns ?? []).filter((c) => c.id !== column.id);
  }

  function moveRow(index: number, direction: 'up' | 'down') {
    const newRows = [...(question.config.rows ?? [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newRows.length) {
      const current = newRows[index];
      const target = newRows[targetIndex];
      if (current && target) {
        newRows[index] = target;
        newRows[targetIndex] = current;
        question.config.rows = newRows;
      }
    }
  }

  function moveColumn(index: number, direction: 'left' | 'right') {
    const newColumns = [...(question.config.columns ?? [])];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newColumns.length) {
      const current = newColumns[index];
      const target = newColumns[targetIndex];
      if (current && target) {
        newColumns[index] = target;
        newColumns[targetIndex] = current;
        question.config.columns = newColumns;
      }
    }
  }

  // Auto-generate numeric values for scale type
  $effect(() => {
    if (responseType === 'scale' && columns.length > 0) {
      question.config.columns = columns.map((col, index) => ({
        ...col,
        value: index + 1,
      }));
    }
  });
</script>

<div class="designer-panel">
  <!-- Response Type -->
  <div class="form-group">
    <label for="response-type">Response Type</label>
    <Select id="response-type" bind:value={question.config.responseType}>
      <option value="radio">Radio (Single choice per row)</option>
      <option value="checkbox">Checkbox (Multiple choice per row)</option>
      <option value="text">Text Input</option>
      <option value="dropdown">Dropdown</option>
      <option value="scale">Numeric Scale</option>
    </Select>
  </div>

  <!-- Display Options -->
  <div class="section">
    <h4 class="section-title">Display Options</h4>

    <div class="form-group">
      <Checkbox
        id="matrix-sticky-headers"
        label="Sticky column headers"
        checked={question.config.stickyHeaders ?? false}
        onchange={(e) => (question.config.stickyHeaders = e.currentTarget.checked)}
      />
    </div>

    <div class="form-group">
      <Checkbox
        id="matrix-alt-row-colors"
        label="Alternate row colors"
        checked={question.config.alternateRowColors ?? false}
        onchange={(e) => (question.config.alternateRowColors = e.currentTarget.checked)}
      />
    </div>

    <div class="form-group">
      <label for="mobile-layout">Mobile Layout</label>
      <Select id="mobile-layout" bind:value={question.config.mobileLayout}>
        <option value="scroll">Horizontal Scroll</option>
        <option value="accordion">Accordion</option>
        <option value="cards">Cards</option>
      </Select>
    </div>
  </div>

  <!-- Rows -->
  <div class="section">
    <h4 class="section-title">Rows</h4>

    <div class="items-list">
      {#each rows as row, index}
        {#if editingRow?.id === row.id}
          <div class="edit-item">
            <Input type="text" bind:value={editingRow.label} placeholder="Row label" />
            <Input
              type="text"
              value={editingRow.description ?? ''}
              oninput={(e) => editingRow && (editingRow.description = e.currentTarget.value)}
              placeholder="Description (optional)"
            />
            <Checkbox
              label="Required"
              checked={editingRow.required ?? false}
              onchange={(e) => editingRow && (editingRow.required = e.currentTarget.checked)}
            />
            <div class="edit-actions">
              <Button variant="primary" size="sm" onclick={() => updateRow(editingRow!)}> Save </Button>
              <Button variant="secondary" size="sm" onclick={() => (editingRow = null)}>
                Cancel
              </Button>
            </div>
          </div>
        {:else}
          <div class="item">
            <div class="item-content">
              <span class="item-label">{row.label}</span>
              {#if row.description}
                <span class="item-description">{row.description}</span>
              {/if}
              {#if row.required}
                <span class="required-badge">Required</span>
              {/if}
            </div>
            <div class="item-actions">
              <Button
                variant="ghost"
                size="sm"
                onclick={() => moveRow(index, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ChevronUp size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => moveRow(index, 'down')}
                disabled={index === rows.length - 1}
                aria-label="Move down"
              >
                <ChevronDown size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => (editingRow = { ...row })}
                aria-label="Edit"
              >
                <Edit size={16} />
              </Button>
              <Button variant="ghost" size="sm" class="hover:text-destructive" onclick={() => deleteRow(row)} aria-label="Delete">
                <Trash size={16} />
              </Button>
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <div class="add-item">
      <Input
        type="text"
        class="flex-1"
        bind:value={newRowLabel}
        placeholder="Add new row..."
        onkeydown={(e) => e.key === 'Enter' && addRow()}
      />
      <Button variant="secondary" size="sm" onclick={addRow} disabled={!newRowLabel.trim()}>
        Add Row
      </Button>
    </div>
  </div>

  <!-- Columns -->
  <div class="section">
    <h4 class="section-title">Columns</h4>

    <div class="items-list">
      {#each columns as column, index}
        {#if editingColumn?.id === column.id}
          <div class="edit-item">
            <Input type="text" bind:value={editingColumn.label} placeholder="Column label" />
            {#if responseType !== 'scale'}
              <Input type="text" bind:value={editingColumn.value} placeholder="Value" />
            {/if}
            <Input
              type="text"
              value={editingColumn.width ?? ''}
              oninput={(e) => editingColumn && (editingColumn.width = e.currentTarget.value)}
              placeholder="Width (e.g., 100px, 20%)"
            />
            <div class="edit-actions">
              <Button variant="primary" size="sm" onclick={() => updateColumn(editingColumn!)}>
                Save
              </Button>
              <Button variant="secondary" size="sm" onclick={() => (editingColumn = null)}>
                Cancel
              </Button>
            </div>
          </div>
        {:else}
          <div class="item">
            <div class="item-content">
              <span class="item-label">{column.label}</span>
              <span class="item-value">Value: {column.value}</span>
              {#if column.width}
                <span class="item-width">Width: {column.width}</span>
              {/if}
            </div>
            <div class="item-actions">
              <Button
                variant="ghost"
                size="sm"
                onclick={() => moveColumn(index, 'left')}
                disabled={index === 0}
                aria-label="Move left"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => moveColumn(index, 'right')}
                disabled={index === columns.length - 1}
                aria-label="Move right"
              >
                <ChevronRight size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => (editingColumn = { ...column })}
                aria-label="Edit"
              >
                <Edit size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="hover:text-destructive"
                onclick={() => deleteColumn(column)}
                aria-label="Delete"
              >
                <Trash size={16} />
              </Button>
            </div>
          </div>
        {/if}
      {/each}
    </div>

    <div class="add-item">
      <Input
        type="text"
        class="flex-1"
        bind:value={newColumnLabel}
        placeholder="Column label..."
        onkeydown={(e) => e.key === 'Enter' && addColumn()}
      />
      {#if responseType !== 'scale'}
        <Input
          type="text"
          class="flex-1"
          bind:value={newColumnValue}
          placeholder="Value (optional)"
          onkeydown={(e) => e.key === 'Enter' && addColumn()}
        />
      {/if}
      <Button variant="secondary" size="sm" onclick={addColumn} disabled={!newColumnLabel.trim()}>
        Add Column
      </Button>
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
  }

  .item-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .item-label {
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .item-description,
  .item-value,
  .item-width {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .required-badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: hsl(var(--destructive) / 0.15);
    color: hsl(var(--destructive));
    font-size: 0.625rem;
    font-weight: 500;
    border-radius: 0.25rem;
    text-transform: uppercase;
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
  }

  .edit-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: hsl(var(--background));
    border: 2px solid hsl(var(--primary));
    border-radius: 0.375rem;
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .add-item {
    display: flex;
    gap: 0.5rem;
  }


</style>
