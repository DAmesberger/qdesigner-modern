<script lang="ts">
  import type {
    ScoreInterpretation,
    NormativeComparison,
    ConfidenceInterval,
    SubscaleScore,
    FeedbackConfig,
  } from '$lib/analytics/ScoreInterpreter';

  interface Props {
    overallScore: number;
    maxScore: number;
    subscaleScores?: SubscaleScore[];
    interpretation?: ScoreInterpretation;
    normativeComparison?: NormativeComparison;
    confidenceInterval?: ConfidenceInterval;
    feedbackConfig: FeedbackConfig;
  }

  let {
    overallScore,
    maxScore,
    subscaleScores = [],
    interpretation,
    normativeComparison,
    confidenceInterval,
    feedbackConfig,
  }: Props = $props();

  const percentage = $derived(maxScore > 0 ? (overallScore / maxScore) * 100 : 0);
</script>

<section
  class="w-full max-w-2xl mx-auto space-y-6"
  aria-label="Questionnaire feedback"
  data-testid="feedback-panel"
>
  <!-- Overall Score -->
  {#if feedbackConfig.showOverallScore}
    <div
      class="rounded-lg border border-border bg-card p-6"
      data-testid="feedback-overall"
    >
      <h2 class="text-lg font-semibold text-foreground mb-4">Overall Score</h2>

      <div class="flex items-baseline gap-2 mb-3">
        <span class="text-3xl font-bold text-foreground">{overallScore}</span>
        <span class="text-muted-foreground">/ {maxScore}</span>
        <span class="ml-auto text-lg font-medium text-muted-foreground">
          {percentage.toFixed(1)}%
        </span>
      </div>

      <!-- Progress bar -->
      <div
        class="h-3 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={overallScore}
        aria-valuemin={0}
        aria-valuemax={maxScore}
        aria-label="Overall score: {overallScore} out of {maxScore}"
      >
        <div
          class="h-full rounded-full transition-all duration-500"
          style="width: {Math.min(percentage, 100)}%; background-color: {interpretation?.color ?? '#3b82f6'};"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Score Interpretation -->
  {#if feedbackConfig.showInterpretation && interpretation}
    <div
      class="rounded-lg border border-border bg-card p-6"
      data-testid="feedback-interpretation"
    >
      <h2 class="text-lg font-semibold text-foreground mb-3">Interpretation</h2>

      <div class="flex items-center gap-3 mb-2">
        <span
          class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
          style="background-color: {interpretation.color};"
          role="status"
        >
          {interpretation.label}
        </span>
      </div>

      <p class="text-sm text-muted-foreground leading-relaxed">
        {interpretation.description}
      </p>
    </div>
  {/if}

  <!-- Subscale Scores -->
  {#if feedbackConfig.showSubscales && subscaleScores.length > 0}
    <div
      class="rounded-lg border border-border bg-card p-6"
      data-testid="feedback-subscales"
    >
      <h2 class="text-lg font-semibold text-foreground mb-4">Subscale Scores</h2>

      <ul class="space-y-4" aria-label="Subscale scores">
        {#each subscaleScores as sub (sub.name)}
          {@const subPct = sub.maxScore > 0 ? (sub.score / sub.maxScore) * 100 : 0}
          <li>
            <div class="flex justify-between items-baseline mb-1">
              <span class="text-sm font-medium text-foreground">{sub.name}</span>
              <span class="text-sm text-muted-foreground">
                {sub.score} / {sub.maxScore}
                {#if sub.interpretation}
                  <span
                    class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style="background-color: {sub.interpretation.color};"
                  >
                    {sub.interpretation.label}
                  </span>
                {/if}
              </span>
            </div>
            <div
              class="h-2 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={sub.score}
              aria-valuemin={0}
              aria-valuemax={sub.maxScore}
              aria-label="{sub.name}: {sub.score} out of {sub.maxScore}"
            >
              <div
                class="h-full rounded-full transition-all duration-500"
                style="width: {Math.min(subPct, 100)}%; background-color: {sub.interpretation?.color ?? '#3b82f6'};"
              ></div>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Percentile Rank -->
  {#if feedbackConfig.showPercentile && normativeComparison}
    <div
      class="rounded-lg border border-border bg-card p-6"
      data-testid="feedback-percentile"
    >
      <h2 class="text-lg font-semibold text-foreground mb-4">
        Normative Comparison
      </h2>

      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4 text-center">
        <div>
          <p class="text-2xl font-bold text-foreground">
            {normativeComparison.percentileRank.toFixed(1)}
          </p>
          <p class="text-xs text-muted-foreground mt-1">Percentile</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-foreground">
            {normativeComparison.zScore.toFixed(2)}
          </p>
          <p class="text-xs text-muted-foreground mt-1">Z-Score</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-foreground">
            {normativeComparison.tScore.toFixed(1)}
          </p>
          <p class="text-xs text-muted-foreground mt-1">T-Score</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-foreground">
            {normativeComparison.stanine}
          </p>
          <p class="text-xs text-muted-foreground mt-1">Stanine</p>
        </div>
      </div>

      <p class="mt-4 text-sm text-center font-medium text-muted-foreground">
        Classification:
        <span class="text-foreground">{normativeComparison.classification}</span>
      </p>

      <!-- Percentile position bar -->
      <div class="mt-4" aria-label="Percentile rank visualization">
        <div class="relative h-4 w-full rounded-full bg-muted overflow-hidden">
          <!-- Gradient background representing distribution -->
          <div
            class="absolute inset-0 rounded-full"
            style="background: linear-gradient(to right, #3b82f6, #8b5cf6, #ec4899);"
          ></div>
          <!-- Marker -->
          <div
            class="absolute top-0 h-full w-1 bg-foreground rounded-full"
            style="left: {Math.max(0, Math.min(normativeComparison.percentileRank, 100))}%;"
            role="img"
            aria-label="Your percentile rank: {normativeComparison.percentileRank.toFixed(1)}"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0th</span>
          <span>50th</span>
          <span>100th</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Confidence Interval -->
  {#if feedbackConfig.showConfidenceInterval && confidenceInterval}
    <div
      class="rounded-lg border border-border bg-card p-6"
      data-testid="feedback-ci"
    >
      <h2 class="text-lg font-semibold text-foreground mb-3">
        Confidence Interval ({(confidenceInterval.confidence * 100).toFixed(0)}%)
      </h2>

      <p class="text-sm text-muted-foreground mb-4">
        Your true score is estimated to fall between
        <span class="font-semibold text-foreground">{confidenceInterval.lower.toFixed(2)}</span>
        and
        <span class="font-semibold text-foreground">{confidenceInterval.upper.toFixed(2)}</span>
        (SEM = {confidenceInterval.sem.toFixed(2)}).
      </p>

      <!-- CI visualization -->
      {#if confidenceInterval.upper - confidenceInterval.lower > 0}
        {@const ciRange = confidenceInterval.upper - confidenceInterval.lower}
        {@const displayMin = confidenceInterval.lower - ciRange * 0.3}
        {@const displayMax = confidenceInterval.upper + ciRange * 0.3}
        {@const displaySpan = displayMax - displayMin}
        <div class="relative h-8" aria-label="Confidence interval visualization">
          <!-- Track -->
          <div class="absolute top-3 left-0 right-0 h-2 rounded-full bg-muted"></div>
          <!-- CI range -->
          <div
            class="absolute top-3 h-2 rounded-full bg-primary/20"
            style="left: {((confidenceInterval.lower - displayMin) / displaySpan) * 100}%; width: {(ciRange / displaySpan) * 100}%;"
          ></div>
          <!-- Score marker -->
          <div
            class="absolute top-1 w-3 h-6 rounded bg-primary"
            style="left: calc({((overallScore - displayMin) / displaySpan) * 100}% - 6px);"
            role="img"
            aria-label="Your score: {overallScore}"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{confidenceInterval.lower.toFixed(1)}</span>
          <span>{overallScore.toFixed(1)}</span>
          <span>{confidenceInterval.upper.toFixed(1)}</span>
        </div>
      {/if}
    </div>
  {/if}
</section>
