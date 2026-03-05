<script lang="ts">
  import { Search, Play, CheckCircle, BookOpen, Keyboard, Lightbulb } from 'lucide-svelte';
  import { helpStore } from '../stores/helpStore.svelte';
  import { tourEngine } from '../tours/TourEngine.svelte';
  import type { TourDefinition } from '../tours/types';
  import type { HelpEntry } from '../content/types';

  type HelpTab = 'tours' | 'reference' | 'tips';
  let activeTab = $state<HelpTab>('tours');
  let searchQuery = $state('');

  // Tour definitions — imported lazily to avoid circular deps.
  // Other agents are creating these files; we define the expected shape and
  // dynamically import so the panel still renders if they're not yet present.
  interface TourInfo {
    id: string;
    name: string;
    description: string;
    definition: TourDefinition;
  }

  let tours = $state<TourInfo[]>([]);

  // Attempt to load tour definitions. They may not exist yet.
  async function loadTours() {
    const modules = import.meta.glob<{ default?: TourDefinition } & Record<string, TourDefinition>>(
      '../tours/definitions/*.ts'
    );

    const loaded: TourInfo[] = [];
    for (const [path, loader] of Object.entries(modules)) {
      try {
        const mod = await loader();
        // Each file exports a single TourDefinition (named or default)
        const def: TourDefinition | undefined =
          mod.default ?? Object.values(mod).find((v): v is TourDefinition => typeof v === 'object' && v !== null && 'id' in v && 'steps' in v);
        if (def) {
          loaded.push({ id: def.id, name: def.name, description: def.description, definition: def });
        }
      } catch {
        // Module not ready yet — skip
      }
    }
    tours = loaded;
  }

  // Contextual tips based on currently selected designer context
  let tips = $state<HelpEntry[]>([]);

  async function loadTips() {
    try {
      const modules = import.meta.glob<Record<string, HelpEntry[]>>(
        '../content/*.ts'
      );
      const allEntries: HelpEntry[] = [];
      for (const [, loader] of Object.entries(modules)) {
        try {
          const mod = await loader();
          for (const exported of Object.values(mod)) {
            if (Array.isArray(exported)) {
              allEntries.push(...exported);
            }
          }
        } catch {
          // Content not ready
        }
      }
      tips = allEntries;
    } catch {
      // Glob failed
    }
  }

  // Load on mount
  $effect(() => {
    void loadTours();
    void loadTips();
  });

  const filteredTours = $derived(
    searchQuery
      ? tours.filter(
          (t) =>
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : tours
  );

  const filteredTips = $derived(
    searchQuery
      ? tips.filter(
          (t) =>
            t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.tags ?? []).some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : tips
  );

  let showFormulaRef = $state(false);
  let showShortcuts = $state(false);

  function startTour(tour: TourInfo) {
    tourEngine.start(tour.definition);
  }
</script>

{#if showFormulaRef}
  {#await import('./FormulaReferenceSheet.svelte') then FormulaRef}
    <FormulaRef.default onclose={() => (showFormulaRef = false)} />
  {/await}
{/if}

{#if showShortcuts}
  {#await import('./KeyboardShortcutDialog.svelte') then Shortcuts}
    <Shortcuts.default open={showShortcuts} onclose={() => (showShortcuts = false)} />
  {/await}
{/if}

<div class="flex h-full flex-col" data-testid="help-panel">
  <!-- Search -->
  <div class="px-3 pt-3 pb-2">
    <div class="relative">
      <Search class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search help..."
        class="w-full rounded-md border border-border bg-[hsl(var(--layer-surface))] py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        bind:value={searchQuery}
        data-testid="help-search"
      />
    </div>
  </div>

  <!-- Tabs -->
  <div class="flex border-b border-border px-1">
    {#each [
      { id: 'tours' as HelpTab, label: 'Tours' },
      { id: 'reference' as HelpTab, label: 'Reference' },
      { id: 'tips' as HelpTab, label: 'Tips' }
    ] as tab (tab.id)}
      <button
        type="button"
        class="flex-1 px-2 py-2 text-xs font-medium transition-colors duration-150 {activeTab === tab.id
          ? 'border-b-2 border-primary text-primary'
          : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => (activeTab = tab.id)}
        data-testid={`help-tab-${tab.id}`}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Content -->
  <div class="min-h-0 flex-1 overflow-auto">
    {#if activeTab === 'tours'}
      <div class="flex flex-col gap-1 p-2">
        {#if filteredTours.length === 0}
          <p class="px-2 py-4 text-center text-xs text-muted-foreground">
            {searchQuery ? 'No tours match your search.' : 'No tours available yet.'}
          </p>
        {/if}
        {#each filteredTours as tour (tour.id)}
          {@const completed = helpStore.hasTourCompleted(tour.id)}
          <div
            class="rounded-lg border border-border bg-[hsl(var(--layer-surface))] p-3 transition-colors hover:bg-muted/50"
            data-testid={`tour-item-${tour.id}`}
          >
            <div class="flex items-start gap-2">
              <div class="mt-0.5 flex-shrink-0">
                {#if completed}
                  <CheckCircle class="h-4 w-4 text-green-500" />
                {:else}
                  <Play class="h-4 w-4 text-muted-foreground" />
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <h3 class="text-sm font-medium text-foreground">{tour.name}</h3>
                  {#if completed}
                    <span class="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                      Completed
                    </span>
                  {/if}
                </div>
                <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {tour.description}
                </p>
                <button
                  type="button"
                  class="mt-2 rounded-md px-2.5 py-1 text-xs font-medium transition-colors {completed
                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'}"
                  onclick={() => startTour(tour)}
                  data-testid={`tour-start-${tour.id}`}
                >
                  {completed ? 'Replay Tour' : 'Start Tour'}
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>

    {:else if activeTab === 'reference'}
      <div class="flex flex-col gap-1 p-2">
        <button
          type="button"
          class="flex items-center gap-3 rounded-lg border border-border bg-[hsl(var(--layer-surface))] p-3 text-left transition-colors hover:bg-muted/50"
          onclick={() => (showFormulaRef = true)}
          data-testid="help-formula-ref"
        >
          <BookOpen class="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <div>
            <h3 class="text-sm font-medium text-foreground">Formula Reference</h3>
            <p class="mt-0.5 text-xs text-muted-foreground">
              50+ functions for math, statistics, text, arrays, and more
            </p>
          </div>
        </button>

        <button
          type="button"
          class="flex items-center gap-3 rounded-lg border border-border bg-[hsl(var(--layer-surface))] p-3 text-left transition-colors hover:bg-muted/50"
          onclick={() => (showShortcuts = true)}
          data-testid="help-keyboard-shortcuts"
        >
          <Keyboard class="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <div>
            <h3 class="text-sm font-medium text-foreground">Keyboard Shortcuts</h3>
            <p class="mt-0.5 text-xs text-muted-foreground">
              All keyboard shortcuts for the designer
            </p>
          </div>
        </button>
      </div>

    {:else if activeTab === 'tips'}
      <div class="flex flex-col gap-1 p-2">
        {#if filteredTips.length === 0}
          <p class="px-2 py-4 text-center text-xs text-muted-foreground">
            {searchQuery ? 'No tips match your search.' : 'No contextual tips available.'}
          </p>
        {/if}
        {#each filteredTips as tip (tip.key)}
          <details
            class="group rounded-lg border border-border bg-[hsl(var(--layer-surface))] transition-colors hover:bg-muted/50"
            data-testid={`tip-${tip.key}`}
          >
            <summary class="flex cursor-pointer items-start gap-2 p-3 [&::-webkit-details-marker]:hidden">
              <Lightbulb class="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-medium text-foreground">{tip.title}</h3>
                <span class="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {tip.category}
                </span>
              </div>
            </summary>
            <div class="px-3 pb-3 pl-9 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
              {tip.description}
            </div>
          </details>
        {/each}
      </div>
    {/if}
  </div>
</div>
