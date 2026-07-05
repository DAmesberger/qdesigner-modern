<script lang="ts">
  import { Languages } from 'lucide-svelte';

  interface LocaleOption {
    code: string;
    label: string;
  }

  interface Props {
    options: LocaleOption[];
    active: string;
    onSelect: (code: string) => void;
  }

  let { options, active, onSelect }: Props = $props();
</script>

{#if options.length > 1}
  <div class="language-picker" data-testid="fillout-language-picker">
    <Languages class="picker-icon" aria-hidden="true" />
    <div class="picker-options" role="group" aria-label="Select language">
      {#each options as option (option.code)}
        <button
          type="button"
          class="picker-option"
          class:active={option.code === active}
          aria-pressed={option.code === active}
          onclick={() => onSelect(option.code)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .language-picker {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 auto 1.5rem;
  }

  :global(.language-picker .picker-icon) {
    width: 1rem;
    height: 1rem;
    color: hsl(var(--muted-foreground));
  }

  .picker-options {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    background: hsl(var(--muted));
    border-radius: 9999px;
  }

  .picker-option {
    padding: 0.25rem 0.75rem;
    border: none;
    border-radius: 9999px;
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .picker-option:hover {
    color: hsl(var(--foreground));
  }

  .picker-option.active {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  }
</style>
