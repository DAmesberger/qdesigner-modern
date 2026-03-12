<script lang="ts">
  import { ArrowRight, Check, ShieldCheck } from 'lucide-svelte';

  const plans = [
    {
      name: 'Pilot',
      eyebrow: 'Validate a study',
      highlight: '14-day guided trial',
      description: 'Best for a single study team proving out the workflow before a wider rollout.',
      ctaLabel: 'Start trial',
      ctaHref: '/signup',
      featured: false,
      features: [
        'Designer, preview, and live run modes',
        'Offline-capable response collection',
        'Template reuse for early study iteration',
      ],
    },
    {
      name: 'Lab',
      eyebrow: 'Run ongoing programs',
      highlight: 'Best fit for active research groups',
      description:
        'The default plan for teams running multiple studies with operator review and cleaner governance.',
      ctaLabel: 'Talk to the team',
      ctaHref: '/demo',
      featured: true,
      features: [
        'Version history tied to every study release',
        'Shared libraries, comments, and review flows',
        'Analysis-ready exports for downstream tooling',
      ],
    },
    {
      name: 'Institution',
      eyebrow: 'Coordinate across departments',
      highlight: 'Custom onboarding and procurement',
      description:
        'For organizations that need governance, training, and secure handoffs across many projects.',
      ctaLabel: 'Plan rollout',
      ctaHref: '/company/contact',
      featured: false,
      features: [
        'Role-based access and approval workflows',
        'Storage, export, and retention controls',
        'Support for shared templates and operating standards',
      ],
    },
  ] as const;

  const assurances = [
    'No placeholder pricing cards or empty marketing blocks',
    'Clear paths for pilot teams, active labs, and larger institutions',
    'Procurement and security conversations are surfaced directly',
  ] as const;
</script>

<section class="py-24">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-3xl text-center">
      <div
        class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
      >
        <ShieldCheck class="h-4 w-4" />
        Plan structure
      </div>
      <h2 class="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Pricing now has real decision paths instead of another dead placeholder.
      </h2>
      <p class="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
        Not every visitor needs a number first. They need to understand which path matches a pilot,
        a lab, or an institution and what changes operationally at each level.
      </p>
    </div>

    <div class="mt-12 grid gap-6 xl:grid-cols-3">
      {#each plans as plan}
        <article
          class={`rounded-[32px] border p-6 shadow-sm shadow-slate-900/5 transition-transform hover:-translate-y-1 sm:p-8 ${
            plan.featured
              ? 'border-slate-950 bg-slate-950 text-white shadow-[0_30px_70px_-40px_rgba(15,23,42,0.8)] dark:border-white dark:bg-white dark:text-slate-950'
              : 'border-border bg-card/80 text-foreground'
          }`}
        >
          <p
            class={`text-sm font-semibold uppercase tracking-[0.28em] ${plan.featured ? 'text-slate-300 dark:text-slate-600' : 'text-muted-foreground'}`}
          >
            {plan.eyebrow}
          </p>
          <h3 class="mt-4 text-2xl font-semibold tracking-tight">{plan.name}</h3>
          <p
            class={`mt-2 text-sm font-medium ${plan.featured ? 'text-sky-300 dark:text-sky-700' : 'text-primary'}`}
          >
            {plan.highlight}
          </p>
          <p
            class={`mt-5 text-base leading-7 ${plan.featured ? 'text-slate-200 dark:text-slate-700' : 'text-muted-foreground'}`}
          >
            {plan.description}
          </p>

          <a
            href={plan.ctaHref}
            class={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-colors ${
              plan.featured
                ? 'bg-white text-slate-950 hover:bg-slate-100 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800'
                : 'bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
            }`}
          >
            {plan.ctaLabel}
            <ArrowRight class="h-4 w-4" />
          </a>

          <ul class="mt-8 space-y-4">
            {#each plan.features as feature}
              <li class="flex items-start gap-3 text-sm leading-6">
                <span
                  class={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    plan.featured
                      ? 'bg-white/10 text-emerald-300 dark:bg-slate-900/10 dark:text-emerald-600'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  <Check class="h-4 w-4" />
                </span>
                <span>{feature}</span>
              </li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>

    <div
      class="mt-10 rounded-[32px] border border-border bg-card/80 p-6 shadow-sm shadow-slate-900/5 sm:p-8"
    >
      <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div class="max-w-2xl">
          <p class="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            What every plan should communicate
          </p>
          <p class="mt-3 text-base leading-7 text-muted-foreground">
            Even if final commercial terms happen in procurement, the interface should still tell a
            team what kind of rollout they are considering and what they get operationally.
          </p>
        </div>

        <div class="space-y-3">
          {#each assurances as assurance}
            <div class="flex items-start gap-3 rounded-2xl bg-muted/40 px-4 py-3">
              <span
                class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              >
                <Check class="h-4 w-4" />
              </span>
              <p class="text-sm leading-6 text-foreground">{assurance}</p>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>
