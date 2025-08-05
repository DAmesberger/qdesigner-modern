<script lang="ts">
  import { FormulaEvaluator, type EvaluationResult, type Variable } from '@qdesigner/scripting-engine';
  import { fade, slide } from 'svelte/transition';
  
  export let formula: string = '';
  export let variables: Map<string, Variable> = new Map();
  export let showSteps: boolean = true;
  export let showDependencies: boolean = true;
  export let showPerformance: boolean = true;
  
  interface DebugStep {
    step: number;
    description: string;
    expression: string;
    result: any;
    type: 'parse' | 'variable' | 'function' | 'operation' | 'final';
    timestamp: number;
  }
  
  interface DebugInfo {
    steps: DebugStep[];
    dependencies: string[];
    errors: string[];
    warnings: string[];
    executionTime: number;
    memoryUsed?: number;
  }
  
  let debugInfo: DebugInfo | null = null;
  let evaluator: FormulaEvaluator;
  let isDebugging = false;
  let expandedSteps: Set<number> = new Set();
  
  $: {
    evaluator = new FormulaEvaluator({
      variables,
      currentTime: Date.now()
    });
  }
  
  async function debugFormula() {
    if (!formula || !formula.startsWith('=')) {
      debugInfo = null;
      return;
    }
    
    isDebugging = true;
    const startTime = performance.now();
    const steps: DebugStep[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    let stepCounter = 0;
    
    try {
      // Step 1: Parse formula
      steps.push({
        step: ++stepCounter,
        description: 'Parse formula',
        expression: formula,
        result: formula.substring(1), // Remove '='
        type: 'parse',
        timestamp: performance.now() - startTime
      });
      
      // Step 2: Identify variables
      const variablePattern = /\b([A-Za-z_]\w*)\b(?!\s*\()/g;
      const foundVariables: string[] = [];
      let match;
      
      while ((match = variablePattern.exec(formula)) !== null) {
        const varName = match[1];
        const variable = variables.get(varName);
        
        if (variable) {
          foundVariables.push(varName);
          steps.push({
            step: ++stepCounter,
            description: `Resolve variable: ${varName}`,
            expression: varName,
            result: variable.value,
            type: 'variable',
            timestamp: performance.now() - startTime
          });
        } else {
          warnings.push(`Unknown variable: ${varName}`);
        }
      }
      
      // Step 3: Evaluate functions
      const functionPattern = /\b([A-Z_]+)\s*\(([^()]*)\)/g;
      const formulaCopy = formula;
      
      while ((match = functionPattern.exec(formulaCopy)) !== null) {
        const funcName = match[1];
        const args = match[2];
        
        steps.push({
          step: ++stepCounter,
          description: `Evaluate function: ${funcName}`,
          expression: match[0],
          result: `${funcName}(${args})`, // Simplified
          type: 'function',
          timestamp: performance.now() - startTime
        });
      }
      
      // Step 4: Final evaluation
      const result = evaluator.evaluate(formula);
      
      steps.push({
        step: ++stepCounter,
        description: 'Final result',
        expression: formula,
        result: result.value,
        type: 'final',
        timestamp: performance.now() - startTime
      });
      
      if (result.error) {
        errors.push(result.error);
      }
      
      // Check for potential issues
      if (foundVariables.length === 0 && formula.length > 1) {
        warnings.push('No variables used in formula');
      }
      
      if (result.executionTime && result.executionTime > 100) {
        warnings.push(`Slow formula execution: ${result.executionTime.toFixed(2)}ms`);
      }
      
      debugInfo = {
        steps,
        dependencies: result.dependencies || foundVariables,
        errors,
        warnings,
        executionTime: performance.now() - startTime
      };
      
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      debugInfo = {
        steps,
        dependencies: [],
        errors,
        warnings,
        executionTime: performance.now() - startTime
      };
    } finally {
      isDebugging = false;
    }
  }
  
  function toggleStep(stepIndex: number) {
    if (expandedSteps.has(stepIndex)) {
      expandedSteps.delete(stepIndex);
    } else {
      expandedSteps.add(stepIndex);
    }
    expandedSteps = expandedSteps;
  }
  
  function formatValue(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }
  
  function getStepIcon(type: DebugStep['type']): string {
    switch (type) {
      case 'parse': return '📝';
      case 'variable': return '📊';
      case 'function': return '🔧';
      case 'operation': return '⚙️';
      case 'final': return '✅';
      default: return '•';
    }
  }
  
  $: if (formula) {
    debugFormula();
  }
</script>

<div class="formula-debugger">
  <div class="debugger-header">
    <h3>Formula Debugger</h3>
    <div class="debugger-actions">
      <button
        class="debug-button"
        on:click={debugFormula}
        disabled={isDebugging || !formula}
      >
        {#if isDebugging}
          <span class="spinner"></span>
          Debugging...
        {:else}
          🐛 Debug
        {/if}
      </button>
    </div>
  </div>
  
  {#if debugInfo}
    <div class="debug-content" transition:fade>
      {#if debugInfo.errors.length > 0}
        <div class="debug-section errors" transition:slide>
          <h4>❌ Errors</h4>
          <ul>
            {#each debugInfo.errors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </div>
      {/if}
      
      {#if debugInfo.warnings.length > 0}
        <div class="debug-section warnings" transition:slide>
          <h4>⚠️ Warnings</h4>
          <ul>
            {#each debugInfo.warnings as warning}
              <li>{warning}</li>
            {/each}
          </ul>
        </div>
      {/if}
      
      {#if showSteps && debugInfo.steps.length > 0}
        <div class="debug-section steps">
          <h4>📋 Execution Steps</h4>
          <div class="steps-list">
            {#each debugInfo.steps as step, index}
              <div 
                class="step-item"
                class:expanded={expandedSteps.has(index)}
              >
                <button
                  class="step-header"
                  on:click={() => toggleStep(index)}
                >
                  <span class="step-number">#{step.step}</span>
                  <span class="step-icon">{getStepIcon(step.type)}</span>
                  <span class="step-description">{step.description}</span>
                  <span class="step-time">+{step.timestamp.toFixed(2)}ms</span>
                </button>
                
                {#if expandedSteps.has(index)}
                  <div class="step-details" transition:slide>
                    <div class="detail-row">
                      <span class="detail-label">Expression:</span>
                      <code class="detail-value">{step.expression}</code>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Result:</span>
                      <code class="detail-value">{formatValue(step.result)}</code>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Type:</span>
                      <span class="detail-value type-{step.type}">{step.type}</span>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      {#if showDependencies && debugInfo.dependencies.length > 0}
        <div class="debug-section dependencies">
          <h4>🔗 Dependencies</h4>
          <div class="dependency-list">
            {#each debugInfo.dependencies as dep}
              <div class="dependency-item">
                <span class="dep-name">{dep}</span>
                <span class="dep-value">
                  = {formatValue(variables.get(dep)?.value)}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      {#if showPerformance}
        <div class="debug-section performance">
          <h4>⚡ Performance</h4>
          <div class="performance-stats">
            <div class="stat-item">
              <span class="stat-label">Total execution time:</span>
              <span class="stat-value">{debugInfo.executionTime.toFixed(2)}ms</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Steps executed:</span>
              <span class="stat-value">{debugInfo.steps.length}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Variables used:</span>
              <span class="stat-value">{debugInfo.dependencies.length}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {:else if formula}
    <div class="empty-state">
      <p>Click "Debug" to analyze the formula</p>
    </div>
  {:else}
    <div class="empty-state">
      <p>Enter a formula to debug</p>
    </div>
  {/if}
</div>

<style>
  .formula-debugger {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .debugger-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--color-gray-50);
    border-bottom: 1px solid var(--color-gray-200);
  }
  
  .debugger-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .debug-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-blue-500);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .debug-button:hover:not(:disabled) {
    background: var(--color-blue-600);
  }
  
  .debug-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .debug-content {
    padding: 1rem;
  }
  
  .debug-section {
    margin-bottom: 1.5rem;
  }
  
  .debug-section:last-child {
    margin-bottom: 0;
  }
  
  .debug-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .errors {
    background: var(--color-red-50);
    padding: 1rem;
    border-radius: 0.375rem;
    border: 1px solid var(--color-red-200);
  }
  
  .errors h4 {
    color: var(--color-red-700);
  }
  
  .errors ul {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--color-red-600);
    font-size: 0.875rem;
  }
  
  .warnings {
    background: var(--color-yellow-50);
    padding: 1rem;
    border-radius: 0.375rem;
    border: 1px solid var(--color-yellow-200);
  }
  
  .warnings h4 {
    color: var(--color-yellow-700);
  }
  
  .warnings ul {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--color-yellow-600);
    font-size: 0.875rem;
  }
  
  .steps-list {
    border: 1px solid var(--color-gray-200);
    border-radius: 0.375rem;
    overflow: hidden;
  }
  
  .step-item {
    border-bottom: 1px solid var(--color-gray-100);
  }
  
  .step-item:last-child {
    border-bottom: none;
  }
  
  .step-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    background: white;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .step-header:hover {
    background: var(--color-gray-50);
  }
  
  .step-item.expanded .step-header {
    background: var(--color-blue-50);
  }
  
  .step-number {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-500);
  }
  
  .step-icon {
    font-size: 1rem;
  }
  
  .step-description {
    flex: 1;
    font-size: 0.875rem;
    color: var(--color-gray-700);
  }
  
  .step-time {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    font-family: 'Courier New', monospace;
  }
  
  .step-details {
    padding: 0.75rem;
    background: var(--color-gray-50);
    border-top: 1px solid var(--color-gray-200);
  }
  
  .detail-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }
  
  .detail-row:last-child {
    margin-bottom: 0;
  }
  
  .detail-label {
    font-weight: 500;
    color: var(--color-gray-600);
    min-width: 80px;
  }
  
  .detail-value {
    font-family: 'Courier New', monospace;
    color: var(--color-gray-800);
  }
  
  .detail-value.type-parse { color: var(--color-blue-600); }
  .detail-value.type-variable { color: var(--color-purple-600); }
  .detail-value.type-function { color: var(--color-green-600); }
  .detail-value.type-operation { color: var(--color-orange-600); }
  .detail-value.type-final { color: var(--color-gray-900); font-weight: 600; }
  
  .dependency-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .dependency-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-gray-50);
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  
  .dep-name {
    font-family: 'Courier New', monospace;
    font-weight: 600;
    color: var(--color-purple-600);
  }
  
  .dep-value {
    color: var(--color-gray-600);
    font-family: 'Courier New', monospace;
  }
  
  .performance-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--color-gray-50);
    border-radius: 0.375rem;
  }
  
  .stat-label {
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  .stat-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--color-gray-500);
    font-size: 0.875rem;
  }
</style>