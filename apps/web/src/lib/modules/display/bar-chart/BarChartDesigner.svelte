<script lang="ts">
  import type { Question } from '$lib/shared';
  import { moduleRegistry } from '$lib/modules/registry';
  import { designerStore } from '$lib/stores/designer.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface BarChartConfig {
    orientation: 'vertical' | 'horizontal';
    showErrorBars: boolean;
    errorType: 'standardError' | 'standardDeviation' | 'confidence95';
    stacked: boolean;
    showValues: boolean;
    showDataLabels: boolean;
    barWidth: number;
    barSpacing: number;
    colors: {
      scheme: string;
      customColors: string[];
    };
    axes: {
      x: {
        label: string;
        showGrid: boolean;
        showTicks: boolean;
        showLabels: boolean; // Added in case
      };
      y: {
        label: string;
        showGrid: boolean;
        showTicks: boolean;
        min: 'auto' | number;
        max: 'auto' | number;
      };
    };
    value?: string;
    referenceValue?: string;
  }

  interface BarChartDataSource {
    variables: string[];
    aggregation: 'none' | 'mean' | 'sum' | 'count' | 'min' | 'max';
  }

  interface Props {
    analytics?: Question & { config?: BarChartConfig; dataSource?: BarChartDataSource };
    block?: Question & { config?: BarChartConfig; dataSource?: BarChartDataSource };
    onUpdate?: (updates: any) => void;
  }

  let { analytics, block, onUpdate }: Props = $props();

  // Use analytics prop if provided, otherwise fall back to block
  const item = $derived(analytics || block);

  // Initialize config and dataSource if they don't exist
  $effect(() => {
    if (item) {
      let updates: any = {};
      let needsUpdate = false;

      // Initialize config if missing
      if (!item.config) {
        const metadata = moduleRegistry.get('bar-chart');
        if (metadata?.defaultConfig) {
          updates.config = metadata.defaultConfig;
          needsUpdate = true;
        }
      }

      // Initialize dataSource if missing
      if (!item.dataSource) {
        updates.dataSource = {
          variables: [],
          aggregation: 'none',
        };
        needsUpdate = true;
      }

      // Apply updates if needed
      if (needsUpdate) {
        onUpdate?.({
          ...item,
          ...updates,
        });
      }
    }
  });

  // Load available variables from designer store using derived
  let availableVariables = $derived(
    (designerStore.questionnaire.variables || []).map((v) => ({
      id: v.id || v.name,
      name: v.name,
      type: v.type || 'any',
    }))
  );

  // UI state
  let activeTab = $state<'data' | 'appearance' | 'axes'>('data');
  let newColor = $state('#3b82f6');
  let yMinInput = $state('');
  let yMaxInput = $state('');

  // Color scheme options
  const colorSchemes = [
    { value: 'default', label: 'Default', preview: ['#3b82f6', '#10b981', '#f59e0b'] },
    { value: 'categorical', label: 'Categorical', preview: ['#1f77b4', '#ff7f0e', '#2ca02c'] },
    { value: 'sequential', label: 'Sequential', preview: ['#c6dbef', '#6baed6', '#08519c'] },
    { value: 'diverging', label: 'Diverging', preview: ['#d7191c', '#ffffbf', '#1a9641'] },
  ];

  $effect(() => {
    const minValue = item?.config?.axes?.y?.min;
    const maxValue = item?.config?.axes?.y?.max;
    yMinInput = minValue === 'auto' ? '' : String(minValue ?? '');
    yMaxInput = maxValue === 'auto' ? '' : String(maxValue ?? '');
  });

  // Update y-axis bounds
  $effect(() => {
    if (!item?.config) return;

    const newMin = yMinInput === '' ? 'auto' : parseFloat(yMinInput);
    if (item.config.axes?.y?.min !== newMin && (newMin === 'auto' || !isNaN(newMin as number))) {
      onUpdate?.({
        ...item,
        config: {
          ...item.config,
          axes: {
            ...item.config.axes,
            y: {
              ...item.config.axes.y,
              min: newMin,
            },
          },
        },
      });
    }
  });

  $effect(() => {
    if (!item?.config) return;

    const newMax = yMaxInput === '' ? 'auto' : parseFloat(yMaxInput);
    if (item.config.axes?.y?.max !== newMax && (newMax === 'auto' || !isNaN(newMax as number))) {
      onUpdate?.({
        ...item,
        config: {
          ...item.config,
          axes: {
            ...item.config.axes,
            y: {
              ...item.config.axes.y,
              max: newMax,
            },
          },
        },
      });
    }
  });

  function toggleVariable(varId: string) {
    if (!item) return;
    const current = item.dataSource?.variables || [];
    const newVariables = current.includes(varId)
      ? current.filter((v) => v !== varId)
      : [...current, varId];

    onUpdate?.({
      ...item,
      dataSource: {
        ...item.dataSource,
        variables: newVariables,
      },
    });
  }

  function addCustomColor() {
    if (!newColor || !item?.config) return;

    onUpdate?.({
      ...item,
      config: {
        ...item.config,
        colors: {
          ...item.config!.colors,
          customColors: [...(item.config!.colors?.customColors || []), newColor],
        },
      },
    });

    // Generate new random color for next addition
    newColor =
      '#' +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
  }

  function removeCustomColor(index: number) {
    if (!item?.config) return;

    onUpdate?.({
      ...item,
      config: {
        ...item.config,
        colors: {
          ...item.config!.colors,
          customColors: item.config!.colors?.customColors?.filter((_, i) => i !== index) || [],
        },
      },
    });
  }

  function reorderCustomColor(index: number, direction: 'up' | 'down') {
    if (!item?.config) return;

    const colors = [...(item.config!.colors?.customColors || [])];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= colors.length) return;

    [colors[index], colors[newIndex]] = [colors[newIndex]!, colors[index]!];

    onUpdate?.({
      ...item,
      config: {
        ...item.config,
        colors: {
          ...item.config!.colors,
          customColors: colors,
        },
      },
    });
  }
