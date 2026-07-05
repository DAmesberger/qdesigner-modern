// Variable interpolation service

import { FormulaParser } from '@qdesigner/scripting-engine';
import { ASTEvaluator } from '@qdesigner/scripting-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- interpolation evaluates dynamic variable maps and expression results
type DynamicValue = any;

/**
 * Interpolate variables in a string. Supports both `{{variable}}` and
 * `${variable}` syntaxes — the two run through the identical lookup.
 */
export function interpolateVariables(
  template: string,
  variables: Record<string, DynamicValue> = {}
): string {
  if (!template) return '';

  // Shared substitution: simple variable reference, else evaluated expression,
  // else leave the original matched text untouched.
  const substitute = (match: string, rawExpression: string): string => {
    const expression = rawExpression.trim();
    try {
      // Check if it's a simple variable reference
      if (expression in variables) {
        return formatValue(variables[expression]);
      }

      // Try to evaluate as an expression. The AST evaluator returns `undefined`
      // for an unknown identifier rather than throwing, so treat an unresolved
      // result as "leave the original text" (e.g. `${nope}` stays literal).
      const result = evaluateExpression(expression, variables);
      if (result === undefined) {
        return match;
      }
      return formatValue(result);
    } catch (error) {
      console.warn(`Failed to interpolate expression: ${expression}`, error);
      return match; // Return original if interpolation fails
    }
  };

  // Match {{variable}} / {{expression}}, then ${variable} / ${expression}.
  return template
    .replace(/\{\{([^}]+)\}\}/g, substitute)
    .replace(/\$\{([^}]+)\}/g, substitute);
}

/**
 * Interpolate variables in an object recursively
 */
export function interpolateObject<T extends Record<string, DynamicValue>>(
  obj: T,
  variables: Record<string, DynamicValue> = {}
): T {
  const result: DynamicValue = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolateVariables(value, variables);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'string' 
          ? interpolateVariables(item, variables)
          : typeof item === 'object' && item !== null
          ? interpolateObject(item, variables)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = interpolateObject(value, variables);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

/**
 * Check if a string contains variable interpolation syntax
 */
export function hasInterpolation(str: string): boolean {
  return /\{\{[^}]+\}\}/.test(str) || /\$\{[^}]+\}/.test(str);
}

/**
 * Extract variable names from a template
 */
export function extractVariables(template: string): string[] {
  const variables = new Set<string>();

  // Scan both {{…}} and ${…} syntaxes; capture the inner expression in group 1.
  const patterns = [/\{\{([^}]+)\}\}/g, /\$\{([^}]+)\}/g];
  patterns.forEach(pattern => {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(template)) !== null) {
      const expression = match[1]!.trim();
      // Extract simple variable names (not expressions)
      const varMatches = expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
      varMatches.forEach(v => variables.add(v));
    }
  });

  return Array.from(variables);
}

/**
 * Evaluate an expression with variables (synchronous — uses AST parser, no async)
 */
function evaluateExpression(expression: string, variables: Record<string, DynamicValue>): DynamicValue {
  const parser = new FormulaParser();
  const ast = parser.parse(expression);
  const varMap = new Map<string, DynamicValue>(Object.entries(variables));
  const evaluator = new ASTEvaluator({ variables: varMap });
  return evaluator.evaluate(ast);
}

/**
 * Format a value for display
 */
function formatValue(value: DynamicValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  
  return String(value);
}

/**
 * Create a template function for repeated interpolation
 */
export function createTemplate(template: string): (variables: Record<string, DynamicValue>) => string {
  // Pre-parse the template for better performance
  const parts: Array<string | { expression: string }> = [];
  let lastIndex = 0;
  
  template.replace(/\{\{([^}]+)\}\}/g, (match, expression, index) => {
    // Add literal text before this match
    if (index > lastIndex) {
      parts.push(template.slice(lastIndex, index));
    }
    
    // Add expression
    parts.push({ expression: expression.trim() });
    
    lastIndex = index + match.length;
    return match;
  });
  
  // Add remaining literal text
  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex));
  }
  
  // Return compiled template function
  return (variables: Record<string, DynamicValue> = {}) => {
    return parts.map(part => {
      if (typeof part === 'string') {
        return part;
      } else {
        try {
          const { expression } = part;
          if (expression in variables) {
            return formatValue(variables[expression]);
          }
          const result = evaluateExpression(expression, variables);
          return formatValue(result);
        } catch {
          return `{{${part.expression}}}`;
        }
      }
    }).join('');
  };
}

/**
 * Validate a template for syntax errors
 */
export function validateTemplate(template: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let openCount = 0;
  let closeCount = 0;
  
  // Check for balanced brackets
  for (let i = 0; i < template.length; i++) {
    if (template[i] === '{' && template[i + 1] === '{') {
      openCount++;
      i++; // Skip next character
    } else if (template[i] === '}' && template[i + 1] === '}') {
      closeCount++;
      i++; // Skip next character
    }
  }
  
  if (openCount !== closeCount) {
    errors.push(`Unbalanced brackets: ${openCount} opening, ${closeCount} closing`);
  }
  
  // Check for empty expressions
  const emptyMatches = template.match(/\{\{\s*\}\}/g);
  if (emptyMatches) {
    errors.push(`Empty expressions found: ${emptyMatches.length}`);
  }
  
  // Try to extract and validate expressions
  const expressions = template.match(/\{\{([^}]+)\}\}/g) || [];
  expressions.forEach((match, index) => {
    const expression = match.slice(2, -2).trim();
    if (!expression) {
      errors.push(`Empty expression at position ${index + 1}`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}
