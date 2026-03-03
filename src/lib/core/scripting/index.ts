export { VariableEngine } from '$lib/scripting-engine';
export type { VariableValue, VariableContext, EvaluationResult } from '$lib/scripting-engine';

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