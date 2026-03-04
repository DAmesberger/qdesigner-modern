/**
 * Monaco Editor configuration for worker loading
 */

// MonacoEnvironment is a global set by Monaco Editor on self
(self as unknown as Record<string, unknown>).MonacoEnvironment = {
  getWorkerUrl: function (moduleId: string, label: string) {
    if (label === 'json') {
      return '/monaco/vs/language/json/json.worker.js';
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return '/monaco/vs/language/css/css.worker.js';
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return '/monaco/vs/language/html/html.worker.js';
    }
    if (label === 'typescript' || label === 'javascript') {
      return '/monaco/vs/language/typescript/ts.worker.js';
    }
    return '/monaco/vs/editor/editor.worker.js';
  }
};

// Alternative approach using CDN if local workers fail
export function setupMonacoEnvironment() {
  if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
    window.MonacoEnvironment = {
      getWorkerUrl: function (moduleId: string, label: string) {
        if (label === 'json') {
          return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: 'https://unpkg.com/monaco-editor@0.45.0/min/' };
            importScripts('https://unpkg.com/monaco-editor@0.45.0/min/vs/language/json/json.worker.js');
          `);
        }
        if (label === 'css' || label === 'scss' || label === 'less') {
          return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: 'https://unpkg.com/monaco-editor@0.45.0/min/' };
            importScripts('https://unpkg.com/monaco-editor@0.45.0/min/vs/language/css/css.worker.js');
          `);
        }
        if (label === 'html' || label === 'handlebars' || label === 'razor') {
          return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: 'https://unpkg.com/monaco-editor@0.45.0/min/' };
            importScripts('https://unpkg.com/monaco-editor@0.45.0/min/vs/language/html/html.worker.js');
          `);
        }
        if (label === 'typescript' || label === 'javascript') {
          return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
            self.MonacoEnvironment = { baseUrl: 'https://unpkg.com/monaco-editor@0.45.0/min/' };
            importScripts('https://unpkg.com/monaco-editor@0.45.0/min/vs/language/typescript/ts.worker.js');
          `);
        }
        return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(`
          self.MonacoEnvironment = { baseUrl: 'https://unpkg.com/monaco-editor@0.45.0/min/' };
          importScripts('https://unpkg.com/monaco-editor@0.45.0/min/vs/editor/editor.worker.js');
        `);
      }
    };
  }
}