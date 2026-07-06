<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import StimulusKindEditor from '$lib/components/designer/reaction/StimulusKindEditor.svelte';
  import ResponseMappingEditor from '$lib/components/designer/reaction/ResponseMappingEditor.svelte';
  import PhaseTimelineEditor from '$lib/components/designer/reaction/PhaseTimelineEditor.svelte';
  import {
    clamp,
    type ReactionExperimentAssetRef,
    type ReactionExperimentBlock,
    type ReactionExperimentConfig,
    type ReactionExperimentTrial,
  } from '../model/reaction-experiment';
  import type { ReactionStimulusConfig } from '$lib/runtime/reaction';

  interface Props {
    config: ReactionExperimentConfig;
    updateConfig: (mutator: (draft: ReactionExperimentConfig) => void) => void;
    selectedBlock: ReactionExperimentBlock | null;
    selectedTrial: ReactionExperimentTrial | null;
    updateSelectedBlock: (mutator: (block: ReactionExperimentBlock) => void) => void;
    updateSelectedTrial: (mutator: (trial: ReactionExperimentTrial) => void) => void;
    /**
     * Persist the current config after a shared sub-editor's in-place (`bind:`)
     * mutation. The shared editors mutate the live trial object; a bubbling
     * input/change handler wired to this commits + emits the update.
     */
    onTrialCommit: () => void;
    hasScript: boolean;
    onOpenScript: () => void;
    /** Open the media picker in "assign to selected trial" mode. */
    onChooseMedia: () => void;
    /** Switch the left rail to the Assets tab. */
    onOpenAssetBin: () => void;
  }

  let {
    config,
    updateConfig,
    selectedBlock,
    selectedTrial,
    updateSelectedBlock,
    updateSelectedTrial,
    onTrialCommit,
    hasScript,
    onOpenScript,
    onChooseMedia,
    onOpenAssetBin,
  }: Props = $props();

  const stimulusKind = $derived.by<ReactionStimulusConfig['kind']>(() => {
    if (selectedTrial && typeof selectedTrial.stimulus === 'object') {
      return selectedTrial.stimulus.kind;
    }
    return 'text';
  });

  function stimulusAssetCandidates(): ReactionExperimentAssetRef[] {
    if (!selectedTrial || typeof selectedTrial.stimulus !== 'object') return [];
    const kind = selectedTrial.stimulus.kind;
    if (kind === 'image' || kind === 'video' || kind === 'audio') {
      return config.assets.filter((asset) => asset.kind === kind);
    }
    return [];
  }

  function changeStimulusKind(next: ReactionStimulusConfig) {
    updateSelectedTrial((trial) => {
      trial.stimulus = next;
      trial.assetPoolIds = [];
    });
  }

  function assignAsset(asset: ReactionExperimentAssetRef) {
    updateSelectedTrial((trial) => {
      if (typeof trial.stimulus !== 'object') return;
      if (trial.stimulus.kind !== asset.kind) return;
      trial.assetPoolIds = [asset.id];
      if ('src' in trial.stimulus) {
        trial.stimulus.src = asset.url || '';
      }
    });
  }

  function addPositionVariant() {
    updateSelectedTrial((trial) => {
      const variants = Array.isArray(trial.positionVariants) ? trial.positionVariants : [];
      const nextIndex = variants.length + 1;
      variants.push({ id: `position-${nextIndex}`, label: `Position ${nextIndex}`, x: 0, y: 0 });
      trial.positionVariants = variants;
    });
  }

  function removePositionVariant(id: string) {
    updateSelectedTrial((trial) => {
      trial.positionVariants = (trial.positionVariants || []).filter((variant) => variant.id !== id);
    });
  }
</script>

