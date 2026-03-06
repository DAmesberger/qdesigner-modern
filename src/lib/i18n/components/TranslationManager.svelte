<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    supportedLanguages,
    resources,
    getCurrentLanguage,
    validateTranslationKeys,
    detectMissingTranslations,
    namespaces,
  } from '../config';
  import { translationManagerStore, translationStats, i18nStore } from '../stores';
  import type {
    TranslationEntry,
    TranslationManagerProps,
    TranslationImportResult,
    TranslationExportOptions,
  } from '../types';
  import { Search, ArrowUpDown, Download, Upload, Save, AlertTriangle, AlertCircle, Check, X, Pencil, Copy, Languages } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';

  interface Props extends TranslationManagerProps {
    readonly?: boolean;
    allowInlineEdit?: boolean;
    showValidation?: boolean;
    showStatistics?: boolean;
    allowImportExport?: boolean;
    filterLanguages?: string[];
    filterNamespaces?: string[];
  }

  let {
    readonly = false,
    allowInlineEdit = true,
    showValidation = true,
    showStatistics = true,
    allowImportExport = true,
    filterLanguages = [],
    filterNamespaces = [],
    ...restProps
  }: Props = $props();

  // State
  let searchQuery = $state('');
  let selectedNamespace = $state('all');
  let selectedLanguage = $state('all');
  let showMissingOnly = $state(false);
  let showModifiedOnly = $state(false);
  let showValidationErrors = $state(false);
  let entries = $state<TranslationEntry[]>([]);
  let filteredEntries = $state<TranslationEntry[]>([]);
  let editingKey = $state<string | null>(null);
  let editingValue = $state('');
  let isLoading = $state(true);
  let isSaving = $state(false);
  let saveStatus = $state<'idle' | 'saving' | 'success' | 'error'>('idle');
  let inContextMode = $state(false);
  let selectedEntries = $state<Set<string>>(new Set());
  let sortBy = $state<'key' | 'namespace' | 'modified' | 'missing'>('key');
  let sortOrder = $state<'asc' | 'desc'>('asc');

  // Computed values
  let availableLanguages = $derived(
    filterLanguages.length > 0
      ? supportedLanguages.filter((l) => filterLanguages.includes(l.code))
      : supportedLanguages
  );

  let availableNamespaces = $derived(
    filterNamespaces.length > 0
      ? namespaces.filter((ns) => filterNamespaces.includes(ns))
      : namespaces
  );

  let stats = $derived($translationStats);
  let modifiedCount = $derived(entries.filter((e) => e.modified).length);
  let missingCount = $derived(entries.reduce((sum, e) => sum + e.missing.length, 0));
  let validationErrorCount = $derived(
    entries.reduce((sum, e) => {
      const errors = validateTranslationKeys(e.translations, e.namespace);
      return sum + errors.length;
    }, 0)
  );

  // Load translations on mount
  onMount(() => {
    loadTranslations();
  });

  // Load all translations
  function loadTranslations() {
    isLoading = true;
    const allEntries: TranslationEntry[] = [];

    // Extract all translation keys
    for (const namespace of availableNamespaces) {
      const enTranslations = resources.en?.[namespace] || {};
      const keys = extractKeys(enTranslations, namespace);

      for (const key of keys) {
        const translations: Record<string, string> = {};
        const missing: string[] = [];

        // Check each language
        for (const lang of availableLanguages) {
          const langTranslations = resources[lang.code]?.[namespace] || {};
          const value = getNestedValue(langTranslations, key.split('.').slice(1));

          if (value) {
            translations[lang.code] = value;
          } else if (lang.code !== 'en') {
            missing.push(lang.code);
          }
        }

        allEntries.push({
          key: `${namespace}.${key}`,
          namespace,
          translations,
          missing,
          modified: false,
          lastModified: new Date(),
          modifiedBy: 'user',
        });
      }
    }

    entries = allEntries;
    translationManagerStore.set(allEntries);
    filterAndSortEntries();
    isLoading = false;
  }

  // Extract all keys from nested object
  function extractKeys(obj: any, prefix: string = ''): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null) {
        keys.push(...extractKeys(value, fullKey));
      } else {
        keys.push(fullKey);
      }
    }

    return keys;
  }

  // Get nested value from object
  function getNestedValue(obj: any, path: string[]): string | undefined {
    let current = obj;

    for (const key of path) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return typeof current === 'string' ? current : undefined;
  }

  // Filter and sort entries
  function filterAndSortEntries() {
    let filtered = entries;

    // Apply namespace filter
    if (selectedNamespace !== 'all') {
      filtered = filtered.filter((entry) => entry.namespace === selectedNamespace);
    }

    // Apply language filter
    if (selectedLanguage !== 'all') {
      filtered = filtered.filter(
        (entry) => entry.missing.includes(selectedLanguage) || entry.translations[selectedLanguage]
      );
    }

    // Apply missing filter
    if (showMissingOnly) {
      filtered = filtered.filter((entry) => entry.missing.length > 0);
    }

    // Apply modified filter
    if (showModifiedOnly) {
      filtered = filtered.filter((entry) => entry.modified);
    }

    // Apply validation errors filter
    if (showValidationErrors) {
      filtered = filtered.filter((entry) => {
        const errors = validateTranslationKeys(entry.translations, entry.namespace);
        return errors.length > 0;
      });
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (entry) =>
          entry.key.toLowerCase().includes(query) ||
          Object.values(entry.translations).some((trans) => trans.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'key':
          comparison = a.key.localeCompare(b.key);
          break;
        case 'namespace':
          comparison = a.namespace.localeCompare(b.namespace);
          break;
        case 'modified':
          comparison = (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0);
          break;
        case 'missing':
          comparison = a.missing.length - b.missing.length;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    filteredEntries = filtered;
  }

  // Start editing a translation
  async function startEdit(key: string, lang: string) {
    if (readonly) return;

    const entry = entries.find((e) => e.key === key);
    if (entry) {
      editingKey = `${key}:${lang}`;
      editingValue = entry.translations[lang] || '';

      // Focus the input after DOM update
      await tick();
      const input = document.querySelector(
        '.translation-manager td input[type="text"]'
      ) as HTMLInputElement;
      input?.focus();
    }
  }

  // Save edited translation
  function saveEdit(key: string, lang: string) {
    if (readonly) return;

    const entry = entries.find((e) => e.key === key);
    if (entry) {
      entry.translations[lang] = editingValue;
      entry.modified = true;
      entry.lastModified = new Date();

      // Remove from missing if it was there
      const missingIndex = entry.missing.indexOf(lang);
      if (missingIndex > -1) {
        entry.missing.splice(missingIndex, 1);
      }

      editingKey = null;
      editingValue = '';

      // Update store
      translationManagerStore.updateEntry(key, entry);
      filterAndSortEntries();
    }
  }

  // Cancel editing
  function cancelEdit() {
    editingKey = null;
    editingValue = '';
  }

  // Handle keyboard shortcuts in edit mode
  function handleEditKeydown(event: KeyboardEvent, key: string, lang: string) {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        saveEdit(key, lang);
        break;
      case 'Escape':
        event.preventDefault();
        cancelEdit();
        break;
      case 'Tab':
        // Allow tab to move to next field
        saveEdit(key, lang);
        break;
    }
  }

  // Copy translation from another language
  function copyTranslation(key: string, fromLang: string, toLang: string) {
    if (readonly) return;

    const entry = entries.find((e) => e.key === key);
    if (entry && entry.translations[fromLang]) {
      entry.translations[toLang] = entry.translations[fromLang];
      entry.modified = true;
      entry.lastModified = new Date();

      // Remove from missing
      const missingIndex = entry.missing.indexOf(toLang);
      if (missingIndex > -1) {
        entry.missing.splice(missingIndex, 1);
      }

      translationManagerStore.updateEntry(key, entry);
      filterAndSortEntries();
    }
  }

  // Auto-translate using fallback values
  function autoTranslate(key: string, targetLang: string) {
    if (readonly) return;

    const entry = entries.find((e) => e.key === key);
    if (entry && entry.translations.en) {
      // For demo purposes, we'll just copy the English text
      // In a real implementation, this could call a translation API
      entry.translations[targetLang] = `[AUTO] ${entry.translations.en}`;
      entry.modified = true;
      entry.lastModified = new Date();

      const missingIndex = entry.missing.indexOf(targetLang);
      if (missingIndex > -1) {
        entry.missing.splice(missingIndex, 1);
      }

      translationManagerStore.updateEntry(key, entry);
      filterAndSortEntries();
    }
  }

  // Toggle entry selection
  function toggleEntrySelection(key: string) {
    const newSelection = new Set(selectedEntries);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    selectedEntries = newSelection;
  }

  // Select all filtered entries
  function selectAllFiltered() {
    selectedEntries = new Set(filteredEntries.map((e) => e.key));
  }

  // Clear selection
  function clearSelection() {
    selectedEntries = new Set();
  }

  // Export translations
  async function exportTranslations(options: TranslationExportOptions = {}) {
    const exportData: Record<string, any> = {};
    const entriesToExport =
      options.languages || options.namespaces
        ? entries.filter(
            (e) =>
              (!options.languages || options.languages.includes(e.namespace)) &&
              (!options.namespaces || options.namespaces.includes(e.namespace))
          )
        : selectedEntries.size > 0
          ? entries.filter((e) => selectedEntries.has(e.key))
          : entries;

    // Group by language and namespace
    for (const entry of entriesToExport) {
      for (const [lang, translation] of Object.entries(entry.translations)) {
        if (!translation && !options.includeEmpty) continue;

        if (!exportData[lang]) {
          exportData[lang] = {};
        }

        const namespace = entry.namespace;
        if (!exportData[lang][namespace]) {
          exportData[lang][namespace] = {};
        }

        // Set nested value
        const keys = entry.key.split('.').slice(1);
        let current = exportData[lang][namespace];

        for (let i = 0; i < keys.length - 1; i++) {
          const segment = keys[i];
          if (!segment) continue;
          if (!(current as any)[segment]) {
            (current as any)[segment] = {};
          }
          current = (current as any)[segment];
        }

        const leaf = keys[keys.length - 1];
        if (!leaf) continue;
        (current as any)[leaf] = translation;

        // Add metadata if requested
        if (options.includeMetadata) {
          current[`${leaf}_meta`] = {
            lastModified: entry.lastModified,
            modifiedBy: entry.modifiedBy,
            missing: entry.missing,
          };
        }
      }
    }

    // Create and download file
    const filename = `translations-${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import translations
  async function importTranslations(event: Event): Promise<TranslationImportResult> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return {
        success: false,
        imported: 0,
        updated: 0,
        errors: ['No file selected'],
        warnings: [],
      };
    }

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      let imported = 0;
      let updated = 0;
      const errors: string[] = [];
      const warnings: string[] = [];

      // Update entries with imported data
      for (const [lang, namespaces] of Object.entries(importData)) {
        if (!supportedLanguages.find((l) => l.code === lang)) {
          warnings.push(`Language ${lang} is not supported`);
          continue;
        }

        for (const [namespace, translations] of Object.entries(namespaces as any)) {
          if (!availableNamespaces.includes(namespace)) {
            warnings.push(`Namespace ${namespace} is not available`);
            continue;
          }

          const result = updateEntriesFromImport(lang, namespace, translations);
          imported += result.imported;
          updated += result.updated;
          errors.push(...result.errors);
        }
      }

      filterAndSortEntries();
      input.value = ''; // Clear the input

      return { success: true, imported, updated, errors, warnings };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        imported: 0,
        updated: 0,
        errors: [`Import failed: ${errorMessage}`],
        warnings: [],
      };
    }
  }

  function updateEntriesFromImport(
    lang: string,
    namespace: string,
    translations: any,
    prefix: string = ''
  ) {
    let imported = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [key, value] of Object.entries(translations)) {
      if (key.endsWith('_meta')) continue; // Skip metadata

      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null) {
        const result = updateEntriesFromImport(lang, namespace, value, fullKey);
        imported += result.imported;
        updated += result.updated;
        errors.push(...result.errors);
      } else {
        const entryKey = `${namespace}.${fullKey}`;
        const entry = entries.find((e) => e.key === entryKey);

        if (entry) {
          const existed = !!entry.translations[lang];
          entry.translations[lang] = value as string;
          entry.modified = true;
          entry.lastModified = new Date();

          // Remove from missing
          const missingIndex = entry.missing.indexOf(lang);
          if (missingIndex > -1) {
            entry.missing.splice(missingIndex, 1);
          }

          if (existed) {
            updated++;
          } else {
            imported++;
          }
        } else {
          errors.push(`Key ${entryKey} not found`);
        }
      }
    }

    return { imported, updated, errors };
  }

  // Save all changes
  async function saveAllChanges() {
    if (readonly) return;

    isSaving = true;
    saveStatus = 'saving';

    try {
      // In a real app, this would save to the backend
      // For now, we'll just simulate saving
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mark all as unmodified
      entries.forEach((entry) => {
        entry.modified = false;
      });

      translationManagerStore.markAsSaved();

      saveStatus = 'success';
      setTimeout(() => {
        saveStatus = 'idle';
      }, 3000);
    } catch (error) {
      saveStatus = 'error';
      console.error('Save failed:', error);
    } finally {
      isSaving = false;
    }
  }

  // React to filter changes
  $effect(() => {
    if (
      searchQuery !== undefined ||
      selectedNamespace !== undefined ||
      selectedLanguage !== undefined ||
      showMissingOnly !== undefined ||
      showModifiedOnly !== undefined ||
      showValidationErrors !== undefined ||
      sortBy !== undefined ||
      sortOrder !== undefined
    ) {
      filterAndSortEntries();
    }
  });
</script>

<div class="translation-manager p-6 max-h-screen overflow-y-auto">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-2xl font-bold">Translation Manager</h2>
      {#if showStatistics && stats}
        <div class="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Completion: {stats.overallCompletion.toFixed(1)}%</span>
          <span>Modified: {stats.modifiedCount}</span>
        </div>
      {/if}
    </div>
    <p class="text-muted-foreground">Manage translations for all supported languages</p>
  </div>

  <!-- Toolbar -->
  <div class="bg-card border border-border rounded-lg p-4 mb-6">
    <!-- Search and filters row -->
    <div class="flex flex-wrap gap-4 items-center mb-4">
      <!-- Search -->
      <div class="flex-1 min-w-64">
        <div class="relative">
          <Search size={16} class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground z-10" />
          <Input
            type="text"
            bind:value={searchQuery}
            placeholder="Search translations..."
            class="w-full pl-10"
          />
        </div>
      </div>

      <!-- Namespace filter -->
      <Select bind:value={selectedNamespace} placeholder="">
        <option value="all">All Namespaces</option>
        {#each availableNamespaces as namespace}
          <option value={namespace}>{namespace}</option>
        {/each}
      </Select>

      <!-- Language filter -->
      <Select bind:value={selectedLanguage} placeholder="">
        <option value="all">All Languages</option>
        {#each availableLanguages as lang}
          <option value={lang.code}>{lang.name}</option>
        {/each}
      </Select>

      <!-- Sort -->
      <Select bind:value={sortBy} placeholder="">
        <option value="key">Sort by Key</option>
        <option value="namespace">Sort by Namespace</option>
        <option value="modified">Sort by Modified</option>
        <option value="missing">Sort by Missing</option>
      </Select>

      <button
        onclick={() => (sortOrder = sortOrder === 'asc' ? 'desc' : 'asc')}
        class="px-3 py-2 border border-border rounded-md hover:bg-accent focus:ring-primary focus:border-primary"
        title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
      >
        <ArrowUpDown size={16} class="transform transition-transform {sortOrder === 'desc' ? 'rotate-180' : ''}" />
      </button>
    </div>

    <!-- Filter toggles row -->
    <div class="flex flex-wrap gap-4 items-center mb-4">
      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showMissingOnly}
          class="rounded border-border text-primary focus:ring-primary"
        />
        <span class="ml-2 text-sm">Missing only ({missingCount})</span>
      </label>

      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showModifiedOnly}
          class="rounded border-border text-primary focus:ring-primary"
        />
        <span class="ml-2 text-sm">Modified only ({modifiedCount})</span>
      </label>

      {#if showValidation}
        <label class="flex items-center">
          <input
            type="checkbox"
            bind:checked={showValidationErrors}
            class="rounded border-border text-destructive focus:ring-destructive"
          />
          <span class="ml-2 text-sm">Validation errors ({validationErrorCount})</span>
        </label>
      {/if}

      {#if !readonly}
        <label class="flex items-center">
          <input
            type="checkbox"
            bind:checked={inContextMode}
            class="rounded border-border text-success focus:ring-success"
          />
          <span class="ml-2 text-sm">In-context editing</span>
        </label>
      {/if}
    </div>

    <!-- Actions row -->
    <div class="flex items-center justify-between">
      <!-- Selection actions -->
      <div class="flex items-center gap-2">
        {#if selectedEntries.size > 0}
          <span class="text-sm text-muted-foreground">{selectedEntries.size} selected</span>
          <button onclick={clearSelection} class="text-sm text-muted-foreground hover:text-foreground">
            Clear
          </button>
        {:else}
          <button onclick={selectAllFiltered} class="text-sm text-muted-foreground hover:text-foreground">
            Select all ({filteredEntries.length})
          </button>
        {/if}
      </div>

      <!-- Main actions -->
      <div class="flex gap-2">
        {#if allowImportExport}
          <button
            onclick={() => exportTranslations()}
            class="flex items-center gap-2 px-3 py-2 text-sm bg-muted text-foreground rounded-md hover:bg-accent"
          >
            <Download size={16} />
            Export
          </button>

          <label
            class="flex items-center gap-2 px-3 py-2 text-sm bg-muted text-foreground rounded-md hover:bg-accent cursor-pointer"
          >
            <Upload size={16} />
            Import
            <input type="file" accept=".json" onchange={importTranslations} class="hidden" />
          </label>
        {/if}

        {#if !readonly}
          <button
            onclick={saveAllChanges}
            disabled={modifiedCount === 0 || isSaving}
            class="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isSaving}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {:else}
              <Save size={16} />
            {/if}
            Save Changes {modifiedCount > 0 ? `(${modifiedCount})` : ''}
          </button>
        {/if}
      </div>
    </div>

    <!-- Status indicators -->
    <div class="flex items-center gap-4 mt-4 text-sm border-t pt-4">
      <span class="text-muted-foreground">
        Showing {filteredEntries.length} of {entries.length} entries
      </span>

      {#if missingCount > 0}
        <span class="text-warning flex items-center gap-1">
          <AlertTriangle size={16} />
          {missingCount} missing translations
        </span>
      {/if}

      {#if validationErrorCount > 0}
        <span class="text-destructive flex items-center gap-1">
          <AlertCircle size={16} />
          {validationErrorCount} validation errors
        </span>
      {/if}

      {#if saveStatus === 'saving'}
        <span class="text-muted-foreground">Saving...</span>
      {:else if saveStatus === 'success'}
        <span class="text-success flex items-center gap-1">
          <Check size={16} />
          Saved successfully
        </span>
      {:else if saveStatus === 'error'}
        <span class="text-destructive flex items-center gap-1">
          <X size={16} />
          Save failed
        </span>
      {/if}
    </div>
  </div>

  <!-- Translation table -->
  <div class="bg-card border border-border rounded-lg overflow-hidden">
    {#if isLoading}
      <div class="p-8 text-center text-muted-foreground">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"
        ></div>
        Loading translations...
      </div>
    {:else if filteredEntries.length === 0}
      <div class="p-8 text-center text-muted-foreground">
        <svg
          class="w-12 h-12 mx-auto mb-4 text-muted-foreground/50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        No translations found
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-muted border-b border-border sticky top-0 z-10">
            <tr>
              <th class="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedEntries.size === filteredEntries.length}
                  indeterminate={selectedEntries.size > 0 &&
                    selectedEntries.size < filteredEntries.length}
                  onchange={(e) => {
                    if (e.currentTarget.checked) {
                      selectAllFiltered();
                    } else {
                      clearSelection();
                    }
                  }}
                  class="rounded border-border text-primary focus:ring-primary"
                />
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Key
              </th>
              {#each availableLanguages as lang}
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                >
                  <div class="flex items-center gap-2">
                    {#if lang.flag}
                      <span role="img" aria-hidden="true">{lang.flag}</span>
                    {/if}
                    {lang.code}
                  </div>
                </th>
              {/each}
              <th
                class="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            {#each filteredEntries as entry (entry.key)}
              <tr
                class="hover:bg-accent {entry.modified ? 'bg-info/10' : ''} {showValidation && validateTranslationKeys(entry.translations, entry.namespace).length > 0 ? 'bg-destructive/10' : ''}"
              >
                <!-- Checkbox -->
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedEntries.has(entry.key)}
                    onchange={() => toggleEntrySelection(entry.key)}
                    class="rounded border-border text-primary focus:ring-primary"
                  />
                </td>

                <!-- Key -->
                <td class="px-4 py-3 text-sm font-mono text-foreground max-w-xs">
                  <div class="truncate" title={entry.key}>
                    {entry.key}
                  </div>
                  {#if entry.missing.length > 0}
                    <div class="text-xs text-warning mt-1">
                      Missing: {entry.missing.join(', ')}
                    </div>
                  {/if}
                </td>

                <!-- Language columns -->
                {#each availableLanguages as lang}
                  <td class="px-4 py-3 text-sm max-w-xs">
                    {#if editingKey === `${entry.key}:${lang.code}` && allowInlineEdit && !readonly}
                      <div class="flex items-center gap-2">
                        <Input
                          type="text"
                          bind:value={editingValue}
                          class="flex-1 text-sm"
                          onkeydown={(e) => handleEditKeydown(e, entry.key, lang.code)}
                          onblur={() => saveEdit(entry.key, lang.code)}
                        />
                        <button
                          onclick={() => saveEdit(entry.key, lang.code)}
                          class="text-success hover:text-success/80"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onclick={cancelEdit}
                          class="text-destructive hover:text-destructive/80"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    {:else}
                      <div class="flex items-center justify-between group">
                        <div
                          class="flex-1 truncate"
                          class:text-muted-foreground={!entry.translations[lang.code]}
                        >
                          {entry.translations[lang.code] || 'Missing'}
                        </div>
                        {#if !readonly}
                          <div
                            class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {#if allowInlineEdit}
                              <button
                                onclick={() => startEdit(entry.key, lang.code)}
                                class="text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil size={12} />
                              </button>
                            {/if}

                            {#if !entry.translations[lang.code] && entry.translations.en}
                              <button
                                onclick={() => copyTranslation(entry.key, 'en', lang.code)}
                                class="text-muted-foreground hover:text-foreground"
                                title="Copy from English"
                              >
                                <Copy size={12} />
                              </button>

                              <button
                                onclick={() => autoTranslate(entry.key, lang.code)}
                                class="text-muted-foreground hover:text-foreground"
                                title="Auto-translate"
                              >
                                <Languages size={12} />
                              </button>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </td>
                {/each}

                <!-- Actions -->
                <td class="px-4 py-3 text-sm text-right">
                  <div class="flex items-center justify-end gap-2">
                    {#if entry.modified}
                      <span
                        class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-info/10 text-info"
                      >
                        Modified
                      </span>
                    {/if}

                    {#if entry.missing.length > 0 && !readonly}
                      <button
                        onclick={() => {
                          const sourceLang = entry.translations.en
                            ? 'en'
                            : Object.keys(entry.translations)[0];
                          if (sourceLang) {
                            entry.missing.forEach((lang) =>
                              copyTranslation(entry.key, sourceLang, lang)
                            );
                          }
                        }}
                        title="Copy to missing languages"
                        class="text-muted-foreground hover:text-foreground"
                      >
                        <Copy size={16} />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .translation-manager {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  /* Sticky header */
  thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  /* Loading animation */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /* RTL support */
  :global([dir='rtl']) .translation-manager {
    text-align: right;
  }

  :global([dir='rtl']) .translation-manager table {
    direction: ltr; /* Keep table structure LTR for better readability */
  }

  /* Indeterminate checkbox styling */
  input[type='checkbox']:indeterminate {
    background-color: hsl(var(--primary));
    border-color: hsl(var(--primary));
  }

  input[type='checkbox']:indeterminate::before {
    content: '';
    display: block;
    width: 8px;
    height: 2px;
    background: white;
    margin: 3px auto;
  }
</style>
