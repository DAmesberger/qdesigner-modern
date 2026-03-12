<script lang="ts">
  const researchSegments = [
    {
      name: 'Behavioral Science Labs',
      mark: 'BS',
      description: 'Reaction-time, longitudinal, and in-lab studies',
    },
    {
      name: 'Clinical Research Units',
      mark: 'CR',
      description: 'Consent flows, screening gates, and compliance',
    },
    {
      name: 'Public Universities',
      mark: 'PU',
      description: 'Department-wide templates and shared governance',
    },
    {
      name: 'Learning Science Teams',
      mark: 'LS',
      description: 'Course feedback, experiments, and cohort analysis',
    },
    {
      name: 'Field Research Programs',
      mark: 'FR',
      description: 'Offline collection with delayed sync and review',
    },
    {
      name: 'Product Insight Groups',
      mark: 'PI',
      description: 'Usability studies and mixed-methods panels',
    },
  ] as const;

  const footprintStats = [
    { value: '500+', label: 'Research teams' },
    { value: '2M+', label: 'Responses captured' },
    { value: '50+', label: 'Countries covered' },
  ] as const;
</script>

<section class="border-y border-border bg-white/75 py-12 backdrop-blur dark:bg-card/60">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
      <div class="max-w-2xl">
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Built for modern research programs
        </p>
        <h2 class="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Structured for the teams that need precise data, reusable workflows, and clean handoffs.
        </h2>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each researchSegments as segment}
          <div
            class="flex items-center gap-4 rounded-2xl border border-border/80 bg-background/80 p-4 shadow-sm shadow-slate-900/5"
          >
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold tracking-[0.24em] text-white dark:bg-white dark:text-slate-950"
            >
              {segment.mark}
            </div>
            <div>
              <p class="text-sm font-semibold text-foreground">{segment.name}</p>
              <p class="mt-1 text-xs leading-5 text-muted-foreground">
                {segment.description}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div
      class="mt-8 grid gap-4 rounded-[28px] border border-border/80 bg-background/70 p-5 shadow-sm shadow-slate-900/5 sm:grid-cols-3 sm:p-6"
    >
      {#each footprintStats as stat}
        <div class="rounded-2xl border border-border/70 bg-muted/40 p-4 text-center">
          <p class="text-2xl font-semibold tracking-tight text-foreground">{stat.value}</p>
          <p class="mt-1 text-sm text-muted-foreground">{stat.label}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
