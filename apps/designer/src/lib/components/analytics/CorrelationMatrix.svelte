<script lang="ts">
  import type { CorrelationMatrix } from '$lib/analytics/types';
  import { fade } from 'svelte/transition';
  
  export let matrix: CorrelationMatrix | null = null;
  export let showPValues: boolean = true;
  export let colorScale: 'diverging' | 'sequential' = 'diverging';
  
  function getCorrelationColor(value: number): string {
    if (isNaN(value)) return '#e5e7eb'; // gray-200
    
    if (colorScale === 'diverging') {
      // Red-White-Blue diverging scale
      if (value < 0) {
        const intensity = Math.abs(value);
        const r = 59 + (196 * intensity);
        const g = 130 + (125 * (1 - intensity));
        const b = 246;
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      } else {
        const intensity = value;
        const r = 239 + (16 * (1 - intensity));
        const g = 68 + (187 * (1 - intensity));
        const b = 68 + (187 * (1 - intensity));
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      }
    } else {
      // Sequential scale (white to blue)
      const intensity = Math.abs(value);
      const r = 255 - (255 - 59) * intensity;
      const g = 255 - (255 - 130) * intensity;
      const b = 255 - (255 - 246) * intensity;
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
  }
  
  function formatCorrelation(value: number): string {
    if (isNaN(value)) return '—';
    return value.toFixed(3);
  }
  
  function formatPValue(value: number): string {
    if (isNaN(value)) return '';
    if (value < 0.001) return '***';
    if (value < 0.01) return '**';
    if (value < 0.05) return '*';
    return '';
  }
  
  function getSignificanceLevel(pValue: number): string {
    if (isNaN(pValue)) return '';
    if (pValue < 0.001) return 'p < 0.001';
    if (pValue < 0.01) return 'p < 0.01';
    if (pValue < 0.05) return 'p < 0.05';
    return 'n.s.';
  }
</script>

<div class="correlation-matrix-container">
  {#if !matrix}
    <div class="empty-state">
      <span class="icon">📊</span>
      <p>No correlation data available</p>
    </div>
  {:else}
    <div class="matrix-wrapper" transition:fade>
      <div class="matrix-header">
        <h3>Correlation Matrix</h3>
        <div class="matrix-info">
          <span class="method">{matrix.method} correlation</span>
          <span class="variable-count">{matrix.variables.length} variables</span>
        </div>
      </div>
      
      <div class="matrix-scroll">
        <table class="correlation-table">
          <thead>
            <tr>
              <th class="variable-header"></th>
              {#each matrix.variables as variable, j}
                <th class="variable-header">
                  <div class="variable-name" title={variable}>
                    {variable}
                  </div>
                  <div class="variable-index">({j + 1})</div>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each matrix.variables as rowVar, i}
              <tr>
                <td class="variable-header">
                  <div class="variable-name" title={rowVar}>
                    {rowVar}
                  </div>
                  <div class="variable-index">({i + 1})</div>
                </td>
                {#each matrix.variables as colVar, j}
                  <td 
                    class="correlation-cell"
                    class:diagonal={i === j}
                    style="background-color: {getCorrelationColor(matrix.matrix[i][j])}"
                  >
                    <div class="cell-content">
                      <span class="correlation-value">
                        {formatCorrelation(matrix.matrix[i][j])}
                      </span>
                      {#if showPValues && matrix.pValues && i !== j}
                        <span class="significance">
                          {formatPValue(matrix.pValues[i][j])}
                        </span>
                      {/if}
                    </div>
                    {#if i !== j}
                      <div class="cell-tooltip">
                        <div>{rowVar} × {colVar}</div>
                        <div>r = {formatCorrelation(matrix.matrix[i][j])}</div>
                        {#if matrix.pValues}
                          <div>{getSignificanceLevel(matrix.pValues[i][j])}</div>
                        {/if}
                      </div>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      
      <div class="matrix-legend">
        <div class="legend-scale">
          <span class="scale-label">Correlation strength:</span>
          <div class="scale-gradient" />
          <div class="scale-values">
            <span>-1.0</span>
            <span>0</span>
            <span>+1.0</span>
          </div>
        </div>
        
        {#if showPValues}
          <div class="significance-legend">
            <span class="legend-label">Significance:</span>
            <span class="sig-item">*** p < 0.001</span>
            <span class="sig-item">** p < 0.01</span>
            <span class="sig-item">* p < 0.05</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .correlation-matrix-container {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
  }
  
  .empty-state .icon {
    font-size: 2.5rem;
    color: var(--color-gray-400);
    margin-bottom: 0.5rem;
  }
  
  .empty-state p {
    margin: 0;
    color: var(--color-gray-600);
    font-size: 0.875rem;
  }
  
  .matrix-wrapper {
    display: flex;
    flex-direction: column;
  }
  
  .matrix-header {
    padding: 1rem 1.5rem;
    background: var(--color-gray-50);
    border-bottom: 1px solid var(--color-gray-200);
  }
  
  .matrix-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .matrix-info {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  .method {
    text-transform: capitalize;
  }
  
  .matrix-scroll {
    overflow: auto;
    max-height: 600px;
  }
  
  .correlation-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  
  .variable-header {
    position: sticky;
    background: white;
    border: 1px solid var(--color-gray-200);
    padding: 0.5rem;
    text-align: center;
    font-weight: 500;
  }
  
  thead .variable-header {
    top: 0;
    z-index: 2;
  }
  
  tbody .variable-header {
    left: 0;
    z-index: 1;
    text-align: left;
  }
  
  .variable-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-gray-700);
  }
  
  .variable-index {
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }
  
  .correlation-cell {
    border: 1px solid var(--color-gray-200);
    padding: 0.5rem;
    text-align: center;
    position: relative;
    cursor: default;
  }
  
  .correlation-cell.diagonal {
    background: var(--color-gray-100) !important;
    cursor: not-allowed;
  }
  
  .cell-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
  }
  
  .correlation-value {
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .significance {
    font-size: 0.75rem;
    color: var(--color-red-600);
    font-weight: 700;
  }
  
  .cell-tooltip {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-gray-900);
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    z-index: 10;
    margin-top: 0.25rem;
  }
  
  .correlation-cell:hover .cell-tooltip {
    opacity: 1;
  }
  
  .matrix-legend {
    padding: 1rem 1.5rem;
    background: var(--color-gray-50);
    border-top: 1px solid var(--color-gray-200);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1.5rem;
  }
  
  .legend-scale {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .scale-label,
  .legend-label {
    font-size: 0.875rem;
    color: var(--color-gray-600);
    font-weight: 500;
  }
  
  .scale-gradient {
    width: 200px;
    height: 20px;
    background: linear-gradient(
      to right,
      rgb(59, 130, 246),
      rgb(147, 197, 246),
      white,
      rgb(252, 165, 165),
      rgb(239, 68, 68)
    );
    border-radius: 0.25rem;
    border: 1px solid var(--color-gray-300);
  }
  
  .scale-values {
    display: flex;
    justify-content: space-between;
    width: 200px;
    font-size: 0.75rem;
    color: var(--color-gray-600);
    position: absolute;
    margin-top: 1.5rem;
  }
  
  .significance-legend {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .sig-item {
    font-size: 0.75rem;
    color: var(--color-gray-600);
  }
  
  @media (max-width: 768px) {
    .matrix-scroll {
      max-height: 400px;
    }
    
    .matrix-legend {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>