<script lang="ts">
  import { onMount } from 'svelte';
  import type { ScenarioName } from './harness';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Second guard (defense-in-depth alongside the +page.ts 404). The debug
  // global is only ever installed when the harness is explicitly enabled, so a
  // production bundle that somehow reached this component still exposes nothing.
  const HARNESS_ENABLED =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_RUNTIME === 'true';

  let ready = $state(false);
  let scenario = $state<ScenarioName>((data.scenario as ScenarioName) ?? 'stroop');

  onMount(() => {
    if (!HARNESS_ENABLED) return;
    // Dynamic import so Rollup drops the harness chunk from prod builds
    // (import.meta.env guards are statically replaced at build time).
    let dispose: (() => void) | undefined;
    import('./harness').then((m) => {
      dispose = m.installReactionHarness(scenario, { seed: data.seed });
      ready = true;
    });
    return () => dispose?.();
  });
</script>

<div class="harness-root" data-testid="test-runtime-root" data-ready={ready}>
  <p class="harness-eyebrow">Reaction Runtime Harness (dev only)</p>
  <h1>Deterministic reaction test harness</h1>
  <p>
    Initial scenario:
    <span data-testid="test-runtime-scenario">{scenario}</span>
  </p>
  <p data-testid="test-runtime-ready">{ready ? 'ready' : 'initializing'}</p>
  <p class="harness-hint">
    Drive this page via <code>window.__QDESIGNER_RUNTIME_DEBUG__</code>. Timing is
    injected deterministically; nothing here measures wall-clock latency.
  </p>
</div>

<style>
  .harness-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    font-family: ui-monospace, monospace;
    background: #0b0b0f;
    color: #e6e6ea;
  }
  .harness-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.3em;
    font-size: 0.7rem;
    color: #8a8a99;
  }
  h1 {
    font-size: 1.5rem;
    font-weight: 700;
  }
  .harness-hint {
    color: #8a8a99;
    font-size: 0.85rem;
  }
  code {
    color: #9ad;
  }
</style>