<div class="space-y-5">
  <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
    <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      Experiment
    </p>
    <div class="mt-3 grid gap-3">
      <label class="space-y-1 text-sm">
        <span class="block text-muted-foreground">Prompt</span>
        <input
          class="w-full rounded-xl border border-input bg-background px-3 py-2"
          value={config.metadata.prompt}
          oninput={(event) =>
            updateConfig((draft) => {
              draft.metadata.prompt = event.currentTarget.value;
            })}
        />
      </label>
      <label class="space-y-1 text-sm">
        <span class="block text-muted-foreground">Description</span>
        <textarea
          class="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2"
          value={config.metadata.description}
          oninput={(event) =>
            updateConfig((draft) => {
              draft.metadata.description = event.currentTarget.value;
            })}
        ></textarea>
      </label>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Canvas Width</span>
          <input
            type="number"
            min="320"
            max="1920"
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.stage.width}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.stage.width = clamp(Number(event.currentTarget.value), 320, 1920);
              })}
          />
        </label>
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Canvas Height</span>
          <input
            type="number"
            min="240"
            max="1080"
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.stage.height}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.stage.height = clamp(Number(event.currentTarget.value), 240, 1080);
              })}
          />
        </label>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Background</span>
          <input
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.stage.background}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.stage.background = event.currentTarget.value;
              })}
          />
        </label>
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Target FPS</span>
          <input
            type="number"
            min="30"
            max="240"
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.stage.targetFPS}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.stage.targetFPS = clamp(Number(event.currentTarget.value), 30, 240);
              })}
          />
        </label>
      </div>
      <label class="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={config.stage.showGrid}
          onchange={(event) =>
            updateConfig((draft) => {
              draft.stage.showGrid = event.currentTarget.checked;
            })}
        />
        Show stage grid
      </label>
      <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-foreground">Experiment Script</p>
            <p class="text-xs text-muted-foreground">
              Attach advanced runtime hooks for this experiment.
            </p>
          </div>
          <Button variant="secondary" size="sm" onclick={onOpenScript}>
            {hasScript ? 'Edit Script' : 'Add Script'}
          </Button>
        </div>
      </div>
    </div>
  </section>

  <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
    <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
      Response & Feedback
    </p>
    <div class="mt-3 grid gap-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Response Mode</span>
          <select
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.response.mode}
            onchange={(event) =>
              updateConfig((draft) => {
                draft.response.mode = event.currentTarget.value as typeof draft.response.mode;
              })}
          >
            <option value="keyboard">Keyboard</option>
            <option value="mouse">Mouse</option>
            <option value="touch">Touch</option>
          </select>
        </label>
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Save Variable</span>
          <input
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.response.saveAs}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.response.saveAs = event.currentTarget.value;
              })}
          />
        </label>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Default Valid Inputs</span>
          <input
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.response.validKeys.join(', ')}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.response.validKeys = event.currentTarget.value
                  .split(',')
                  .map((entry) => entry.trim())
                  .filter(Boolean);
              })}
          />
        </label>
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Default Correct Response</span>
          <input
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={config.response.correctKey || ''}
            oninput={(event) =>
              updateConfig((draft) => {
                draft.response.correctKey = event.currentTarget.value || undefined;
              })}
          />
        </label>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={config.response.requireCorrect}
            onchange={(event) =>
              updateConfig((draft) => {
                draft.response.requireCorrect = event.currentTarget.checked;
              })}
          />
          Score responses as correct / incorrect
        </label>
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={config.feedback.enabled}
            onchange={(event) =>
              updateConfig((draft) => {
                draft.feedback.enabled = event.currentTarget.checked;
              })}
          />
          Show per-trial feedback during preview/runtime
        </label>
      </div>
    </div>
  </section>

  {#if selectedBlock}
    <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
      <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Block</p>
      <div class="mt-3 grid gap-3">
        <label class="space-y-1 text-sm">
          <span class="block text-muted-foreground">Name</span>
          <input
            class="w-full rounded-xl border border-input bg-background px-3 py-2"
            value={selectedBlock?.name}
            oninput={(event) =>
              updateSelectedBlock((block) => {
                block.name = event.currentTarget.value;
              })}
          />
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Kind</span>
            <select
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedBlock?.kind}
              onchange={(event) =>
                updateSelectedBlock((block) => {
                  block.kind = event.currentTarget.value as ReactionExperimentBlock['kind'];
                })}
            >
              <option value="practice">Practice</option>
              <option value="test">Test</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Repetitions</span>
            <input
              type="number"
              min="1"
              max="50"
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedBlock?.repetitions}
              oninput={(event) =>
                updateSelectedBlock((block) => {
                  block.repetitions = clamp(Number(event.currentTarget.value), 1, 50);
                })}
            />
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={selectedBlock?.randomizeOrder}
            onchange={(event) =>
              updateSelectedBlock((block) => {
                block.randomizeOrder = event.currentTarget.checked;
              })}
          />
          Randomize order in this block
        </label>
      </div>
    </section>
  {/if}

  {#if selectedTrial}
    <section class="rounded-2xl border border-border/70 bg-background/80 p-4">
      <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Trial</p>
      <div class="mt-3 grid gap-3">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Name</span>
            <input
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.name}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.name = event.currentTarget.value;
                })}
            />
          </label>
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Condition</span>
            <input
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.condition}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.condition = event.currentTarget.value;
                })}
            />
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Repeat</span>
            <input
              type="number"
              min="1"
              max="250"
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.repeat || 1}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.repeat = clamp(Number(event.currentTarget.value), 1, 250);
                })}
            />
          </label>
          <StimulusKindEditor
            kind={stimulusKind}
            kinds={['text', 'shape', 'image', 'video', 'audio', 'custom']}
            onChange={changeStimulusKind}
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={selectedTrial?.isPractice || false}
              onchange={(event) =>
                updateSelectedTrial((trial) => {
                  trial.isPractice = event.currentTarget.checked;
                })}
            />
            Practice trial
          </label>
          <label class="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={selectedTrial?.isTarget || false}
              onchange={(event) =>
                updateSelectedTrial((trial) => {
                  trial.isTarget = event.currentTarget.checked;
                })}
            />
            Target trial
          </label>
        </div>

        {#if selectedTrial && typeof selectedTrial.stimulus === 'object'}
          {@const stimulus = selectedTrial.stimulus as ReactionStimulusConfig}
          {#if stimulus.kind === 'text'}
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Text</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={stimulus.text}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'text') {
                        trial.stimulus.text = event.currentTarget.value;
                      }
                    })}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Font Size</span>
                <input
                  type="number"
                  min="10"
                  max="240"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={stimulus.fontPx || 64}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'text') {
                        trial.stimulus.fontPx = Number(event.currentTarget.value);
                      }
                    })}
                />
              </label>
            </div>
          {:else if stimulus.kind === 'shape'}
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Shape</span>
                <select
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={stimulus.shape}
                  onchange={(event) =>
                    updateSelectedTrial((trial) => {
                      if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'shape') {
                        trial.stimulus.shape = event.currentTarget.value as typeof stimulus.shape;
                      }
                    })}
                >
                  <option value="circle">Circle</option>
                  <option value="square">Square</option>
                  <option value="rectangle">Rectangle</option>
                  <option value="triangle">Triangle</option>
                </select>
              </label>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Radius / Size</span>
                <input
                  type="number"
                  min="10"
                  max="800"
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={stimulus.radiusPx || stimulus.widthPx || 120}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'shape') {
                        const next = Number(event.currentTarget.value);
                        trial.stimulus.radiusPx = next;
                        trial.stimulus.widthPx = next;
                        trial.stimulus.heightPx = next;
                      }
                    })}
                />
              </label>
            </div>
          {:else if stimulus.kind === 'image' || stimulus.kind === 'video' || stimulus.kind === 'audio'}
            <div class="space-y-3">
              <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-foreground">Media Source</p>
                    <p class="text-xs text-muted-foreground">
                      Link an uploaded asset or paste a remote fallback URL.
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onclick={onChooseMedia}>Choose Media</Button>
                    <Button variant="ghost" size="sm" onclick={onOpenAssetBin}>Open Asset Bin</Button>
                  </div>
                </div>
              </div>
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Assigned Asset</span>
                <select
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={selectedTrial?.assetPoolIds?.[0] || ''}
                  onchange={(event) => {
                    const asset = config.assets.find((entry) => entry.id === event.currentTarget.value);
                    if (asset) assignAsset(asset);
                  }}
                >
                  <option value="">No asset selected</option>
                  {#each stimulusAssetCandidates() as asset}
                    <option value={asset.id}>{asset.label}</option>
                  {/each}
                </select>
              </label>
              {#if stimulusAssetCandidates().length === 0}
                <p class="text-xs text-muted-foreground">
                  No linked {stimulus.kind} assets yet. Use <strong>Choose Media</strong> or the Asset
                  Bin tab.
                </p>
              {/if}
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Fallback URL</span>
                <input
                  class="w-full rounded-xl border border-input bg-background px-3 py-2"
                  value={stimulus.src}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      if (typeof trial.stimulus === 'object' && 'src' in trial.stimulus) {
                        trial.stimulus.src = event.currentTarget.value;
                      }
                    })}
                />
              </label>
            </div>
          {:else if stimulus.kind === 'custom'}
            <div class="grid gap-3">
              <label class="space-y-1 text-sm">
                <span class="block text-muted-foreground">Shader Source</span>
                <textarea
                  class="min-h-28 w-full rounded-xl border border-input bg-background px-3 py-2 font-mono text-xs"
                  value={stimulus.shader}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      if (typeof trial.stimulus === 'object' && trial.stimulus.kind === 'custom') {
                        trial.stimulus.shader = event.currentTarget.value;
                      }
                    })}
                ></textarea>
              </label>
            </div>
          {/if}

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Position X</span>
              <input
                type="number"
                min="-1"
                max="1"
                step="0.05"
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={stimulus.position?.x || 0}
                oninput={(event) =>
                  updateSelectedTrial((trial) => {
                    if (typeof trial.stimulus === 'object') {
                      trial.stimulus.position = {
                        x: Number(event.currentTarget.value),
                        y: trial.stimulus.position?.y || 0,
                      };
                    }
                  })}
              />
            </label>
            <label class="space-y-1 text-sm">
              <span class="block text-muted-foreground">Position Y</span>
              <input
                type="number"
                min="-1"
                max="1"
                step="0.05"
                class="w-full rounded-xl border border-input bg-background px-3 py-2"
                value={stimulus.position?.y || 0}
                oninput={(event) =>
                  updateSelectedTrial((trial) => {
                    if (typeof trial.stimulus === 'object') {
                      trial.stimulus.position = {
                        x: trial.stimulus.position?.x || 0,
                        y: Number(event.currentTarget.value),
                      };
                    }
                  })}
              />
            </label>
          </div>
        {/if}

        <!-- Response mapping (shared P6-T5 editor). It mutates the trial in place
             via bind:; the bubbling input/change handler commits. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div oninput={onTrialCommit} onchange={onTrialCommit}>
          <ResponseMappingEditor trial={selectedTrial} onUpdate={onTrialCommit} />
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Fixation (ms)</span>
            <input
              type="number"
              min="0"
              max="10000"
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.fixationMs || 0}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.fixationMs = Number(event.currentTarget.value);
                })}
            />
          </label>
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Cue Delay (ms)</span>
            <input
              type="number"
              min="0"
              max="10000"
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.preStimulusDelayMs || 0}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.preStimulusDelayMs = Number(event.currentTarget.value);
                })}
            />
          </label>
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Stimulus Duration (ms)</span>
            <input
              type="number"
              min="0"
              max="30000"
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.stimulusDurationMs || 0}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.stimulusDurationMs = Number(event.currentTarget.value);
                })}
            />
          </label>
          <label class="space-y-1 text-sm">
            <span class="block text-muted-foreground">Response Timeout (ms)</span>
            <input
              type="number"
              min="100"
              max="30000"
              class="w-full rounded-xl border border-input bg-background px-3 py-2"
              value={selectedTrial?.responseTimeoutMs || config.response.timeoutMs}
              oninput={(event) =>
                updateSelectedTrial((trial) => {
                  trial.responseTimeoutMs = Number(event.currentTarget.value);
                })}
            />
          </label>
        </div>

        <div class="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-foreground">Position Variants</h4>
            <Button variant="ghost" size="sm" onclick={addPositionVariant}>Add</Button>
          </div>
          <div class="mt-3 space-y-2">
            {#each selectedTrial?.positionVariants || [] as variant (variant.id)}
              <div class="grid grid-cols-[1fr_96px_96px_auto] gap-2">
                <input
                  class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={variant.label}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      const target = (trial.positionVariants || []).find((entry) => entry.id === variant.id);
                      if (target) target.label = event.currentTarget.value;
                    })}
                />
                <input
                  type="number"
                  min="-1"
                  max="1"
                  step="0.05"
                  class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={variant.x}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      const target = (trial.positionVariants || []).find((entry) => entry.id === variant.id);
                      if (target) target.x = Number(event.currentTarget.value);
                    })}
                />
                <input
                  type="number"
                  min="-1"
                  max="1"
                  step="0.05"
                  class="rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={variant.y}
                  oninput={(event) =>
                    updateSelectedTrial((trial) => {
                      const target = (trial.positionVariants || []).find((entry) => entry.id === variant.id);
                      if (target) target.y = Number(event.currentTarget.value);
                    })}
                />
                <button
                  type="button"
                  class="rounded-xl px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                  onclick={() => removePositionVariant(variant.id)}
                >
                  Remove
                </button>
              </div>
            {/each}
            {#if (selectedTrial?.positionVariants || []).length === 0}
              <p class="text-xs text-muted-foreground">
                Add alternate positions for shuffle or counterbalancing rules.
              </p>
            {/if}
          </div>
        </div>

        <!-- Phase timeline (shared P6-T5 editor); bubbling handler commits bind: edits. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div oninput={onTrialCommit} onchange={onTrialCommit}>
          <PhaseTimelineEditor trial={selectedTrial} onUpdate={onTrialCommit} />
        </div>
      </div>
    </section>
  {/if}
</div>
