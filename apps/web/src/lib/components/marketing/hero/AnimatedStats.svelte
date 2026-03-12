<script lang="ts">
  const stats = [
    { value: '120+', label: 'FPS Support' },
    { value: '<1 ms', label: 'Time Accuracy' },
    { value: '99.9%', label: 'Uptime SLA' },
    { value: '500k+', label: 'Data Points/Sec' },
  ] as const;
</script>

<div id="animated-stats" class="mt-8 sm:mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
  {#each stats as stat}
    <div class="text-center lg:text-left">
      <p class="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</p>
      <p class="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">{stat.label}</p>
    </div>
  {/each}
</div>
