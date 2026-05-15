import type { languages, editor } from 'monaco-editor';

export interface MonacoTheme {
  base: 'vs' | 'vs-dark' | 'hc-black';
  inherit: boolean;
  rules: Array<{
    token: string;
    foreground?: string;
    background?: string;
    fontStyle?: string;
  }>;
  colors: Record<string, string>;
}

export const qdesignerTheme: MonacoTheme = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '0000FF' },
    { token: 'comment', foreground: '008000', fontStyle: 'italic' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'variable', foreground: '001080' },
    { token: 'function', foreground: '795E26' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#000000',
    'editor.lineHighlightBackground': '#F0F0F0',
    'editorCursor.foreground': '#000000',
    'editor.selectionBackground': '#ADD6FF',
  }
};

export const qdesignerDarkTheme: MonacoTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '569CD6' },
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'variable', foreground: '9CDCFE' },
    { token: 'function', foreground: 'DCDCAA' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
    'editor.lineHighlightBackground': '#2A2A2A',
    'editorCursor.foreground': '#D4D4D4',
    'editor.selectionBackground': '#264F78',
  }
};

export const javascriptLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' }
  ],
  folding: {
    markers: {
      start: new RegExp("^\\s*//\\s*#?region\\b"),
      end: new RegExp("^\\s*//\\s*#?endregion\\b")
    }
  }
};

export const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  theme: 'qdesigner-light',
  language: 'javascript',
  fontSize: 14,
  fontFamily: 'Consolas, "Courier New", monospace',
  lineNumbers: 'on',
  roundedSelection: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  minimap: {
    enabled: false
  },
  suggest: {
    showKeywords: true,
    showSnippets: true,
    showConstants: true,
    showVariables: true,
    showFunctions: true,
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true
  },
  parameterHints: {
    enabled: true
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnCommitCharacter: true,
  snippetSuggestions: 'inline',
  tabCompletion: 'on',
  wordBasedSuggestions: 'currentDocument' as const,
  contextmenu: true,
  formatOnType: true,
  formatOnPaste: true,
  dragAndDrop: true,
  links: true,
  colorDecorators: false,
  folding: true,
  showFoldingControls: 'mouseover',
  matchBrackets: 'always',
  renderWhitespace: 'selection',
  renderControlCharacters: false,
  renderLineHighlight: 'all',
  useTabStops: true,
  fontLigatures: false,
};

// --- Function Registry ---

interface FunctionParam {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
  default?: string;
}

interface FunctionDef {
  name: string;
  category: 'Math' | 'Array' | 'Statistics' | 'Logic' | 'Text' | 'Date/Time' | 'Custom';
  description: string;
  params: FunctionParam[];
  returns: string;
  examples?: string[];
}

const categoryLabels: Record<string, string> = {
  'Math': 'Math',
  'Array': 'Array',
  'Statistics': 'Statistics',
  'Logic': 'Logic',
  'Text': 'Text',
  'Date/Time': 'Date/Time',
  'Custom': 'Custom',
};

