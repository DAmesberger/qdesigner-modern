<script lang="ts">
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';

  let { children } = $props();
</script>

<div class="relative min-h-screen overflow-hidden bg-slate-100 text-foreground dark:bg-slate-950">
  <div
    class="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] bg-[size:72px_72px] opacity-50 [mask-image:radial-gradient(circle_at_center,black,transparent_76%)]"
  ></div>
  <div
    class="pointer-events-none absolute -left-24 top-16 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl"
  ></div>
  <div
    class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-transparent to-transparent dark:from-slate-900/70"
  ></div>

  <div
    class="fixed right-4 top-4 z-20 rounded-full border border-white/70 bg-white/75 p-1 shadow-lg shadow-slate-900/10 backdrop-blur dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/30"
  >
    <ThemeToggle />
  </div>

  <div class="relative">
    {@render children()}
  </div>
</div>
