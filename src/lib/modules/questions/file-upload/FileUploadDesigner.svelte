<script lang="ts">
  import type { Question } from '$lib/shared';

  interface FileUploadConfig {
    accept?: string[];
    maxSize?: number;
    maxFiles?: number;
    dragDrop?: boolean;
    storage?: 'reference' | 'base64' | 'url';
    saveMetadata?: boolean;
    showPreview?: boolean;
    autoUpload?: boolean;
  }

  interface Props {
    question: Question & { config: FileUploadConfig };
  }

  let { question = $bindable() }: Props = $props();

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

  // Initialize config defaults
  $effect(() => {
    if (!question.config.accept) question.config.accept = [];
    if (!question.config.maxSize) question.config.maxSize = 10 * 1024 * 1024;
    if (!question.config.maxFiles) question.config.maxFiles = 1;
    if (question.config.dragDrop === undefined) question.config.dragDrop = true;
    if (!question.config.storage) question.config.storage = 'reference';
    if (question.config.saveMetadata === undefined) question.config.saveMetadata = true;
    if (question.config.showPreview === undefined) question.config.showPreview = true;
    if (question.config.autoUpload === undefined) question.config.autoUpload = true;
  });

  function addAcceptType() {
    if (!newAcceptType) return;

    if (!question.config.accept) {
      question.config.accept = [];
    }

    if (!question.config.accept.includes(newAcceptType)) {
      question.config.accept = [...question.config.accept, newAcceptType];
    }

    newAcceptType = '';
  }

  function removeAcceptType(type: string) {
    if (!question.config.accept) return;
    question.config.accept = question.config.accept.filter((t) => t !== type);
  }

  function applyPreset() {
    if (!selectedPreset) return;

    const preset = fileTypePresets.find((p) => p.label === selectedPreset);
    if (preset) {
      question.config.accept = [...(question.config.accept || []), ...preset.value];
      // Remove duplicates
      question.config.accept = [...new Set(question.config.accept)];
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
      <input
        type="text"
        bind:value={newAcceptType}
        placeholder="e.g., .jpg, image/*, .pdf"
        class="input"
        onkeydown={(e) => e.key === 'Enter' && addAcceptType()}
      />
      <button class="btn btn-secondary" onclick={addAcceptType} disabled={!newAcceptType}>
        Add
      </button>
    </div>

    <!-- Presets -->
    <div class="preset-selector">
      <select bind:value={selectedPreset} class="select select-small">
        <option value="">Add preset...</option>
        {#each fileTypePresets as preset}
          <option value={preset.label}>{preset.label}</option>
        {/each}
      </select>
      <button class="btn btn-secondary btn-small" onclick={applyPreset} disabled={!selectedPreset}>
        Apply
      </button>
    </div>

    {#if question.config.accept?.length}
      <div class="accept-types-list">
        {#each question.config.accept as type}
          <div class="accept-type-item">
            <span>{type}</span>
            <button
              class="remove-btn"
              onclick={() => removeAcceptType(type)}
              aria-label="Remove type"
            >
              ✕
            </button>
          </div>
        {/each}
      </div>
    {/if}
    <p class="help-text">Leave empty to accept all file types</p>
  </div>

  <!-- File Size -->
  <div class="form-group">
    <label for="max-size">Maximum File Size</label>
    <select id="max-size" bind:value={question.config.maxSize} class="select">
      {#each fileSizePresets as preset}
        <option value={preset.value}>{preset.label}</option>
      {/each}
    </select>
    <p class="help-text">Current: {formatFileSize(question.config.maxSize || 0)}</p>
  </div>

  <!-- File Count -->
  <div class="form-group">
    <label for="max-files">Maximum Files</label>
    <input
      id="max-files"
      type="number"
      bind:value={question.config.maxFiles}
      min="1"
      max="100"
      class="input"
    />
    <p class="help-text">Allow multiple file uploads (1 = single file only)</p>
  </div>

  <!-- Storage Options -->
  <div class="section">
    <h4 class="section-title">Storage Options</h4>

    <div class="form-group">
      <label for="storage">Storage Mode</label>
      <select id="storage" bind:value={question.config.storage} class="select">
        <option value="reference">Reference (metadata only)</option>
        <option value="base64">Base64 (embed in response)</option>
        <option value="url">Object URL (temporary preview)</option>
      </select>
      <p class="help-text">
        {#if question.config.storage === 'reference'}
          Only file metadata is stored, actual file must be uploaded separately
        {:else if question.config.storage === 'base64'}
          File content is embedded as base64 string - increases response size
        {:else}
          Creates temporary URLs for preview - only valid during session
        {/if}
      </p>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.saveMetadata} class="checkbox" />
        <span>Save file metadata (last modified, upload time)</span>
      </label>
    </div>
  </div>

  <!-- UI Options -->
  <div class="section">
    <h4 class="section-title">User Interface</h4>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.dragDrop} class="checkbox" />
        <span>Enable drag & drop upload</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.showPreview} class="checkbox" />
        <span>Show file preview (images only)</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.autoUpload} class="checkbox" />
        <span>Auto-process files on selection</span>
      </label>
    </div>
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
              {question.config.accept?.length ? question.config.accept.join(', ') : 'All types'}
            </span>
          </div>
          <div class="stat">
            <span class="stat-label">Max size:</span>
            <span class="stat-value">{formatFileSize(question.config.maxSize || 0)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Max files:</span>
            <span class="stat-value">{question.config.maxFiles || 1}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Features:</span>
            <span class="stat-value">
              {[
                question.config.dragDrop && 'Drag & Drop',
                question.config.showPreview && 'Preview',
                question.config.autoUpload && 'Auto-upload',
              ]
                .filter(Boolean)
                .join(', ') || 'Basic upload'}
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
    color: #374151;
  }

  .input,
  .select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }

  .select-small {
    width: auto;
    min-width: 150px;
  }

  .input:hover,
  .select:hover {
    border-color: #d1d5db;
  }

  .input:focus,
  .select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  /* Accept types */
  .accept-types-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .accept-types-input .input {
    flex: 1;
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
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .remove-btn {
    padding: 0.125rem;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #dc2626;
  }

  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Preview */
  .preview-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
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
    color: #6b7280;
  }

  .stat-value {
    font-weight: 500;
    color: #111827;
    text-align: right;
  }
</style>