const formulaFunctions: FunctionDef[] = [
  // === Math (7) ===
  {
    name: 'ABS',
    category: 'Math',
    description: 'Returns the absolute value of a number.',
    params: [{ name: 'value', type: 'number', description: 'Number to get absolute value of' }],
    returns: 'number',
    examples: ['ABS(-5)  // 5'],
  },
  {
    name: 'ROUND',
    category: 'Math',
    description: 'Rounds a number to the specified number of decimal places.',
    params: [
      { name: 'value', type: 'number', description: 'Number to round' },
      { name: 'decimals', type: 'number', description: 'Decimal places', optional: true, default: '0' },
    ],
    returns: 'number',
    examples: ['ROUND(3.456, 2)  // 3.46'],
  },
  {
    name: 'SQRT',
    category: 'Math',
    description: 'Returns the square root of a number.',
    params: [{ name: 'value', type: 'number', description: 'Number to get square root of' }],
    returns: 'number',
    examples: ['SQRT(16)  // 4'],
  },
  {
    name: 'POW',
    category: 'Math',
    description: 'Returns the base raised to the exponent power.',
    params: [
      { name: 'base', type: 'number', description: 'Base number' },
      { name: 'exponent', type: 'number', description: 'Exponent' },
    ],
    returns: 'number',
    examples: ['POW(2, 3)  // 8'],
  },
  {
    name: 'RANDOM',
    category: 'Math',
    description: 'Returns a random number between 0 (inclusive) and 1 (exclusive).',
    params: [],
    returns: 'number',
    examples: ['RANDOM()  // 0.7231...'],
  },
  {
    name: 'RANDINT',
    category: 'Math',
    description: 'Returns a random integer between min and max (inclusive).',
    params: [
      { name: 'min', type: 'number', description: 'Minimum value (inclusive)' },
      { name: 'max', type: 'number', description: 'Maximum value (inclusive)' },
    ],
    returns: 'number',
    examples: ['RANDINT(1, 10)  // 7'],
  },

  // === Array (13) ===
  {
    name: 'SUM',
    category: 'Array',
    description: 'Calculates the sum of all numeric values.',
    params: [{ name: 'values', type: '...number', description: 'Numbers to sum (or an array)' }],
    returns: 'number',
    examples: ['SUM(1, 2, 3)  // 6', 'SUM([10, 20, 30])  // 60'],
  },
  {
    name: 'COUNT',
    category: 'Array',
    description: 'Counts the number of non-empty values.',
    params: [{ name: 'values', type: '...any', description: 'Values to count (or an array)' }],
    returns: 'number',
    examples: ['COUNT(1, 2, null, 3)  // 3'],
  },
  {
    name: 'MIN',
    category: 'Array',
    description: 'Returns the smallest numeric value.',
    params: [{ name: 'values', type: '...number', description: 'Numbers to compare (or an array)' }],
    returns: 'number',
    examples: ['MIN(3, 1, 4, 1, 5)  // 1'],
  },
  {
    name: 'MAX',
    category: 'Array',
    description: 'Returns the largest numeric value.',
    params: [{ name: 'values', type: '...number', description: 'Numbers to compare (or an array)' }],
    returns: 'number',
    examples: ['MAX(3, 1, 4, 1, 5)  // 5'],
  },
  {
    name: 'FILTER',
    category: 'Array',
    description: 'Filters array elements based on a condition string.',
    params: [
      { name: 'array', type: 'array', description: 'Array to filter' },
      { name: 'condition', type: 'string', description: 'Condition expression (e.g. "> 3", "!= banana")' },
    ],
    returns: 'array',
    examples: ['FILTER([1, 2, 3, 4, 5], "> 3")  // [4, 5]'],
  },
  {
    name: 'MAP',
    category: 'Array',
    description: 'Transforms each element of an array using an operation.',
    params: [
      { name: 'array', type: 'array', description: 'Array to transform' },
      { name: 'transform', type: 'string', description: 'Operation expression (e.g. "* 2", "+ 10")' },
    ],
    returns: 'array',
    examples: ['MAP([1, 2, 3], "* 2")  // [2, 4, 6]'],
  },
  {
    name: 'REDUCE',
    category: 'Array',
    description: 'Reduces an array to a single value using an operation.',
    params: [
      { name: 'array', type: 'array', description: 'Array to reduce' },
      { name: 'operation', type: 'string', description: 'Operation: "sum", "product", "min", "max", "concat", "count"' },
      { name: 'initial', type: 'any', description: 'Initial accumulator value', optional: true },
    ],
    returns: 'any',
    examples: ['REDUCE([1, 2, 3, 4], "sum")  // 10', 'REDUCE([2, 3, 4], "product")  // 24'],
  },
  {
    name: 'SORT',
    category: 'Array',
    description: 'Returns a sorted copy of the array.',
    params: [
      { name: 'array', type: 'array', description: 'Array to sort' },
      { name: 'order', type: 'string', description: '"asc" or "desc"', optional: true, default: '"asc"' },
    ],
    returns: 'array',
    examples: ['SORT([3, 1, 4, 1, 5])  // [1, 1, 3, 4, 5]'],
  },
  {
    name: 'UNIQUE',
    category: 'Array',
    description: 'Returns an array with duplicate values removed.',
    params: [{ name: 'array', type: 'array', description: 'Array with potential duplicates' }],
    returns: 'array',
    examples: ['UNIQUE([1, 2, 2, 3, 3])  // [1, 2, 3]'],
  },
  {
    name: 'FLATTEN',
    category: 'Array',
    description: 'Flattens nested arrays to the specified depth.',
    params: [
      { name: 'array', type: 'array', description: 'Nested array to flatten' },
      { name: 'depth', type: 'number', description: 'Depth to flatten', optional: true, default: '1' },
    ],
    returns: 'array',
    examples: ['FLATTEN([[1, 2], [3, 4]])  // [1, 2, 3, 4]'],
  },
  {
    name: 'GROUP_BY',
    category: 'Array',
    description: 'Groups an array of objects by a property value.',
    params: [
      { name: 'array', type: 'array', description: 'Array of objects' },
      { name: 'property', type: 'string', description: 'Property name to group by' },
    ],
    returns: 'object',
    examples: ['GROUP_BY([{type: "A", v: 1}, {type: "B", v: 2}], "type")'],
  },
  {
    name: 'PLUCK',
    category: 'Array',
    description: 'Extracts a single property value from each object in an array.',
    params: [
      { name: 'array', type: 'array', description: 'Array of objects' },
      { name: 'property', type: 'string', description: 'Property name to extract' },
    ],
    returns: 'array',
    examples: ['PLUCK([{name: "Alice"}, {name: "Bob"}], "name")  // ["Alice", "Bob"]'],
  },
  {
    name: 'SLICE',
    category: 'Array',
    description: 'Extracts a portion of an array from start to end index.',
    params: [
      { name: 'array', type: 'array', description: 'Array to slice' },
      { name: 'start', type: 'number', description: 'Start index (0-based)' },
      { name: 'end', type: 'number', description: 'End index (exclusive)', optional: true },
    ],
    returns: 'array',
    examples: ['SLICE([1, 2, 3, 4, 5], 1, 4)  // [2, 3, 4]'],
  },
  {
    name: 'REVERSE',
    category: 'Array',
    description: 'Returns a reversed copy of the array.',
    params: [{ name: 'array', type: 'array', description: 'Array to reverse' }],
    returns: 'array',
    examples: ['REVERSE([1, 2, 3])  // [3, 2, 1]'],
  },

  // === Statistics (11) ===
  {
    name: 'MEAN',
    category: 'Statistics',
    description: 'Calculates the arithmetic mean (average) of numbers.',
    params: [{ name: 'values', type: '...number', description: 'Numbers (or an array)' }],
    returns: 'number',
    examples: ['MEAN(1, 2, 3, 4, 5)  // 3', 'MEAN([10, 20, 30])  // 20'],
  },
  {
    name: 'MEDIAN',
    category: 'Statistics',
    description: 'Returns the median (middle) value of a set of numbers.',
    params: [{ name: 'values', type: '...number', description: 'Numbers (or an array)' }],
    returns: 'number',
    examples: ['MEDIAN(1, 3, 5, 7, 9)  // 5'],
  },
  {
    name: 'MODE',
    category: 'Statistics',
    description: 'Returns the most frequently occurring value(s).',
    params: [{ name: 'values', type: '...any', description: 'Values (or an array)' }],
    returns: 'any',
    examples: ['MODE(1, 2, 2, 3, 3, 3)  // 3'],
  },
  {
    name: 'STDEV',
    category: 'Statistics',
    description: 'Calculates the sample standard deviation.',
    params: [{ name: 'values', type: '...number', description: 'Numbers (or an array)' }],
    returns: 'number',
    examples: ['STDEV(1, 2, 3, 4, 5)  // 1.581...'],
  },
  {
    name: 'VARIANCE',
    category: 'Statistics',
    description: 'Calculates the sample variance.',
    params: [{ name: 'values', type: '...number', description: 'Numbers (or an array)' }],
    returns: 'number',
    examples: ['VARIANCE(1, 2, 3, 4, 5)  // 2.5'],
  },
  {
    name: 'PERCENTILE',
    category: 'Statistics',
    description: 'Calculates the nth percentile of a dataset.',
    params: [
      { name: 'values', type: 'array', description: 'Array of numbers' },
      { name: 'percentile', type: 'number', description: 'Percentile value (0-1 or 0-100)' },
    ],
    returns: 'number',
    examples: ['PERCENTILE([1, 2, 3, 4, 5], 0.5)  // 3', 'PERCENTILE([10, 20, 30, 40], 75)  // 32.5'],
  },
  {
    name: 'CORRELATION',
    category: 'Statistics',
    description: 'Calculates the Pearson correlation coefficient between two arrays.',
    params: [
      { name: 'x', type: 'array', description: 'First array of numbers' },
      { name: 'y', type: 'array', description: 'Second array of numbers' },
    ],
    returns: 'number',
    examples: ['CORRELATION([1, 2, 3], [2, 4, 6])  // 1.0'],
  },
  {
    name: 'ZSCORE',
    category: 'Statistics',
    description: 'Calculates the z-score (standard score) for a value.',
    params: [
      { name: 'value', type: 'number', description: 'Value to standardize' },
      { name: 'mean', type: 'number', description: 'Population mean' },
      { name: 'stdev', type: 'number', description: 'Population standard deviation' },
    ],
    returns: 'number',
    examples: ['ZSCORE(85, 80, 10)  // 0.5'],
  },
  {
    name: 'TTEST',
    category: 'Statistics',
    description: 'Performs an independent samples t-test between two groups.',
    params: [
      { name: 'group1', type: 'array', description: 'First group of values' },
      { name: 'group2', type: 'array', description: 'Second group of values' },
      { name: 'tails', type: 'number', description: 'Number of tails (1 or 2)', optional: true, default: '2' },
    ],
    returns: 'object',
    examples: ['TTEST([80, 85, 90], [75, 78, 82])'],
  },
  {
    name: 'SKEWNESS',
    category: 'Statistics',
    description: 'Calculates the skewness of a distribution.',
    params: [{ name: 'values', type: '...number', description: 'Numbers (or an array)' }],
    returns: 'number',
    examples: ['SKEWNESS(1, 2, 3, 4, 5)'],
  },
  {
    name: 'KURTOSIS',
    category: 'Statistics',
    description: 'Calculates the excess kurtosis of a distribution.',
    params: [{ name: 'values', type: '...number', description: 'Numbers (or an array)' }],
    returns: 'number',
    examples: ['KURTOSIS(1, 2, 3, 4, 5)'],
  },

  // === Logic (4) ===
  {
    name: 'IF',
    category: 'Logic',
    description: 'Returns one value if the condition is true, another if false.',
    params: [
      { name: 'condition', type: 'boolean', description: 'Condition to evaluate' },
      { name: 'trueValue', type: 'any', description: 'Value when condition is true' },
      { name: 'falseValue', type: 'any', description: 'Value when condition is false' },
    ],
    returns: 'any',
    examples: ['IF(score > 70, "Pass", "Fail")'],
  },
  {
    name: 'AND',
    category: 'Logic',
    description: 'Returns true if all arguments are truthy.',
    params: [{ name: 'values', type: '...boolean', description: 'Values to AND together' }],
    returns: 'boolean',
    examples: ['AND(true, true, false)  // false'],
  },
  {
    name: 'OR',
    category: 'Logic',
    description: 'Returns true if any argument is truthy.',
    params: [{ name: 'values', type: '...boolean', description: 'Values to OR together' }],
    returns: 'boolean',
    examples: ['OR(false, true, false)  // true'],
  },
  {
    name: 'NOT',
    category: 'Logic',
    description: 'Returns the logical negation of a value.',
    params: [{ name: 'value', type: 'boolean', description: 'Value to negate' }],
    returns: 'boolean',
    examples: ['NOT(true)  // false'],
  },

  // === Text (4) ===
  {
    name: 'CONCAT',
    category: 'Text',
    description: 'Concatenates all arguments into a single string.',
    params: [{ name: 'values', type: '...any', description: 'Values to concatenate' }],
    returns: 'string',
    examples: ['CONCAT("Hello", " ", "World")  // "Hello World"'],
  },
  {
    name: 'LENGTH',
    category: 'Text',
    description: 'Returns the length of a string.',
    params: [{ name: 'text', type: 'string', description: 'Text to measure' }],
    returns: 'number',
    examples: ['LENGTH("hello")  // 5'],
  },
  {
    name: 'UPPER',
    category: 'Text',
    description: 'Converts text to uppercase.',
    params: [{ name: 'text', type: 'string', description: 'Text to convert' }],
    returns: 'string',
    examples: ['UPPER("hello")  // "HELLO"'],
  },
  {
    name: 'LOWER',
    category: 'Text',
    description: 'Converts text to lowercase.',
    params: [{ name: 'text', type: 'string', description: 'Text to convert' }],
    returns: 'string',
    examples: ['LOWER("HELLO")  // "hello"'],
  },

  // === Date/Time (2) ===
  {
    name: 'NOW',
    category: 'Date/Time',
    description: 'Returns the current timestamp in milliseconds.',
    params: [],
    returns: 'number',
    examples: ['NOW()  // 1709481600000'],
  },
  {
    name: 'TIME_SINCE',
    category: 'Date/Time',
    description: 'Returns the time elapsed since a given timestamp in milliseconds.',
    params: [{ name: 'timestamp', type: 'number', description: 'Start timestamp in milliseconds' }],
    returns: 'number',
    examples: ['TIME_SINCE(startTime)'],
  },

  // === Custom / Research (5) ===
  {
    name: 'SCORE_SCALE',
    category: 'Custom',
    description: 'Sums specified question answers for a psychometric scale score.',
    params: [
      { name: 'questionIds', type: 'array', description: 'Array of question IDs' },
      { name: 'reverseIds', type: 'array', description: 'IDs of reverse-scored items', optional: true },
      { name: 'maxValue', type: 'number', description: 'Maximum value for reverse scoring', optional: true },
    ],
    returns: 'number',
    examples: ['SCORE_SCALE(["q1", "q2", "q3"], ["q2"], 5)'],
  },
  {
    name: 'CATEGORY_SCORE',
    category: 'Custom',
    description: 'Categorizes a numeric score into labeled ranges.',
    params: [
      { name: 'score', type: 'number', description: 'Numeric score to categorize' },
      { name: 'ranges', type: 'array', description: 'Array of [threshold, label] pairs' },
    ],
    returns: 'string',
    examples: ['CATEGORY_SCORE(75, [[60, "Low"], [80, "Medium"], [100, "High"]])'],
  },
  {
    name: 'AGE_GROUP',
    category: 'Custom',
    description: 'Assigns an age value to a demographic age group.',
    params: [{ name: 'age', type: 'number', description: 'Age in years' }],
    returns: 'string',
    examples: ['AGE_GROUP(25)  // "18-29"'],
  },
  {
    name: 'LIKERT_TO_NUMERIC',
    category: 'Custom',
    description: 'Converts a Likert label to its numeric value.',
    params: [
      { name: 'label', type: 'string', description: 'Likert scale label' },
      { name: 'scale', type: 'object', description: 'Mapping object of labels to numbers', optional: true },
    ],
    returns: 'number',
    examples: ['LIKERT_TO_NUMERIC("Strongly Agree")  // 5'],
  },
  {
    name: 'RESPONSE_TIME_CATEGORY',
    category: 'Custom',
    description: 'Categorizes a reaction time into speed buckets.',
    params: [{ name: 'ms', type: 'number', description: 'Response time in milliseconds' }],
    returns: 'string',
    examples: ['RESPONSE_TIME_CATEGORY(350)  // "Fast"'],
  },
];

