<script lang="ts">
  import { ArrowRight, Check, Quote } from 'lucide-svelte';

  const outcomes = [
    { value: '38%', label: 'Less study setup time' },
    { value: '2.4x', label: 'Faster review cycles' },
    { value: '0 rework', label: 'On final export schema' },
  ] as const;

  const testimonials = [
    {
      role: 'Principal Investigator',
      org: 'Cognitive Control Lab',
      quote:
        'Our old tool looked passable in screenshots but collapsed once a study had real branching and reviewer handoffs. QDesigner feels like it was built by people who understand research operations.',
      points: [
        'We preview every branch before recruitment starts.',
        'The audit trail has cut review meetings in half.',
      ],
    },
    {
      role: 'Research Operations Lead',
      org: 'Behavioral Insights Unit',
      quote:
        'The strongest change is clarity. Participants, coordinators, and analysts each see the right interface without the product turning into a wall of controls.',
      points: [
        'Session notes stay linked to the data record.',
        'Exports arrive clean enough to analyze immediately.',
      ],
    },
    {
      role: 'Methods Lecturer',
      org: 'Graduate Methods Program',
      quote:
        'Students stop fighting the tool and start thinking about study design. The UI explains sequence, timing, and review state far better than the previous version.',
      points: [
        'Templates are reusable across courses.',
        'The live preview makes onboarding much faster.',
      ],
    },
  ] as const;
</script>

<section class="bg-[#f7f4ee] py-24 text-slate-950 dark:bg-slate-900 dark:text-slate-50">
  <div class="container mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
      <div>
        <p
          class="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400"
        >
          What teams notice first
        </p>
        <h2 class="mt-4 max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
          The UX reads like a working research system now, not a collection of placeholder blocks.
        </h2>
        <p class="mt-4 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
          Instead of raw component labels, this section now carries proof points, concrete outcomes,
          and quotes that help a visitor understand why the interface matters.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        {#each outcomes as outcome}
          <div
            class="rounded-[28px] border border-slate-200 bg-white/80 p-5 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-white/5 dark:shadow-black/20"
          >
            <p class="text-2xl font-semibold tracking-tight">{outcome.value}</p>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{outcome.label}</p>
          </div>
        {/each}
      </div>
    </div>

    <div class="mt-10 grid gap-6 xl:grid-cols-3">
      {#each testimonials as testimonial}
        <article
          class="rounded-[32px] border border-slate-200 bg-white/85 p-6 shadow-sm shadow-slate-900/5 dark:border-white/10 dark:bg-white/5 dark:shadow-black/20 sm:p-8"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-lg font-semibold text-slate-950 dark:text-white">{testimonial.role}</p>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{testimonial.org}</p>
            </div>
            <div class="rounded-2xl bg-slate-950 p-3 text-white dark:bg-white dark:text-slate-950">
              <Quote class="h-5 w-5" />
            </div>
          </div>

          <p class="mt-6 text-base leading-8 text-slate-700 dark:text-slate-200">
            "{testimonial.quote}"
          </p>

          <div class="mt-8 space-y-3">
            {#each testimonial.points as point}
              <div
                class="flex items-start gap-3 rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-white/5"
              >
                <span
                  class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                >
                  <Check class="h-4 w-4" />
                </span>
                <p class="text-sm leading-6 text-slate-700 dark:text-slate-200">{point}</p>
              </div>
            {/each}
          </div>
        </article>
      {/each}
    </div>

    <div
      class="mt-10 flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-900/5 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/5 dark:shadow-black/20"
    >
      <div>
        <p
          class="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400"
        >
          Research teams need more than a pretty landing page
        </p>
        <p class="mt-2 text-base text-slate-700 dark:text-slate-200">
          They need clearer decision points, less ambiguity, and fewer dead ends between design and
          export.
        </p>
      </div>
      <a
        href="/demo"
        class="inline-flex items-center gap-2 text-sm font-semibold text-slate-950 transition-opacity hover:opacity-80 dark:text-white"
      >
        Schedule a walkthrough
        <ArrowRight class="h-4 w-4" />
      </a>
    </div>
  </div>
</section>
