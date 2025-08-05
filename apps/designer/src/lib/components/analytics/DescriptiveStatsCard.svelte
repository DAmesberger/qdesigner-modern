<script lang="ts">
  import type { DescriptiveStats } from '$lib/analytics/types';
  import { fade } from 'svelte/transition';
  
  export let stats: DescriptiveStats | null = null;
  export let title: string = 'Descriptive Statistics';
  export let loading: boolean = false;
  export let error: string | null = null;
  
  function formatNumber(value: number): string {
    if (isNaN(value)) return 'N/A';
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(3);
  }
  
  function formatPercent(value: number): string {
    if (isNaN(value)) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  }
  
  function getSkewnessInterpretation(skewness: number): { label: string; color: string } {
    const absSkew = Math.abs(skewness);
    if (absSkew < 0.5) return { label: 'Approximately symmetric', color: 'green' };
    if (absSkew < 1) return { label: 'Moderately skewed', color: 'yellow' };
    return { label: 'Highly skewed', color: 'red' };
  }
  
  function getKurtosisInterpretation(kurtosis: number): { label: string; color: string } {
    if (Math.abs(kurtosis) < 0.5) return { label: 'Mesokurtic (normal)', color: 'green' };
    if (kurtosis > 0.5) return { label: 'Leptokurtic (heavy tails)', color: 'yellow' };
    return { label: 'Platykurtic (light tails)', color: 'yellow' };
  }
</script>

<div class="stats-card">
  <div class="card-header">
    <h3>{title}</h3>
    {#if stats}
      <span class="sample-size">n = {stats.n}</span>
    {/if}
  </div>
  
  <div class="card-content">
    {#if loading}
      <div class="loading" transition:fade={{ duration: 200 }}>
        <div class="spinner" />
        <p>Calculating statistics...</p>
      </div>
    {:else if error}
      <div class="error" transition:fade={{ duration: 200 }}>
        <span class="icon">⚠️</span>
        <p>{error}</p>
      </div>
    {:else if !stats || stats.n === 0}
      <div class="empty" transition:fade={{ duration: 200 }}>
        <span class="icon">📊</span>
        <p>No data available yet</p>
      </div>
    {:else}
      <div class="stats-grid" transition:fade={{ duration: 200 }}>
        <!-- Central Tendency -->
        <div class="stat-group">
          <h4>Central Tendency</h4>
          <div class="stat-items">
            <div class="stat-item">
              <span class="label">Mean</span>
              <span class="value">{formatNumber(stats.mean)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Median</span>
              <span class="value">{formatNumber(stats.median)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Mode</span>
              <span class="value">
                {#if Array.isArray(stats.mode)}
                  {stats.mode.map(formatNumber).join(', ')}
                {:else}
                  {formatNumber(stats.mode)}
                {/if}
              </span>
            </div>
          </div>
        </div>
        
        <!-- Variability -->
        <div class="stat-group">
          <h4>Variability</h4>
          <div class="stat-items">
            <div class="stat-item">
              <span class="label">Std Dev</span>
              <span class="value">{formatNumber(stats.std)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Variance</span>
              <span class="value">{formatNumber(stats.variance)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Range</span>
              <span class="value">{formatNumber(stats.range)}</span>
            </div>
            <div class="stat-item">
              <span class="label">IQR</span>
              <span class="value">
                {formatNumber(stats.percentiles.p75 - stats.percentiles.p25)}
              </span>
            </div>
          </div>
        </div>
        
        <!-- Distribution Shape -->
        <div class="stat-group">
          <h4>Distribution Shape</h4>
          <div class="stat-items">
            <div class="stat-item">
              <span class="label">Skewness</span>
              <span class="value">
                {formatNumber(stats.skewness)}
                {@const interpretation = getSkewnessInterpretation(stats.skewness)}
                <span class="interpretation {interpretation.color}">
                  ({interpretation.label})
                </span>
              </span>
            </div>
            <div class="stat-item">
              <span class="label">Kurtosis</span>
              <span class="value">
                {formatNumber(stats.kurtosis)}
                {@const interpretation = getKurtosisInterpretation(stats.kurtosis)}
                <span class="interpretation {interpretation.color}">
                  ({interpretation.label})
                </span>
              </span>
            </div>
          </div>
        </div>
        
        <!-- Percentiles -->
        <div class="stat-group">
          <h4>Percentiles</h4>
          <div class="stat-items">
            <div class="stat-item">
              <span class="label">Min</span>
              <span class="value">{formatNumber(stats.min)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Q1 (25%)</span>
              <span class="value">{formatNumber(stats.percentiles.p25)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Q2 (50%)</span>
              <span class="value">{formatNumber(stats.percentiles.p50)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Q3 (75%)</span>
              <span class="value">{formatNumber(stats.percentiles.p75)}</span>
            </div>
            <div class="stat-item">
              <span class="label">90%</span>
              <span class="value">{formatNumber(stats.percentiles.p90)}</span>
            </div>
            <div class="stat-item">
              <span class="label">95%</span>
              <span class="value">{formatNumber(stats.percentiles.p95)}</span>
            </div>
            <div class="stat-item">
              <span class="label">99%</span>
              <span class="value">{formatNumber(stats.percentiles.p99)}</span>
            </div>
            <div class="stat-item">
              <span class="label">Max</span>
              <span class="value">{formatNumber(stats.max)}</span>
            </div>
          </div>
        </div>
        
        <!-- Confidence Interval -->
        <div class="stat-group full-width">
          <h4>95% Confidence Interval</h4>
          <div class="ci-display">
            <span class="ci-value">[{formatNumber(stats.ci95[0])}, {formatNumber(stats.ci95[1])}]</span>
            <span class="ci-interpretation">
              We are 95% confident the true mean lies within this interval
            </span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .stats-card {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: var(--color-gray-50);
    border-bottom: 1px solid var(--color-gray-200);
  }
  
  .card-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .sample-size {
    font-size: 0.875rem;
    color: var(--color-gray-600);
    font-weight: 500;
  }
  
  .card-content {
    padding: 1.5rem;
  }
  
  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
  }
  
  .loading .spinner {
    width: 3rem;
    height: 3rem;
    border: 3px solid var(--color-gray-200);
    border-top-color: var(--color-blue-500);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .loading p,
  .error p,
  .empty p {
    margin: 1rem 0 0 0;
    color: var(--color-gray-600);
    font-size: 0.875rem;
  }
  
  .icon {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }
  
  .error .icon {
    color: var(--color-red-500);
  }
  
  .empty .icon {
    color: var(--color-gray-400);
  }
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
  }
  
  .stat-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .stat-group.full-width {
    grid-column: 1 / -1;
  }
  
  .stat-group h4 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .stat-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0;
    border-bottom: 1px solid var(--color-gray-100);
  }
  
  .stat-item:last-child {
    border-bottom: none;
  }
  
  .stat-item .label {
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  .stat-item .value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .interpretation {
    font-size: 0.75rem;
    font-weight: 400;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }
  
  .interpretation.green {
    background: var(--color-green-100);
    color: var(--color-green-700);
  }
  
  .interpretation.yellow {
    background: var(--color-yellow-100);
    color: var(--color-yellow-700);
  }
  
  .interpretation.red {
    background: var(--color-red-100);
    color: var(--color-red-700);
  }
  
  .ci-display {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--color-blue-50);
    border-radius: 0.375rem;
  }
  
  .ci-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-blue-900);
  }
  
  .ci-interpretation {
    font-size: 0.875rem;
    color: var(--color-blue-700);
  }
  
  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>