// Build a lookup map for fast access
const functionMap = new Map<string, FunctionDef>();
for (const fn of formulaFunctions) {
  functionMap.set(fn.name, fn);
}

/**
 * Build a snippet insert text with tab-stop placeholders for a function.
 */
function buildSnippet(fn: FunctionDef): string {
  if (fn.params.length === 0) {
    return `${fn.name}()`;
  }
  const paramSnippets = fn.params.map((p, i) => {
    const placeholder = p.default ?? p.name;
    return `\${${i + 1}:${placeholder}}`;
  });
  return `${fn.name}(${paramSnippets.join(', ')})`;
}

/**
 * Build a human-readable signature string.
 */
function buildSignature(fn: FunctionDef): string {
  const params = fn.params.map(p => {
    let s = `${p.name}: ${p.type}`;
    if (p.optional) s += '?';
    return s;
  });
  return `${fn.name}(${params.join(', ')}): ${fn.returns}`;
}

/**
 * Build a markdown documentation string.
 */
function buildDocs(fn: FunctionDef): string {
  const lines: string[] = [fn.description, ''];
  if (fn.params.length > 0) {
    lines.push('**Parameters:**');
    for (const p of fn.params) {
      let line = `- \`${p.name}\` *(${p.type})*: ${p.description}`;
      if (p.optional) line += ` (optional, default: ${p.default ?? 'none'})`;
      lines.push(line);
    }
    lines.push('');
  }
  lines.push(`**Returns:** \`${fn.returns}\``);
  if (fn.examples && fn.examples.length > 0) {
    lines.push('', '**Examples:**');
    for (const ex of fn.examples) {
      lines.push(`\`\`\`\n${ex}\n\`\`\``);
    }
  }
  return lines.join('\n');
}

