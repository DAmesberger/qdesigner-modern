<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { api } from '$lib/services/api';

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

    // Upload files to server in background if a session is active
    uploadFilesToServer(filesToProcess, results);
  }

  async function uploadFilesToServer(filesToProcess: File[], results: FileData[]) {
    const sessionId = sessionStorage.getItem('qd_api_session_id');
    if (!sessionId) return;

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      if (!file) continue;

      try {
        const result = await api.sessions.uploadMedia(sessionId, file, file.name);

        // Update the file data with the server URL
        const fileResult = results[i];
        if (fileResult) {
          fileResult.data = result.url;
        }
      } catch (err) {
        console.warn(`File upload failed for ${file.name}, keeping local data:`, err);
      }
    }

    // Re-emit value with updated URLs
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
  <div class="w-full">
    <input
      bind:this={fileInput}
      type="file"
      {accept}
      multiple={allowMultiple}
      onchange={handleFileSelect}
      {disabled}
      class="hidden"
    />

    {#if dragDrop}
      <div
        class="drop-zone border-2 border-dashed border-border rounded-lg text-center cursor-pointer transition-all duration-200 bg-muted hover:border-primary hover:bg-primary/10"
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
          <div class="pointer-events-none">
            <div class="text-5xl mb-4">📁</div>
            <p class="mb-2 text-lg font-medium text-foreground">Drag & drop files here or click to browse</p>
            <p class="text-sm text-muted-foreground">
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
      <button type="button" onclick={triggerFileInput} {disabled} class="upload-button px-6 py-3 bg-primary text-background border-none rounded-md text-base font-medium cursor-pointer transition-colors duration-200 hover:brightness-90 disabled:bg-muted-foreground disabled:cursor-not-allowed">
        Choose File{allowMultiple ? 's' : ''}
      </button>
    {/if}

    {#if files.length > 0}
      <div class="mt-4 flex flex-col gap-2">
        {#each files as file, index}
          {@const fileId = `${file.name}-${file.size}-${file.lastModified}`}
          {@const progress = uploadProgress.get(fileId) || 0}
          {@const error = uploadErrors.get(fileId)}

          <div class="file-item flex items-center px-4 py-3 bg-background border border-border rounded-md relative" class:error>
            <div class="flex-1 flex items-center gap-3 min-w-0">
              <span class="text-2xl shrink-0">
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
              <div class="flex flex-col min-w-0">
                <span class="text-sm font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis">{file.name}</span>
                <span class="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
              </div>
            </div>

            {#if error}
              <div class="file-error absolute -bottom-5 left-0 text-xs text-destructive">{error}</div>
            {:else if progress < 100}
              <div class="progress-bar absolute bottom-0 left-0 right-0 h-[3px] bg-border rounded-b-md overflow-hidden">
                <div class="h-full bg-primary transition-[width] duration-300" style="width: {progress}%"></div>
              </div>
            {/if}

            <button
              type="button"
              onclick={() => removeFile(index)}
              class="w-6 h-6 p-0 bg-muted border border-border rounded text-muted-foreground text-sm cursor-pointer transition-all duration-200 shrink-0 hover:bg-destructive/15 hover:border-destructive/50 hover:text-destructive"
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
  .drop-zone {
    padding: 3rem 2rem;
  }

  .drop-zone.dragging {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.2);
  }

  .drop-zone.has-files {
    padding: 1rem;
  }

  .file-item.error {
    border-color: hsl(var(--destructive));
    background: hsl(var(--destructive) / 0.1);
  }

  .upload-button:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  @media (max-width: 640px) {
    .drop-zone {
      padding: 2rem 1rem;
    }
  }
</style>
