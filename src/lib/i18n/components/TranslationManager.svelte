<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { 
    supportedLanguages, 
    resources,
    getCurrentLanguage,
    validateTranslationKeys,
    detectMissingTranslations,
    namespaces
  } from '../config';
  import { 
    translationManagerStore, 
    translationStats,
    i18nStore 
  } from '../stores';
  import type { 
    TranslationEntry, 
    TranslationManagerProps,
    TranslationImportResult,
    TranslationExportOptions 
  } from '../types';
  
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
  $: availableLanguages = filterLanguages.length > 0 
    ? supportedLanguages.filter(l => filterLanguages.includes(l.code))
    : supportedLanguages;
    
  $: availableNamespaces = filterNamespaces.length > 0 
    ? namespaces.filter(ns => filterNamespaces.includes(ns))
    : namespaces;
  
  $: stats = $translationStats;
  $: modifiedCount = entries.filter(e => e.modified).length;
  $: missingCount = entries.reduce((sum, e) => sum + e.missing.length, 0);
  $: validationErrorCount = entries.reduce((sum, e) => {
    const errors = validateTranslationKeys(e.translations, e.namespace);
    return sum + errors.length;
  }, 0);
  
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
          modifiedBy: 'user'
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
      filtered = filtered.filter(entry => entry.namespace === selectedNamespace);
    }
    
    // Apply language filter
    if (selectedLanguage !== 'all') {
      filtered = filtered.filter(entry => 
        entry.missing.includes(selectedLanguage) || 
        entry.translations[selectedLanguage]
      );
    }
    
    // Apply missing filter
    if (showMissingOnly) {
      filtered = filtered.filter(entry => entry.missing.length > 0);
    }
    
    // Apply modified filter
    if (showModifiedOnly) {
      filtered = filtered.filter(entry => entry.modified);
    }
    
    // Apply validation errors filter
    if (showValidationErrors) {
      filtered = filtered.filter(entry => {
        const errors = validateTranslationKeys(entry.translations, entry.namespace);
        return errors.length > 0;
      });
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.key.toLowerCase().includes(query) ||
        Object.values(entry.translations).some(trans => 
          trans.toLowerCase().includes(query)
        )
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
    
    const entry = entries.find(e => e.key === key);
    if (entry) {
      editingKey = `${key}:${lang}`;
      editingValue = entry.translations[lang] || '';
      
      // Focus the input after DOM update
      await tick();
      const input = document.querySelector(`input[data-editing="${editingKey}"]`) as HTMLInputElement;
      input?.focus();
    }
  }
  
  // Save edited translation
  function saveEdit(key: string, lang: string) {
    if (readonly) return;
    
    const entry = entries.find(e => e.key === key);
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
    
    const entry = entries.find(e => e.key === key);
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
    
    const entry = entries.find(e => e.key === key);
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
    selectedEntries = new Set(filteredEntries.map(e => e.key));
  }
  
  // Clear selection
  function clearSelection() {
    selectedEntries = new Set();
  }
  
  // Export translations
  async function exportTranslations(options: TranslationExportOptions = {}) {
    const exportData: Record<string, any> = {};
    const entriesToExport = options.languages || options.namespaces 
      ? entries.filter(e => 
          (!options.languages || options.languages.includes(e.namespace)) &&
          (!options.namespaces || options.namespaces.includes(e.namespace))
        )
      : selectedEntries.size > 0 
        ? entries.filter(e => selectedEntries.has(e.key))
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
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = translation;
        
        // Add metadata if requested
        if (options.includeMetadata) {
          current[`${keys[keys.length - 1]}_meta`] = {
            lastModified: entry.lastModified,
            modifiedBy: entry.modifiedBy,
            missing: entry.missing
          };
        }
      }
    }
    
    // Create and download file
    const filename = `translations-${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
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
      return { success: false, imported: 0, updated: 0, errors: ['No file selected'], warnings: [] };
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
        if (!supportedLanguages.find(l => l.code === lang)) {
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
        warnings: [] 
      };
    }
  }
  
  function updateEntriesFromImport(lang: string, namespace: string, translations: any, prefix: string = '') {
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
        const entry = entries.find(e => e.key === entryKey);
        
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mark all as unmodified
      entries.forEach(entry => {
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
  $: {
    if (searchQuery !== undefined || selectedNamespace !== undefined || selectedLanguage !== undefined || 
        showMissingOnly !== undefined || showModifiedOnly !== undefined || showValidationErrors !== undefined ||
        sortBy !== undefined || sortOrder !== undefined) {
      filterAndSortEntries();
    }
  }
</script>

<div class="translation-manager p-6 max-h-screen overflow-y-auto">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-2xl font-bold">Translation Manager</h2>
      {#if showStatistics && stats}
        <div class="flex items-center gap-4 text-sm text-gray-600">
          <span>Completion: {stats.overallCompletion.toFixed(1)}%</span>
          <span>Modified: {stats.modifiedCount}</span>
        </div>
      {/if}
    </div>
    <p class="text-gray-600">
      Manage translations for all supported languages
    </p>
  </div>
  
  <!-- Toolbar -->
  <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
    <!-- Search and filters row -->
    <div class="flex flex-wrap gap-4 items-center mb-4">
      <!-- Search -->
      <div class="flex-1 min-w-64">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search translations..."
            class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <!-- Namespace filter -->
      <select
        bind:value={selectedNamespace}
        class="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="all">All Namespaces</option>
        {#each availableNamespaces as namespace}
          <option value={namespace}>{namespace}</option>
        {/each}
      </select>
      
      <!-- Language filter -->
      <select
        bind:value={selectedLanguage}
        class="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="all">All Languages</option>
        {#each availableLanguages as lang}
          <option value={lang.code}>{lang.name}</option>
        {/each}
      </select>
      
      <!-- Sort -->
      <select
        bind:value={sortBy}
        class="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="key">Sort by Key</option>
        <option value="namespace">Sort by Namespace</option>
        <option value="modified">Sort by Modified</option>
        <option value="missing">Sort by Missing</option>
      </select>
      
      <button
        onclick={() => sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'}
        class="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
        title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
      >
        <svg class="w-4 h-4 transform transition-transform {sortOrder === 'desc' ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </button>
    </div>
    
    <!-- Filter toggles row -->
    <div class="flex flex-wrap gap-4 items-center mb-4">
      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showMissingOnly}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span class="ml-2 text-sm">Missing only ({missingCount})</span>
      </label>
      
      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showModifiedOnly}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span class="ml-2 text-sm">Modified only ({modifiedCount})</span>
      </label>
      
      {#if showValidation}
        <label class="flex items-center">
          <input
            type="checkbox"
            bind:checked={showValidationErrors}
            class="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span class="ml-2 text-sm">Validation errors ({validationErrorCount})</span>
        </label>
      {/if}
      
      {#if !readonly}
        <label class="flex items-center">
          <input
            type="checkbox"
            bind:checked={inContextMode}
            class="rounded border-gray-300 text-green-600 focus:ring-green-500"
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
          <span class="text-sm text-gray-600">{selectedEntries.size} selected</span>
          <button
            onclick={clearSelection}
            class="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        {:else}
          <button
            onclick={selectAllFiltered}
            class="text-sm text-gray-500 hover:text-gray-700"
          >
            Select all ({filteredEntries.length})
          </button>
        {/if}
      </div>
      
      <!-- Main actions -->
      <div class="flex gap-2">
        {#if allowImportExport}
          <button
            onclick={() => exportTranslations()}
            class="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Export
          </button>
          
          <label class="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Import
            <input
              type="file"
              accept=".json"
              onchange={importTranslations}
              class="hidden"
            />
          </label>
        {/if}
        
        {#if !readonly}
          <button
            onclick={saveAllChanges}
            disabled={modifiedCount === 0 || isSaving}
            class="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if isSaving}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            {/if}
            Save Changes {modifiedCount > 0 ? `(${modifiedCount})` : ''}
          </button>
        {/if}
      </div>
    </div>
    
    <!-- Status indicators -->
    <div class="flex items-center gap-4 mt-4 text-sm border-t pt-4">
      <span class="text-gray-600">
        Showing {filteredEntries.length} of {entries.length} entries
      </span>
      
      {#if missingCount > 0}
        <span class="text-orange-600 flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {missingCount} missing translations
        </span>
      {/if}
      
      {#if validationErrorCount > 0}
        <span class="text-red-600 flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {validationErrorCount} validation errors
        </span>
      {/if}
      
      {#if saveStatus === 'saving'}
        <span class="text-gray-600">Saving...</span>
      {:else if saveStatus === 'success'}
        <span class="text-green-600 flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Saved successfully
        </span>
      {:else if saveStatus === 'error'}
        <span class="text-red-600 flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Save failed
        </span>
      {/if}
    </div>
  </div>
  
  <!-- Translation table -->
  <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
    {#if isLoading}
      <div class="p-8 text-center text-gray-500">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        Loading translations...
      </div>
    {:else if filteredEntries.length === 0}
      <div class="p-8 text-center text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        No translations found
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th class="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedEntries.size === filteredEntries.length}
                  indeterminate={selectedEntries.size > 0 && selectedEntries.size < filteredEntries.length}
                  onchange={(e) => {
                    if (e.currentTarget.checked) {
                      selectAllFiltered();
                    } else {
                      clearSelection();
                    }
                  }}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Key
              </th>
              {#each availableLanguages as lang}
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div class="flex items-center gap-2">
                    {#if lang.flag}
                      <span role="img" aria-hidden="true">{lang.flag}</span>
                    {/if}
                    {lang.code}
                  </div>
                </th>
              {/each}
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            {#each filteredEntries as entry (entry.key)}
              <tr 
                class="hover:bg-gray-50"
                class:bg-blue-50={entry.modified}
                class:bg-red-50={showValidation && validateTranslationKeys(entry.translations, entry.namespace).length > 0}
              >
                <!-- Checkbox -->
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedEntries.has(entry.key)}
                    onchange={() => toggleEntrySelection(entry.key)}
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                
                <!-- Key -->
                <td class="px-4 py-3 text-sm font-mono text-gray-900 max-w-xs">
                  <div class="truncate" title={entry.key}>
                    {entry.key}
                  </div>
                  {#if entry.missing.length > 0}
                    <div class="text-xs text-orange-600 mt-1">
                      Missing: {entry.missing.join(', ')}
                    </div>
                  {/if}
                </td>
                
                <!-- Language columns -->
                {#each availableLanguages as lang}
                  <td class="px-4 py-3 text-sm max-w-xs">
                    {#if editingKey === `${entry.key}:${lang.code}` && allowInlineEdit && !readonly}
                      <div class="flex items-center gap-2">
                        <input
                          type="text"
                          bind:value={editingValue}
                          data-editing={editingKey}
                          class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          onkeydown={(e) => handleEditKeydown(e, entry.key, lang.code)}
                          onblur={() => saveEdit(entry.key, lang.code)}
                        />
                        <button
                          onclick={() => saveEdit(entry.key, lang.code)}
                          class="text-green-600 hover:text-green-700"
                          title="Save"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onclick={cancelEdit}
                          class="text-red-600 hover:text-red-700"
                          title="Cancel"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    {:else}
                      <div class="flex items-center justify-between group">
                        <div class="flex-1 truncate" class:text-gray-400={!entry.translations[lang.code]}>
                          {entry.translations[lang.code] || 'Missing'}
                        </div>
                        {#if !readonly}
                          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {#if allowInlineEdit}
                              <button
                                onclick={() => startEdit(entry.key, lang.code)}
                                class="text-gray-400 hover:text-gray-600"
                                title="Edit"
                              >
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            {/if}
                            
                            {#if !entry.translations[lang.code] && entry.translations.en}
                              <button
                                onclick={() => copyTranslation(entry.key, 'en', lang.code)}
                                class="text-gray-400 hover:text-gray-600"
                                title="Copy from English"
                              >
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                              
                              <button
                                onclick={() => autoTranslate(entry.key, lang.code)}
                                class="text-gray-400 hover:text-gray-600"
                                title="Auto-translate"
                              >
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                </svg>
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
                      <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Modified
                      </span>
                    {/if}
                    
                    {#if entry.missing.length > 0 && !readonly}
                      <button
                        onclick={() => {
                          const sourceLang = entry.translations.en ? 'en' : Object.keys(entry.translations)[0];
                          if (sourceLang) {
                            entry.missing.forEach(lang => copyTranslation(entry.key, sourceLang, lang));
                          }
                        }}
                        title="Copy to missing languages"
                        class="text-gray-400 hover:text-gray-600"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
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
    font-family: system-ui, -apple-system, sans-serif;
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
  :global([dir="rtl"]) .translation-manager {
    text-align: right;
  }
  
  :global([dir="rtl"]) .translation-manager table {
    direction: ltr; /* Keep table structure LTR for better readability */
  }
  
  /* Indeterminate checkbox styling */
  input[type="checkbox"]:indeterminate {
    background-color: #3b82f6;
    border-color: #3b82f6;
  }
  
  input[type="checkbox"]:indeterminate::before {
    content: '';
    display: block;
    width: 8px;
    height: 2px;
    background: white;
    margin: 3px auto;
  }
</style>