/**
 * Create completion items for the QDesigner scripting API.
 * Includes all 47+ formula functions grouped by category, context variables, and common snippets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco completion items have complex dynamic shape
export function createCompletionItems(monaco: typeof import('monaco-editor')): any[] {
  const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco completion items have complex dynamic shape
  const items: any[] = [];

  // --- Context variables ---
  items.push(
    {
      label: 'variables',
      kind: CompletionItemKind.Variable,
      documentation: { value: 'Access questionnaire variables by name.' },
      insertText: 'variables',
      detail: 'Record<string, any>',
      sortText: '0_variables',
    },
    {
      label: 'answers',
      kind: CompletionItemKind.Variable,
      documentation: { value: 'Access collected questionnaire answers by question ID.' },
      insertText: 'answers',
      detail: 'Record<string, any>',
      sortText: '0_answers',
    },
    {
      label: 'current',
      kind: CompletionItemKind.Variable,
      documentation: { value: 'Current execution context.\n\n`{ pageId?: string, questionId?: string, timestamp: number }`' },
      insertText: 'current',
      detail: '{ pageId?, questionId?, timestamp }',
      sortText: '0_current',
    },
  );

  // --- Formula functions by category ---
  const categoryOrder = ['Math', 'Array', 'Statistics', 'Logic', 'Text', 'Date/Time', 'Custom'];
  for (const cat of categoryOrder) {
    const fns = formulaFunctions.filter(fn => fn.category === cat);
    for (const fn of fns) {
      items.push({
        label: fn.name,
        kind: CompletionItemKind.Function,
        documentation: { value: buildDocs(fn) },
        insertText: buildSnippet(fn),
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        detail: `[${categoryLabels[cat]}] ${buildSignature(fn)}`,
        sortText: `1_${cat}_${fn.name}`,
      });
    }
  }

  // --- Utility functions (JS scripting API) ---
  const utilFns: Array<{ label: string; doc: string; snippet: string; detail: string }> = [
    { label: 'utils.sum', doc: 'Calculate the sum of an array of numbers', snippet: 'utils.sum(${1:values})', detail: '(values: number[]) => number' },
    { label: 'utils.mean', doc: 'Calculate the mean of an array of numbers', snippet: 'utils.mean(${1:values})', detail: '(values: number[]) => number' },
    { label: 'utils.min', doc: 'Find the minimum value in an array', snippet: 'utils.min(${1:values})', detail: '(values: number[]) => number' },
    { label: 'utils.max', doc: 'Find the maximum value in an array', snippet: 'utils.max(${1:values})', detail: '(values: number[]) => number' },
    { label: 'utils.count', doc: 'Count the number of items in an array', snippet: 'utils.count(${1:values})', detail: '(values: any[]) => number' },
    { label: 'utils.range', doc: 'Generate an array of numbers from start to end', snippet: 'utils.range(${1:start}, ${2:end})', detail: '(start: number, end: number) => number[]' },
    { label: 'utils.random', doc: 'Generate a random number between min and max', snippet: 'utils.random(${1:min}, ${2:max})', detail: '(min?: number, max?: number) => number' },
    { label: 'utils.log', doc: 'Log values for debugging', snippet: 'utils.log(${1:value})', detail: '(...args: any[]) => void' },
  ];

  for (const u of utilFns) {
    items.push({
      label: u.label,
      kind: CompletionItemKind.Function,
      documentation: { value: u.doc },
      insertText: u.snippet,
      insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
      detail: u.detail,
      sortText: `2_${u.label}`,
    });
  }

  // --- Common snippets ---
  items.push(
    {
      label: 'Calculate total score',
      kind: CompletionItemKind.Snippet,
      documentation: { value: 'Sum answers from multiple questions' },
      insertText: [
        '// Calculate total score',
        'const questionIds = [${1:"q1", "q2", "q3"}];',
        'const scores = questionIds.map(id => answers[id] || 0);',
        'return utils.sum(scores);'
      ].join('\n'),
      insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: '3_snippet_total',
    },
    {
      label: 'Conditional value',
      kind: CompletionItemKind.Snippet,
      documentation: { value: 'Return different values based on a condition' },
      insertText: [
        '// Return value based on condition',
        'if (${1:answers.age >= 18}) {',
        '  return "${2:adult}";',
        '} else {',
        '  return "${3:minor}";',
        '}'
      ].join('\n'),
      insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: '3_snippet_conditional',
    },
    {
      label: 'Calculate percentage',
      kind: CompletionItemKind.Snippet,
      documentation: { value: 'Calculate percentage of maximum possible score' },
      insertText: [
        '// Calculate percentage score',
        'const maxScore = ${1:100};',
        'const actualScore = ${2:answers.totalScore};',
        'return (actualScore / maxScore) * 100;'
      ].join('\n'),
      insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: '3_snippet_percentage',
    },
    {
      label: 'Reverse score item',
      kind: CompletionItemKind.Snippet,
      documentation: { value: 'Reverse-code a Likert item (e.g. 5-point scale)' },
      insertText: [
        '// Reverse score a Likert item',
        'const maxScale = ${1:5};',
        'return (maxScale + 1) - ${2:answers.itemId};'
      ].join('\n'),
      insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
      sortText: '3_snippet_reverse',
    },
  );

  return items;
}

/**
 * Register the formula CompletionItemProvider and SignatureHelpProvider for the
 * QDesigner scripting language. Returns an object whose `dispose` method
 * removes both registrations, and a `setVariables` function to update
 * dynamic variable suggestions at runtime.
 */
