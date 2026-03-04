import type { FormulaFunction } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- array formulas accept heterogeneous values
type DynamicValue = any;

// Array Operation Functions
export const arrayFunctions: FormulaFunction[] = [
  {
    name: 'FILTER',
    category: 'array',
    description: 'Filter array elements based on a condition',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to filter' },
      { name: 'condition', type: 'function|string', description: 'Filter condition or expression' }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[], condition: DynamicValue) => {
      if (!Array.isArray(array)) return [];
      
      if (typeof condition === 'function') {
        return array.filter(condition);
      }
      
      // Simple conditions like "> 5", "== 'test'"
      if (typeof condition === 'string') {
        const operators = ['>=', '<=', '!=', '==', '>', '<', '='];
        let op = '';
        let value: DynamicValue = '';
        
        for (const operator of operators) {
          if (condition.includes(operator)) {
            [op, value] = condition.split(operator).map(s => s.trim());
            if (!op) {
              op = operator;
              break;
            }
          }
        }
        
        if (!op) return array;
        
        // Try to parse value as number
        const numValue = parseFloat(value);
        value = isNaN(numValue) ? value.replace(/['"]/g, '') : numValue;
        
        return array.filter(item => {
          switch (op) {
            case '>': return item > value;
            case '>=': return item >= value;
            case '<': return item < value;
            case '<=': return item <= value;
            case '=':
            case '==': return item == value;
            case '!=': return item != value;
            default: return false;
          }
        });
      }
      
      return array;
    },
    examples: [
      'FILTER([1, 2, 3, 4, 5], "> 3")',
      'FILTER(["apple", "banana", "cherry"], "!= banana")'
    ]
  },
  
  {
    name: 'MAP',
    category: 'array',
    description: 'Transform each element of an array',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to transform' },
      { name: 'transform', type: 'function|string', description: 'Transformation function or expression' }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[], transform: DynamicValue) => {
      if (!Array.isArray(array)) return [];
      
      if (typeof transform === 'function') {
        return array.map(transform);
      }
      
      // Simple transformations like "* 2", "+ 10"
      if (typeof transform === 'string') {
        const operators = ['+', '-', '*', '/', '^'];
        let op = '';
        let value: DynamicValue = '';
        
        for (const operator of operators) {
          if (transform.includes(operator)) {
            const parts = transform.split(operator);
            if (parts.length === 2) {
              op = operator;
              value = parts[1].trim();
              break;
            }
          }
        }
        
        if (!op) return array;
        
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return array;
        
        return array.map(item => {
          if (typeof item !== 'number') return item;
          
          switch (op) {
            case '+': return item + numValue;
            case '-': return item - numValue;
            case '*': return item * numValue;
            case '/': return numValue !== 0 ? item / numValue : NaN;
            case '^': return Math.pow(item, numValue);
            default: return item;
          }
        });
      }
      
      return array;
    },
    examples: [
      'MAP([1, 2, 3], "* 2")',
      'MAP([10, 20, 30], "+ 5")'
    ]
  },
  
  {
    name: 'REDUCE',
    category: 'array',
    description: 'Reduce array to single value',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to reduce' },
      { name: 'operation', type: 'string', description: 'Reduction operation (sum, product, min, max, concat)' },
      { name: 'initial', type: 'any', description: 'Initial value', optional: true }
    ],
    returns: 'any',
    implementation: (array: DynamicValue[], operation: string, initial?: DynamicValue) => {
      if (!Array.isArray(array)) return initial;
      
      switch (operation.toLowerCase()) {
        case 'sum':
          return array.reduce((acc, val) => {
            const num = typeof val === 'number' ? val : 0;
            return acc + num;
          }, initial || 0);
          
        case 'product':
          return array.reduce((acc, val) => {
            const num = typeof val === 'number' ? val : 1;
            return acc * num;
          }, initial || 1);
          
        case 'min':
          const numbers = array.filter(v => typeof v === 'number');
          return numbers.length > 0 ? Math.min(...numbers) : initial;
          
        case 'max':
          const nums = array.filter(v => typeof v === 'number');
          return nums.length > 0 ? Math.max(...nums) : initial;
          
        case 'concat':
          return array.reduce((acc, val) => acc + String(val), initial || '');
          
        case 'count':
          return array.length;
          
        default:
          return initial;
      }
    },
    examples: [
      'REDUCE([1, 2, 3, 4], "sum")',
      'REDUCE([5, 10, 15], "product")',
      'REDUCE(["a", "b", "c"], "concat")'
    ]
  },
  
  {
    name: 'SORT',
    category: 'array',
    description: 'Sort array elements',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to sort' },
      { name: 'order', type: 'string', description: 'Sort order: "asc" or "desc"', optional: true, default: 'asc' }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[], order: string = 'asc') => {
      if (!Array.isArray(array)) return [];
      
      const sorted = [...array].sort((a, b) => {
        if (a === b) return 0;
        if (a === null || a === undefined) return 1;
        if (b === null || b === undefined) return -1;
        
        if (typeof a === 'number' && typeof b === 'number') {
          return a - b;
        }
        
        return String(a).localeCompare(String(b));
      });
      
      return order.toLowerCase() === 'desc' ? sorted.reverse() : sorted;
    },
    examples: [
      'SORT([3, 1, 4, 1, 5])',
      'SORT(["banana", "apple", "cherry"], "desc")'
    ]
  },
  
  {
    name: 'UNIQUE',
    category: 'array',
    description: 'Get unique values from array',
    parameters: [
      { name: 'array', type: 'array', description: 'Array with potential duplicates' }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[]) => {
      if (!Array.isArray(array)) return [];
      return Array.from(new Set(array));
    },
    examples: [
      'UNIQUE([1, 2, 2, 3, 3, 3])',
      'UNIQUE(["a", "b", "a", "c"])'
    ]
  },
  
  {
    name: 'FLATTEN',
    category: 'array',
    description: 'Flatten nested arrays',
    parameters: [
      { name: 'array', type: 'array', description: 'Nested array to flatten' },
      { name: 'depth', type: 'number', description: 'Depth to flatten', optional: true, default: 1 }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[], depth: number = 1) => {
      if (!Array.isArray(array)) return [];
      
      const flatten = (arr: DynamicValue[], d: number): DynamicValue[] => {
        if (d <= 0) return arr;
        
        return arr.reduce((flat, item) => {
          if (Array.isArray(item)) {
            return flat.concat(flatten(item, d - 1));
          }
          return flat.concat(item);
        }, []);
      };
      
      return flatten(array, depth);
    },
    examples: [
      'FLATTEN([[1, 2], [3, 4]])',
      'FLATTEN([1, [2, [3, 4]]], 2)'
    ]
  },
  
  {
    name: 'GROUP_BY',
    category: 'array',
    description: 'Group array of objects by a property',
    parameters: [
      { name: 'array', type: 'array', description: 'Array of objects' },
      { name: 'property', type: 'string', description: 'Property to group by' }
    ],
    returns: 'object',
    implementation: (array: DynamicValue[], property: string) => {
      if (!Array.isArray(array)) return {};
      
      return array.reduce((groups, item) => {
        if (typeof item === 'object' && item !== null && property in item) {
          const key = String(item[property]);
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
        }
        return groups;
      }, {} as Record<string, DynamicValue[]>);
    },
    examples: [
      'GROUP_BY([{name: "Alice", age: 25}, {name: "Bob", age: 25}], "age")'
    ]
  },
  
  {
    name: 'PLUCK',
    category: 'array',
    description: 'Extract property values from array of objects',
    parameters: [
      { name: 'array', type: 'array', description: 'Array of objects' },
      { name: 'property', type: 'string', description: 'Property to extract' }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[], property: string) => {
      if (!Array.isArray(array)) return [];
      
      return array.map(item => {
        if (typeof item === 'object' && item !== null && property in item) {
          return item[property];
        }
        return undefined;
      }).filter(val => val !== undefined);
    },
    examples: [
      'PLUCK([{name: "Alice", age: 25}, {name: "Bob", age: 30}], "name")'
    ]
  },
  
  {
    name: 'SLICE',
    category: 'array',
    description: 'Extract portion of array',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to slice' },
      { name: 'start', type: 'number', description: 'Start index' },
      { name: 'end', type: 'number', description: 'End index', optional: true }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[], start: number, end?: number) => {
      if (!Array.isArray(array)) return [];
      return array.slice(start, end);
    },
    examples: [
      'SLICE([1, 2, 3, 4, 5], 1, 4)',
      'SLICE(["a", "b", "c", "d"], 2)'
    ]
  },
  
  {
    name: 'REVERSE',
    category: 'array',
    description: 'Reverse array order',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to reverse' }
    ],
    returns: 'array',
    implementation: (array: DynamicValue[]) => {
      if (!Array.isArray(array)) return [];
      return [...array].reverse();
    },
    examples: [
      'REVERSE([1, 2, 3, 4, 5])',
      'REVERSE(["a", "b", "c"])'
    ]
  },

  {
    name: 'FOREACH',
    category: 'array',
    description: 'Execute an expression for each element in an array (for side effects)',
    parameters: [
      { name: 'array', type: 'array', description: 'Array to iterate over' },
      { name: 'callback', type: 'function', description: 'Function to call for each element. Receives (item, index).' }
    ],
    returns: 'number',
    implementation: (array: DynamicValue[], callback: DynamicValue) => {
      if (!Array.isArray(array)) return 0;

      if (typeof callback === 'function') {
        let count = 0;
        for (let i = 0; i < array.length; i++) {
          callback(array[i], i);
          count++;
        }
        return count;
      }

      return array.length;
    },
    examples: [
      'FOREACH([1, 2, 3], (item, index) => console.log(item))',
      'FOREACH(RANGE(1, 5), (item) => SET("var_" + item, item * 10))'
    ]
  },

  {
    name: 'RANGE',
    category: 'array',
    description: 'Generate a sequence of numbers',
    parameters: [
      { name: 'start', type: 'number', description: 'Start value (inclusive)' },
      { name: 'end', type: 'number', description: 'End value (exclusive)' },
      { name: 'step', type: 'number', description: 'Step increment', optional: true, default: 1 }
    ],
    returns: 'array',
    implementation: (start: number, end: number, step: number = 1) => {
      if (typeof start !== 'number' || typeof end !== 'number') return [];
      if (step === 0) return [];

      // Safety: limit to 10000 elements to prevent runaway loops
      const maxElements = 10000;
      const result: number[] = [];

      if (step > 0) {
        for (let i = start; i < end && result.length < maxElements; i += step) {
          result.push(i);
        }
      } else {
        for (let i = start; i > end && result.length < maxElements; i += step) {
          result.push(i);
        }
      }

      return result;
    },
    examples: [
      'RANGE(1, 5)',        // [1, 2, 3, 4]
      'RANGE(0, 10, 2)',    // [0, 2, 4, 6, 8]
      'RANGE(5, 0, -1)'     // [5, 4, 3, 2, 1]
    ]
  }
];
