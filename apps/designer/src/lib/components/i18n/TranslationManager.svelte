<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    supportedLanguages, 
    resources,
    getCurrentLanguage 
  } from '$lib/i18n/config';
  import { useTranslation } from '$lib/i18n/hooks';
  import { 
    Search, 
    Filter, 
    Download, 
    Upload, 
    Save,
    AlertCircle,
    Check,
    X,
    Edit2,
    Copy,
    Trash2
  } from 'lucide-svelte';
  
  interface TranslationEntry {
    key: string;
    namespace: string;
    translations: Record<string, string>;
    missing: string[];
    modified: boolean;
  }
  
  const { t } = useTranslation();
  
  let searchQuery = $state('');
  let selectedNamespace = $state('all');
  let selectedLanguage = $state('all');
  let showMissingOnly = $state(false);
  let showModifiedOnly = $state(false);
  let entries = $state<TranslationEntry[]>([]);
  let filteredEntries = $state<TranslationEntry[]>([]);
  let editingKey = $state<string | null>(null);
  let editingValue = $state('');
  let isLoading = $state(true);
  let isSaving = $state(false);
  let saveStatus = $state<'idle' | 'saving' | 'success' | 'error'>('idle');
  
  const namespaces = ['common', 'questions', 'analytics', 'auth', 'errors', 'validation'];
  
  // Load all translations
  onMount(() => {
    loadTranslations();
  });
  
  function loadTranslations() {
    isLoading = true;
    const allEntries: TranslationEntry[] = [];
    
    // Extract all translation keys
    for (const namespace of namespaces) {
      const enTranslations = resources.en[namespace] || {};
      const keys = extractKeys(enTranslations, namespace);
      
      for (const key of keys) {
        const translations: Record<string, string> = {};
        const missing: string[] = [];
        
        // Check each language
        for (const lang of supportedLanguages) {
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
          modified: false
        });
      }
    }
    
    entries = allEntries;
    filterEntries();
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
  
  // Filter entries based on search and filters
  function filterEntries() {
    let filtered = entries;
    
    // Filter by namespace
    if (selectedNamespace !== 'all') {
      filtered = filtered.filter(entry => entry.namespace === selectedNamespace);
    }
    
    // Filter by language
    if (selectedLanguage !== 'all') {
      filtered = filtered.filter(entry => 
        entry.missing.includes(selectedLanguage) || 
        entry.translations[selectedLanguage]
      );
    }
    
    // Filter by missing translations
    if (showMissingOnly) {
      filtered = filtered.filter(entry => entry.missing.length > 0);
    }
    
    // Filter by modified
    if (showModifiedOnly) {
      filtered = filtered.filter(entry => entry.modified);
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.key.toLowerCase().includes(query) ||
        Object.values(entry.translations).some(trans => 
          trans.toLowerCase().includes(query)
        )
      );
    }
    
    filteredEntries = filtered;
  }
  
  // Start editing a translation
  function startEdit(key: string, lang: string) {
    const entry = entries.find(e => e.key === key);
    if (entry) {
      editingKey = `${key}:${lang}`;
      editingValue = entry.translations[lang] || '';
    }
  }
  
  // Save edited translation
  function saveEdit(key: string, lang: string) {
    const entry = entries.find(e => e.key === key);
    if (entry) {
      entry.translations[lang] = editingValue;
      entry.modified = true;
      
      // Remove from missing if it was there
      const missingIndex = entry.missing.indexOf(lang);
      if (missingIndex > -1) {
        entry.missing.splice(missingIndex, 1);
      }
      
      editingKey = null;
      editingValue = '';
      filterEntries();
    }
  }
  
  // Cancel editing
  function cancelEdit() {
    editingKey = null;
    editingValue = '';
  }
  
  // Copy translation from another language
  function copyTranslation(key: string, fromLang: string, toLang: string) {
    const entry = entries.find(e => e.key === key);
    if (entry && entry.translations[fromLang]) {
      entry.translations[toLang] = entry.translations[fromLang];
      entry.modified = true;
      
      // Remove from missing
      const missingIndex = entry.missing.indexOf(toLang);
      if (missingIndex > -1) {
        entry.missing.splice(missingIndex, 1);
      }
      
      filterEntries();
    }
  }
  
  // Export translations
  async function exportTranslations() {
    const exportData: Record<string, any> = {};
    
    // Group by language and namespace
    for (const entry of entries) {
      for (const [lang, translation] of Object.entries(entry.translations)) {
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
      }
    }
    
    // Create download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'translations.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Import translations
  async function importTranslations(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // Update entries with imported data
      for (const [lang, namespaces] of Object.entries(importData)) {
        for (const [namespace, translations] of Object.entries(namespaces as any)) {
          updateEntriesFromImport(lang, namespace, translations);
        }
      }
      
      filterEntries();
    } catch (error) {
      console.error('Import failed:', error);
    }
  }
  
  function updateEntriesFromImport(lang: string, namespace: string, translations: any, prefix: string = '') {
    for (const [key, value] of Object.entries(translations)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        updateEntriesFromImport(lang, namespace, value, fullKey);
      } else {
        const entryKey = `${namespace}.${fullKey}`;
        const entry = entries.find(e => e.key === entryKey);
        
        if (entry) {
          entry.translations[lang] = value as string;
          entry.modified = true;
          
          // Remove from missing
          const missingIndex = entry.missing.indexOf(lang);
          if (missingIndex > -1) {
            entry.missing.splice(missingIndex, 1);
          }
        }
      }
    }
  }
  
  // Save all changes
  async function saveAllChanges() {
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
  $: searchQuery, selectedNamespace, selectedLanguage, showMissingOnly, showModifiedOnly, filterEntries();
  
  // Count modified entries
  $: modifiedCount = entries.filter(e => e.modified).length;
  $: missingCount = entries.reduce((sum, e) => sum + e.missing.length, 0);
</script>

<div class="translation-manager p-6">
  <div class="mb-6">
    <h2 class="text-2xl font-bold mb-2">{t('Translation Manager')}</h2>
    <p class="text-gray-600">
      {t('Manage translations for all supported languages')}
    </p>
  </div>
  
  <!-- Toolbar -->
  <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
    <div class="flex flex-wrap gap-4 items-center">
      <!-- Search -->
      <div class="flex-1 min-w-64">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder={t('Search translations...')}
            class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>
      
      <!-- Filters -->
      <select
        bind:value={selectedNamespace}
        class="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="all">{t('All Namespaces')}</option>
        {#each namespaces as namespace}
          <option value={namespace}>{namespace}</option>
        {/each}
      </select>
      
      <select
        bind:value={selectedLanguage}
        class="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="all">{t('All Languages')}</option>
        {#each supportedLanguages as lang}
          <option value={lang.code}>{lang.name}</option>
        {/each}
      </select>
      
      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showMissingOnly}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span class="ml-2 text-sm">{t('Missing only')}</span>
      </label>
      
      <label class="flex items-center">
        <input
          type="checkbox"
          bind:checked={showModifiedOnly}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span class="ml-2 text-sm">{t('Modified only')}</span>
      </label>
      
      <!-- Actions -->
      <div class="flex gap-2 ml-auto">
        <button
          onclick={exportTranslations}
          class="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <Download class="w-4 h-4" />
          {t('Export')}
        </button>
        
        <label class="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer">
          <Upload class="w-4 h-4" />
          {t('Import')}
          <input
            type="file"
            accept=".json"
            onchange={importTranslations}
            class="hidden"
          />
        </label>
        
        <button
          onclick={saveAllChanges}
          disabled={modifiedCount === 0 || isSaving}
          class="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save class="w-4 h-4" />
          {t('Save Changes')} {modifiedCount > 0 ? `(${modifiedCount})` : ''}
        </button>
      </div>
    </div>
    
    <!-- Status -->
    <div class="flex items-center gap-4 mt-4 text-sm">
      <span class="text-gray-600">
        {t('Total')}: {filteredEntries.length} / {entries.length}
      </span>
      {#if missingCount > 0}
        <span class="text-orange-600 flex items-center gap-1">
          <AlertCircle class="w-4 h-4" />
          {missingCount} {t('missing translations')}
        </span>
      {/if}
      {#if modifiedCount > 0}
        <span class="text-blue-600">
          {modifiedCount} {t('unsaved changes')}
        </span>
      {/if}
      {#if saveStatus === 'saving'}
        <span class="text-gray-600">{t('Saving...')}</span>
      {:else if saveStatus === 'success'}
        <span class="text-green-600 flex items-center gap-1">
          <Check class="w-4 h-4" />
          {t('Saved successfully')}
        </span>
      {:else if saveStatus === 'error'}
        <span class="text-red-600 flex items-center gap-1">
          <X class="w-4 h-4" />
          {t('Save failed')}
        </span>
      {/if}
    </div>
  </div>
  
  <!-- Translation table -->
  <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
    {#if isLoading}
      <div class="p-8 text-center text-gray-500">
        {t('Loading translations...')}
      </div>
    {:else if filteredEntries.length === 0}
      <div class="p-8 text-center text-gray-500">
        {t('No translations found')}
      </div>
    {:else}
      <table class="w-full">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('Key')}
            </th>
            {#each supportedLanguages as lang}
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {lang.code}
              </th>
            {/each}
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              {t('Actions')}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          {#each filteredEntries as entry}
            <tr class:bg-blue-50={entry.modified}>
              <td class="px-4 py-3 text-sm font-mono text-gray-900">
                {entry.key}
              </td>
              {#each supportedLanguages as lang}
                <td class="px-4 py-3 text-sm">
                  {#if editingKey === `${entry.key}:${lang.code}`}
                    <div class="flex items-center gap-2">
                      <input
                        type="text"
                        bind:value={editingValue}
                        class="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        onkeydown={(e) => {
                          if (e.key === 'Enter') saveEdit(entry.key, lang.code);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <button
                        onclick={() => saveEdit(entry.key, lang.code)}
                        class="text-green-600 hover:text-green-700"
                      >
                        <Check class="w-4 h-4" />
                      </button>
                      <button
                        onclick={cancelEdit}
                        class="text-red-600 hover:text-red-700"
                      >
                        <X class="w-4 h-4" />
                      </button>
                    </div>
                  {:else}
                    <div class="flex items-center justify-between group">
                      <span class:text-gray-400={!entry.translations[lang.code]}>
                        {entry.translations[lang.code] || t('Missing')}
                      </span>
                      <button
                        onclick={() => startEdit(entry.key, lang.code)}
                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                      >
                        <Edit2 class="w-3 h-3" />
                      </button>
                    </div>
                  {/if}
                </td>
              {/each}
              <td class="px-4 py-3 text-sm text-right">
                <div class="flex items-center justify-end gap-2">
                  {#if entry.missing.length > 0}
                    <button
                      onclick={() => {
                        const sourceLang = entry.translations.en ? 'en' : Object.keys(entry.translations)[0];
                        if (sourceLang) {
                          entry.missing.forEach(lang => copyTranslation(entry.key, sourceLang, lang));
                        }
                      }}
                      title={t('Copy to missing languages')}
                      class="text-gray-400 hover:text-gray-600"
                    >
                      <Copy class="w-4 h-4" />
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .translation-manager {
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }
  
  /* Sticky header */
  thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }
</style>