<script lang="ts">
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import type {
    Variable,
    VariableType,
    ServerComputationDef,
    ServerStat,
    DatasetFilter,
  } from '$lib/shared';
  import { MAX_SERVER_VARIABLES } from '@qdesigner/questionnaire-core';
  import FormulaEditor from './FormulaEditor.svelte';
  import Dialog from '$lib/components/ui/overlays/Dialog.svelte';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { onMount } from 'svelte';
  import { Hash, Type, ToggleLeft, Calendar, Clock, List, Box, Zap, Target, HelpCircle, Pencil, Trash2, Network, Plus } from 'lucide-svelte';
  import HelpTip from '$lib/help/components/HelpTip.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  let showAddVariable = $state(false);
  let editingVariable = $state<Variable | null>(null);
  const showVariableDialog = $derived(showAddVariable || editingVariable !== null);

  let variables = $derived(designerStore.questionnaire.variables);
  let selectedVariableId = $derived(
    designerStore.selectedItemType === 'variable' && designerStore.selectedItem
      ? designerStore.selectedItem.id
      : null
  );

  let newVariable = $state<Partial<Variable> & { type: VariableType }>({
    name: '',
    type: 'number',
    scope: 'global',
    description: '',
  });

  let showAdvancedEditor = $state(false);
  let showDependencyGraph = $state(false);
  let dependencyCanvas = $state<HTMLCanvasElement>();

  // Server-computed variable authoring (server-computed-variable / E-FEEDBACK-3).
  // A single "computation mode" fork drives whether the variable is static, a
  // formula, or a SERVER-computed aggregate. Server mode reveals a source/key
  // picker, a materialization toggle (single stat ⇒ number, full stats ⇒ object),
  // and a dataset filter builder.
  type ComputationMode = 'static' | 'formula' | 'server';
  let computationMode = $state<ComputationMode>('static');

  // The active edit target (edit dialog vs. add dialog share one shape).
  const draft = $derived<Partial<Variable> & { type: VariableType }>(
    (editingVariable ?? newVariable) as Partial<Variable> & { type: VariableType }
  );

  const serverStats: { value: ServerStat; label: string }[] = [
    { value: 'n', label: 'Count (n)' },
    { value: 'mean', label: 'Mean' },
    { value: 'sd', label: 'Std deviation' },
    { value: 'min', label: 'Minimum' },
    { value: 'max', label: 'Maximum' },
    { value: 'p10', label: '10th percentile' },
    { value: 'p25', label: '25th percentile' },
    { value: 'median', label: 'Median (p50)' },
    { value: 'p75', label: '75th percentile' },
    { value: 'p90', label: '90th percentile' },
    { value: 'p95', label: '95th percentile' },
    { value: 'p99', label: '99th percentile' },
  ];

  const whereOps: { value: NonNullable<DatasetFilter['where']>[number]['op']; label: string }[] = [
    { value: 'eq', label: '= (equals)' },
    { value: 'ne', label: '≠ (not equals)' },
    { value: 'lt', label: '< (less than)' },
    { value: 'lte', label: '≤ (at most)' },
    { value: 'gt', label: '> (greater than)' },
    { value: 'gte', label: '≥ (at least)' },
    { value: 'in', label: 'in (comma-separated list)' },
  ];

  // Session variables usable as a where-clause target (server variables can't be
  // filtered on — they are not persisted per-session).
  const sessionVariableOptions = $derived(
    (designerStore.questionnaire.variables || [])
      .filter((v) => !v.server)
      .map((v) => ({ value: v.name, label: v.name }))
  );

  // Key-picker options for source: 'response' (question ids) vs 'variable'
  // (declared variables + score.<scaleId>.<field> paths from settings.scoring).
  const questionKeyOptions = $derived(
    (designerStore.questionnaire.questions || []).map((q) => ({
      value: q.id,
      label: q.name ? `${q.name} (${q.id})` : q.id,
    }))
  );

  const scoreFieldSuffixes = ['value', 'tScore', 'percentile', 'z', 'stanine'];
  const variableKeyOptions = $derived.by(() => {
    const vars = (designerStore.questionnaire.variables || [])
      .filter((v) => !v.server)
      .map((v) => ({ value: v.name, label: v.name }));
    const scales = designerStore.questionnaire.settings?.scoring?.scales ?? [];
    const scoreOpts = scales.flatMap((s) =>
      scoreFieldSuffixes.map((f) => ({
        value: `score.${s.id}.${f}`,
        label: `${s.name || s.id} · ${f}`,
      }))
    );
    return [...vars, ...scoreOpts];
  });

  // How many server variables already exist (excluding the one being edited).
  const serverVariableCount = $derived(
    (designerStore.questionnaire.variables || []).filter(
      (v) => v.server && v.id !== editingVariable?.id
    ).length
  );

  const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  const serverValidationErrors = $derived.by((): string[] => {
    if (computationMode !== 'server') return [];
    const errors: string[] = [];
    const name = draft.name ?? '';
    if (!IDENTIFIER_RE.test(name)) {
      errors.push('Name must be a plain identifier (letters, digits, underscore; no leading digit).');
    }
    if (name.length > 50) {
      errors.push('Name must be 50 characters or fewer.');
    }
    if (serverVariableCount >= MAX_SERVER_VARIABLES) {
      errors.push(`At most ${MAX_SERVER_VARIABLES} server-computed variables per questionnaire.`);
    }
    const srv = draft.server;
    if (!srv?.key) {
      errors.push('Choose a source key to aggregate across participants.');
    }
    if (srv?.stat && draft.type !== 'number') {
      errors.push('A single-statistic server variable must be type Number.');
    }
    if (srv && !srv.stat && draft.type !== 'object') {
      errors.push('A full-statistics server variable must be type Object.');
    }
    if (draft.defaultValue === undefined || draft.defaultValue === '') {
      errors.push('A default value is required — participants offline (or below the anonymity floor) see it as the fallback.');
    }
    if (srv?.minN !== undefined && (!Number.isInteger(srv.minN) || srv.minN < 1)) {
      errors.push('Disclosure floor (minimum n) must be a whole number of at least 1.');
    }
    const known = new Set(sessionVariableOptions.map((o) => o.value));
    (srv?.dataset?.where ?? []).forEach((w, i) => {
      if (!w.var) errors.push(`Filter row ${i + 1}: choose a variable.`);
      else if (!known.has(w.var)) errors.push(`Filter row ${i + 1}: variable "${w.var}" is not a declared variable.`);
    });
    return errors;
  });

  function defaultServerDef(): ServerComputationDef {
    // ADR 0028: new declarations default to minN 1 (author-visible, not a hidden
    // platform floor) and hide below-floor.
    return { source: 'variable', key: '', stat: 'mean', minN: 1, belowFloor: 'hide' };
  }

  function setComputationMode(mode: ComputationMode): void {
    computationMode = mode;
    const d = editingVariable ?? newVariable;
    if (mode === 'server') {
      d.formula = undefined;
      if (!d.server) d.server = defaultServerDef();
      d.type = d.server.stat ? 'number' : 'object';
    } else {
      d.server = undefined;
      if (mode === 'static') d.formula = undefined;
    }
  }

  function updateServer(patch: Partial<ServerComputationDef>): void {
    const d = editingVariable ?? newVariable;
    const base: ServerComputationDef = d.server ?? defaultServerDef();
    d.server = { ...base, ...patch };
  }

  function setMaterialization(kind: 'single' | 'full'): void {
    const d = editingVariable ?? newVariable;
    const base: ServerComputationDef = d.server ?? defaultServerDef();
    if (kind === 'single') {
      d.server = { ...base, stat: base.stat ?? 'mean' };
      d.type = 'number';
    } else {
      const next = { ...base };
      delete next.stat;
      d.server = next;
      d.type = 'object';
    }
  }

  function updateDataset(patch: Partial<DatasetFilter>): void {
    const d = editingVariable ?? newVariable;
    const base: DatasetFilter = d.server?.dataset ?? { id: crypto.randomUUID() };
    updateServer({ dataset: { ...base, ...patch } });
  }

  function addWhereRow(): void {
    const d = editingVariable ?? newVariable;
    const ds: DatasetFilter = d.server?.dataset ?? { id: crypto.randomUUID() };
    const where = [...(ds.where ?? []), { var: '', op: 'eq' as const, value: '' }];
    updateDataset({ where });
  }

  function updateWhereRow(
    index: number,
    patch: Partial<NonNullable<DatasetFilter['where']>[number]>
  ): void {
    const d = editingVariable ?? newVariable;
    const where = (d.server?.dataset?.where ?? []).map((w, i) =>
      i === index ? { ...w, ...patch } : w
    );
    updateDataset({ where });
  }

  function removeWhereRow(index: number): void {
    const d = editingVariable ?? newVariable;
    const where = (d.server?.dataset?.where ?? []).filter((_, i) => i !== index);
    updateDataset({ where });
  }

  function setWhereValue(index: number, raw: string, op: string): void {
    const value: string | Array<string> =
      op === 'in' ? raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : raw;
    updateWhereRow(index, { value });
  }

  const variableTypes: { value: VariableType; label: string }[] = [
    { value: 'number', label: 'Number' },
    { value: 'string', label: 'Text' },
    { value: 'boolean', label: 'True/False' },
    { value: 'date', label: 'Date' },
    { value: 'time', label: 'Time' },
    { value: 'array', label: 'List' },
    { value: 'object', label: 'Object' },
    { value: 'reaction_time', label: 'Reaction Time' },
    { value: 'stimulus_onset', label: 'Stimulus Onset' },
  ];

  function openAddVariable() {
    showAddVariable = true;
    computationMode = newVariable.server ? 'server' : newVariable.formula ? 'formula' : 'static';
  }

  function handleAddVariable() {
    if (!newVariable.name) return;
    if (computationMode === 'server' && serverValidationErrors.length > 0) return;

    const defaultValue = parseDefaultValue(newVariable.defaultValue?.toString() || '', newVariable.type);

    designerStore.addVariable({
      id: crypto.randomUUID(),
      name: newVariable.name,
      type: newVariable.type,
      scope: newVariable.scope ?? 'global',
      defaultValue: defaultValue !== '' ? defaultValue : undefined,
      formula: computationMode === 'formula' ? newVariable.formula || undefined : undefined,
      server: computationMode === 'server' ? newVariable.server : undefined,
      description: newVariable.description || undefined,
    });

    // Reset form
    newVariable = {
      name: '',
      type: 'number',
      scope: 'global',
      defaultValue: '',
      formula: '',
      description: '',
    };
    computationMode = 'static';
    showAddVariable = false;
  }

  function handleEditVariable(variable: Variable) {
    editingVariable = { ...variable };
    computationMode = variable.server ? 'server' : variable.formula ? 'formula' : 'static';
  }

  function handleUpdateVariable() {
    if (!editingVariable) return;
    if (computationMode === 'server' && serverValidationErrors.length > 0) return;

    const defaultValue = parseDefaultValue(
      editingVariable.defaultValue?.toString() || '',
      editingVariable.type
    );

    designerStore.updateVariable(editingVariable.id, {
      name: editingVariable.name,
      type: editingVariable.type,
      defaultValue: defaultValue !== '' ? defaultValue : undefined,
      formula: computationMode === 'formula' ? editingVariable.formula || undefined : undefined,
      server: computationMode === 'server' ? editingVariable.server : undefined,
      description: editingVariable.description || undefined,
    });

    editingVariable = null;
    computationMode = 'static';
  }

  async function handleDeleteVariable(variableId: string) {
    if (
      await confirmDialog({
        title: 'Delete variable?',
        message: 'Delete this variable? This may break formulas that depend on it.',
        confirmLabel: 'Delete',
        destructive: true,
      })
    ) {
      designerStore.deleteVariable(variableId);
    }
  }

  function parseDefaultValue(value: string, type: VariableType): any {
    if (!value) return '';

    switch (type) {
      case 'number':
      case 'reaction_time':
      case 'stimulus_onset':
        return parseFloat(value) || 0;
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'array':
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      case 'date':
      case 'time':
        return new Date(value);
      default:
        return value;
    }
  }

  function formatValue(value: any, type: VariableType): string {
    if (value === null || value === undefined) return '';

    switch (type) {
      case 'array':
      case 'object':
        return JSON.stringify(value);
      case 'date':
        return value instanceof Date ? value.toLocaleDateString() : value;
      case 'time':
        return value instanceof Date ? value.toLocaleTimeString() : value;
      default:
        return value.toString();
    }
  }

  const variableTypeIcons: Record<VariableType, string> = {
    number: 'hash',
    string: 'type',
    boolean: 'toggle',
    date: 'calendar',
    time: 'clock',
    array: 'list',
    object: 'box',
    reaction_time: 'zap',
    stimulus_onset: 'target',
  };

  // Calculate variable dependencies
  function calculateDependencies(): Map<string, Set<string>> {
    const deps = new Map<string, Set<string>>();

    variables.forEach((variable) => {
      if (variable.formula) {
        const dependencies = new Set<string>();
        // Simple regex to find variable references
        const variableRefs = variable.formula.match(/\b[a-zA-Z_]\w*\b/g) || [];

        variableRefs.forEach((ref) => {
          // Check if it's actually a variable name
          if (variables.some((v) => v.name === ref)) {
            dependencies.add(ref);
          }
        });

        deps.set(variable.name, dependencies);
      }
    });

    return deps;
  }

  // Draw dependency graph
  function drawDependencyGraph() {
    if (!dependencyCanvas) return;

    const ctx = dependencyCanvas.getContext('2d');
    if (!ctx) return;

    const width = dependencyCanvas.width;
    const height = dependencyCanvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate positions for nodes
    const nodePositions = new Map<string, { x: number; y: number }>();
    const dependencies = calculateDependencies();

    // Simple circular layout
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    variables.forEach((variable, index) => {
      const angle = (index / variables.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      nodePositions.set(variable.name, { x, y });
    });

    // Theme-aware canvas colors
    const isDark = document.documentElement.classList.contains('dark');
    const borderColor = isDark ? '#475569' : '#cbd5e1';
    const nodeActiveBg = isDark ? '#1e3a5f' : '#dbeafe';
    const nodeActiveBorder = '#3b82f6';
    const nodeDefaultBg = isDark ? '#374151' : '#f3f4f6';
    const nodeDefaultBorder = isDark ? '#6b7280' : '#9ca3af';
    const textColor = isDark ? '#e5e7eb' : '#374151';

    // Draw edges (dependencies)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;

    dependencies.forEach((deps, varName) => {
      const fromPos = nodePositions.get(varName);
      if (!fromPos) return;

      deps.forEach((depName) => {
        const toPos = nodePositions.get(depName);
        if (!toPos) return;

        // Draw arrow
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);

        // Calculate arrow position (stop before node)
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const nodeRadius = 30;

        const endX = fromPos.x + (dx / distance) * (distance - nodeRadius);
        const endY = fromPos.y + (dy / distance) * (distance - nodeRadius);

        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw arrowhead
        const arrowSize = 8;
        const angle = Math.atan2(dy, dx);

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowSize * Math.cos(angle - Math.PI / 6),
          endY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowSize * Math.cos(angle + Math.PI / 6),
          endY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      });
    });

    // Draw nodes
    variables.forEach((variable) => {
      const pos = nodePositions.get(variable.name);
      if (!pos) return;

      // Node background
      ctx.fillStyle = selectedVariableId === variable.id ? nodeActiveBg : nodeDefaultBg;
      ctx.strokeStyle = selectedVariableId === variable.id ? nodeActiveBorder : nodeDefaultBorder;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Variable icon
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const canvasIcons: Record<string, string> = {
        number: '#', string: 'T', boolean: '?', date: 'D', time: 'C',
        array: '[]', object: '{}', reaction_time: 'Z', stimulus_onset: 'O',
      };
      ctx.fillStyle = textColor;
      ctx.fillText(canvasIcons[variable.type] || '?', pos.x, pos.y - 5);

      // Variable name
      ctx.font = '12px sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(variable.name, pos.x, pos.y + 35);
    });
  }

  onMount(() => {
    if (showDependencyGraph && dependencyCanvas) {
      drawDependencyGraph();
    }
  });

  $effect(() => {
    if (showDependencyGraph && dependencyCanvas && variables.length > 0) {
      drawDependencyGraph();
    }
  });
