<script lang="ts">
  import {
    ArrowRight,
    Check,
    Database,
    FileText,
    FlaskConical,
    MessageSquare,
    ShieldCheck,
  } from 'lucide-svelte';

  const pipelineGroups = [
    {
      title: 'Recruit and identify',
      icon: FlaskConical,
      description: 'Control participant intake before low-quality sessions reach the study.',
      items: [
        'Panel sources and email outreach',
        'Eligibility checks and locale routing',
        'Quota balancing by cohort',
      ],
    },
    {
      title: 'Capture and route',
      icon: MessageSquare,
      description: 'Keep responses, operator notes, and runtime telemetry tied together.',
      items: [
        'Offline-safe response storage',
        'Session comments and review flags',
        'Release-aware questionnaire history',
      ],
    },
    {
      title: 'Analyze and archive',
      icon: Database,
      description: 'Hand off clean datasets to downstream tools without rebuilding context.',
      items: [
        'Versioned exports for R, Python, and SPSS',
        'Webhooks, CSV drops, and JSON feeds',
        'Storage policies with audit metadata',
      ],
    },
  ] as const;

  const compatibilityChips = [
    'REST API',
    'CSV exports',
    'JSON payloads',
    'Warehouse sync',
    'SSO',
    'Role-based access',
    'S3-compatible storage',
    'Notifications',
    'Review queues',
  ] as const;
</script>

<section class="relative overflow-hidden bg-slate-950 py-24 text-slate-50">
  <div
    class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.18),transparent_30%)]"
  ></div>
  <div
    class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20 [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]"
  ></div>

  <div class="container relative mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
      <div>
        <div
          class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200"
        >
          <ShieldCheck class="h-4 w-4 text-emerald-300" />
          Operational ecosystem
        </div>

        <h2 class="mt-6 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          The interface now explains how studies move through your stack, not just what the product
          looks like.
        </h2>
        <p class="mt-4 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
          Researchers rarely work in a single screen. This section turns the previous placeholder
          into a clear picture of intake, collection, export, and governance.
        </p>

        <div class="mt-8 space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-emerald-400/15 p-2">
              <Check class="h-4 w-4 text-emerald-300" />
            </div>
            <div>
              <p class="font-semibold text-white">Fewer broken handoffs</p>
              <p class="mt-1 text-sm leading-6 text-slate-300">
                Version history, comments, and exports remain attached to the same study record.
              </p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-sky-400/15 p-2">
              <FileText class="h-4 w-4 text-sky-300" />
            </div>
            <div>
              <p class="font-semibold text-white">Clearer review loops</p>
              <p class="mt-1 text-sm leading-6 text-slate-300">
                Operators can annotate suspicious sessions before anything reaches analysis.
              </p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-violet-400/15 p-2">
              <Database class="h-4 w-4 text-violet-300" />
            </div>
            <div>
              <p class="font-semibold text-white">Research-ready exports</p>
              <p class="mt-1 text-sm leading-6 text-slate-300">
                Clean payloads reach your analysis tools without manual stitching or schema drift.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <div class="grid gap-4 xl:grid-cols-3">
          {#each pipelineGroups as group}
            <div class="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div class="flex items-center gap-3">
                <div class="rounded-2xl bg-white/10 p-3">
                  <group.icon class="h-5 w-5 text-white" />
                </div>
                <div>
                  <p class="text-sm font-medium text-slate-300">Workflow lane</p>
                  <h3 class="text-lg font-semibold text-white">{group.title}</h3>
                </div>
              </div>

              <p class="mt-4 text-sm leading-6 text-slate-300">{group.description}</p>

              <ul class="mt-5 space-y-3">
                {#each group.items as item}
                  <li class="flex items-start gap-3 text-sm leading-6 text-slate-200">
                    <span class="mt-1 h-2 w-2 rounded-full bg-sky-300"></span>
                    <span>{item}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>

        <div class="rounded-[28px] border border-white/10 bg-white/5 p-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-sm font-medium text-slate-300">Compatibility layer</p>
              <h3 class="mt-1 text-xl font-semibold text-white">
                Publish once, then route data wherever your study program needs it.
              </h3>
            </div>
            <a
              href="/resources/api-docs"
              class="inline-flex items-center gap-2 text-sm font-semibold text-sky-300 transition-opacity hover:opacity-80"
            >
              Review integration docs
              <ArrowRight class="h-4 w-4" />
            </a>
          </div>

          <div class="mt-6 flex flex-wrap gap-3">
            {#each compatibilityChips as chip}
              <span
                class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
              >
                {chip}
              </span>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
