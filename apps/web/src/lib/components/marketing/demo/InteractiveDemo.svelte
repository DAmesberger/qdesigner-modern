<script lang="ts">
  import {
    ArrowRight,
    BarChart3,
    Check,
    Clock,
    FileText,
    FlaskConical,
    FolderKanban,
    LayoutDashboard,
    Play,
    ShieldCheck,
  } from 'lucide-svelte';

  const demoViews = [
    {
      id: 'build',
      label: 'Protocol design',
      icon: FolderKanban,
      eyebrow: 'Build',
      title: 'Map complex study flows without opening a code editor',
      description:
        'Arrange consent, qualification, randomization, and follow-up logic in one workspace. Every branch stays visible, versioned, and easy to review.',
      bullets: [
        'Drag study screens, quotas, and branching rules into a single flow.',
        'Preview every branch before a participant sees it.',
        'Reuse proven blocks across studies and departments.',
      ],
      steps: [
        {
          title: 'Consent + screening',
          detail: 'Gate access by language, device, or eligibility.',
        },
        {
          title: 'Core task blocks',
          detail: 'Run reaction-time modules beside standard survey pages.',
        },
        {
          title: 'Quota + routing',
          detail: 'Balance cohorts and redirect overflow automatically.',
        },
      ],
      signals: [
        { value: '18 min', label: 'To configure a new pilot' },
        { value: '4 tabs', label: 'Design, preview, script, publish' },
      ],
    },
    {
      id: 'launch',
      label: 'Live operations',
      icon: FlaskConical,
      eyebrow: 'Launch',
      title: 'Watch active fieldwork and catch data quality issues early',
      description:
        'Operators can monitor completion rates, device health, and quota pressure in real time instead of waiting for exports after the study has drifted.',
      bullets: [
        'See drop-off points and latency spikes as sessions arrive.',
        'Pause or reroute recruitment when quotas skew.',
        'Keep comments, approvals, and audit context in the same record.',
      ],
      steps: [
        {
          title: 'Recruitment watch',
          detail: 'Track conversion by source, locale, and device profile.',
        },
        {
          title: 'Session quality',
          detail: 'Flag abandoned runs, timing anomalies, and duplicate patterns.',
        },
        { title: 'Team review', detail: 'Add notes before data reaches downstream reporting.' },
      ],
      signals: [
        { value: '99.9%', label: 'Observed uptime target' },
        { value: '<1 ms', label: 'Timing telemetry surfaced inline' },
      ],
    },
    {
      id: 'analyze',
      label: 'Data handoff',
      icon: BarChart3,
      eyebrow: 'Analyze',
      title: 'Move from collection to analysis without cleanup chaos',
      description:
        'Responses, device traces, and version history stay tied together so exported data remains interpretable long after a study closes.',
      bullets: [
        'Export analysis-ready datasets with version metadata attached.',
        'Compare cohorts without rebuilding context from notes and emails.',
        'Preserve the exact questionnaire revision behind each response.',
      ],
      steps: [
        {
          title: 'Versioned exports',
          detail: 'Keep schema history, comments, and release notes attached.',
        },
        {
          title: 'Live dashboards',
          detail: 'Surface performance summaries before the final export cycle.',
        },
        { title: 'Secure archive', detail: 'Hand off clean datasets with access controls intact.' },
      ],
      signals: [
        { value: 'CSV + JSON', label: 'Export-ready formats' },
        { value: 'Audit trail', label: 'Linked to every study revision' },
      ],
    },
  ] as const;

  const workspaceTags = [
    'Randomization',
    'Quota guardrails',
    'Device checks',
    'Version history',
  ] as const;

  let activeView = $state<(typeof demoViews)[number]['id']>(demoViews[0].id);
  const currentView = $derived(demoViews.find((view) => view.id === activeView) ?? demoViews[0]);
</script>

