<script lang="ts">
  import type { Question } from '$lib/shared';
  import { buildModuleRuntimeConfig } from '$lib/runtime/core/moduleConfigAdapter';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';

  // The storage-mode selector (base64 / url / reference) and its companion
  // processing toggles are DELETED (ADR 0029 Half 2): binary answers now take one
  // offline-first path. Only the capture constraints remain designer-configurable.
  interface FileUploadConfig {
    accept?: string[];
    maxSize?: number;
    maxFiles?: number;
    dragDrop?: boolean;
  }

  interface Props {
    question: Question & { config?: FileUploadConfig };
    onUpdate?: (updates: Record<string, unknown>) => void;
  }

  let { question, onUpdate }: Props = $props();
  const storedConfig = $derived(buildModuleRuntimeConfig(question) as unknown as FileUploadConfig);
  function updateConfig(updates: Partial<FileUploadConfig>) {
    onUpdate?.({ config: { ...question.config, ...updates } });
  }

  // Common file types
  const fileTypePresets = [
    { label: 'Images', value: ['image/*'] },
    { label: 'Documents', value: ['.pdf', '.doc', '.docx', '.txt'] },
    { label: 'Spreadsheets', value: ['.xls', '.xlsx', '.csv'] },
    { label: 'Videos', value: ['video/*'] },
    { label: 'Audio', value: ['audio/*'] },
    { label: 'Archives', value: ['.zip', '.rar', '.7z', '.tar', '.gz'] },
  ];

  // File size presets
  const fileSizePresets = [
    { label: '1 MB', value: 1 * 1024 * 1024 },
    { label: '5 MB', value: 5 * 1024 * 1024 },
    { label: '10 MB', value: 10 * 1024 * 1024 },
    { label: '25 MB', value: 25 * 1024 * 1024 },
    { label: '50 MB', value: 50 * 1024 * 1024 },
    { label: '100 MB', value: 100 * 1024 * 1024 },
  ];

  let newAcceptType = $state('');
  let selectedPreset = $state('');

  const config = $derived({
    accept: [],
    maxSize: 25 * 1024 * 1024,
    maxFiles: 1,
    dragDrop: true,
    ...storedConfig,
  });

  function addAcceptType() {
    if (!newAcceptType) return;

    if (!config.accept.includes(newAcceptType)) {
      updateConfig({ accept: [...config.accept, newAcceptType] });
    }

    newAcceptType = '';
  }

  function removeAcceptType(type: string) {
    if (!config.accept) return;
    updateConfig({ accept: config.accept.filter((t) => t !== type) });
  }

  function applyPreset() {
    if (!selectedPreset) return;

    const preset = fileTypePresets.find((p) => p.label === selectedPreset);
    if (preset) {
      updateConfig({ accept: [...new Set([...(config.accept || []), ...preset.value])] });
    }

    selectedPreset = '';
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
</script>

<div class="designer-panel">
  <!-- File Types -->
  <div class="form-group">
    <span class="label-text">Accepted File Types</span>
    <div class="accept-types-input">
      <Input
        type="text"
        class="flex-1"
        bind:value={newAcceptType}
        placeholder="e.g., .jpg, image/*, .pdf"
        onkeydown={(e) => e.key === 'Enter' && addAcceptType()}
      />
      <Button variant="secondary" size="sm" onclick={addAcceptType} disabled={!newAcceptType}>
        Add
      </Button>
    </div>

    <!-- Presets -->
    <div class="preset-selector">
      <Select bind:value={selectedPreset} class="text-sm">
        <option value="">Add preset...</option>
        {#each fileTypePresets as preset}
          <option value={preset.label}>{preset.label}</option>
        {/each}
      </Select>
      <Button variant="secondary" size="xs" onclick={applyPreset} disabled={!selectedPreset}>
        Apply
      </Button>
    </div>

    {#if config.accept?.length}
      <div class="accept-types-list">
        {#each config.accept as type}
          <div class="accept-type-item">
            <span>{type}</span>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => removeAcceptType(type)}
              aria-label="Remove type"
            >
              ✕
            </Button>
          </div>
        {/each}
      </div>
    {/if}
    <p class="help-text">Leave empty to accept all file types</p>
  </div>

  <!-- File Size -->
  <div class="form-group">
    <label for="max-size">Maximum File Size</label>
    <Select
      id="max-size"
      value={config.maxSize}
      onchange={(e) => updateConfig({ maxSize: Number(e.currentTarget.value) })}
    >
      {#each fileSizePresets as preset}
        <option value={preset.value}>{preset.label}</option>
      {/each}
    </Select>
    <p class="help-text">Current: {formatFileSize(config.maxSize || 0)}</p>
  </div>

  <!-- File Count -->
  <div class="form-group">
    <label for="max-files">Maximum Files</label>
    <Input
      id="max-files"
      type="number"
      min="1"
      max="100"
      value={config.maxFiles != null ? String(config.maxFiles) : ''}
      oninput={(e) =>
        updateConfig({
          maxFiles: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
        })}
    />
    <p class="help-text">Allow multiple file uploads (1 = single file only)</p>
  </div>

  <!-- UI Options -->
  <div class="section">
    <h4 class="section-title">User Interface</h4>

    <div class="form-group">
      <Checkbox
        id="file-drag-drop"
        label="Enable drag & drop upload"
        checked={config.dragDrop ?? false}
        onchange={(e) => updateConfig({ dragDrop: e.currentTarget.checked })}
      />
    </div>

    <p class="help-text">
      Uploaded files are saved on the device first and delivered when the participant is online, so
      capture works fully offline. The response is complete as soon as the file is chosen.
    </p>
  </div>

  <!-- Preview -->
  <div class="section">
    <h4 class="section-title">Preview</h4>
    <div class="preview-box">
      <div class="preview-content">
        <div class="preview-stats">
          <div class="stat">
            <span class="stat-label">Accepted:</span>
            <span class="stat-value">
              {config.accept?.length ? config.accept.join(', ') : 'All types'}
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Max size:</span>
            <span class="stat-value">{formatFileSize(config.maxSize || 0)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Max files:</span>
            <span class="stat-value">{config.maxFiles || 1}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Features:</span>
            <span class="stat-value">
              {[config.dragDrop && 'Drag & Drop'].filter(Boolean).join(', ') || 'Basic upload'}
            </span>
          </div>
        </div>
      </div>
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

  .label-text {
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

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  /* Accept types */
  .accept-types-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .preset-selector {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .accept-types-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .accept-type-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  /* Preview */
  .preview-box {
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .preview-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-stats {
    display: grid;
    gap: 0.5rem;
  }

  .stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }

  .stat-label {
    color: hsl(var(--muted-foreground));
  }

  .stat-value {
    font-weight: 500;
    color: hsl(var(--foreground));
    text-align: right;
  }
</style>