</script>

<div class="bg-card rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-border">
  <div class="p-4 border-b border-border">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground flex items-center gap-1">Variables <HelpTip helpKey="variables.overview" /></h3>
      <div class="flex items-center space-x-2">
        <button
          onclick={() => (showDependencyGraph = !showDependencyGraph)}
          class="px-3 py-1 text-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors text-sm flex items-center space-x-1"
          title={showDependencyGraph ? 'Hide dependency graph' : 'Show dependency graph'}
        >
          <Network class="w-4 h-4" />
          <span>{showDependencyGraph ? 'Hide' : 'Show'} Graph</span>
        </button>
        <button
          onclick={openAddVariable}
          class="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
        >
          Add Variable
        </button>
      </div>
    </div>
  </div>

  {#if showDependencyGraph && variables.length > 0}
    <div class="p-4 bg-muted/50 border-b border-border">
      <h4 class="text-sm font-medium text-foreground mb-2">Variable Dependencies</h4>
      <div class="bg-card rounded-lg border border-border p-4">
        <canvas
          bind:this={dependencyCanvas}
          width="400"
          height="300"
          class="w-full"
          style="max-width: 400px; margin: 0 auto; display: block;"
        ></canvas>
      </div>
      <p class="text-xs text-muted-foreground mt-2 text-center">
        Arrows show which variables depend on others
      </p>
    </div>
  {/if}

  <div class="p-4">
    {#if variables.length > 0}
      <div class="space-y-2">
        {#each variables as variable (variable.id)}
          <div
            role="button"
            tabindex="0"
            onclick={() => designerStore.selectItem(variable.id, 'variable')}
            onkeydown={(e) =>
              (e.key === 'Enter' || e.key === ' ') &&
              designerStore.selectItem(variable.id, 'variable')}
            class="p-3 border rounded-lg cursor-pointer transition-all
                   {selectedVariableId === variable.id
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-border/80'}"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-start space-x-2 flex-1">
                <span class="mt-0.5 text-muted-foreground">
                  {#if variable.type === 'number'}<Hash class="w-4 h-4" />
                  {:else if variable.type === 'reaction_time'}<Zap class="w-4 h-4" />
                  {:else if variable.type === 'stimulus_onset'}<Target class="w-4 h-4" />
                  {:else if variable.type === 'string'}<Type class="w-4 h-4" />
                  {:else if variable.type === 'boolean'}<ToggleLeft class="w-4 h-4" />
                  {:else if variable.type === 'date'}<Calendar class="w-4 h-4" />
                  {:else if variable.type === 'time'}<Clock class="w-4 h-4" />
                  {:else if variable.type === 'array'}<List class="w-4 h-4" />
                  {:else if variable.type === 'object'}<Box class="w-4 h-4" />
                  {:else}<HelpCircle class="w-4 h-4" />
                  {/if}
                </span>

                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <h4 class="font-medium text-foreground">{variable.name}</h4>
                    <span class="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                      {variable.type}
                    </span>
                    {#if variable.formula}
                      <span class="text-xs px-2 py-0.5 bg-violet-500/10 rounded text-violet-600 dark:text-violet-400">
                        formula
                      </span>
                    {/if}
                    {#if variable.server}
                      <span class="text-xs px-2 py-0.5 bg-sky-500/10 rounded text-sky-600 dark:text-sky-400">
                        server
                      </span>
                    {/if}
                  </div>

                  {#if variable.description}
                    <p class="text-sm text-muted-foreground mt-1">{variable.description}</p>
                  {/if}

                  {#if variable.formula}
                    <p class="text-xs font-mono bg-muted rounded px-2 py-1 mt-2">
                      = {variable.formula}
                    </p>
                  {:else if variable.defaultValue !== undefined}
                    <p class="text-sm text-muted-foreground mt-1">
                      Default: {formatValue(variable.defaultValue, variable.type)}
                    </p>
                  {/if}
                </div>
              </div>

              <div class="flex items-center space-x-1 ml-2">
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    handleEditVariable(variable);
                  }}
                  class="p-1 hover:bg-accent rounded"
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil class="w-4 h-4 text-muted-foreground" />
                </button>

                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    handleDeleteVariable(variable.id);
                  }}
                  class="p-1 hover:bg-destructive/10 rounded"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 class="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground text-center py-8">
        No variables defined. Add variables to store values and create formulas.
      </p>
    {/if}
  </div>

  <div class="p-4 border-t border-border bg-muted/50">
    <h4 class="text-sm font-medium text-foreground mb-2">Available Functions</h4>
    <div class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <div>• IF(condition, true, false)</div>
      <div>• SUM(array)</div>
      <div>• AVG(array)</div>
      <div>• COUNT(array)</div>
      <div>• CONCAT(str1, str2, ...)</div>
      <div>• NOW()</div>
      <div>• RANDOM()</div>
      <div>• Math: sqrt, pow, min, max</div>
    </div>
  </div>
</div>

<!-- Add/Edit Variable Modal -->
<Dialog
  open={showVariableDialog}
  title={editingVariable ? 'Edit Variable' : 'Add Variable'}
  size="md"
  onclose={() => { showAddVariable = false; editingVariable = null; computationMode = 'static'; }}
>
  <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-name">Name</label>
          <input
            id="var-name"
            type="text"
            value={editingVariable ? editingVariable.name : newVariable.name}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.name = value;
              } else {
                newVariable.name = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder="e.g., score, reactionTime"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-mode">Computation</label>
          <Select
            id="var-mode"
            value={computationMode}
            onchange={(e) => setComputationMode(e.currentTarget.value as ComputationMode)}
            placeholder=""
          >
            <option value="static">Static (default value)</option>
            <option value="formula">Formula (computed locally)</option>
            <option value="server">Server-computed (aggregate across participants)</option>
          </Select>
          {#if computationMode === 'server'}
            <p class="text-xs text-muted-foreground mt-1">
              Computed on the server from every completed session. Participants see the value as of
              their last online load; offline it falls back to the default value below.
            </p>
          {/if}
        </div>

        {#if computationMode !== 'server'}
          <div>
            <label class="text-sm font-medium text-foreground mb-1 flex items-center gap-1" for="var-type">Type <HelpTip helpKey="variables.types.number" /></label>
            <Select
              id="var-type"
              value={editingVariable ? editingVariable.type : newVariable.type}
              onchange={(e) => {
                const value = e.currentTarget.value as VariableType;
                if (editingVariable) {
                  editingVariable.type = value;
                } else {
                  newVariable.type = value;
                }
              }}
              placeholder=""
            >
              {#each variableTypes as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </Select>
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-default">
            {#if computationMode === 'server'}
              Default Value <span class="text-destructive">*</span>
              <span class="font-normal text-muted-foreground">— offline / insufficient-data fallback</span>
            {:else}
              Default Value (optional)
            {/if}
          </label>
          <input
            id="var-default"
            type="text"
            value={editingVariable
              ? formatValue(editingVariable.defaultValue, editingVariable.type)
              : newVariable.defaultValue}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.defaultValue = parseDefaultValue(value, editingVariable.type);
              } else {
                newVariable.defaultValue = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder={computationMode === 'server'
              ? 'Shown when never synced / below anonymity floor'
              : 'Leave empty for no default'}
          />
        </div>

        {#if computationMode !== 'server'}
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm font-medium text-foreground flex items-center gap-1" for="var-formula"
              >Formula (optional) <HelpTip helpKey="variables.formula.description" /></label
            >
            <button
              type="button"
              onclick={() => (showAdvancedEditor = !showAdvancedEditor)}
              class="text-xs text-primary hover:text-primary/80"
            >
              {showAdvancedEditor ? 'Simple Editor' : 'Advanced Editor'}
            </button>
          </div>

          {#if showAdvancedEditor}
            <FormulaEditor
              value={editingVariable ? editingVariable.formula || '' : newVariable.formula}
              onchange={(value) => {
                if (editingVariable) {
                  editingVariable.formula = value;
                } else {
                  newVariable.formula = value;
                }
              }}
              height="150px"
              variables={Object.fromEntries(variables.map((v) => [v.name, v.type]))}
              placeholder="e.g., age * 10 + reactionTime"
            />
          {:else}
            <textarea
              value={editingVariable ? editingVariable.formula : newVariable.formula}
              oninput={(e) => {
                const value = e.currentTarget.value;
                if (editingVariable) {
                  editingVariable.formula = value;
                } else {
                  newVariable.formula = value;
                }
              }}
              id="var-formula"
              rows="3"
              class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground font-mono text-sm"
              placeholder="e.g., age * 10 + reactionTime"
            ></textarea>
          {/if}

          <p class="text-xs text-muted-foreground mt-1">Use other variable names directly in formulas</p>
        </div>
        {/if}

        {#if computationMode === 'server'}
          <div class="space-y-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3" data-testid="server-variable-editor">
            <!-- Source + key -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-foreground mb-1" for="srv-source">Aggregate over</label>
                <Select
                  id="srv-source"
                  value={draft.server?.source ?? 'variable'}
                  onchange={(e) => updateServer({ source: e.currentTarget.value as 'variable' | 'response' | 'trials', key: '' })}
                  placeholder=""
                >
                  <option value="variable">Session variable / score</option>
                  <option value="response">Question response</option>
                  <option value="trials">Reaction trials (RT)</option>
                </Select>
              </div>
              <div>
                <label class="block text-xs font-medium text-foreground mb-1" for="srv-key">
                  {draft.server?.source === 'trials' ? 'Reaction question' : 'Source key'}
                </label>
                <Select
                  id="srv-key"
                  value={draft.server?.key ?? ''}
                  onchange={(e) => updateServer({ key: e.currentTarget.value })}
                  placeholder=""
                >
                  <option value="">Select…</option>
                  {#each (draft.server?.source === 'variable' ? variableKeyOptions : questionKeyOptions) as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </Select>
                {#if draft.server?.source !== 'trials'}
                  <input
                    type="text"
                    value={draft.server?.key ?? ''}
                    oninput={(e) => updateServer({ key: e.currentTarget.value })}
                    class="mt-1 w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground font-mono"
                    placeholder="or type a key (e.g. score.anxiety.value)"
                  />
                {/if}
              </div>
            </div>

            {#if draft.server?.source === 'trials'}
              <!-- Trial aggregation options -->
              <div class="grid grid-cols-2 gap-3" data-testid="srv-trials-options">
                <div>
                  <label class="block text-xs font-medium text-foreground mb-1" for="srv-metric">Trial metric</label>
                  <Select
                    id="srv-metric"
                    value={draft.server?.metric ?? 'rt'}
                    onchange={(e) => updateServer({ metric: e.currentTarget.value as 'rt' | 'accuracy' })}
                    placeholder=""
                  >
                    <option value="rt">Reaction time (µs)</option>
                    <option value="accuracy">Accuracy (0–1)</option>
                  </Select>
                </div>
                <div class="flex items-end pb-1">
                  <label class="flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={draft.server?.includeInvalidated ?? false}
                      onchange={(e) => updateServer({ includeInvalidated: e.currentTarget.checked })}
                    />
                    Include invalidated trials
                  </label>
                </div>
              </div>
            {/if}

            <!-- Materialization -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-foreground mb-1" for="srv-materialization">Materialization</label>
                <Select
                  id="srv-materialization"
                  value={draft.server?.stat ? 'single' : 'full'}
                  onchange={(e) => setMaterialization(e.currentTarget.value as 'single' | 'full')}
                  placeholder=""
                >
                  <option value="single">Single statistic → Number</option>
                  <option value="full">Full statistics → Object</option>
                </Select>
              </div>
              {#if draft.server?.stat}
                <div>
                  <label class="block text-xs font-medium text-foreground mb-1" for="srv-stat">Statistic</label>
                  <Select
                    id="srv-stat"
                    value={draft.server?.stat ?? 'mean'}
                    onchange={(e) => updateServer({ stat: e.currentTarget.value as ServerStat })}
                    placeholder=""
                  >
                    {#each serverStats as s}
                      <option value={s.value}>{s.label}</option>
                    {/each}
                  </Select>
                </div>
              {:else}
                <p class="text-xs text-muted-foreground self-end pb-2">
                  Resolves to a stats bundle
                  <code class="bg-muted px-1 rounded">{'{ n, mean, sd, median, p25, p75, … }'}</code>
                  — bind it in feedback / report cohort widgets.
                </p>
              {/if}
            </div>

            <!-- Disclosure floor (ADR 0028) -->
            <div class="grid grid-cols-2 gap-3" data-testid="srv-disclosure">
              <div>
                <label class="block text-xs font-medium text-foreground mb-1" for="srv-min-n">Minimum n (disclosure floor)</label>
                <input
                  id="srv-min-n"
                  type="number"
                  min="1"
                  step="1"
                  value={draft.server?.minN ?? 1}
                  oninput={(e) => updateServer({ minN: Math.max(1, Math.floor(Number(e.currentTarget.value) || 1)) })}
                  class="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                />
                <p class="mt-0.5 text-[11px] text-muted-foreground">Stats are withheld until this many participants contribute. n is always shown.</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-foreground mb-1" for="srv-below-floor">Below the floor</label>
                <Select
                  id="srv-below-floor"
                  value={draft.server?.belowFloor ?? 'hide'}
                  onchange={(e) => updateServer({ belowFloor: e.currentTarget.value as 'hide' | 'placeholder' })}
                  placeholder=""
                >
                  <option value="hide">Hide the widget</option>
                  <option value="placeholder">Show "still forming" placeholder</option>
                </Select>
              </div>
            </div>

            <!-- Dataset filter -->
            <div class="space-y-2">
              <div class="text-xs font-semibold text-foreground">Dataset</div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-[11px] text-muted-foreground mb-0.5" for="srv-version-scope">Version scope</label>
                  <Select
                    id="srv-version-scope"
                    value={draft.server?.dataset?.versionScope ?? 'sameMajor'}
                    onchange={(e) => updateDataset({ versionScope: e.currentTarget.value as DatasetFilter['versionScope'] })}
                    placeholder=""
                  >
                    <option value="sameMajor">Same major</option>
                    <option value="exact">Exact version</option>
                    <option value="any">Any version</option>
                  </Select>
                </div>
                <div>
                  <label class="block text-[11px] text-muted-foreground mb-0.5" for="srv-after">Completed after</label>
                  <input
                    id="srv-after"
                    type="date"
                    value={(draft.server?.dataset?.completedAfter ?? '').slice(0, 10)}
                    oninput={(e) => updateDataset({ completedAfter: e.currentTarget.value || undefined })}
                    class="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                </div>
                <div>
                  <label class="block text-[11px] text-muted-foreground mb-0.5" for="srv-before">Completed before</label>
                  <input
                    id="srv-before"
                    type="date"
                    value={(draft.server?.dataset?.completedBefore ?? '').slice(0, 10)}
                    oninput={(e) => updateDataset({ completedBefore: e.currentTarget.value || undefined })}
                    class="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                  />
                </div>
              </div>

              <!-- where rows -->
              <div class="space-y-2">
                {#each draft.server?.dataset?.where ?? [] as row, i}
                  <div class="flex items-center gap-1.5" data-testid={`srv-where-${i}`}>
                    <Select
                      value={row.var}
                      onchange={(e) => updateWhereRow(i, { var: e.currentTarget.value })}
                      placeholder=""
                      class="text-xs"
                    >
                      <option value="">Variable…</option>
                      {#each sessionVariableOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                    </Select>
                    <Select
                      value={row.op}
                      onchange={(e) => updateWhereRow(i, { op: e.currentTarget.value as typeof row.op })}
                      placeholder=""
                      class="text-xs"
                    >
                      {#each whereOps as op}
                        <option value={op.value}>{op.label}</option>
                      {/each}
                    </Select>
                    <input
                      type="text"
                      value={Array.isArray(row.value) ? row.value.join(', ') : String(row.value ?? '')}
                      oninput={(e) => setWhereValue(i, e.currentTarget.value, row.op)}
                      class="flex-1 min-w-0 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                      placeholder={row.op === 'in' ? 'a, b, c' : 'value'}
                    />
                    <button
                      type="button"
                      onclick={() => removeWhereRow(i)}
                      class="p-1 rounded hover:bg-destructive/10"
                      aria-label="Remove filter"
                    >
                      <Trash2 class="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                {/each}
                <button
                  type="button"
                  onclick={addWhereRow}
                  class="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                >
                  <Plus class="w-3.5 h-3.5" /> Add filter
                </button>
              </div>
            </div>

            <p class="text-[11px] text-muted-foreground leading-relaxed">
              Values compute after publish; there is no live preview because the server only
              evaluates published declarations. Cohorts below the anonymity floor (n&lt;5) return no
              statistics and the default value is used instead.
            </p>

            {#if serverValidationErrors.length > 0}
              <div class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive space-y-0.5" data-testid="server-variable-errors">
                {#each serverValidationErrors as err}
                  <p>{err}</p>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-desc"
            >Description (optional)</label
          >
          <input
            id="var-desc"
            type="text"
            value={editingVariable ? editingVariable.description : newVariable.description}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.description = value;
              } else {
                newVariable.description = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder="What is this variable for?"
          />
        </div>
  </div>

  {#snippet footer()}
    <button
      onclick={() => {
        showAddVariable = false;
        editingVariable = null;
        computationMode = 'static';
      }}
      class="px-4 py-2 text-muted-foreground hover:text-foreground"
    >
      Cancel
    </button>
    <button
      onclick={editingVariable ? handleUpdateVariable : handleAddVariable}
      disabled={computationMode === 'server' && serverValidationErrors.length > 0}
      class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {editingVariable ? 'Update' : 'Add'} Variable
    </button>
  {/snippet}
</Dialog>
