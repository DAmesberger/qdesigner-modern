<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
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

  interface FileData {
    id: string;
    name: string;
    size: number;
    type: string;
    data: any;
    metadata?: {
      lastModified: number;
      uploadTime: number;
    };
  }

  interface Props extends QuestionProps {
    question: Question & { config: FileUploadConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(null),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  // Configuration
  const config = $derived(question.config);
  const accept = $derived(config.accept?.join(',') || '*');
  const maxSize = $derived(config.maxSize || 10 * 1024 * 1024);
  const maxFiles = $derived(config.maxFiles || 1);
  const allowMultiple = $derived(maxFiles > 1);
  const dragDrop = $derived(config.dragDrop !== false);

  // State
  let files = $state<File[]>([]);
  let uploadProgress = $state<Map<string, number>>(new Map());
  let uploadErrors = $state<Map<string, string>>(new Map());
  let isDragging = $state(false);
  let fileInput: HTMLInputElement;

  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;

    if (question.required && (!value || (Array.isArray(value) && value.length === 0))) {
      errors.push('At least one file is required');
      isValid = false;
    }

    onValidation?.({ valid: isValid, errors });
  });

  // Human-readable file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // File type validation
  function isValidFileType(file: File): boolean {
    if (!config.accept || config.accept.length === 0) return true;

    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    return config.accept.some((type) => {
      // Check MIME type
      if (type.includes('/')) {
        if (type.endsWith('/*')) {
          // Wildcard MIME type (e.g., image/*)
          return mimeType.startsWith(type.slice(0, -1));
        }
        return mimeType === type;
      }
      // Check file extension
      return fileExtension === type.toLowerCase();
    });
  }

  // File size validation
  function isValidFileSize(file: File): boolean {
    return file.size <= maxSize;
  }

  // Handle file selection
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      handleFiles(Array.from(input.files));
    }
  }

  // Handle drag over
  function handleDragOver(event: DragEvent) {
    if (!dragDrop || disabled) return;

    event.preventDefault();
    isDragging = true;
  }

  // Handle drag leave
  function handleDragLeave(event: DragEvent) {
    if (!dragDrop || disabled) return;

    event.preventDefault();
    isDragging = false;
  }

  // Handle drop
  function handleDrop(event: DragEvent) {
    if (!dragDrop || disabled) return;

    event.preventDefault();
    isDragging = false;

    if (event.dataTransfer?.files) {
      handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  // Process files
  function handleFiles(newFiles: File[]) {
    uploadErrors.clear();

    // Validate file count
    const totalFiles = files.length + newFiles.length;
    if (totalFiles > maxFiles) {
      alert(`Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed`);
      return;
    }

    // Validate and process each file
    const validFiles: File[] = [];

    for (const file of newFiles) {
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;

      // Validate file type
      if (!isValidFileType(file)) {
        uploadErrors.set(fileId, `Invalid file type. Allowed: ${config.accept?.join(', ')}`);
        continue;
      }

      // Validate file size
      if (!isValidFileSize(file)) {
        uploadErrors.set(fileId, `File too large. Maximum size: ${formatFileSize(maxSize)}`);
        continue;
      }

      validFiles.push(file);
      uploadProgress.set(fileId, 0);
    }

    // Add valid files
    files = [...files, ...validFiles];

    // Process files based on storage type
    if (config.autoUpload !== false) {
      processFiles(validFiles);
    }

    onInteraction?.({
      type: 'files-selected' as any,
      timestamp: Date.now(),
      data: {
        count: validFiles.length,
        totalSize: validFiles.reduce((sum, f) => sum + f.size, 0),
      },
    });
  }

  // Process files based on storage configuration
  async function processFiles(filesToProcess: File[]) {
    const results: FileData[] = [];

    for (const file of filesToProcess) {
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;

      try {
        let fileData: any;

        if (config.storage === 'base64') {
          // Convert to base64
          fileData = await fileToBase64(file);
        } else if (config.storage === 'url') {
          // Create object URL (for preview)
          fileData = URL.createObjectURL(file);
        } else {
          // Reference mode - just store file metadata
          fileData = {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          };
        }

        results.push({
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          data: fileData,
          metadata: config.saveMetadata
            ? {
                lastModified: file.lastModified,
                uploadTime: Date.now(),
              }
            : undefined,
        });

        uploadProgress.set(fileId, 100);
      } catch (error: any) {
        uploadErrors.set(fileId, `Failed to process file: ${error.message}`);
        uploadProgress.delete(fileId);
      }
    }

    // Update value
    if (allowMultiple) {
      const currentValue = Array.isArray(value) ? value : [];
      value = [...currentValue, ...results];
    } else {
      value = results[0] || null;
    }

    onResponse?.(value);
  }

  // Convert file to base64
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  }

  // Remove file
  function removeFile(index: number) {
    const removedFile = files[index];
    if (!removedFile) return;

    const fileId = `${removedFile.name}-${removedFile.size}-${removedFile.lastModified}`;

    // Clean up
    uploadProgress.delete(fileId);
    uploadErrors.delete(fileId);

    if (config.storage === 'url' && value) {
      // Revoke object URL
      const fileData = Array.isArray(value) ? value[index] : value;
      if (
        fileData?.data &&
        typeof fileData.data === 'string' &&
        fileData.data.startsWith('blob:')
      ) {
        URL.revokeObjectURL(fileData.data);
      }
    }

    // Update files
    files = files.filter((_, i) => i !== index);

    // Update value
    if (allowMultiple && Array.isArray(value)) {
      value = value.filter((_, i) => i !== index);
    } else {
      value = null;
    }

    onResponse?.(value);
    onInteraction?.({
      type: 'file-removed' as any,
      timestamp: Date.now(),
      data: { fileName: removedFile.name },
    });
  }

  // Trigger file input
  function triggerFileInput() {
    fileInput?.click();
  }

  // Cleanup on unmount
  $effect(() => {
    return () => {
      // Revoke any object URLs on unmount
      if (config.storage === 'url' && value) {
        const values = Array.isArray(value) ? value : [value];
        values.forEach((fileData) => {
          if (
            fileData?.data &&
            typeof fileData.data === 'string' &&
            fileData.data.startsWith('blob:')
          ) {
            URL.revokeObjectURL(fileData.data);
          }
        });
      }
    };
  });
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="upload-container">
    <input
      bind:this={fileInput}
      type="file"
      {accept}
      multiple={allowMultiple}
      onchange={handleFileSelect}
      {disabled}
      class="file-input"
    />

    {#if dragDrop}
      <div
        class="drop-zone"
        class:dragging={isDragging}
        class:has-files={files.length > 0}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onclick={triggerFileInput}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === 'Enter' && triggerFileInput()}
      >
        {#if files.length === 0}
          <div class="drop-content">
            <div class="upload-icon">📁</div>
            <p class="drop-text">Drag & drop files here or click to browse</p>
            <p class="drop-hint">
              {#if config.accept && config.accept.length > 0}
                Accepted: {config.accept.join(', ')}
              {/if}
              {#if maxSize}
                • Max size: {formatFileSize(maxSize)}
              {/if}
              {#if maxFiles > 1}
                • Max files: {maxFiles}
              {/if}
            </p>
          </div>
        {/if}
      </div>
    {:else}
      <button type="button" onclick={triggerFileInput} {disabled} class="upload-button">
        Choose File{allowMultiple ? 's' : ''}
      </button>
    {/if}

    {#if files.length > 0}
      <div class="file-list">
        {#each files as file, index}
          {@const fileId = `${file.name}-${file.size}-${file.lastModified}`}
          {@const progress = uploadProgress.get(fileId) || 0}
          {@const error = uploadErrors.get(fileId)}

          <div class="file-item" class:error>
            <div class="file-info">
              <span class="file-icon">
                {#if file.type.startsWith('image/')}
                  🖼️
                {:else if file.type.startsWith('video/')}
                  🎥
                {:else if file.type.startsWith('audio/')}
                  🎵
                {:else if file.type.includes('pdf')}
                  📄
                {:else if file.type.includes('zip') || file.type.includes('compress')}
                  🗜️
                {:else}
                  📎
                {/if}
              </span>
              <div class="file-details">
                <span class="file-name">{file.name}</span>
                <span class="file-size">{formatFileSize(file.size)}</span>
              </div>
            </div>

            {#if error}
              <div class="file-error">{error}</div>
            {:else if progress < 100}
              <div class="progress-bar">
                <div class="progress-fill" style="width: {progress}%"></div>
              </div>
            {/if}

            <button
              type="button"
              onclick={() => removeFile(index)}
              class="remove-button"
              aria-label="Remove file"
            >
              ✕
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</BaseQuestion>

<style>
  .upload-container {
    width: 100%;
  }

  .file-input {
    display: none;
  }

  /* Drop zone styles */
  .drop-zone {
    border: 2px dashed #e5e7eb;
    border-radius: 0.5rem;
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #f9fafb;
  }

  .drop-zone:hover {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .drop-zone.dragging {
    border-color: #3b82f6;
    background: #dbeafe;
  }

  .drop-zone.has-files {
    padding: 1rem;
  }

  .drop-content {
    pointer-events: none;
  }

  .upload-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .drop-text {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 500;
    color: #374151;
  }

  .drop-hint {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Upload button (no drag & drop) */
  .upload-button {
    padding: 0.75rem 1.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .upload-button:hover:not(:disabled) {
    background: #2563eb;
  }

  .upload-button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  /* File list */
  .file-list {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-item {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    position: relative;
  }

  .file-item.error {
    border-color: #f87171;
    background: #fef2f2;
  }

  .file-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .file-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .file-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-size {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .file-error {
    position: absolute;
    bottom: -1.25rem;
    left: 0;
    font-size: 0.75rem;
    color: #dc2626;
  }

  /* Progress bar */
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #e5e7eb;
    border-radius: 0 0 0.375rem 0.375rem;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s;
  }

  /* Remove button */
  .remove-button {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    color: #6b7280;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .remove-button:hover {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #dc2626;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .drop-zone {
      padding: 2rem 1rem;
    }

    .upload-icon {
      font-size: 2rem;
    }

    .drop-text {
      font-size: 1rem;
    }

    .drop-hint {
      font-size: 0.75rem;
    }

    .file-item {
      padding: 0.625rem 0.875rem;
    }

    .file-icon {
      font-size: 1.25rem;
    }
  }
</style>
