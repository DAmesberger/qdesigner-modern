import { create, all, type FactoryFunctionMap, type MathJsInstance } from 'mathjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sandboxed math evaluates dynamic formula payloads
type DynamicValue = any;

/**
 * Built-in functions shared by every sandboxed mathjs instance
 * (VariableEngine, ScoringPipeline). Dangerous mathjs functions are
 * overridden to throw; the QDesigner formula built-ins are added on top.
 */
export const BUILTIN_FUNCTIONS = {
  import: () => {
    throw new Error('Function import is disabled');
  },
  createUnit: () => {
    throw new Error('Function createUnit is disabled');
  },
  simplify: () => {
    throw new Error('Function simplify is disabled');
  },
  derivative: () => {
    throw new Error('Function derivative is disabled');
  },
  IF: (condition: boolean, trueValue: DynamicValue, falseValue: DynamicValue) => (condition ? trueValue : falseValue),
  NOW: () => Date.now(),
  TIME_SINCE: (timestamp: number) => Date.now() - timestamp,
  COUNT: (arr: DynamicValue[]) => (Array.isArray(arr) ? arr.length : 0),
  SUM: (arr: number[]) => (Array.isArray(arr) ? arr.reduce((a: number, b: number) => a + b, 0) : 0),
  AVG: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a: number, b: number) => a + b, 0) / arr.length;
  },
  CONCAT: (...args: DynamicValue[]) => args.join(''),
  LENGTH: (value: string | DynamicValue[]) => value?.length ?? 0,
  RANDOM: () => Math.random(),
  RANDINT: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
};

/**
 * Create a mathjs instance with the sandbox built-ins installed.
 */
export function createSandboxedMath(): MathJsInstance {
  const math = create(all as FactoryFunctionMap);
  math.import(BUILTIN_FUNCTIONS, { override: true });
  return math;
}
