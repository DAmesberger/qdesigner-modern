// Scripting Engine Exports

export * from './types';
export * from './evaluator';
export * from './functions/statistical';
export * from './functions/array';
export * from './functions/psychometric';
export * from './functions/irt';
export * from './customFunctions';
export * from './math/eigen';
export * from './parser';
export * from './ast-evaluator';
export * from './policies';

export { BUILTIN_FUNCTIONS, createSandboxedMath } from './sandbox-math';

export { VariableEngine } from './VariableEngine';
export type { VariableValue, VariableContext, EvaluationResult } from './VariableEngine';

export { ScriptEngine } from './ScriptEngine';
export type { ScriptContext, ScriptUtils, ScriptResult } from './ScriptEngine';

export {
  qdesignerTheme,
  qdesignerDarkTheme,
  javascriptLanguageConfig,
  editorOptions,
  createCompletionItems,
  registerFormulaProviders,
  formulaFunctions,
} from './MonacoConfig';
export type { MonacoTheme, FunctionDef, FunctionParam } from './MonacoConfig';
