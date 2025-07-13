// ScriptEngine - JavaScript execution in Web Worker with sandboxing

export interface ScriptContext {
  // Variables accessible in scripts
  variables: Record<string, any>;
  // Questionnaire answers
  answers: Record<string, any>;
  // Current page/question info
  current: {
    pageId?: string;
    questionId?: string;
    timestamp: number;
  };
  // Utility functions available in scripts
  utils: ScriptUtils;
}

export interface ScriptUtils {
  sum: (values: number[]) => number;
  mean: (values: number[]) => number;
  min: (values: number[]) => number;
  max: (values: number[]) => number;
  count: (values: any[]) => number;
  range: (start: number, end: number) => number[];
  random: (min?: number, max?: number) => number;
  now: () => number;
  log: (...args: any[]) => void;
}

export interface ScriptResult {
  success: boolean;
  value?: any;
  error?: string;
  logs?: string[];
  executionTime?: number;
}

export class ScriptEngine {
  private worker: Worker | null = null;
  private scriptCache = new Map<string, Function>();
  private executionTimeout = 5000; // 5 seconds default

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker(): void {
    if (typeof Worker !== 'undefined') {
      // Create worker from inline blob to avoid separate file
      const workerCode = `
        // Script execution worker
        self.onmessage = function(e) {
          const { id, script, context, timeout } = e.data;
          
          // Set up timeout
          const timeoutId = setTimeout(() => {
            self.postMessage({
              id,
              success: false,
              error: 'Script execution timeout'
            });
          }, timeout);

          try {
            // Create sandbox function
            const sandboxedFunction = new Function(
              'variables', 'answers', 'current', 'utils',
              \`
              "use strict";
              // Prevent access to global scope
              const window = undefined;
              const document = undefined;
              const global = undefined;
              const self = undefined;
              const postMessage = undefined;
              const importScripts = undefined;
              const fetch = undefined;
              const XMLHttpRequest = undefined;
              const WebSocket = undefined;
              
              // User script
              \${script}
              \`
            );

            const startTime = performance.now();
            const result = sandboxedFunction(
              context.variables,
              context.answers,
              context.current,
              context.utils
            );
            const executionTime = performance.now() - startTime;

            clearTimeout(timeoutId);
            
            self.postMessage({
              id,
              success: true,
              value: result,
              executionTime,
              logs: context.utils._logs || []
            });
          } catch (error) {
            clearTimeout(timeoutId);
            self.postMessage({
              id,
              success: false,
              error: (error as Error).message || 'Unknown error'
            });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
    }
  }

  /**
   * Execute a script in the sandboxed environment
   */
  public async execute(script: string, context: ScriptContext): Promise<ScriptResult> {
    // Add logging capability to utils
    const logs: string[] = [];
    const enhancedContext = {
      ...context,
      utils: {
        ...this.createUtils(),
        log: (...args: any[]) => {
          logs.push(args.map(arg => String(arg)).join(' '));
        },
        _logs: logs
      }
    };

    if (this.worker) {
      // Execute in worker for better isolation
      return this.executeInWorker(script, enhancedContext);
    } else {
      // Fallback to main thread execution
      return this.executeInMainThread(script, enhancedContext);
    }
  }

  private executeInWorker(script: string, context: ScriptContext): Promise<ScriptResult> {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).substr(2, 9);
      
      const handleMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          this.worker!.removeEventListener('message', handleMessage);
          resolve(e.data);
        }
      };

      this.worker!.addEventListener('message', handleMessage);
      this.worker!.postMessage({
        id,
        script,
        context,
        timeout: this.executionTimeout
      });

      // Fallback timeout
      setTimeout(() => {
        this.worker!.removeEventListener('message', handleMessage);
        resolve({
          success: false,
          error: 'Script execution timeout'
        });
      }, this.executionTimeout + 1000);
    });
  }

  private executeInMainThread(script: string, context: ScriptContext): Promise<ScriptResult> {
    return new Promise((resolve) => {
      try {
        const startTime = performance.now();
        
        // Create sandboxed function
        const sandboxedFunction = new Function(
          'variables', 'answers', 'current', 'utils',
          `
          "use strict";
          // User script
          ${script}
          `
        );

        const result = sandboxedFunction(
          context.variables,
          context.answers,
          context.current,
          context.utils
        );

        const executionTime = performance.now() - startTime;

        resolve({
          success: true,
          value: result,
          executionTime,
          logs: (context.utils as any)._logs || []
        });
      } catch (error: any) {
        resolve({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    });
  }

  /**
   * Validate a script without executing it
   */
  public validate(script: string): { valid: boolean; error?: string } {
    try {
      new Function(script);
      return { valid: true };
    } catch (error: any) {
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }

  /**
   * Create utility functions available in scripts
   */
  private createUtils(): ScriptUtils {
    return {
      sum: (values: number[]) => values.reduce((a, b) => a + b, 0),
      mean: (values: number[]) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      min: (values: number[]) => Math.min(...values),
      max: (values: number[]) => Math.max(...values),
      count: (values: any[]) => values.length,
      range: (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i),
      random: (min = 0, max = 1) => Math.random() * (max - min) + min,
      now: () => Date.now(),
      log: () => {} // Placeholder, replaced in execute
    };
  }

  /**
   * Get TypeScript definitions for the scripting API
   */
  public getTypeDefinitions(): string {
    return `
// Available in all scripts:

// Variables object containing all questionnaire variables
declare const variables: Record<string, any>;

// Answers object containing all questionnaire answers
declare const answers: Record<string, any>;

// Current context information
declare const current: {
  pageId?: string;
  questionId?: string;
  timestamp: number;
};

// Utility functions
declare const utils: {
  sum(values: number[]): number;
  mean(values: number[]): number;
  min(values: number[]): number;
  max(values: number[]): number;
  count(values: any[]): number;
  range(start: number, end: number): number[];
  random(min?: number, max?: number): number;
  now(): number;
  log(...args: any[]): void;
};

// Common patterns:
// Set a variable: return value;
// Calculate score: return utils.sum([answers.q1, answers.q2, answers.q3]);
// Conditional logic: return answers.age >= 18 ? 'adult' : 'minor';
`;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.scriptCache.clear();
  }
}