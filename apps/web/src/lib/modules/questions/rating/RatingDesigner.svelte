<script lang="ts">
  import type { Question } from '$lib/shared';
  import { buildModuleRuntimeConfig } from '$lib/runtime/core/moduleConfigAdapter';
  import { X } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  type RatingStyle = 'stars' | 'hearts' | 'thumbs' | 'numeric';

  interface RatingConfig {
    levels: number;
    style: RatingStyle;
    allowHalf?: boolean;
    showValue?: boolean;
    labels?: string[];
  }

  interface Props {
    question: Question & { config?: RatingConfig };
    onUpdate?: (updates: Record<string, unknown>) => void;
  }

  let { question, onUpdate }: Props = $props();
  const config = $derived(buildModuleRuntimeConfig(question) as unknown as RatingConfig);
  function updateConfig(updates: Partial<RatingConfig>) {
    onUpdate?.({ config: { ...question.config, ...updates } });
  }
  function updateLabel(index: number, value: string) {
    const labels = [...(config.labels ?? [])];
    while (labels.length <= index) labels.push('');
    labels[index] = value;
    updateConfig({ labels });
  }
  function removeLabel(index: number) {
    updateLabel(index, '');
  }
</script>

<div class="designer-panel">
  <!-- Visual Style -->
  <div class="form-group">
    <label for="rating-style">Visual Style</label>
    <Select
      id="rating-style"
      value={config.style ?? 'stars'}
      onchange={(e) => updateConfig({ style: e.currentTarget.value as RatingStyle })}
    >
      <option value="stars">Stars</option>
      <option value="hearts">Hearts</option>
      <option value="thumbs">Thumbs Up</option>
      <option value="numeric">Numeric</option>
    </Select>
  </div>

  <!-- Number of Levels -->
  <div class="form-group">
    <label for="levels">Number of Levels</label>
    <Input
      id="levels"
      type="number"
      min="2"
      max="10"
      value={String(config.levels ?? 5)}
      oninput={(e) => updateConfig({ levels: parseInt(e.currentTarget.value) || 2 })}
    />
    <p class="help-text">How many rating options (2-10)</p>
  </div>

  <!-- Options -->
  <div class="section">
    <h4 class="section-title">Options</h4>

    <div class="form-group">
      <Checkbox
        id="rating-allow-half"
        label="Allow half-step ratings"
        checked={config.allowHalf ?? false}
        onchange={(e) => updateConfig({ allowHalf: e.currentTarget.checked })}
      />
    </div>

    <div class="form-group">
      <Checkbox
        id="rating-show-value"
        label="Show numeric value"
        checked={config.showValue ?? false}
        onchange={(e) => updateConfig({ showValue: e.currentTarget.checked })}
      />
    </div>
  </div>

  <!-- Labels -->
  <div class="section">
    <h4 class="section-title">Labels (optional)</h4>
    <p class="help-text">Add descriptive labels for each rating level</p>

    <div class="labels-list">
      {#each Array(config.levels || 5) as _, index}
        <div class="label-item">
          <span class="label-index">{index + 1}</span>
          <div class="label-input">
            <Input
              type="text"
              value={config.labels?.[index] ?? ''}
              placeholder={index === 0
                ? 'e.g. Poor'
                : index === (config.levels || 5) - 1
                  ? 'e.g. Excellent'
                  : `Level ${index + 1}`}
              oninput={(e) => updateLabel(index, e.currentTarget.value)}
            />
          </div>
          {#if config.labels?.[index]}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => removeLabel(index)}
              aria-label="Remove label"
            >
              <X size={14} />
            </Button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground));
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .labels-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .label-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label-index {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--muted));
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .label-input {
    flex: 1;
  }
</style>