export function registerFormulaProviders(
  monaco: typeof import('monaco-editor'),
  languageId: string = 'javascript',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scripting context accepts arbitrary values
  initialVariables: Record<string, any> = {},
) {
  // Mutable variable state that the providers close over
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scripting context accepts arbitrary values
  let currentVariables: Record<string, any> = { ...initialVariables };

  const baseItems = createCompletionItems(monaco);

  // --- Completion Provider ---
  const completionDisposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', '(', ','],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco editor API types
    provideCompletionItems: (_model: any, _position: any) => {
      const suggestions = [...baseItems];

      // Dynamic variables
      for (const [varName, varValue] of Object.entries(currentVariables)) {
        suggestions.push({
          label: varName,
          kind: monaco.languages.CompletionItemKind.Variable,
          documentation: { value: `Variable: **${varName}**\n\nCurrent value: \`${JSON.stringify(varValue)}\`` },
          insertText: varName,
          detail: `variable (${typeof varValue})`,
          sortText: `0_var_${varName}`,
        });
      }

      return { suggestions };
    },
  });

  // --- Signature Help Provider ---
  const signatureDisposable = monaco.languages.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ['(', ','],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco editor API types
    provideSignatureHelp: (model: any, position: any) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Walk backwards to find the function name and current parameter index
      let depth = 0;
      let commaCount = 0;
      let funcEnd = -1;

      for (let i = textUntilPosition.length - 1; i >= 0; i--) {
        const ch = textUntilPosition[i];
        if (ch === ')') depth++;
        else if (ch === '(') {
          if (depth === 0) {
            funcEnd = i;
            break;
          }
          depth--;
        } else if (ch === ',' && depth === 0) {
          commaCount++;
        }
      }

      if (funcEnd === -1) return undefined;

      // Extract function name
      const beforeParen = textUntilPosition.substring(0, funcEnd).trimEnd();
      const fnNameMatch = beforeParen.match(/([A-Z_][A-Z_0-9]*)\s*$/i);
      if (!fnNameMatch) return undefined;

      const fnName = fnNameMatch[1].toUpperCase();
      const fnDef = functionMap.get(fnName);
      if (!fnDef) return undefined;

      const signatureLabel = buildSignature(fnDef);
      const parameters = fnDef.params.map(p => ({
        label: p.name,
        documentation: { value: `*${p.type}* - ${p.description}${p.optional ? ' (optional)' : ''}` },
      }));

      return {
        value: {
          signatures: [
            {
              label: signatureLabel,
              documentation: { value: fnDef.description },
              parameters,
            },
          ],
          activeSignature: 0,
          activeParameter: Math.min(commaCount, fnDef.params.length - 1),
        },
        dispose: () => {},
      };
    },
  });

  return {
    /** Update the set of dynamic variables shown in autocomplete. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scripting context accepts arbitrary values
    setVariables(variables: Record<string, any>) {
      currentVariables = { ...variables };
    },
    /** Dispose both providers. */
    dispose() {
      completionDisposable.dispose();
      signatureDisposable.dispose();
    },
  };
}

/** Exported for testing / external consumption. */
export { formulaFunctions, type FunctionDef, type FunctionParam };
