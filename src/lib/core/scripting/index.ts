export { VariableEngine } from '$lib/scripting-engine';
export type { VariableValue, VariableContext, EvaluationResult } from '$lib/scripting-engine';

export { ScriptEngine } from './ScriptEngine';
export type { ScriptContext, ScriptUtils, ScriptResult } from './ScriptEngine';

export {
  qdesignerTheme,
  qdesignerDarkTheme,
  javascriptLanguageConfig,
  editorOptions,
  createCompletionItems
} from './MonacoConfig';
export type { MonacoTheme } from './MonacoConfig';