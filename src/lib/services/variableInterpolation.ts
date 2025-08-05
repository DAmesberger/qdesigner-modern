// Variable interpolation service

import { scriptingEngine } from './scriptingEngine';

/**
 * Interpolate variables in a string using {{variable}} syntax
 */
export function interpolateVariables(
  template: string, 
  variables: Record<string, any> = {}
): string {
  if (!template) return '';
  
  // Match {{variable}} or {{expression}}
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
    try {
      // Trim whitespace
      expression = expression.trim();
      
      // Check if it's a simple variable reference
      if (expression in variables) {
        return formatValue(variables[expression]);
      }
      
      // Try to evaluate as an expression
      const result = evaluateExpression(expression, variables);
      return formatValue(result);
    } catch (error) {
      console.warn(`Failed to interpolate expression: ${expression}`, error);
      return match; // Return original if interpolation fails
    }
  });
}

/**
 * Interpolate variables in an object recursively
 */
export function interpolateObject<T extends Record<string, any>>(
  obj: T,
  variables: Record<string, any> = {}
): T {
  const result: any = {};
  
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
  return /\{\{[^}]+\}\}/.test(str);
}

/**
 * Extract variable names from a template
 */
export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{([^}]+)\}\}/g) || [];
  const variables = new Set<string>();
  
  matches.forEach(match => {
    const expression = match.slice(2, -2).trim();
    // Extract simple variable names (not expressions)
    const varMatches = expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    varMatches.forEach(v => variables.add(v));
  });
  
  return Array.from(variables);
}

/**
 * Evaluate an expression with variables
 */
function evaluateExpression(expression: string, variables: Record<string, any>): any {
  // Use the scripting engine if available
  if (scriptingEngine && scriptingEngine.evaluate) {
    return scriptingEngine.evaluate(expression, variables);
  }
  
  // Fallback to simple Function constructor
  try {
    const func = new Function(...Object.keys(variables), `return ${expression}`);
    return func(...Object.values(variables));
  } catch (error) {
    throw new Error(`Invalid expression: ${expression}`);
  }
}

/**
 * Format a value for display
 */
function formatValue(value: any): string {
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
export function createTemplate(template: string): (variables: Record<string, any>) => string {
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
  return (variables: Record<string, any> = {}) => {
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