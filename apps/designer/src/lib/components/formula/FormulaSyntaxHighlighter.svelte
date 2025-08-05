<script lang="ts">
  export let formula: string = '';
  
  interface Token {
    type: 'function' | 'variable' | 'number' | 'string' | 'operator' | 'parenthesis' | 'comma' | 'equals' | 'text';
    value: string;
    start: number;
    end: number;
  }
  
  function tokenizeFormula(formula: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    
    while (i < formula.length) {
      const char = formula[i];
      
      // Skip whitespace
      if (/\s/.test(char)) {
        tokens.push({ type: 'text', value: char, start: i, end: i + 1 });
        i++;
        continue;
      }
      
      // Equals sign
      if (char === '=' && i === 0) {
        tokens.push({ type: 'equals', value: char, start: i, end: i + 1 });
        i++;
        continue;
      }
      
      // String literals
      if (char === '"' || char === "'") {
        const quote = char;
        let j = i + 1;
        while (j < formula.length && formula[j] !== quote) {
          if (formula[j] === '\\') j++; // Skip escaped characters
          j++;
        }
        tokens.push({ 
          type: 'string', 
          value: formula.substring(i, j + 1), 
          start: i, 
          end: j + 1 
        });
        i = j + 1;
        continue;
      }
      
      // Numbers
      if (/[0-9]/.test(char) || (char === '.' && i + 1 < formula.length && /[0-9]/.test(formula[i + 1]))) {
        let j = i;
        while (j < formula.length && /[0-9.]/.test(formula[j])) {
          j++;
        }
        tokens.push({ 
          type: 'number', 
          value: formula.substring(i, j), 
          start: i, 
          end: j 
        });
        i = j;
        continue;
      }
      
      // Functions and variables
      if (/[A-Za-z_]/.test(char)) {
        let j = i;
        while (j < formula.length && /[A-Za-z0-9_]/.test(formula[j])) {
          j++;
        }
        const word = formula.substring(i, j);
        
        // Check if it's a function (followed by parenthesis)
        let k = j;
        while (k < formula.length && /\s/.test(formula[k])) k++;
        
        const type = k < formula.length && formula[k] === '(' ? 'function' : 'variable';
        tokens.push({ type, value: word, start: i, end: j });
        i = j;
        continue;
      }
      
      // Operators
      if ('+-*/^%<>=!&|'.includes(char)) {
        let j = i;
        // Handle multi-character operators
        if (j + 1 < formula.length) {
          const twoChar = formula.substring(j, j + 2);
          if (['<=', '>=', '==', '!=', '&&', '||'].includes(twoChar)) {
            tokens.push({ type: 'operator', value: twoChar, start: i, end: i + 2 });
            i += 2;
            continue;
          }
        }
        tokens.push({ type: 'operator', value: char, start: i, end: i + 1 });
        i++;
        continue;
      }
      
      // Parentheses and brackets
      if ('()[]'.includes(char)) {
        tokens.push({ type: 'parenthesis', value: char, start: i, end: i + 1 });
        i++;
        continue;
      }
      
      // Comma
      if (char === ',') {
        tokens.push({ type: 'comma', value: char, start: i, end: i + 1 });
        i++;
        continue;
      }
      
      // Default to text
      tokens.push({ type: 'text', value: char, start: i, end: i + 1 });
      i++;
    }
    
    return tokens;
  }
  
  $: tokens = tokenizeFormula(formula);
  
  function getTokenClass(token: Token): string {
    switch (token.type) {
      case 'function': return 'token-function';
      case 'variable': return 'token-variable';
      case 'number': return 'token-number';
      case 'string': return 'token-string';
      case 'operator': return 'token-operator';
      case 'parenthesis': return 'token-parenthesis';
      case 'comma': return 'token-comma';
      case 'equals': return 'token-equals';
      default: return 'token-text';
    }
  }
</script>

<div class="highlighted-formula">
  {#each tokens as token}
    <span class={getTokenClass(token)}>{token.value}</span>
  {/each}
</div>

<style>
  .highlighted-formula {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  
  .token-function {
    color: var(--color-blue-600);
    font-weight: 600;
  }
  
  .token-variable {
    color: var(--color-purple-600);
    font-weight: 500;
  }
  
  .token-number {
    color: var(--color-orange-600);
  }
  
  .token-string {
    color: var(--color-green-600);
  }
  
  .token-operator {
    color: var(--color-red-600);
    font-weight: 600;
  }
  
  .token-parenthesis {
    color: var(--color-gray-700);
    font-weight: 600;
  }
  
  .token-comma {
    color: var(--color-gray-600);
  }
  
  .token-equals {
    color: var(--color-blue-700);
    font-weight: 600;
  }
  
  .token-text {
    color: var(--color-gray-900);
  }
</style>