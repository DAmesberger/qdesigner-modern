<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import {
    OfflineBinaryPersistence,
    BinaryCaptureError,
    DEFAULT_BINARY_MAX_BYTES,
    type BinaryAnswerReference,
  } from '$lib/fillout/services/OfflineBinaryPersistence';

  // The storage-mode selector (base64 / url / reference) is DELETED (ADR 0029
  // Half 2). Both binary question types now share one offline-first contract:
  // the Blob is written to IndexedDB and the response stores a structured
  // reference. `storage` / `saveMetadata` / `autoUpload` fields on legacy
  // definitions are simply ignored.
  interface FileUploadConfig {
    accept?: string[];
    maxSize?: number;
    maxFiles?: number;
    dragDrop?: boolean;
  }

  interface Props extends QuestionProps {
    question: Question & { config: FileUploadConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  if (value === undefined) value = null;

  // Configuration
  const config = $derived(question.config);
  const accept = $derived(config.accept?.join(',') || '*');
  const maxSize = $derived(config.maxSize || DEFAULT_BINARY_MAX_BYTES);
  const maxFiles = $derived(config.maxFiles || 1);
  const allowMultiple = $derived(maxFiles > 1);
  const dragDrop = $derived(config.dragDrop !== false);

  // State
  let files = $state<File[]>([]);
  let uploadErrors = $state<Map<string, string>>(new Map());
  // Form-level (not per-file) validation message, e.g. the max-files guard or a
  // capture failure (oversize / device quota). Drives the blocking onValidation
  // verdict so Continue is held until the participant fixes it (ADR 0029 Half 2).
  let formError = $state<string | null>(null);
  let isDragging = $state(false);
  let fileInput: HTMLInputElement;

  // Validation (ADR 0029 Half 2). A capture failure blocks unconditionally — the
  // participant is present and can act — while required-presence gating stays
  // central in the fillout controller.
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;

    if (formError) {
      errors.push(formError);
      isValid = false;
    }

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

  // Handle file selection
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      void handleFiles(Array.from(input.files));
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
      void handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  /**
   * Validate, persist offline-first, and record each selected file. The Blob is
   * written to IndexedDB via {@link OfflineBinaryPersistence.capture}; the
   * response value holds only the structured reference (never a blob: URL). A
   * capture failure (oversize / quota) is surfaced loudly and blocks Continue.
   */
  async function handleFiles(newFiles: File[]) {
    uploadErrors.clear();
    formError = null;

    // Validate file count
    const totalFiles = files.length + newFiles.length;
    if (totalFiles > maxFiles) {
      formError = `Maximum ${maxFiles} file${maxFiles > 1 ? 's' : ''} allowed`;
      return;
    }

    const sessionId =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('qd_api_session_id') : null;

    const acceptedFiles: File[] = [];
    const references: BinaryAnswerReference[] = [];

    for (const file of newFiles) {
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;

      // Type validation is a participant-correctable constraint.
      if (!isValidFileType(file)) {
        uploadErrors.set(fileId, `Invalid file type. Allowed: ${config.accept?.join(', ')}`);
        formError = 'Please choose a file of an allowed type.';
        continue;
      }

      try {
        const reference = sessionId
          ? await OfflineBinaryPersistence.capture(
              sessionId,
              question.id,
              file,
              file.name,
              maxSize
            )
          : // Designer preview (no session): validate the size cap but keep the
            // reference transient — nothing is persisted or synced.
            captureTransient(file);
        acceptedFiles.push(file);
        references.push(reference);
      } catch (err) {
        if (err instanceof BinaryCaptureError) {
          uploadErrors.set(fileId, err.message);
          formError = err.message;
        } else {
          const message = err instanceof Error ? err.message : 'Failed to save file';
          uploadErrors.set(fileId, message);
          formError = message;
        }
      }
    }

    if (acceptedFiles.length > 0) {
      files = [...files, ...acceptedFiles];

      if (allowMultiple) {
        const current: BinaryAnswerReference[] = Array.isArray(value)
          ? (value as BinaryAnswerReference[])
          : [];
        value = [...current, ...references];
      } else {
        value = references[0] ?? null;
      }

      onResponse?.(value);
    }

    onInteraction?.({
      type: 'files-selected' as any,
      timestamp: Date.now(),
      data: {
        count: acceptedFiles.length,
        totalSize: acceptedFiles.reduce((sum, f) => sum + f.size, 0),
      },
    });
  }

  /** Non-persisting reference for designer preview (size cap still enforced). */
  function captureTransient(file: File): BinaryAnswerReference {
    const cap = maxSize;
    if (file.size > cap) {
      throw new BinaryCaptureError(
        'oversize',
        `File is ${formatFileSize(file.size)}; the maximum is ${formatFileSize(cap)}.`
      );
    }
    return {
      clientId: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: 'pending',
    };
  }

  // Remove file
  function removeFile(index: number) {
    const removedFile = files[index];
    if (!removedFile) return;

    const fileId = `${removedFile.name}-${removedFile.size}-${removedFile.lastModified}`;
    uploadErrors.delete(fileId);
    // Removing the offending file clears a capture block.
    formError = null;

    // Discard the pinned blob for the removed entry so it isn't uploaded later.
    const removedRef = allowMultiple && Array.isArray(value) ? value[index] : value;
    if (removedRef && typeof removedRef === 'object' && 'clientId' in removedRef) {
      void OfflineBinaryPersistence.delete((removedRef as BinaryAnswerReference).clientId);
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

    {#if formError}
      <div class="mt-2 text-sm text-destructive" role="alert" data-testid="file-upload-form-error">
        {formError}
      </div>
    {/if}

    {#if files.length > 0}
      <div class="mt-4 flex flex-col gap-2">
        {#each files as file, index}
          {@const fileId = `${file.name}-${file.size}-${file.lastModified}`}
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
