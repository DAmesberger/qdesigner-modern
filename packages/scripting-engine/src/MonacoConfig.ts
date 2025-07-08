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

/**
 * Create completion items for the QDesigner scripting API
 */
export function createCompletionItems(monaco: typeof import('monaco-editor')): any[] {
  const { CompletionItemKind } = monaco.languages;
  
  return [
    // Variables
    {
      label: 'variables',
      kind: CompletionItemKind.Variable,
      documentation: 'Access questionnaire variables',
      insertText: 'variables',
      detail: 'Record<string, any>'
    },
    {
      label: 'answers',
      kind: CompletionItemKind.Variable,
      documentation: 'Access questionnaire answers',
      insertText: 'answers',
      detail: 'Record<string, any>'
    },
    {
      label: 'current',
      kind: CompletionItemKind.Variable,
      documentation: 'Current context information',
      insertText: 'current',
      detail: '{ pageId?: string, questionId?: string, timestamp: number }'
    },
    
    // Utils functions
    {
      label: 'utils.sum',
      kind: CompletionItemKind.Function,
      documentation: 'Calculate the sum of an array of numbers',
      insertText: 'utils.sum(${1:values})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(values: number[]) => number'
    },
    {
      label: 'utils.mean',
      kind: CompletionItemKind.Function,
      documentation: 'Calculate the mean of an array of numbers',
      insertText: 'utils.mean(${1:values})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(values: number[]) => number'
    },
    {
      label: 'utils.min',
      kind: CompletionItemKind.Function,
      documentation: 'Find the minimum value in an array',
      insertText: 'utils.min(${1:values})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(values: number[]) => number'
    },
    {
      label: 'utils.max',
      kind: CompletionItemKind.Function,
      documentation: 'Find the maximum value in an array',
      insertText: 'utils.max(${1:values})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(values: number[]) => number'
    },
    {
      label: 'utils.count',
      kind: CompletionItemKind.Function,
      documentation: 'Count the number of items in an array',
      insertText: 'utils.count(${1:values})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(values: any[]) => number'
    },
    {
      label: 'utils.range',
      kind: CompletionItemKind.Function,
      documentation: 'Generate an array of numbers from start to end',
      insertText: 'utils.range(${1:start}, ${2:end})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(start: number, end: number) => number[]'
    },
    {
      label: 'utils.random',
      kind: CompletionItemKind.Function,
      documentation: 'Generate a random number between min and max',
      insertText: 'utils.random(${1:min}, ${2:max})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(min?: number, max?: number) => number'
    },
    {
      label: 'utils.log',
      kind: CompletionItemKind.Function,
      documentation: 'Log values for debugging',
      insertText: 'utils.log(${1:value})',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '(...args: any[]) => void'
    },
    
    // Common snippets
    {
      label: 'Calculate total score',
      kind: CompletionItemKind.Snippet,
      documentation: 'Sum answers from multiple questions',
      insertText: [
        '// Calculate total score',
        'const questionIds = [${1:"q1", "q2", "q3"}];',
        'const scores = questionIds.map(id => answers[id] || 0);',
        'return utils.sum(scores);'
      ].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    },
    {
      label: 'Conditional value',
      kind: CompletionItemKind.Snippet,
      documentation: 'Return different values based on a condition',
      insertText: [
        '// Return value based on condition',
        'if (${1:answers.age >= 18}) {',
        '  return "${2:adult}";',
        '} else {',
        '  return "${3:minor}";',
        '}'
      ].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    },
    {
      label: 'Calculate percentage',
      kind: CompletionItemKind.Snippet,
      documentation: 'Calculate percentage of maximum possible score',
      insertText: [
        '// Calculate percentage score',
        'const maxScore = ${1:100};',
        'const actualScore = ${2:answers.totalScore};',
        'return (actualScore / maxScore) * 100;'
      ].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    }
  ];
}