</script>

{#if item}
  <div class="p-6 max-h-full overflow-y-auto">
    <!-- Tabs -->
    <div class="tabs">
      <button class="tab" class:active={activeTab === 'data'} onclick={() => (activeTab = 'data')}>
        Data
      </button>
      <button
        class="tab"
        class:active={activeTab === 'appearance'}
        onclick={() => (activeTab = 'appearance')}
      >
        Appearance
      </button>
      <button class="tab" class:active={activeTab === 'axes'} onclick={() => (activeTab = 'axes')}>
        Axes
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      {#if activeTab === 'data'}
        <!-- Data Tab -->
        <div class="mb-8">
          <h4 class="section-title">Data Source</h4>

          <div class="mb-4">
            <span class="block text-sm font-medium text-foreground mb-2"
              >Variables to Display</span
            >
            <div class="variable-list">
              {#each availableVariables as variable}
                <label class="variable-option">
                  <input
                    type="checkbox"
                    checked={item.dataSource?.variables?.includes(variable.id)}
                    onchange={() => toggleVariable(variable.id)}
                  />
                  <span class="flex-1 text-sm font-medium text-[hsl(var(--foreground))]">{variable.name}</span>
                  <span class="variable-type">{variable.type}</span>
                </label>
              {/each}
            </div>
            {#if availableVariables.length === 0}
              <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                No variables available. Create variables in your questionnaire to display them here.
              </p>
            {/if}
          </div>

          <div class="mb-4">
            <label for="aggregation" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Aggregation</label>
            <Select
              id="aggregation"
              value={item.dataSource?.aggregation || 'none'}
              onchange={(e) => {
                onUpdate?.({
                  ...item,
                  dataSource: {
                    ...item.dataSource,
                    aggregation: e.currentTarget.value,
                  },
                });
              }}
            >
              <option value="none">None</option>
              <option value="mean">Mean</option>
              <option value="sum">Sum</option>
              <option value="count">Count</option>
              <option value="min">Minimum</option>
              <option value="max">Maximum</option>
            </Select>
          </div>

          <div class="mb-4">
            <label for="value" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Value Expression</label>
            <input
              id="value"
              type="text"
              value={item?.config?.value || ''}
              onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                onUpdate?.({
                  ...item,
                  config: {
                    ...item.config,
                    value: e.currentTarget.value,
                  },
                });
              }}
              placeholder="e.g., variableName or IF(condition, value1, value2)"
              class="input-field"
            />
            <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Enter a variable name or formula to display</p>
          </div>

          <div class="mb-4">
            <label for="referenceValue" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Reference Value (Optional)</label>
            <input
              id="referenceValue"
              type="text"
              value={item?.config?.referenceValue || ''}
              onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                onUpdate?.({
                  ...item,
                  config: {
                    ...item.config,
                    referenceValue: e.currentTarget.value,
                  },
                });
              }}
              placeholder="e.g., baseline or 100"
              class="input-field"
            />
            <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Enter a reference value or variable for comparison</p>
          </div>
        </div>
      {:else if activeTab === 'appearance'}
        <!-- Appearance Tab -->
        <div class="mb-8">
          <h4 class="section-title">Chart Appearance</h4>

          <div class="mb-4">
            <label for="orientation" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Orientation</label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="orientation"
                  value="vertical"
                  checked={item.config?.orientation === 'vertical'}
                  onchange={() => {
                    if (!item.config) return;
                    onUpdate?.({
                      ...item,
                      config: {
                        ...item.config,
                        orientation: 'vertical',
                      },
                    });
                  }}
                />
                <span>Vertical</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="orientation"
                  value="horizontal"
                  checked={item.config?.orientation === 'horizontal'}
                  onchange={() => {
                    if (!item.config) return;
                    onUpdate?.({
                      ...item,
                      config: {
                        ...item.config,
                        orientation: 'horizontal',
                      },
                    });
                  }}
                />
                <span>Horizontal</span>
              </label>
            </div>
          </div>

          <div class="mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={item.config?.stacked || false}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      stacked: e.currentTarget.checked,
                    },
                  });
                }}
              />
              <span>Stacked bars</span>
            </label>
          </div>

          <div class="mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={item.config?.showValues || false}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      showValues: e.currentTarget.checked,
                    },
                  });
                }}
              />
              <span>Show values on bars</span>
            </label>
          </div>

          <div class="mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={item.config?.showDataLabels || false}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      showDataLabels: e.currentTarget.checked,
                    },
                  });
                }}
              />
              <span>Show data labels</span>
            </label>
          </div>

          <div class="mb-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={item.config?.showErrorBars || false}
                onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      showErrorBars: e.currentTarget.checked,
                    },
                  });
                }}
              />
              <span>Show error bars</span>
            </label>
          </div>

          {#if item.config?.showErrorBars}
            <div class="mb-4 pl-6">
              <label for="error-type" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Error Type</label>
              <Select
                id="error-type"
                value={item.config?.errorType || 'standardError'}
                onchange={(e) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      errorType: e.currentTarget.value,
                    },
                  });
                }}
              >
                <option value="standardError">Standard Error</option>
                <option value="standardDeviation">Standard Deviation</option>
                <option value="confidence95">95% Confidence Interval</option>
              </Select>
            </div>
          {/if}

          <div class="grid grid-cols-2 gap-4">
            <div class="mb-4">
              <label for="bar-width" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Bar Width</label>
              <input
                id="bar-width"
                type="range"
                value={item.config?.barWidth || 0.8}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      barWidth: parseFloat(e.currentTarget.value),
                    },
                  });
                }}
                min="0.1"
                max="1"
                step="0.1"
                class="w-full mb-1"
              />
              <span class="inline-block ml-2 text-sm font-mono text-[hsl(var(--muted-foreground))]">{item?.config?.barWidth || 0.8}</span>
            </div>

            <div class="mb-4">
              <label for="bar-spacing" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Bar Spacing</label>
              <input
                id="bar-spacing"
                type="range"
                value={item.config?.barSpacing || 0.2}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      barSpacing: parseFloat(e.currentTarget.value),
                    },
                  });
                }}
                min="0"
                max="0.5"
                step="0.1"
                class="w-full mb-1"
              />
              <span class="inline-block ml-2 text-sm font-mono text-[hsl(var(--muted-foreground))]">{item?.config?.barSpacing || 0.2}</span>
            </div>
          </div>

          <div class="mb-4">
            <label for="color-scheme" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Color Scheme</label>
            <div class="flex flex-col gap-3">
              {#each colorSchemes as scheme}
                <label class="color-scheme-option">
                  <input
                    type="radio"
                    name="colorScheme"
                    value={scheme.value}
                    checked={item.config?.colors?.scheme === scheme.value}
                    onchange={() => {
                      if (!item.config) return;
                      onUpdate?.({
                        ...item,
                        config: {
                          ...item.config,
                          colors: {
                            ...item.config.colors,
                            scheme: scheme.value,
                          },
                        },
                      });
                    }}
                  />
                  <span class="text-sm font-medium text-[hsl(var(--foreground))] w-24">{scheme.label}</span>
                  <div class="flex gap-1 flex-1">
                    {#each scheme.preview as color}
                      <div class="w-8 h-6 rounded border border-[hsl(var(--border))]" style="background-color: {color}"></div>
                    {/each}
                  </div>
                </label>
              {/each}
            </div>
          </div>

          <div class="mb-4">
            <span class="block text-sm font-medium text-foreground mb-2"
              >Custom Colors</span
            >
            <div class="flex flex-col gap-2">
              {#each item.config?.colors?.customColors || [] as color, index}
                <div class="flex items-center gap-2 p-2 bg-[hsl(var(--muted))] rounded-md">
                  <div class="w-8 h-8 rounded border border-[hsl(var(--border))]" style="background-color: {color}"></div>
                  <span class="flex-1 font-mono text-sm text-[hsl(var(--foreground))]">{color}</span>
                  <div class="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => reorderCustomColor(index, 'up')}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => reorderCustomColor(index, 'down')}
                      disabled={index === (item.config?.colors?.customColors?.length || 0) - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="hover:text-destructive"
                      onclick={() => removeCustomColor(index)}
                      aria-label="Remove"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              {/each}

              <div class="flex gap-2 items-center mt-2">
                <input type="color" bind:value={newColor} class="color-input" />
                <Button variant="secondary" size="sm" onclick={addCustomColor}> Add Color </Button>
              </div>
            </div>
          </div>
        </div>
      {:else if activeTab === 'axes'}
        <!-- Axes Tab -->
        <div class="mb-8">
          <h4 class="section-title">Axes Configuration</h4>

          <div class="mt-6 pl-2">
            <h5 class="text-sm font-semibold text-gray-600 mb-3">X-Axis</h5>

            <div class="mb-4">
              <label for="x-label" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Label</label>
              <input
                id="x-label"
                type="text"
                value={item.config?.axes?.x?.label || ''}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      axes: {
                        ...item.config.axes,
                        x: {
                          ...item.config.axes.x,
                          label: e.currentTarget.value,
                        },
                      },
                    },
                  });
                }}
                placeholder="X-axis label"
                class="input-field"
              />
            </div>

            <div class="mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.config?.axes?.x?.showGrid || false}
                  onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                    if (!item.config) return;
                    onUpdate?.({
                      ...item,
                      config: {
                        ...item.config,
                        axes: {
                          ...item.config.axes,
                          x: {
                            ...item.config.axes.x,
                            showGrid: e.currentTarget.checked,
                          },
                        },
                      },
                    });
                  }}
                />
                <span>Show grid lines</span>
              </label>
            </div>

            <div class="mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.config?.axes?.x?.showTicks || false}
                  onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                    if (!item.config) return;
                    onUpdate?.({
                      ...item,
                      config: {
                        ...item.config,
                        axes: {
                          ...item.config.axes,
                          x: {
                            ...item.config.axes.x,
                            showTicks: e.currentTarget.checked,
                          },
                        },
                      },
                    });
                  }}
                />
                <span>Show tick marks</span>
              </label>
            </div>
          </div>

          <div class="mt-6 pl-2">
            <h5 class="text-sm font-semibold text-gray-600 mb-3">Y-Axis</h5>

            <div class="mb-4">
              <label for="y-label" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Label</label>
              <input
                id="y-label"
                type="text"
                value={item.config?.axes?.y?.label || ''}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                  if (!item.config) return;
                  onUpdate?.({
                    ...item,
                    config: {
                      ...item.config,
                      axes: {
                        ...item.config.axes,
                        y: {
                          ...item.config.axes.y,
                          label: e.currentTarget.value,
                        },
                      },
                    },
                  });
                }}
                placeholder="Y-axis label"
                class="input-field"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="mb-4">
                <label for="y-min" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Minimum</label>
                <input
                  id="y-min"
                  type="text"
                  bind:value={yMinInput}
                  placeholder="Auto"
                  class="input-field"
                />
              </div>

              <div class="mb-4">
                <label for="y-max" class="block mb-1.5 text-sm font-medium text-[hsl(var(--foreground))]">Maximum</label>
                <input
                  id="y-max"
                  type="text"
                  bind:value={yMaxInput}
                  placeholder="Auto"
                  class="input-field"
                />
              </div>
            </div>

            <div class="mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.config?.axes?.y?.showGrid || false}
                  onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                    if (!item.config) return;
                    onUpdate?.({
                      ...item,
                      config: {
                        ...item.config,
                        axes: {
                          ...item.config.axes,
                          y: {
                            ...item.config.axes.y,
                            showGrid: e.currentTarget.checked,
                          },
                        },
                      },
                    });
                  }}
                />
                <span>Show grid lines</span>
              </label>
            </div>

            <div class="mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.config?.axes?.y?.showTicks || false}
                  onchange={(e) => {
                    if (!item.config) return;
                    onUpdate?.({
                      ...item,
                      config: {
                        ...item.config,
                        axes: {
                          ...item.config.axes,
                          y: {
                            ...item.config.axes.y,
                            showTicks: e.currentTarget.checked,
                          },
                        },
                      },
                    });
                  }}
                />
                <span>Show tick marks</span>
              </label>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="p-6 max-h-full overflow-y-auto">
    <p class="text-muted-foreground">No bar chart selected</p>
  </div>
{/if}

<style>
  /* Tabs */
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid hsl(var(--border));
  }

  .tab {
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover {
    color: hsl(var(--foreground));
  }

  .tab.active {
    color: hsl(var(--primary));
    border-bottom-color: hsl(var(--primary));
  }

  /* Section title */
  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Form elements */
  .input-field {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input-field:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  /* Variable selection */
  .variable-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.5rem;
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
  }

  .variable-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .variable-option:hover {
    background: hsl(var(--muted));
  }

  .variable-type {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }

  /* Color schemes */
  .color-scheme-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .color-scheme-option:hover {
    border-color: hsl(var(--primary));
  }

  .color-input {
    width: 3rem;
    height: 2rem;
    padding: 0.25rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    cursor: pointer;
  }
</style>
