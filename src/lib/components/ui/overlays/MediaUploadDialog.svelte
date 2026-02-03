<script lang="ts">
  import Dialog from './Dialog.svelte';
  import Button from '../../common/Button.svelte';
  import { fade } from 'svelte/transition';

  interface Props {
    open?: boolean;
    title?: string;
    accept?: string;
    multiple?: boolean;
    maxSize?: number; // in MB
    maxFiles?: number;
    onclose?: () => void;
    onupload?: (event: { files: File[] }) => void;
  }

  let {
    open = $bindable(false),
    title = 'Upload Media',
    accept = 'image/*,video/*',
    multiple = true,
    maxSize = 10,
    maxFiles = 10,
    onclose,
    onupload,
  }: Props = $props();

  let fileInput: HTMLInputElement;
  let dragActive = $state(false);
  let files = $state<File[]>([]);
  let uploadProgress = $state<Record<string, number>>({});
  let errors = $state<Record<string, string>>({});

  const maxSizeBytes = maxSize * 1024 * 1024;

  function handleClose() {
    open = false;
    files = [];
    uploadProgress = {};
    errors = {};
    dragActive = false;
    onclose?.();
  }

  function validateFile(file: File): string | null {
    if (file.size > maxSizeBytes) {
      return `File size exceeds ${maxSize}MB limit`;
    }

    // Check file type if accept is specified
    if (accept && accept !== '*') {
      const acceptedTypes = accept.split(',').map((t) => t.trim());
      const fileType = file.type;
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

      const isAccepted = acceptedTypes.some((type) => {
        if (type.endsWith('/*')) {
          return fileType.startsWith(type.replace('/*', ''));
        }
        return type === fileExtension || type === fileType;
      });

      if (!isAccepted) {
        return 'File type not accepted';
      }
    }

    return null;
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;

    const newFiles = Array.from(fileList);
    const validFiles: File[] = [];
    const newErrors: Record<string, string> = {};

    // Check max files limit
    if (files.length + newFiles.length > maxFiles) {
      newErrors.general = `Maximum ${maxFiles} files allowed`;
      errors = { ...errors, ...newErrors };
      return;
    }

    newFiles.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        newErrors[file.name] = error;
      } else {
        validFiles.push(file);
      }
    });

    if (validFiles.length > 0) {
      files = multiple ? [...files, ...validFiles] : validFiles.slice(0, 1);
    }

    errors = { ...errors, ...newErrors };
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    handleFiles(event.dataTransfer?.files || null);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    if (event.currentTarget === event.target) {
      dragActive = false;
    }
  }

  function removeFile(index: number) {
    files = files.filter((_, i) => i !== index);
    const fileName = files[index]?.name;
    if (fileName) {
      delete errors[fileName];
      delete uploadProgress[fileName];
      errors = { ...errors };
      uploadProgress = { ...uploadProgress };
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleUpload() {
    if (files.length === 0) return;

    // Initialize progress
    files.forEach((file) => {
      uploadProgress[file.name] = 0;
    });

    onupload?.({ files });
  }

  function getFileIcon(file: File) {
    if (file.type.startsWith('image/')) {
      return 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z';
    } else if (file.type.startsWith('video/')) {
      return 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';
    } else {
      return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
    }
  }
</script>

<Dialog bind:open {title} size="lg" onclose={handleClose}>
  <div class="space-y-6">
    <!-- Drop Zone -->
    <div
      class="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors {dragActive
        ? 'border-primary bg-primary/5'
        : 'border-border hover:border-muted-foreground bg-layer-surface'}"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      role="button"
      tabindex="0"
      onclick={() => fileInput?.click()}
      onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
    >
      <input
        bind:this={fileInput}
        type="file"
        {accept}
        {multiple}
        onchange={(e) => handleFiles(e.currentTarget.files)}
        class="sr-only"
      />

      <svg
        class="mx-auto h-12 w-12 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>

      <p class="mt-4 text-sm font-medium text-foreground">
        {dragActive ? 'Drop files here' : 'Drop files here or click to browse'}
      </p>

      <p class="mt-2 text-xs text-muted-foreground">
        {accept === '*' ? 'All file types' : accept.split(',').join(', ')} • Max {maxSize}MB per
        file •
        {multiple ? `Up to ${maxFiles} files` : 'Single file only'}
      </p>
    </div>

    <!-- Error Messages -->
    {#if errors.general}
      <div
        transition:fade={{ duration: 200 }}
        class="rounded-md bg-destructive/10 border border-destructive/20 p-3"
      >
        <p class="text-sm text-destructive">{errors.general}</p>
      </div>
    {/if}

    <!-- File List -->
    {#if files.length > 0}
      <div class="space-y-2">
        <h3 class="text-sm font-medium text-foreground">
          Selected Files ({files.length})
        </h3>

        <div class="space-y-2 max-h-64 overflow-y-auto">
          {#each files as file, index}
            <div
              class="flex items-center gap-3 p-3 rounded-lg border transition-colors {errors[
                file.name
              ]
                ? 'border-destructive/50 bg-destructive/5'
                : 'border-border bg-layer-surface hover:bg-accent/50'}"
            >
              <!-- File Icon -->
              <div class="flex-shrink-0">
                <svg
                  class="h-8 w-8 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d={getFileIcon(file)}
                  />
                </svg>
              </div>

              <!-- File Info -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground truncate">
                  {file.name}
                </p>
                <p class="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                  {#if errors[file.name]}
                    <span class="text-destructive"> • {errors[file.name]}</span>
                  {/if}
                </p>

                <!-- Upload Progress -->
                {#if uploadProgress[file.name] !== undefined}
                  <div class="mt-1 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      class="bg-primary h-full transition-all duration-300 ease-out"
                      style="width: {uploadProgress[file.name]}%"
                    ></div>
                  </div>
                {/if}
              </div>

              <!-- Remove Button -->
              {#if !uploadProgress[file.name]}
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Remove file"
                >
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={handleClose}>Cancel</Button>
    <Button
      variant="primary"
      onclick={handleUpload}
      disabled={files.length === 0 || Object.keys(errors).some((key) => key !== 'general')}
    >
      Upload {files.length}
      {files.length === 1 ? 'File' : 'Files'}
    </Button>
  {/snippet}
</Dialog>
