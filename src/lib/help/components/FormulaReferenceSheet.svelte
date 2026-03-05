<script lang="ts">
  import { X, Search } from 'lucide-svelte';
  import { browser } from '$app/environment';

  interface Props {
    onclose?: () => void;
  }

  let { onclose }: Props = $props();

  interface FormulaParam {
    name: string;
    type: string;
    description: string;
    optional?: boolean;
    default?: unknown;
  }

  interface FormulaEntry {
    name: string;
    category: string;
    description: string;
    parameters: FormulaParam[];
    returns: string;
    example?: string;
  }

  type CategoryKey = 'math' | 'array' | 'text' | 'logical' | 'date' | 'stat' | 'psychometric' | 'irt';

  const categoryLabels: Record<CategoryKey, string> = {
    math: 'Math',
    array: 'Array',
    text: 'String',
    logical: 'Conditional',
    date: 'Time',
    stat: 'Statistical',
    psychometric: 'Psychometric',
    irt: 'IRT',
  };

  const categoryOrder: CategoryKey[] = ['math', 'logical', 'text', 'date', 'array', 'stat', 'psychometric', 'irt'];

  // Complete formula reference built from the scripting engine's actual functions
  const entries: FormulaEntry[] = [
    // Math
    { name: 'ABS', category: 'math', description: 'Returns the absolute value of a number.', parameters: [{ name: 'value', type: 'number', description: 'Number to get absolute value of' }], returns: 'number', example: 'ABS(-5)  // 5' },
    { name: 'ROUND', category: 'math', description: 'Rounds a number to the specified decimal places.', parameters: [{ name: 'value', type: 'number', description: 'Number to round' }, { name: 'decimals', type: 'number', description: 'Decimal places', optional: true, default: 0 }], returns: 'number', example: 'ROUND(3.456, 2)  // 3.46' },
    { name: 'SQRT', category: 'math', description: 'Returns the square root of a number.', parameters: [{ name: 'value', type: 'number', description: 'Non-negative number' }], returns: 'number', example: 'SQRT(16)  // 4' },
    { name: 'POW', category: 'math', description: 'Raises a base to an exponent.', parameters: [{ name: 'base', type: 'number', description: 'Base number' }, { name: 'exponent', type: 'number', description: 'Exponent' }], returns: 'number', example: 'POW(2, 8)  // 256' },
    { name: 'RANDOM', category: 'math', description: 'Returns a random number between 0 (inclusive) and 1 (exclusive). Supports reproducible sequences via randomSeed.', parameters: [], returns: 'number', example: 'RANDOM()  // 0.7241...' },
    { name: 'RANDINT', category: 'math', description: 'Returns a random integer between min and max (inclusive).', parameters: [{ name: 'min', type: 'number', description: 'Minimum value' }, { name: 'max', type: 'number', description: 'Maximum value' }], returns: 'number', example: 'RANDINT(1, 6)  // 4' },

    // Logical
    { name: 'IF', category: 'logical', description: 'Returns one value if a condition is true, another if false.', parameters: [{ name: 'condition', type: 'boolean', description: 'Condition to evaluate' }, { name: 'trueValue', type: 'any', description: 'Value when true' }, { name: 'falseValue', type: 'any', description: 'Value when false' }], returns: 'any', example: 'IF(score > 80, "Pass", "Fail")' },
    { name: 'AND', category: 'logical', description: 'Returns true if all arguments are truthy.', parameters: [{ name: 'values', type: '...boolean', description: 'Values to test' }], returns: 'boolean', example: 'AND(age >= 18, consent == true)' },
    { name: 'OR', category: 'logical', description: 'Returns true if any argument is truthy.', parameters: [{ name: 'values', type: '...boolean', description: 'Values to test' }], returns: 'boolean', example: 'OR(role == "admin", role == "editor")' },
    { name: 'NOT', category: 'logical', description: 'Negates a boolean value.', parameters: [{ name: 'value', type: 'boolean', description: 'Value to negate' }], returns: 'boolean', example: 'NOT(isComplete)' },

    // Text
    { name: 'CONCAT', category: 'text', description: 'Concatenates values into a single string.', parameters: [{ name: 'values', type: '...any', description: 'Values to join' }], returns: 'string', example: 'CONCAT("Hello, ", name)' },
    { name: 'LENGTH', category: 'text', description: 'Returns the length of a string.', parameters: [{ name: 'text', type: 'string', description: 'Text to measure' }], returns: 'number', example: 'LENGTH("QDesigner")  // 9' },
    { name: 'UPPER', category: 'text', description: 'Converts text to uppercase.', parameters: [{ name: 'text', type: 'string', description: 'Text to convert' }], returns: 'string', example: 'UPPER("hello")  // "HELLO"' },
    { name: 'LOWER', category: 'text', description: 'Converts text to lowercase.', parameters: [{ name: 'text', type: 'string', description: 'Text to convert' }], returns: 'string', example: 'LOWER("HELLO")  // "hello"' },

    // Date/Time
    { name: 'NOW', category: 'date', description: 'Returns the current timestamp in milliseconds.', parameters: [], returns: 'number', example: 'NOW()  // 1709654321000' },
    { name: 'TIME_SINCE', category: 'date', description: 'Returns milliseconds elapsed since a timestamp.', parameters: [{ name: 'timestamp', type: 'number', description: 'Start timestamp' }], returns: 'number', example: 'TIME_SINCE(startTime)  // 5200' },

    // Array
    { name: 'SUM', category: 'array', description: 'Returns the sum of numeric values.', parameters: [{ name: 'values', type: 'array|...number', description: 'Values to sum' }], returns: 'number', example: 'SUM(q1, q2, q3)  // 15' },
    { name: 'COUNT', category: 'array', description: 'Counts non-empty values.', parameters: [{ name: 'values', type: 'array|...any', description: 'Values to count' }], returns: 'number', example: 'COUNT(responses)  // 8' },
    { name: 'MIN', category: 'array', description: 'Returns the smallest number.', parameters: [{ name: 'values', type: 'array|...number', description: 'Values to compare' }], returns: 'number', example: 'MIN(3, 1, 4, 1, 5)  // 1' },
    { name: 'MAX', category: 'array', description: 'Returns the largest number.', parameters: [{ name: 'values', type: 'array|...number', description: 'Values to compare' }], returns: 'number', example: 'MAX(3, 1, 4, 1, 5)  // 5' },
    { name: 'FILTER', category: 'array', description: 'Filters array elements by a condition string.', parameters: [{ name: 'array', type: 'array', description: 'Array to filter' }, { name: 'condition', type: 'string', description: 'Condition (e.g. "> 3")' }], returns: 'array', example: 'FILTER([1,2,3,4,5], "> 3")  // [4, 5]' },
    { name: 'MAP', category: 'array', description: 'Transforms each element of an array.', parameters: [{ name: 'array', type: 'array', description: 'Array to transform' }, { name: 'transform', type: 'string', description: 'Transformation (e.g. "* 2")' }], returns: 'array', example: 'MAP([1,2,3], "* 2")  // [2, 4, 6]' },
    { name: 'REDUCE', category: 'array', description: 'Reduces an array to a single value.', parameters: [{ name: 'array', type: 'array', description: 'Array to reduce' }, { name: 'operation', type: 'string', description: '"sum", "product", "min", "max", or "concat"' }, { name: 'initial', type: 'any', description: 'Initial value', optional: true }], returns: 'any', example: 'REDUCE([1,2,3,4], "sum")  // 10' },
    { name: 'SORT', category: 'array', description: 'Sorts array elements.', parameters: [{ name: 'array', type: 'array', description: 'Array to sort' }, { name: 'order', type: 'string', description: '"asc" or "desc"', optional: true, default: 'asc' }], returns: 'array', example: 'SORT([3,1,4,1,5])  // [1,1,3,4,5]' },
    { name: 'UNIQUE', category: 'array', description: 'Returns unique values from an array.', parameters: [{ name: 'array', type: 'array', description: 'Array with duplicates' }], returns: 'array', example: 'UNIQUE([1,2,2,3,3])  // [1, 2, 3]' },
    { name: 'FLATTEN', category: 'array', description: 'Flattens nested arrays.', parameters: [{ name: 'array', type: 'array', description: 'Nested array' }, { name: 'depth', type: 'number', description: 'Depth to flatten', optional: true, default: 1 }], returns: 'array', example: 'FLATTEN([[1,2],[3,4]])  // [1,2,3,4]' },
    { name: 'REVERSE', category: 'array', description: 'Reverses array order.', parameters: [{ name: 'array', type: 'array', description: 'Array to reverse' }], returns: 'array', example: 'REVERSE([1,2,3])  // [3, 2, 1]' },
    { name: 'SLICE', category: 'array', description: 'Extracts a portion of an array.', parameters: [{ name: 'array', type: 'array', description: 'Source array' }, { name: 'start', type: 'number', description: 'Start index' }, { name: 'end', type: 'number', description: 'End index', optional: true }], returns: 'array', example: 'SLICE([1,2,3,4,5], 1, 4)  // [2,3,4]' },
    { name: 'PLUCK', category: 'array', description: 'Extracts property values from array of objects.', parameters: [{ name: 'array', type: 'array', description: 'Array of objects' }, { name: 'property', type: 'string', description: 'Property name' }], returns: 'array', example: 'PLUCK([{name:"A"},{name:"B"}], "name")  // ["A","B"]' },
    { name: 'GROUP_BY', category: 'array', description: 'Groups array of objects by a property.', parameters: [{ name: 'array', type: 'array', description: 'Array of objects' }, { name: 'property', type: 'string', description: 'Property to group by' }], returns: 'object', example: 'GROUP_BY(items, "category")' },
    { name: 'FOREACH', category: 'array', description: 'Iterates over array elements (for side effects).', parameters: [{ name: 'array', type: 'array', description: 'Array to iterate' }, { name: 'callback', type: 'function', description: 'Function(item, index)' }], returns: 'number', example: 'FOREACH(RANGE(1,5), fn)' },
    { name: 'RANGE', category: 'array', description: 'Generates a sequence of numbers.', parameters: [{ name: 'start', type: 'number', description: 'Start (inclusive)' }, { name: 'end', type: 'number', description: 'End (exclusive)' }, { name: 'step', type: 'number', description: 'Step increment', optional: true, default: 1 }], returns: 'array', example: 'RANGE(1, 5)  // [1, 2, 3, 4]' },

    // Statistical
    { name: 'MEAN', category: 'stat', description: 'Arithmetic mean of values.', parameters: [{ name: 'values', type: 'array|...number', description: 'Numbers to average' }], returns: 'number', example: 'MEAN(1, 2, 3, 4, 5)  // 3' },
    { name: 'MEDIAN', category: 'stat', description: 'Median value of a dataset.', parameters: [{ name: 'values', type: 'array|...number', description: 'Numbers' }], returns: 'number', example: 'MEDIAN(1, 3, 5, 7, 9)  // 5' },
    { name: 'MODE', category: 'stat', description: 'Most frequent value(s).', parameters: [{ name: 'values', type: 'array|...number', description: 'Values to analyze' }], returns: 'any', example: 'MODE(1, 2, 2, 3, 3, 3)  // 3' },
    { name: 'STDEV', category: 'stat', description: 'Sample standard deviation.', parameters: [{ name: 'values', type: 'array|...number', description: 'Numbers' }], returns: 'number', example: 'STDEV(1, 2, 3, 4, 5)' },
    { name: 'VARIANCE', category: 'stat', description: 'Sample variance.', parameters: [{ name: 'values', type: 'array|...number', description: 'Numbers' }], returns: 'number', example: 'VARIANCE(1, 2, 3, 4, 5)' },
    { name: 'PERCENTILE', category: 'stat', description: 'Nth percentile of a dataset.', parameters: [{ name: 'values', type: 'array', description: 'Array of numbers' }, { name: 'percentile', type: 'number', description: '0-1 or 0-100' }], returns: 'number', example: 'PERCENTILE([1,2,3,4,5], 0.5)  // 3' },
    { name: 'CORRELATION', category: 'stat', description: 'Pearson correlation coefficient.', parameters: [{ name: 'x', type: 'array', description: 'First dataset' }, { name: 'y', type: 'array', description: 'Second dataset' }], returns: 'number', example: 'CORRELATION([1,2,3], [2,4,6])  // 1' },
    { name: 'ZSCORE', category: 'stat', description: 'Z-score (standard score).', parameters: [{ name: 'value', type: 'number', description: 'Raw value' }, { name: 'mean', type: 'number', description: 'Population mean' }, { name: 'stdev', type: 'number', description: 'Population SD' }], returns: 'number', example: 'ZSCORE(85, 80, 10)  // 0.5' },
    { name: 'TTEST', category: 'stat', description: 'Independent samples t-test.', parameters: [{ name: 'group1', type: 'array', description: 'First group' }, { name: 'group2', type: 'array', description: 'Second group' }, { name: 'tails', type: 'number', description: '1 or 2 (default 2)', optional: true }], returns: 'object', example: 'TTEST([80,85,90], [75,78,82])' },
    { name: 'SKEWNESS', category: 'stat', description: 'Distribution skewness.', parameters: [{ name: 'values', type: 'array|...number', description: 'Numbers' }], returns: 'number', example: 'SKEWNESS(1, 2, 3, 4, 5)' },
    { name: 'KURTOSIS', category: 'stat', description: 'Excess kurtosis of distribution.', parameters: [{ name: 'values', type: 'array|...number', description: 'Numbers' }], returns: 'number', example: 'KURTOSIS(1, 2, 3, 4, 5)' },

    // Psychometric
    { name: 'SPLIT_HALF', category: 'psychometric', description: 'Split-half reliability with Spearman-Brown correction.', parameters: [{ name: 'items', type: 'array', description: '2D array (participants x items)' }], returns: 'number', example: 'SPLIT_HALF([[4,3,5,2],[3,4,4,3]])' },
    { name: 'KR20', category: 'psychometric', description: 'Kuder-Richardson 20 for dichotomous (0/1) items.', parameters: [{ name: 'items', type: 'array', description: '2D array of 0/1 scores' }], returns: 'number', example: 'KR20([[1,0,1],[1,1,0],[0,1,1]])' },
    { name: 'OMEGA', category: 'psychometric', description: "McDonald's omega (simplified).", parameters: [{ name: 'items', type: 'array', description: '2D array (participants x items)' }], returns: 'number', example: 'OMEGA([[4,3,5],[3,4,4],[5,5,4]])' },
    { name: 'SEM', category: 'psychometric', description: 'Standard Error of Measurement.', parameters: [{ name: 'reliability', type: 'number', description: 'Reliability coefficient (0-1)' }, { name: 'sd', type: 'number', description: 'Standard deviation' }], returns: 'number', example: 'SEM(0.85, 15)' },

    // IRT
    { name: 'IRT_1PL', category: 'irt', description: 'Rasch/1PL item response probability.', parameters: [{ name: 'theta', type: 'number', description: 'Person ability' }, { name: 'b', type: 'number', description: 'Item difficulty' }], returns: 'number', example: 'IRT_1PL(1.5, -0.5)  // 0.88' },
    { name: 'IRT_2PL', category: 'irt', description: '2-parameter logistic IRT probability.', parameters: [{ name: 'theta', type: 'number', description: 'Person ability' }, { name: 'a', type: 'number', description: 'Discrimination' }, { name: 'b', type: 'number', description: 'Difficulty' }], returns: 'number', example: 'IRT_2PL(1.5, 1.2, -0.5)' },
    { name: 'IRT_3PL', category: 'irt', description: '3PL IRT probability with guessing parameter.', parameters: [{ name: 'theta', type: 'number', description: 'Person ability' }, { name: 'a', type: 'number', description: 'Discrimination' }, { name: 'b', type: 'number', description: 'Difficulty' }, { name: 'c', type: 'number', description: 'Guessing (0 to <1)' }], returns: 'number', example: 'IRT_3PL(0, 1, 0, 0.25)  // 0.75' },
    { name: 'IRT_INFO', category: 'irt', description: 'Fisher information for an IRT item.', parameters: [{ name: 'theta', type: 'number', description: 'Ability' }, { name: 'a', type: 'number', description: 'Discrimination' }, { name: 'b', type: 'number', description: 'Difficulty' }, { name: 'c', type: 'number', description: 'Guessing', optional: true, default: 0 }], returns: 'number', example: 'IRT_INFO(0, 1.5, 0, 0.25)' },
    { name: 'IRT_THETA_MLE', category: 'irt', description: 'Maximum likelihood estimate of ability (Newton-Raphson).', parameters: [{ name: 'responses', type: 'array', description: '0/1 response vector' }, { name: 'items', type: 'array', description: 'Item params [{a, b, c?}]' }], returns: 'number', example: 'IRT_THETA_MLE([1,0,1,1], items)' },
  ];

  let searchQuery = $state('');
  let activeCategory = $state<CategoryKey | 'all'>('all');

  const filteredEntries = $derived.by(() => {
    let result = entries;
    if (activeCategory !== 'all') {
      result = result.filter((e) => e.category === activeCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.parameters.some((p) => p.name.toLowerCase().includes(q))
      );
    }
    return result;
  });

  const categoryCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    }
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose?.();
    }
  }

  $effect(() => {
    if (!browser) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-50"
  role="dialog"
  aria-modal="true"
  aria-label="Formula Reference"
  data-testid="formula-reference-sheet"
>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/[var(--backdrop-opacity,0.5)] backdrop-blur-sm"
    onclick={handleBackdrop}
    onkeydown={(e) => e.key === 'Enter' && handleBackdrop(e as unknown as MouseEvent)}
    role="button"
    tabindex="-1"
    aria-label="Close"
  ></div>

  <!-- Sheet -->
  <div class="fixed inset-y-0 right-0 z-10 flex w-full max-w-2xl flex-col border-l border-border bg-[hsl(var(--layer-surface))] shadow-xl animate-slide-in-right">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-border px-5 py-4">
      <h2 class="text-base font-semibold text-foreground">Formula Reference</h2>
      <button
        type="button"
        class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => onclose?.()}
        aria-label="Close"
        data-testid="formula-reference-close"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Search -->
    <div class="border-b border-border px-5 py-3">
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search functions..."
          class="w-full rounded-md border border-border bg-[hsl(var(--layer-surface))] py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          bind:value={searchQuery}
          data-testid="formula-search"
        />
      </div>
    </div>

    <!-- Category filter -->
    <div class="flex flex-wrap gap-1 border-b border-border px-5 py-2">
      <button
        type="button"
        class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors {activeCategory === 'all'
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground'}"
        onclick={() => (activeCategory = 'all')}
      >
        All ({entries.length})
      </button>
      {#each categoryOrder as cat (cat)}
        {#if categoryCounts[cat]}
          <button
            type="button"
            class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors {activeCategory === cat
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'}"
            onclick={() => (activeCategory = cat)}
          >
            {categoryLabels[cat]} ({categoryCounts[cat]})
          </button>
        {/if}
      {/each}
    </div>

    <!-- Function list -->
    <div class="min-h-0 flex-1 overflow-auto px-5 py-3">
      {#if filteredEntries.length === 0}
        <p class="py-8 text-center text-sm text-muted-foreground">
          No functions match your search.
        </p>
      {/if}
      <div class="flex flex-col gap-3">
        {#each filteredEntries as entry (entry.name)}
          <div
            class="rounded-lg border border-border bg-[hsl(var(--glass-bg))] p-4"
            data-testid={`formula-${entry.name}`}
          >
            <!-- Function signature -->
            <div class="flex items-baseline gap-2">
              <code class="text-sm font-semibold text-primary">
                {entry.name}({entry.parameters.map((p) => (p.optional ? `${p.name}?` : p.name)).join(', ')})
              </code>
              <span class="text-xs text-muted-foreground">
                &rarr; {entry.returns}
              </span>
            </div>

            <!-- Description -->
            <p class="mt-1.5 text-sm text-muted-foreground">{entry.description}</p>

            <!-- Parameters -->
            {#if entry.parameters.length > 0}
              <div class="mt-2">
                <div class="flex flex-col gap-0.5">
                  {#each entry.parameters as param (param.name)}
                    <div class="flex items-baseline gap-2 text-xs">
                      <code class="font-mono text-foreground">{param.name}</code>
                      <span class="text-muted-foreground">
                        <span class="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{param.type}</span>
                        {param.description}
                        {#if param.optional}
                          <span class="italic">(optional{param.default !== undefined ? `, default: ${param.default}` : ''})</span>
                        {/if}
                      </span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Example -->
            {#if entry.example}
              <div class="mt-2 rounded bg-muted/50 px-3 py-1.5">
                <code class="text-xs font-mono text-foreground">{entry.example}</code>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .animate-slide-in-right {
    animation: slide-in-right 200ms ease-out;
  }
</style>