<section id="demo" class="py-24">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div>
        <div
          class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
        >
          <Play class="h-4 w-4" />
          Product walkthrough
        </div>

        <h2
          class="mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        >
          A better UI has to explain the workflow, not just decorate the page.
        </h2>
        <p class="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          This section now shows how QDesigner actually supports research teams: designing a study,
          running it confidently, and handing off clean data when fieldwork ends.
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          {#each demoViews as view}
            <button
              type="button"
              class={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                activeView === view.id
                  ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
              onclick={() => (activeView = view.id)}
            >
              <view.icon class="h-4 w-4" />
              {view.label}
            </button>
          {/each}
        </div>

        <div
          class="mt-8 rounded-[28px] border border-border bg-card/80 p-6 shadow-sm shadow-slate-900/5 sm:p-8"
        >
          <p class="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
            {currentView.eyebrow}
          </p>
          <h3 class="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {currentView.title}
          </h3>
          <p class="mt-4 text-base leading-7 text-muted-foreground">
            {currentView.description}
          </p>

          <ul class="mt-6 space-y-3">
            {#each currentView.bullets as bullet}
              <li class="flex items-start gap-3 text-sm leading-6 text-foreground">
                <span
                  class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                >
                  <Check class="h-4 w-4" />
                </span>
                <span>{bullet}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="relative">
        <div class="absolute -left-8 top-10 h-40 w-40 rounded-full bg-sky-500/15 blur-3xl"></div>
        <div
          class="absolute -right-10 bottom-8 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
        ></div>

        <div
          class="relative overflow-hidden rounded-[32px] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_32px_80px_-40px_rgba(15,23,42,0.85)] sm:p-6"
        >
          <div
            class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5"
          >
            <div>
              <p class="text-sm font-medium text-slate-300">Live workspace preview</p>
              <h3 class="mt-1 text-xl font-semibold text-white">{currentView.label}</h3>
            </div>
            <div class="flex flex-wrap gap-2">
              {#each workspaceTags as tag}
                <span
                  class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200"
                >
                  {tag}
                </span>
              {/each}
            </div>
          </div>

          <div class="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="rounded-2xl bg-white/10 p-2">
                    <LayoutDashboard class="h-5 w-5 text-sky-300" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-slate-300">Study journey</p>
                    <p class="text-base font-semibold text-white">
                      Review the full path at a glance
                    </p>
                  </div>
                </div>
                <div
                  class="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300"
                >
                  Ready for handoff
                </div>
              </div>

              <div class="mt-6 space-y-4">
                {#each currentView.steps as step, index}
                  <div class="flex gap-4">
                    <div class="flex flex-col items-center">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-slate-950"
                      >
                        {index + 1}
                      </div>
                      {#if index < currentView.steps.length - 1}
                        <div class="mt-3 h-full w-px flex-1 bg-white/15"></div>
                      {/if}
                    </div>
                    <div
                      class="min-h-[84px] flex-1 rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <p class="text-sm font-semibold text-white">{step.title}</p>
                      <p class="mt-2 text-sm leading-6 text-slate-300">{step.detail}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <div class="space-y-4">
              <div class="rounded-[28px] border border-white/10 bg-white p-5 text-slate-950">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-slate-500">Quality status</p>
                    <p class="mt-1 text-lg font-semibold">Session readiness overview</p>
                  </div>
                  <ShieldCheck class="h-5 w-5 text-emerald-600" />
                </div>

                <div class="mt-5 space-y-4">
                  <div class="rounded-2xl bg-slate-100 p-4">
                    <div class="flex items-center justify-between text-sm font-medium">
                      <span>Review cycle</span>
                      <span class="text-emerald-700">Passed</span>
                    </div>
                    <div class="mt-3 h-2 rounded-full bg-slate-200">
                      <div class="h-full w-[84%] rounded-full bg-emerald-500"></div>
                    </div>
                  </div>

                  <div class="grid gap-3">
                    {#each currentView.signals as signal}
                      <div class="rounded-2xl border border-slate-200 p-4">
                        <p class="text-2xl font-semibold tracking-tight text-slate-950">
                          {signal.value}
                        </p>
                        <p class="mt-1 text-sm leading-6 text-slate-600">{signal.label}</p>
                      </div>
                    {/each}
                  </div>
                </div>
              </div>

              <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p class="text-sm font-medium text-slate-300">Operator checklist</p>
                <div class="mt-4 space-y-3">
                  <div class="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                    <Clock class="h-4 w-4 text-sky-300" />
                    <span class="text-sm text-slate-200"
                      >Verify timing calibration before launch</span
                    >
                  </div>
                  <div class="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                    <FileText class="h-4 w-4 text-violet-300" />
                    <span class="text-sm text-slate-200"
                      >Attach release notes to the published revision</span
                    >
                  </div>
                  <div class="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                    <BarChart3 class="h-4 w-4 text-amber-300" />
                    <span class="text-sm text-slate-200">Monitor drop-off by device and cohort</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            class="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4"
          >
            <div class="flex items-center gap-3 text-sm text-slate-300">
              <div class="rounded-full bg-white/10 p-2">
                <FlaskConical class="h-4 w-4 text-white" />
              </div>
              See design, fieldwork, and analysis context in one place.
            </div>
            <a
              href="/signup"
              class="inline-flex items-center gap-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
            >
              Start with a trial
              <ArrowRight class="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
